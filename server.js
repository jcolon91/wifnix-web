// ============================================================
// WIFNIX LLC — BACKEND COMPLETO
// Node.js + Express + PostgreSQL
// ============================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
require('dotenv').config();
const oauth = require('./lib/oauth');

const app = express();

// ============================================================
// CONFIGURACIÓN
// ============================================================

const db = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'wifnix',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
});

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet());
// Los subdominios se listan uno a uno a propósito. Un comodín tipo
// *.wifnix.com deja entrar a cualquier subdominio, incluido uno que
// se cuele por un DNS mal apuntado.
const ORIGENES = [
  'https://wifnix.com',
  'https://www.wifnix.com',
  'https://portal.wifnix.com',    // de aquí entra la gente
  'https://rifas.wifnix.com',
];
if (process.env.NODE_ENV !== 'production') {
  // En desarrollo, el servidor estático del repositorio.
  ORIGENES.push('http://localhost:4190', 'http://localhost:3000');
}

app.use(cors({
  origin: function (origen, listo) {
    // Sin cabecera Origin son peticiones que no vienen de una página:
    // curl, apps móviles, comprobaciones de estado. No es un navegador,
    // así que CORS no las protege de nada y no tiene sentido bloquearlas.
    if (!origen) return listo(null, true);
    if (ORIGENES.includes(origen)) return listo(null, true);
    listo(new Error('Origen no permitido'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api', limiter);
app.use('/api/auth', authLimiter);

// ============================================================
// HELPERS — AUTH
// ============================================================

// Sin respaldo por defecto a proposito. Este repositorio es publico:
// una cadena escrita aqui la puede leer cualquiera, y con ella se
// fabrica un token de sesion valido para CUALQUIER cuenta. Antes
// habia una, y si la variable faltaba el servidor arrancaba tan
// tranquilo usandola. Mejor que no arranque.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FALTA JWT_SECRET en el .env (minimo 32 caracteres).');
  console.error('Generar uno:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
  process.exit(1);
}
const JWT_EXPIRES = '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows } = await db.query(
      'SELECT id, email, rol, status, nombre, apellido, foto_url FROM usuarios WHERE id = $1 AND status = $2',
      [decoded.userId, 'activo']
    );

    if (!rows.length) return res.status(401).json({ error: 'Usuario inválido' });

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const adminRoles = ['super_admin','admin_soporte','admin_inventario','admin_tecnico','admin_contabilidad'];
    const isAdmin = adminRoles.includes(req.user.rol);
    if (!roles.includes(req.user.rol) && !isAdmin) {
      return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    }
    next();
  };
}

async function checkPermiso(userId, permiso) {
  const { rows } = await db.query(
    `SELECT ${permiso}, acceso_total FROM admin_permisos WHERE usuario_id = $1`,
    [userId]
  );
  if (!rows.length) return false;
  return rows[0].acceso_total || rows[0][permiso];
}

// Precio según rol del usuario
function getPrecioParaRol(producto, rol) {
  switch (rol) {
    case 'tecnico_independiente':
    case 'empresa_revendedora':
      return producto.precio_revendedor ?? producto.precio_cliente;
    case 'cliente':
      return producto.precio_cliente ?? producto.precio_publico;
    case 'empresa_servicios':
      return producto.precio_empresa ?? producto.precio_cliente;
    default:
      return null; // Sin login = sin precio
  }
}

// ============================================================
// RUTAS — AUTH
// ============================================================

// POST /api/auth/registro
app.post('/api/auth/registro', async (req, res) => {
  try {
    const { email, password, nombre, apellido, telefono,
            empresa_nombre, empresa_tipo, rol_solicitado } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
    }

    const { rows: existe } = await db.query(
      'SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]
    );
    if (existe.length) return res.status(409).json({ error: 'Email ya registrado' });

    const hash = await bcrypt.hash(password, 12);

    // Determinar rol inicial
    let rol = 'cliente';
    let verificacion = 'no_requerida';

    if (['tecnico_independiente', 'empresa_revendedora', 'empresa_servicios'].includes(rol_solicitado)) {
      rol = 'cliente'; // Temporalmente cliente hasta verificación
      verificacion = 'pendiente';
    }

    const { rows } = await db.query(
      `INSERT INTO usuarios (email, password_hash, rol, nombre, apellido, telefono, empresa_nombre, empresa_tipo, verificacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, email, rol, nombre`,
      [email.toLowerCase(), hash, rol, nombre, apellido, telefono, empresa_nombre, empresa_tipo, verificacion]
    );

    const user = rows[0];
    const token = signToken({ userId: user.id, rol: user.rol });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      verificacion_pendiente: verificacion === 'pendiente',
      mensaje: verificacion === 'pendiente'
        ? 'Cuenta creada. Tu solicitud de cuenta empresarial está en revisión.'
        : 'Cuenta creada exitosamente.',
    });
  } catch (err) {
    console.error('Error registro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    // Una cuenta creada con Google no tiene contraseña. Sin esto,
    // bcrypt.compare contra NULL revienta o —peor— algún día alguien
    // "arregla" el fallo dejando pasar la comparación.

    const { rows } = await db.query(
      `SELECT id, email, password_hash, rol, status, nombre, apellido, foto_url
       FROM usuarios WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = rows[0];
    if (user.status === 'suspendido') return res.status(403).json({ error: 'Cuenta suspendida' });
    if (user.status === 'bloqueado') return res.status(403).json({ error: 'Cuenta bloqueada' });

    if (!user.password_hash) {
      return res.status(400).json({
        error: 'Esta cuenta entra con Google, Apple, Microsoft o Facebook. Usa ese botón.',
        usar_oauth: true,
      });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Update last login
    await db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]);

    // Get permisos if admin
    let permisos = null;
    const adminRoles = ['super_admin','admin_soporte','admin_inventario','admin_tecnico','admin_contabilidad'];
    if (adminRoles.includes(user.rol)) {
      const { rows: p } = await db.query(
        'SELECT * FROM admin_permisos WHERE usuario_id = $1', [user.id]
      );
      permisos = p[0] || null;
    }

    const token = signToken({ userId: user.id, rol: user.rol });

    res.json({
      token,
      user: {
        id: user.id, email: user.email, rol: user.rol,
        nombre: user.nombre, apellido: user.apellido, foto_url: user.foto_url,
      },
      permisos,
    });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, rol, status, nombre, apellido, telefono,
              foto_url, empresa_nombre, empresa_tipo, verificacion,
              descuento_personalizado, ultimo_login, creado_en
       FROM usuarios WHERE id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ============================================================
// RUTAS — PERFIL DE USUARIO
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes permitidas'));
  },
});

// PUT /api/perfil
app.put('/api/perfil', authMiddleware, async (req, res) => {
  try {
    const { nombre, apellido, telefono, bio, empresa_nombre, empresa_tipo } = req.body;
    const { rows } = await db.query(
      `UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, bio=$4,
       empresa_nombre=$5, empresa_tipo=$6, actualizado_en=NOW()
       WHERE id=$7 RETURNING id, nombre, apellido, telefono, bio, empresa_nombre`,
      [nombre, apellido, telefono, bio, empresa_nombre, empresa_tipo, req.user.id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando perfil' });
  }
});

// POST /api/perfil/foto — Upload profile photo
app.post('/api/perfil/foto', authMiddleware, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

    // En producción: subir a Cloudinary o S3
    // Por ahora guardamos como base64 (temporal)
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    await db.query('UPDATE usuarios SET foto_url=$1 WHERE id=$2', [dataUrl, req.user.id]);
    res.json({ success: true, foto_url: dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Error subiendo foto' });
  }
});

// ============================================================
// RUTAS — ADMINISTRACIÓN DE USUARIOS
// ============================================================

// GET /api/admin/usuarios
app.get('/api/admin/usuarios', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_ver_clientes');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const { rol, status, page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;

  let where = ['1=1'];
  const params = [];

  if (rol) { params.push(rol); where.push(`rol = $${params.length}`); }
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(nombre ILIKE $${params.length} OR apellido ILIKE $${params.length} OR email ILIKE $${params.length} OR empresa_nombre ILIKE $${params.length})`);
  }

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT id, email, rol, status, nombre, apellido, empresa_nombre,
            verificacion, ultimo_login, creado_en
     FROM usuarios WHERE ${where.join(' AND ')}
     ORDER BY creado_en DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

// PUT /api/admin/usuarios/:id/rol
app.put('/api/admin/usuarios/:id/rol', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_crear_admins');
  if (!perm) return res.status(403).json({ error: 'Sin permiso para cambiar roles' });

  const { rol, permisos } = req.body;
  const { id } = req.params;

  await db.query('UPDATE usuarios SET rol=$1 WHERE id=$2', [rol, id]);

  if (permisos) {
    await db.query('DELETE FROM admin_permisos WHERE usuario_id=$1', [id]);
    await db.query(
      `INSERT INTO admin_permisos (usuario_id, asignado_por,
       puede_ver_ventas, puede_crear_ventas, puede_ver_clientes, puede_editar_clientes,
       puede_ver_productos, puede_editar_productos, puede_ver_inventario, puede_editar_inventario,
       puede_ver_reportes, puede_ver_finanzas, puede_gestionar_garantias,
       puede_gestionar_tecnicos, puede_crear_admins, acceso_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, req.user.id, ...Object.values(permisos)]
    );
  }

  res.json({ success: true, mensaje: 'Rol y permisos actualizados' });
});

// PUT /api/admin/usuarios/:id/verificar
app.put('/api/admin/usuarios/:id/verificar', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_editar_clientes');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const { status, rol_aprobado, notas } = req.body;
  const { id } = req.params;

  await db.query(
    `UPDATE usuarios SET
     verificacion=$1, verificacion_notas=$2, verificacion_fecha=NOW(),
     verificacion_admin_id=$3, rol=COALESCE($4, rol)
     WHERE id=$5`,
    [status, notas, req.user.id, rol_aprobado, id]
  );

  res.json({ success: true, mensaje: 'Verificación actualizada' });
});

// ============================================================
// RUTAS — ENTRAR CON GOOGLE, APPLE, MICROSOFT O FACEBOOK
// ============================================================

// El navegador nunca toca un secreto ni un token del proveedor. Va,
// vuelve con un código de un solo uso, y lo cambia por el JWT.
// El detalle del protocolo vive en lib/oauth.js.

const VIDA_ESTADO = 10 * 60 * 1000;

// Para que el portal sepa qué botones dibujar. Si Wifnix todavía no
// ha dado de alta una aplicación en Apple, el botón de Apple no sale:
// mejor eso que un botón que lleva a un error.
app.get('/api/auth/oauth/proveedores', (req, res) => {
  res.json({ proveedores: oauth.disponibles() });
});

// Paso 1: al proveedor.
app.get('/api/auth/oauth/:proveedor', (req, res) => {
  const clave = String(req.params.proveedor || '').toLowerCase();
  if (!oauth.configurado(clave)) {
    return res.status(404).json({ error: 'Proveedor no disponible' });
  }
  // El destino se limita a rutas del propio portal: aceptar una URL
  // cualquiera convierte esto en un redirector abierto, que es como
  // se hacen creíbles los correos de phishing.
  const pedido = String(req.query.destino || '');
  // Solo rutas del propio portal: ni esquema, ni host, ni doble
  // barra (que el navegador leería como //host). Sin esto, la ruta
  // sirve de trampolín para llevar a cualquier sitio con un enlace
  // que empieza por api.wifnix.com.
  const limpio = pedido.startsWith('/') &&
                 !pedido.startsWith('//') &&
                 !pedido.includes('\\') &&
                 !/^\/[^/]*:/.test(pedido);
  const destino = limpio ? pedido : null;
  res.redirect(oauth.urlDeEntrada(clave, destino));
});

// Paso 2: la vuelta. Apple contesta por POST; los demás por GET.
async function volverDelProveedor(req, res) {
  const clave = String(req.params.proveedor || '').toLowerCase();
  const fuente = req.method === 'POST' ? req.body : req.query;
  const irAlPortal = (q) => res.redirect(oauth.PORTAL + '/?' + new URLSearchParams(q).toString());

  try {
    if (!oauth.configurado(clave)) return irAlPortal({ oauth_error: 'no_disponible' });

    if (fuente.error) {
      // El usuario pulsó "cancelar". No es un fallo: se vuelve callado.
      return irAlPortal({ oauth_error: fuente.error === 'access_denied' ? 'cancelado' : 'proveedor' });
    }

    const estado = oauth.abrirFirmado(fuente.state, VIDA_ESTADO);
    if (!estado || estado.p !== clave) return irAlPortal({ oauth_error: 'estado' });
    if (!fuente.code) return irAlPortal({ oauth_error: 'sin_codigo' });

    const perfil = await oauth.perfilDesdeCodigo(clave, fuente.code, estado, fuente);
    if (!perfil.sujeto) return irAlPortal({ oauth_error: 'sin_identidad' });

    const usuario = await entrarOCrear(clave, perfil, req);
    if (usuario.bloqueado) return irAlPortal({ oauth_error: usuario.bloqueado });

    const token = signToken({ userId: usuario.id, rol: usuario.rol });
    const codigo = oauth.guardarCanje({
      token,
      user: { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
    });
    const q = { oauth: codigo };
    if (estado.d) q.destino = estado.d;
    irAlPortal(q);
  } catch (err) {
    console.error('Error OAuth (' + clave + '):', err.message);
    irAlPortal({ oauth_error: 'fallo' });
  }
}

app.get('/api/auth/oauth/:proveedor/callback', volverDelProveedor);
app.post('/api/auth/oauth/:proveedor/callback',
  express.urlencoded({ extended: false }), volverDelProveedor);

// Paso 3: el portal cambia el código por el token, con un POST, para
// que el JWT no quede escrito en la barra de direcciones ni en el
// historial ni en la cabecera Referer.
app.post('/api/auth/oauth/intercambiar', (req, res) => {
  const carga = oauth.usarCanje(String(req.body && req.body.codigo || ''));
  if (!carga) return res.status(400).json({ error: 'Código inválido o vencido' });
  res.json(carga);
});

// Buscar o crear al usuario a partir de lo que dijo el proveedor.
async function entrarOCrear(proveedor, perfil, req) {
  // Primero por (proveedor, sujeto). El correo NO identifica.
  const { rows: yaEnlazado } = await db.query(
    `SELECT u.* FROM identidades_oauth i
       JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.proveedor = $1 AND i.sujeto = $2`,
    [proveedor, perfil.sujeto]
  );

  if (yaEnlazado.length) {
    const u = yaEnlazado[0];
    if (u.status !== 'activo') return { bloqueado: 'cuenta_' + u.status };
    await db.query(
      'UPDATE identidades_oauth SET ultimo_login = NOW(), email = $3 WHERE proveedor = $1 AND sujeto = $2',
      [proveedor, perfil.sujeto, perfil.email]
    );
    await db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [u.id]);
    return u;
  }

  // No hay enlace todavía. Si el proveedor no da un correo verificado
  // no se puede seguir: enlazar por un correo sin verificar es
  // exactamente como se roban las cuentas ajenas.
  if (!perfil.email) return { bloqueado: 'sin_correo' };
  if (!perfil.emailVerificado) return { bloqueado: 'correo_sin_verificar' };

  const { rows: existente } = await db.query(
    'SELECT * FROM usuarios WHERE lower(email) = $1', [perfil.email]
  );

  if (existente.length) {
    // Ya hay cuenta con ese correo y el proveedor lo verificó: se
    // enlaza. Es seguro precisamente por esa verificación.
    const u = existente[0];
    if (u.status !== 'activo') return { bloqueado: 'cuenta_' + u.status };
    await db.query(
      'INSERT INTO identidades_oauth (usuario_id, proveedor, sujeto, email, ultimo_login) VALUES ($1,$2,$3,$4,NOW())',
      [u.id, proveedor, perfil.sujeto, perfil.email]
    );
    await db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [u.id]);
    return u;
  }

  // Cuenta nueva. Sin contraseña: por eso la columna admite NULL.
  const partes = String(perfil.nombre || '').trim().split(/\s+/);
  const nombre = partes.shift() || perfil.email.split('@')[0];
  const apellido = partes.join(' ') || null;

  const { rows: creado } = await db.query(
    `INSERT INTO usuarios (email, password_hash, rol, nombre, apellido, verificacion, ip_registro, ultimo_login)
     VALUES ($1, NULL, 'cliente', $2, $3, 'no_requerida', $4, NOW()) RETURNING *`,
    [perfil.email, nombre, apellido, req.ip || null]
  );
  const u = creado[0];
  await db.query(
    'INSERT INTO identidades_oauth (usuario_id, proveedor, sujeto, email, ultimo_login) VALUES ($1,$2,$3,$4,NOW())',
    [u.id, proveedor, perfil.sujeto, perfil.email]
  );
  return u;
}

// ============================================================
// RUTAS — RESEÑAS DE GOOGLE
// ============================================================

// Este proxy existe por dos razones. La primera es que la llave de la
// API de Google no puede viajar al navegador: quien la vea puede
// gastarla. La segunda es que Google cobra por consulta, y la portada
// de wifnix.com la abre mucha gente — sin caché, cada visita sería
// una llamada facturada.
//
// Sobre los términos de Google: el texto de la reseña se devuelve tal
// cual, sin recortar ni retocar, y siempre acompañado del enlace al
// perfil. Eso es obligatorio, y además es lo honesto.

const RESENAS_CACHE_MS = 12 * 60 * 60 * 1000;   // 12 horas
let resenasCache = { cuando: 0, datos: null };

app.get('/api/resenas', async (req, res) => {
  const llave = process.env.GOOGLE_PLACES_API_KEY;
  const lugar = process.env.GOOGLE_PLACE_ID;

  // Sin configurar no se inventa nada: la web enseña el enlace al
  // perfil y ya. Es preferible a una sección vacía o a un error.
  if (!llave || !lugar) {
    return res.json({
      configurado: false,
      perfil: process.env.GOOGLE_PERFIL_URL || null,
      resenas: [],
    });
  }

  if (resenasCache.datos && Date.now() - resenasCache.cuando < RESENAS_CACHE_MS) {
    return res.json(resenasCache.datos);
  }

  try {
    const r = await fetch(
      'https://places.googleapis.com/v1/places/' + encodeURIComponent(lugar) +
      '?languageCode=es&regionCode=PR',
      {
        headers: {
          'X-Goog-Api-Key': llave,
          'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews',
        },
      }
    );
    if (!r.ok) throw new Error('Google respondió ' + r.status);
    const g = await r.json();

    const datos = {
      configurado: true,
      nota: g.rating || null,
      total: g.userRatingCount || 0,
      perfil: g.googleMapsUri || process.env.GOOGLE_PERFIL_URL || null,
      resenas: (g.reviews || []).map((v) => ({
        autor: (v.authorAttribution && v.authorAttribution.displayName) || 'Cliente de Google',
        foto: (v.authorAttribution && v.authorAttribution.photoUri) || null,
        nota: v.rating || null,
        // Sin tocar. Recortarlo o arreglarle la ortografía a alguien
        // que dejó su opinión sería falsearla.
        texto: (v.originalText && v.originalText.text) || (v.text && v.text.text) || '',
        cuando: v.relativePublishTimeDescription || '',
      })).filter((v) => v.texto),
    };

    resenasCache = { cuando: Date.now(), datos };
    res.json(datos);
  } catch (err) {
    console.error('Error reseñas de Google:', err.message);
    // Si Google falla, se sirve lo último que funcionó antes que
    // dejar la sección rota.
    if (resenasCache.datos) return res.json(resenasCache.datos);
    res.json({ configurado: true, error: true, perfil: process.env.GOOGLE_PERFIL_URL || null, resenas: [] });
  }
});

// ============================================================
// RUTAS — PRODUCTOS
// ============================================================

// GET /api/productos — Precios según rol
app.get('/api/productos', async (req, res) => {
  try {
    let userRol = 'public';
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
        const { rows } = await db.query('SELECT rol FROM usuarios WHERE id=$1', [decoded.userId]);
        if (rows.length) userRol = rows[0].rol;
      } catch {}
    }

    const { categoria, buscar, page = 1, limit = 24 } = req.query;
    const offset = (page - 1) * limit;

    let where = ['p.activo = TRUE'];
    const params = [];

    if (categoria) {
      params.push(categoria);
      where.push(`c.slug = $${params.length}`);
    }
    if (buscar) {
      params.push(`%${buscar}%`);
      where.push(`(p.nombre_es ILIKE $${params.length} OR p.marca ILIKE $${params.length})`);
    }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT p.id, p.sku, p.nombre_es, p.nombre_en, p.descripcion_es,
              p.marca, p.modelo, p.imagen_principal, p.imagenes,
              p.precio_publico, p.precio_cliente, p.precio_revendedor, p.precio_empresa,
              p.stock, p.destacado,
              c.slug as categoria_slug, c.nombre_es as categoria_nombre
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.destacado DESC, p.creado_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Filtrar precios según rol
    const productos = rows.map(p => {
      const precio = getPrecioParaRol(p, userRol);
      return {
        ...p,
        precio_mostrar: precio,
        precio_publico: undefined,
        precio_cliente: undefined,
        precio_revendedor: undefined,
        precio_empresa: undefined,
      };
    });

    res.json({ productos, rol: userRol });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo productos' });
  }
});

// POST /api/admin/productos
app.post('/api/admin/productos', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_editar_productos');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const {
    sku, categoria_id, nombre_es, nombre_en, descripcion_es, marca, modelo,
    precio_publico, precio_cliente, precio_revendedor, precio_empresa,
    stock, stock_minimo, imagen_principal, specs
  } = req.body;

  const { rows } = await db.query(
    `INSERT INTO productos (sku, categoria_id, nombre_es, nombre_en, descripcion_es,
     marca, modelo, precio_publico, precio_cliente, precio_revendedor, precio_empresa,
     stock, stock_minimo, imagen_principal, specs, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id, sku, nombre_es`,
    [sku, categoria_id, nombre_es, nombre_en, descripcion_es, marca, modelo,
     precio_publico, precio_cliente, precio_revendedor, precio_empresa,
     stock || 0, stock_minimo || 5, imagen_principal, specs ? JSON.stringify(specs) : null,
     req.user.id]
  );

  res.status(201).json({ success: true, producto: rows[0] });
});

// PUT /api/admin/productos/:id
app.put('/api/admin/productos/:id', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_editar_productos');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const campos = ['nombre_es','nombre_en','descripcion_es','marca','modelo',
    'precio_publico','precio_cliente','precio_revendedor','precio_empresa',
    'stock','stock_minimo','imagen_principal','activo','destacado'];

  const updates = [];
  const params = [];
  campos.forEach(campo => {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo]);
      updates.push(`${campo}=$${params.length}`);
    }
  });

  if (!updates.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

  params.push(req.params.id);
  await db.query(`UPDATE productos SET ${updates.join(',')} WHERE id=$${params.length}`, params);
  res.json({ success: true });
});

// ============================================================
// RUTAS — ÓRDENES
// ============================================================

// POST /api/ordenes
app.post('/api/ordenes', authMiddleware, async (req, res) => {
  try {
    const { items, notas_cliente, codigo_descuento, direccion, municipio } = req.body;

    let subtotal = 0;
    let descuento_monto = 0;

    // Verificar stock y calcular total
    for (const item of items) {
      const { rows: prod } = await db.query(
        'SELECT * FROM productos WHERE id=$1 AND activo=TRUE', [item.producto_id]
      );
      if (!prod.length) return res.status(400).json({ error: `Producto no encontrado: ${item.producto_id}` });
      const p = prod[0];
      if (p.stock < item.cantidad) {
        return res.status(400).json({ error: `Stock insuficiente para: ${p.nombre_es}` });
      }
      const precio = getPrecioParaRol(p, req.user.rol);
      item.precio_unitario = precio;
      item.subtotal = precio * item.cantidad;
      subtotal += item.subtotal;
    }

    // Aplicar código de descuento
    if (codigo_descuento) {
      const { rows: cod } = await db.query(
        `SELECT * FROM codigos_descuento
         WHERE codigo=$1 AND activo=TRUE
         AND (valido_hasta IS NULL OR valido_hasta > NOW())
         AND (usos_maximos IS NULL OR usos_actuales < usos_maximos)`,
        [codigo_descuento.toUpperCase()]
      );
      if (cod.length) {
        const c = cod[0];
        descuento_monto = c.tipo === 'porcentaje'
          ? subtotal * (c.valor / 100)
          : c.valor;
        await db.query(
          'UPDATE codigos_descuento SET usos_actuales=usos_actuales+1 WHERE id=$1', [c.id]
        );
      }
    }

    const impuesto = (subtotal - descuento_monto) * 0.105; // IVU PR 10.5%
    const total = subtotal - descuento_monto + impuesto;

    const { rows } = await db.query(
      `INSERT INTO ordenes (usuario_id, items, notas_cliente, subtotal, descuento_monto,
       descuento_codigo, impuesto, total, direccion, municipio, tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'producto')
       RETURNING id, numero, total`,
      [req.user.id, JSON.stringify(items), notas_cliente, subtotal,
       descuento_monto, codigo_descuento, impuesto, total, direccion, municipio]
    );

    res.status(201).json({ success: true, orden: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando orden' });
  }
});

// GET /api/ordenes/mis-ordenes
app.get('/api/ordenes/mis-ordenes', authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT o.*, p.metodo as pago_metodo, p.status as pago_status
     FROM ordenes o
     LEFT JOIN pagos p ON p.orden_id = o.id
     WHERE o.usuario_id = $1
     ORDER BY o.creado_en DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// ============================================================
// RUTAS — PAGOS
// ============================================================

// POST /api/pagos/stripe/intent
app.post('/api/pagos/stripe/intent', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe no configurado' });
    const { orden_id } = req.body;

    const { rows } = await db.query('SELECT total FROM ordenes WHERE id=$1 AND usuario_id=$2',
      [orden_id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Orden no encontrada' });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(rows[0].total * 100), // centavos
      currency: 'usd',
      metadata: { orden_id, usuario_id: req.user.id },
    });

    await db.query(
      `INSERT INTO pagos (orden_id, usuario_id, metodo, monto, stripe_payment_id, stripe_client_secret)
       VALUES ($1,$2,'stripe',$3,$4,$5)`,
      [orden_id, req.user.id, rows[0].total, intent.id, intent.client_secret]
    );

    res.json({ client_secret: intent.client_secret, payment_intent_id: intent.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando intent de pago' });
  }
});

// POST /api/pagos/stripe/webhook
app.post('/api/pagos/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe) return res.sendStatus(400);
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      await db.query(
        `UPDATE pagos SET status='completado', completado_en=NOW()
         WHERE stripe_payment_id=$1`, [pi.id]
      );
      await db.query(
        `UPDATE ordenes SET status='pagado'
         WHERE id=$1`, [pi.metadata.orden_id]
      );
    }
    res.json({ received: true });
  }
);

// POST /api/pagos/paypal/create-order
app.post('/api/pagos/paypal/create-order', authMiddleware, async (req, res) => {
  try {
    const { orden_id } = req.body;
    const { rows } = await db.query('SELECT total FROM ordenes WHERE id=$1', [orden_id]);
    if (!rows.length) return res.status(404).json({ error: 'Orden no encontrada' });

    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
    ).toString('base64');

    const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const { access_token } = await tokenRes.json();

    const orderRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: rows[0].total.toFixed(2) },
          custom_id: orden_id,
        }],
      }),
    });
    const ppOrder = await orderRes.json();

    await db.query(
      `INSERT INTO pagos (orden_id, usuario_id, metodo, monto, paypal_order_id)
       VALUES ($1,$2,'paypal',$3,$4)`,
      [orden_id, req.user.id, rows[0].total, ppOrder.id]
    );

    res.json({ paypal_order_id: ppOrder.id });
  } catch (err) {
    res.status(500).json({ error: 'Error con PayPal' });
  }
});

// POST /api/pagos/ath-movil/confirm
app.post('/api/pagos/ath-movil/confirm', authMiddleware, async (req, res) => {
  try {
    const { orden_id, referenceNumber, total } = req.body;

    // Verificar referencia con ATH Móvil API
    const athRes = await fetch('https://www.athmovil.com/rs/MerchantAPI/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ATH_MOVIL_PUBLIC_TOKEN}`,
      },
      body: JSON.stringify({
        publicToken: process.env.ATH_MOVIL_PUBLIC_TOKEN,
        referenceNumber,
      }),
    });

    const athData = await athRes.json();

    if (athData.status === 'success' || athData.paymentStatus === 'completed') {
      await db.query(
        `INSERT INTO pagos (orden_id, usuario_id, metodo, monto, ath_movil_reference, status, completado_en)
         VALUES ($1,$2,'ath_movil',$3,$4,'completado',NOW())`,
        [orden_id, req.user.id, total, referenceNumber]
      );
      await db.query("UPDATE ordenes SET status='pagado' WHERE id=$1", [orden_id]);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Pago no confirmado por ATH Móvil' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error verificando ATH Móvil' });
  }
});

// POST /api/pagos/klarna/session
app.post('/api/pagos/klarna/session', authMiddleware, async (req, res) => {
  try {
    const { orden_id } = req.body;
    const { rows } = await db.query('SELECT * FROM ordenes WHERE id=$1', [orden_id]);
    if (!rows.length) return res.status(404).json({ error: 'Orden no encontrada' });

    const klarnaRes = await fetch('https://api.klarna.com/payments/v1/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.KLARNA_USERNAME}:${process.env.KLARNA_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purchase_country: 'US',
        purchase_currency: 'USD',
        locale: 'en-US',
        order_amount: Math.round(rows[0].total * 100),
        order_lines: [{
          name: `Orden Wifnix #${rows[0].numero}`,
          quantity: 1,
          unit_price: Math.round(rows[0].total * 100),
          total_amount: Math.round(rows[0].total * 100),
        }],
      }),
    });

    const klarna = await klarnaRes.json();
    res.json({ client_token: klarna.client_token, session_id: klarna.session_id });
  } catch (err) {
    res.status(500).json({ error: 'Error con Klarna' });
  }
});

// ============================================================
// RUTAS — CHAT IA
// ============================================================

const WIFNIX_AGENT_PROMPT = `Eres el agente de soporte técnico de Wifnix LLC, una empresa de tecnología en Puerto Rico.
Servicios: CCTV, redes empresariales, HVAC comercial, continuidad operacional, diseño web e inteligencia artificial.
Teléfonos: (787) 354-9596 y (787) 565-0031. Email: sales@wifnix.com.

Tu rol:
1. Saluda profesionalmente y pregunta cómo puedes ayudar.
2. Diagnostica el problema del cliente haciendo preguntas específicas.
3. Ofrece soluciones concretas basadas en los servicios de Wifnix.
4. Si el problema requiere un técnico, di: "Para este caso necesitas hablar con un técnico. ¿Quieres que te conecte ahora?"
5. Para garantías, pide: número de factura, fecha de instalación y descripción del problema.
6. Siempre habla en español a menos que el cliente hable en inglés.
7. Sé conciso, profesional y empático.
8. Nunca inventes precios exactos — di "solicita una cotización gratuita".`;

// POST /api/chat/mensaje
app.post('/api/chat/mensaje', async (req, res) => {
  try {
    const { session_token, mensaje, historial = [] } = req.body;

    if (!mensaje?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

    // Obtener o crear sesión
    let sesion_id;
    if (session_token) {
      const { rows } = await db.query(
        'SELECT id FROM chat_sesiones WHERE session_token=$1 AND status=\'activa\'',
        [session_token]
      );
      if (rows.length) sesion_id = rows[0].id;
    }

    if (!sesion_id) {
      const token = require('crypto').randomUUID();
      const { rows } = await db.query(
        'INSERT INTO chat_sesiones (session_token, status) VALUES ($1,\'activa\') RETURNING id',
        [token]
      );
      sesion_id = rows[0].id;
    }

    // Guardar mensaje del usuario
    await db.query(
      'INSERT INTO chat_mensajes (sesion_id, remitente, mensaje) VALUES ($1,\'usuario\',$2)',
      [sesion_id, mensaje]
    );

    // Preparar historial para Claude
    const messages = [
      ...historial.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: mensaje },
    ];

    // Llamar a Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: WIFNIX_AGENT_PROMPT,
      messages,
    });

    const respuesta = response.content[0].text;

    // Guardar respuesta de IA
    await db.query(
      'INSERT INTO chat_mensajes (sesion_id, remitente, mensaje) VALUES ($1,\'ia\',$2)',
      [sesion_id, respuesta]
    );

    // Detectar si necesita técnico
    const necesita_tecnico =
      respuesta.toLowerCase().includes('técnico') ||
      respuesta.toLowerCase().includes('conecte') ||
      mensaje.toLowerCase().includes('técnico') ||
      mensaje.toLowerCase().includes('hablar con alguien');

    res.json({
      respuesta,
      sesion_id,
      necesita_tecnico,
    });
  } catch (err) {
    console.error('Error chat:', err);
    res.status(500).json({ error: 'Error en el servicio de chat' });
  }
});

// POST /api/chat/solicitar-tecnico
app.post('/api/chat/solicitar-tecnico', async (req, res) => {
  try {
    const { sesion_id, nombre, telefono, email, problema } = req.body;

    // Crear ticket de soporte
    const { rows } = await db.query(
      `INSERT INTO tickets (asunto, descripcion, categoria, prioridad)
       VALUES ($1,$2,'tecnico','alta') RETURNING id, numero`,
      [
        `Chat: ${problema?.substring(0, 100) || 'Solicitud de técnico'}`,
        `Nombre: ${nombre}\nTeléfono: ${telefono}\nEmail: ${email}\nProblema: ${problema}`,
      ]
    );

    await db.query(
      `UPDATE chat_sesiones SET status='solicitud_tecnico', ticket_generado=$1 WHERE id=$2`,
      [rows[0].id, sesion_id]
    );

    res.json({
      success: true,
      ticket_numero: rows[0].numero,
      mensaje: `Tu solicitud fue registrada (Ticket #${rows[0].numero}). Un técnico te contactará pronto al ${telefono}.`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error creando solicitud' });
  }
});

// ============================================================
// RUTAS — GARANTÍAS
// ============================================================

app.post('/api/garantias', authMiddleware, async (req, res) => {
  const {
    producto_nombre, producto_serial, numero_factura,
    fecha_instalacion, descripcion
  } = req.body;

  const { rows } = await db.query(
    `INSERT INTO garantias (usuario_id, producto_nombre, producto_serial,
     numero_factura, fecha_instalacion, descripcion)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, numero_factura`,
    [req.user.id, producto_nombre, producto_serial,
     numero_factura, fecha_instalacion, descripcion]
  );

  res.status(201).json({ success: true, garantia_id: rows[0].id });
});

app.get('/api/garantias/mis-garantias', authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM garantias WHERE usuario_id=$1 ORDER BY creado_en DESC',
    [req.user.id]
  );
  res.json(rows);
});

// ============================================================
// RUTAS — INVENTARIO ADMIN
// ============================================================

app.get('/api/admin/inventario', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_ver_inventario');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const { rows } = await db.query('SELECT * FROM v_inventario_alertas');
  res.json(rows);
});

app.put('/api/admin/inventario/:id/ajuste', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_editar_inventario');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const { cantidad, motivo, tipo } = req.body;
  const { id } = req.params;

  const { rows: prod } = await db.query('SELECT stock FROM productos WHERE id=$1', [id]);
  if (!prod.length) return res.status(404).json({ error: 'Producto no encontrado' });

  const stock_anterior = prod[0].stock;
  const stock_nuevo = tipo === 'entrada' ? stock_anterior + cantidad : stock_anterior - cantidad;

  await db.query('UPDATE productos SET stock=$1 WHERE id=$2', [stock_nuevo, id]);
  await db.query(
    `INSERT INTO inventario_movimientos (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, req.user.id, tipo, cantidad, stock_anterior, stock_nuevo, motivo]
  );

  res.json({ success: true, stock_nuevo });
});

// ============================================================
// RUTAS — REPORTES (solo contabilidad y super_admin)
// ============================================================

app.get('/api/reportes/ventas', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_ver_reportes');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const { rows } = await db.query('SELECT * FROM v_ventas_mes');
  res.json(rows);
});

app.get('/api/reportes/resumen', authMiddleware, async (req, res) => {
  const perm = await checkPermiso(req.user.id, 'puede_ver_finanzas');
  if (!perm) return res.status(403).json({ error: 'Sin permiso' });

  const [ventas, usuarios, inventario] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(monto),0) as total_mes
              FROM pagos WHERE status='completado'
              AND creado_en >= DATE_TRUNC('month', NOW())`),
    db.query('SELECT * FROM v_usuarios_resumen'),
    db.query('SELECT COUNT(*) FILTER (WHERE alerta=\'stock_bajo\') as stock_bajo, COUNT(*) FILTER (WHERE alerta=\'sin_stock\') as sin_stock FROM v_inventario_alertas'),
  ]);

  res.json({
    ventas_mes: ventas.rows[0].total_mes,
    usuarios: usuarios.rows,
    inventario: inventario.rows[0],
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  } catch {
    res.status(500).json({ status: 'error', db: 'unreachable' });
  }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Wifnix API corriendo en puerto ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌ No configurado'}`);
  console.log(`🤖 Claude AI: ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌ No configurado'}`);
});

module.exports = app;
