// ============================================================
// WIFNIX LLC — BACKEND COMPLETO
// Node.js + Express + PostgreSQL
// ============================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');

// Fecha de hoy en Puerto Rico (servidor ya esta en hora AST)
function fechaHoyPR() {
  const ahora = new Date();
  return ahora.getFullYear() + '-' + String(ahora.getMonth()+1).padStart(2,'0') + '-' + String(ahora.getDate()).padStart(2,'0');
}
const twilio = require('twilio');




let twilioClient;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
require('dotenv').config();

// Despues de dotenv, no antes: este modulo necesita JWT_SECRET.
const oauth = require('./lib/oauth');
twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// EMAIL
const nodemailer = require('nodemailer');
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.titan.email',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false }
});

// Plantilla de email profesional con branding Wifnix
function emailTemplate(opts) {
  var titulo = opts.titulo || '';
  var saludo = opts.saludo || 'Hola,';
  var cuerpo = opts.cuerpo || '';
  var despedida = opts.despedida || 'Cordialmente,';
  var cta = opts.cta || null;
  var year = new Date().getFullYear();
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;background:#F1F5F9;color:#0F172A;line-height:1.6">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:30px 16px"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);max-width:600px;margin:0 auto">' +
    // HEADER con logo
    '<tr><td style="background:#FFFFFF;border-bottom:3px solid #0B8FCC;padding:36px 32px;text-align:center">' +
    '<img src="https://wifnix.com/assets/logo-wifnix.png" alt="Wifnix LLC" style="height:48px;width:auto;display:inline-block;max-width:220px">' +
    '<div style="color:#64748B;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin-top:12px;font-weight:600">Tecnología que protege tu negocio</div>' +
    '</td></tr>' +
    // BODY
    '<tr><td style="padding:40px 36px 32px">' +
    '<h2 style="margin:0 0 20px;color:#0F172A;font-size:22px;font-weight:700;line-height:1.3">' + titulo + '</h2>' +
    '<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.7">' + saludo + '</p>' +
    '<div style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 18px">' + cuerpo + '</div>' +
    (cta ? '<div style="text-align:center;margin:28px 0"><a href="' + cta.url + '" style="display:inline-block;background:#0B8FCC;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:0.03em;box-shadow:0 4px 16px rgba(11,143,204,0.3)">' + cta.texto + '</a></div>' : '') +
    '<p style="margin:24px 0 6px;color:#334155;font-size:15px;line-height:1.7">' + despedida + '</p>' +
    '<p style="margin:0;color:#0F172A;font-weight:700;font-size:15px">Equipo Wifnix LLC</p>' +
    '</td></tr>' +
    // FOOTER
    '<tr><td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:28px 32px;text-align:center">' +
    '<div style="margin-bottom:16px"><a href="https://wifnix.com" style="display:inline-block;color:#0B8FCC;font-weight:700;text-decoration:none;font-size:16px">wifnix.com</a></div>' +
    // Social icons
    '<table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px"><tr>' +
    '<td style="padding:0 5px"><a href="https://instagram.com/wifnixllc" style="display:inline-block;width:34px;height:34px;background:#0B8FCC;border-radius:50%;text-align:center;line-height:34px;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;font-family:Arial,sans-serif">IG</a></td>' +
    '<td style="padding:0 5px"><a href="https://facebook.com/wifnixllc" style="display:inline-block;width:34px;height:34px;background:#0B8FCC;border-radius:50%;text-align:center;line-height:34px;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;font-family:Arial,sans-serif">FB</a></td>' +
    '<td style="padding:0 5px"><a href="https://linkedin.com/company/wifnixllc" style="display:inline-block;width:34px;height:34px;background:#0B8FCC;border-radius:50%;text-align:center;line-height:34px;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;font-family:Arial,sans-serif">in</a></td>' +
    '</tr></table>' +
    // Contact info
    '<div style="color:#64748B;font-size:12px;line-height:1.8">' +
    '<div>HC 06 Box 70500, Caguas PR 00727</div>' +
    '<div><a href="tel:+17873549596" style="color:#0B8FCC;text-decoration:none">(787) 354-9596</a> · <a href="tel:+17875650031" style="color:#0B8FCC;text-decoration:none">(787) 565-0031</a></div>' +
    '<div><a href="mailto:customerservice@wifnix.com" style="color:#0B8FCC;text-decoration:none">customerservice@wifnix.com</a></div>' +
    '</div>' +
    // Copyright
    '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0;color:#94A3B8;font-size:11px;line-height:1.6">' +
    '© ' + year + ' Wifnix LLC. Todos los derechos reservados.<br>' +
    'Has recibido este email porque tienes una cuenta o solicitud activa con Wifnix.' +
    '</div>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}


async function sendEmail(to, subject, html) {
  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || 'Wifnix LLC <customerservice@wifnix.com>', to, subject, html });
    console.log('Email enviado a:', to);
    return true;
  } catch(e) { console.error('Email error:', e.message); return false; }
}






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
app.use(cors({
  origin: [
    'https://wifnix.com','https://www.wifnix.com',
    'https://portal.wifnix.com',
    'https://admin.wifnix.com',
    'https://api.wifnix.com',
    'https://tecnicos.wifnix.com',
    'https://app.wifnix.com',
    'http://localhost:3000',
    'http://localhost:8080',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use('/api', limiter);
const chatLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados mensajes, intenta mas tarde' } });
app.use('/api/chat', chatLimiter);
// authLimiter se aplica solo a login y rutas sensibles, no a /api/auth/me

// ============================================================
// HELPERS — AUTH
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET no configurado o demasiado corto (minimo 32 caracteres). Define JWT_SECRET en el archivo .env antes de iniciar.');
  process.exit(1);
}
const JWT_EXPIRES = process.env.JWT_EXPIRES || '2d';

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

// requireRoles eliminado: era codigo muerto con logica laxa (cualquier admin pasaba). La autorizacion real usa checkPermiso().

const PERMISOS_VALIDOS = new Set(['puede_ver_ventas','puede_crear_ventas','puede_ver_clientes','puede_editar_clientes','puede_ver_productos','puede_editar_productos','puede_ver_inventario','puede_editar_inventario','puede_ver_reportes','puede_ver_finanzas','puede_gestionar_garantias','puede_gestionar_tecnicos','puede_crear_admins']);
async function checkPermiso(userId, permiso) {
  if (!PERMISOS_VALIDOS.has(permiso)) return false;
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
      return producto.precio_revendedor ?? producto.precio_cliente ?? producto.precio_publico;
    case 'cliente':
      return producto.precio_cliente ?? producto.precio_publico;
    case 'empresa_servicios':
      return producto.precio_empresa ?? producto.precio_cliente ?? producto.precio_publico;
    case 'super_admin':
    case 'admin_soporte':
    case 'admin_inventario':
    case 'admin_tecnico':
    case 'admin_contabilidad':
      return producto.precio_publico ?? producto.precio_cliente;
    default:
      return null;
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, email, rol, nombre, apellido, telefono, empresa_nombre, telefono_verificado`,
      [email.toLowerCase(), hash, rol, nombre, apellido, telefono, empresa_nombre, empresa_tipo, verificacion]
    );

    const user = rows[0];
    const token = signToken({ userId: user.id, rol: user.rol });

    if (rol_solicitado !== 'reseller' && rol_solicitado !== 'empresa_revendedora') sendWelcomeEmail(email, nombre, rol_solicitado, empresa_nombre).catch(()=>{});
    res.status(201).json({
      token,
      usuario: { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre, apellido: user.apellido, telefono: user.telefono, empresa_nombre: user.empresa_nombre, telefono_verificado: user.telefono_verificado },
      user: { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre, apellido: user.apellido, telefono: user.telefono, telefono_verificado: user.telefono_verificado },
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
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const { rows } = await db.query(
      `SELECT id, email, password_hash, rol, status, nombre, apellido, foto_url
       FROM usuarios WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = rows[0];
    if (user.status === 'suspendido') return res.status(403).json({ error: 'Cuenta suspendida' });
    if (user.status === 'bloqueado') return res.status(403).json({ error: 'Cuenta bloqueada' });

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
              foto_url, empresa_nombre, empresa_tipo, verificacion, bio,
              direccion_fisica, municipio_fisica, zip_fisica,
              direccion_postal, municipio_postal, zip_postal, postal_igual_fisica,
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

const TIPOS_IMG = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (TIPOS_IMG.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imagenes JPG, PNG o WEBP'));
  },
});

// PUT /api/perfil
app.put('/api/perfil', authMiddleware, async (req, res) => {
  try {
    const { nombre, apellido, telefono, bio, empresa_nombre, empresa_tipo,
            direccion_fisica, municipio_fisica, zip_fisica,
            direccion_postal, municipio_postal, zip_postal, postal_igual_fisica } = req.body;
    // Si postal igual a fisica, copiar
    const dPostal = postal_igual_fisica ? direccion_fisica : direccion_postal;
    const mPostal = postal_igual_fisica ? municipio_fisica : municipio_postal;
    const zPostal = postal_igual_fisica ? zip_fisica : zip_postal;
    const { rows } = await db.query(
      `UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, bio=$4,
       empresa_nombre=$5, empresa_tipo=$6,
       direccion_fisica=$7, municipio_fisica=$8, zip_fisica=$9,
       direccion_postal=$10, municipio_postal=$11, zip_postal=$12, postal_igual_fisica=$13,
       actualizado_en=NOW()
       WHERE id=$14 RETURNING id, nombre, apellido, telefono, bio, empresa_nombre,
       direccion_fisica, municipio_fisica, zip_fisica, direccion_postal, municipio_postal, zip_postal, postal_igual_fisica`,
      [nombre, apellido, telefono, bio, empresa_nombre, empresa_tipo,
       direccion_fisica||null, municipio_fisica||null, zip_fisica||null,
       dPostal||null, mPostal||null, zPostal||null, postal_igual_fisica||false, req.user.id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando perfil' });
  }
});

// POST /api/perfil/foto — Upload profile photo
app.post('/api/perfil/foto', authMiddleware, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });

    // Validar por bytes magicos: NO confiar en el mimetype enviado por el cliente
    const b = req.file.buffer;
    let mime = null;
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) mime = 'image/jpeg';
    else if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) mime = 'image/png';
    else if (b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
    if (!mime) return res.status(400).json({ error: 'El archivo no es una imagen valida (JPG, PNG o WEBP)' });

    const base64 = b.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

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

  const ROLES_VALIDOS = ['cliente','tecnico_independiente','empresa_revendedora','empresa_servicios','super_admin','admin_soporte','admin_inventario','admin_tecnico','admin_contabilidad'];
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: 'Rol invalido' });
  }
  if ((rol === 'super_admin' || (permisos && permisos.acceso_total)) && req.user.rol !== 'super_admin') {
    return res.status(403).json({ error: 'Solo un super_admin puede otorgar ese nivel de acceso' });
  }
  if (String(id) === String(req.user.id)) {
    return res.status(403).json({ error: 'No puedes cambiar tu propio rol' });
  }

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
// RUTAS — PRODUCTOS
// ============================================================

// GET /api/productos — Precios según rol
app.get('/api/productos', async (req, res) => {
  try {
    let userRol = "public";
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
        const { rows } = await db.query('SELECT rol FROM usuarios WHERE id=$1 AND status=$2', [decoded.userId, 'activo']);
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
      [req.user.id, JSON.stringify(items.map(i => ({...i, ath_ref: ath_reference || null}))), notas_cliente, subtotal,
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
      return res.status(400).send('Webhook signature verification failed');
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
7. Sé MUY conciso. Máximo 2-3 oraciones por respuesta. Una pregunta a la vez. No hagas listas.
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

    // Historial reconstruido desde la base de datos (no se confia en el cliente)
    const { rows: hist } = await db.query(
      `SELECT remitente, mensaje FROM chat_mensajes WHERE sesion_id=$1 ORDER BY creado_en DESC LIMIT 20`,
      [sesion_id]
    );
    let messages = hist.reverse().map(h => ({
      role: h.remitente === 'ia' ? 'assistant' : 'user',
      content: h.mensaje,
    }));
    while (messages.length && messages[0].role === 'assistant') messages.shift();

    // Llamar a Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 150,
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

// ══ LEADS ══
app.post('/api/leads', async (req, res) => {
  try {
    const { nombre, email, telefono, herramienta, datos, estimado } = req.body;
    await pool.query(
      'INSERT INTO leads (nombre, email, telefono, herramienta, datos, estimado) VALUES ($1,$2,$3,$4,$5,$6)',
      [nombre, email, telefono||'', herramienta||'', JSON.stringify(datos||{}), estimado||'']
    );
    res.json({ ok: true, mensaje: 'Lead guardado' });
  } catch(e) {
    console.error('Lead error:', e.message);
    res.status(500).json({ error: e.message });
  }
});



app.post('/api/verificar-cliente', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ existe: false });
    const result = await db.query(
      'SELECT id, nombre, apellido, email, tipo_cuenta, num_cliente FROM usuarios WHERE email = $1 AND activo = true',
      [email.toLowerCase().trim()]
    );
    if (result.rows.length > 0) {
      const u = result.rows[0];
      res.json({ existe: true, nombre: u.nombre, apellido: u.apellido, tipo: u.tipo_cuenta, num: u.num_cliente });
    } else {
      res.json({ existe: false });
    }
  } catch(e) {
    res.json({ existe: false });
  }
});


app.post('/api/tickets-agente', async (req, res) => {
  try {
    const { usuario_id, servicio, contacto, disponibilidad, notas } = req.body;
    const result = await db.query(
      `INSERT INTO tickets (usuario_id, asunto, descripcion, prioridad, canal_contacto, disponibilidad, estado, creado_por, fecha_creacion)
       VALUES ($1,$2,$3,'alta',$4,$5,'abierto','agente_ia',NOW()) RETURNING id`,
      [usuario_id, 'Solicitud via Agente — ' + servicio, notas||'', contacto||'', disponibilidad||'']
    );
    res.json({ ok: true, ticket_id: result.rows[0].id });
  } catch(e) {
    console.error('Ticket agente error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ══ PORTAL ROUTES ══

// Tickets del cliente
app.get('/api/mis-tickets', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, numero, asunto, descripcion, categoria, status, prioridad, creado_en, actualizado_en FROM tickets WHERE usuario_id = $1 ORDER BY creado_en DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Crear ticket
app.post('/api/mis-tickets', authMiddleware, async (req, res) => {
  try {
    const { asunto, descripcion, categoria } = req.body;
    const result = await db.query(
      `INSERT INTO tickets (usuario_id, asunto, descripcion, categoria)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, asunto, descripcion, categoria||'general']
    );
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Responder ticket
app.post('/api/mis-tickets/:id/mensaje', authMiddleware, async (req, res) => {
  try {
    const { mensaje } = req.body;
    await db.query(
      `INSERT INTO ticket_mensajes (ticket_id, autor_id, autor_rol, mensaje)
       VALUES ($1,$2,$3,$4)`,
      [req.params.id, req.user.id, req.user.rol, mensaje]
    );
    await db.query(`UPDATE tickets SET actualizado_en=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ok: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Mis garantias
app.get('/api/mis-garantias', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM garantias WHERE usuario_id=$1 ORDER BY creado_en DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Mis ordenes con detalle
app.get('/api/mis-ordenes', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM ordenes WHERE usuario_id=$1 ORDER BY creado_en DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Servicios disponibles
app.get('/api/servicios', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM servicios WHERE activo=true ORDER BY categoria, nombre_es`
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Dashboard resumen del cliente
app.get('/api/mi-dashboard', authMiddleware, async (req, res) => {
  try {
    const [tickets, garantias, ordenes] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='abierto') as abiertos FROM tickets WHERE usuario_id=$1`, [req.user.id]),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE fecha_vencimiento >= NOW()) as activas FROM garantias WHERE usuario_id=$1`, [req.user.id]),
      db.query(`SELECT COUNT(*) as total, COALESCE(SUM(total),0) as gastado FROM ordenes WHERE usuario_id=$1`, [req.user.id]),
    ]);
    res.json({
      tickets: tickets.rows[0],
      garantias: garantias.rows[0],
      ordenes: ordenes.rows[0],
      usuario: {nombre: req.user.nombre, rol: req.user.rol, empresa: req.user.empresa_nombre}
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Actualizar perfil completo
app.put('/api/mi-perfil', authMiddleware, async (req, res) => {
  try {
    const { nombre, apellido, telefono, empresa_nombre, empresa_tipo, empresa_ein } = req.body;
    await db.query(
      `UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, empresa_nombre=$4, empresa_tipo=$5, empresa_ein=$6, actualizado_en=NOW() WHERE id=$7`,
      [nombre, apellido, telefono, empresa_nombre, empresa_tipo, empresa_ein, req.user.id]
    );
    res.json({ok: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});


// ══ 2FA + SEGURIDAD ══

// Login con 2FA - paso 1: verificar credenciales y enviar código
app.post('/api/auth/login-2fa', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({error: 'Email y contraseña requeridos'});
    
    const result = await db.query('SELECT * FROM usuarios WHERE email=$1 AND status=$2', [email.toLowerCase(), 'activo']);
    if (result.rows.length === 0) return res.status(401).json({error: 'Credenciales incorrectas'});
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({error: 'Credenciales incorrectas'});
    
    // 2FA por SMS deshabilitado temporalmente (A2P 10DLC pendiente)
    // Cuando se registre, reactivar el bloque de envío de SMS
    return res.json({requiere_2fa: false, token: jwt.sign({userId: user.id, rol: user.rol}, process.env.JWT_SECRET, {expiresIn: '7d'}), usuario: {id: user.id, email: user.email, nombre: user.nombre, apellido: user.apellido, rol: user.rol}});
  } catch(e) {
    console.error('Login 2FA error:', e.message);
    res.status(500).json({error: 'Error enviando código. Intenta nuevamente.'});
  }
});

// Login con 2FA - paso 2: verificar código
app.post('/api/auth/verificar-2fa', async (req, res) => {
  try {
    const { usuario_id, codigo } = req.body;
    if (!usuario_id || !codigo) return res.status(400).json({error: 'Datos incompletos'});
    
    const result = await db.query(
      'SELECT * FROM codigos_2fa WHERE usuario_id=$1 AND codigo=$2 AND usado=FALSE AND expira_en > NOW()',
      [usuario_id, codigo]
    );
    
    if (result.rows.length === 0) return res.status(401).json({error: 'Código inválido o expirado'});
    
    // Marcar como usado
    await db.query('UPDATE codigos_2fa SET usado=TRUE WHERE id=$1', [result.rows[0].id]);
    
    // Obtener usuario y generar token
    const user = await db.query('SELECT * FROM usuarios WHERE id=$1', [usuario_id]);
    const u = user.rows[0];
    
    const token = jwt.sign({userId: u.id, rol: u.rol}, process.env.JWT_SECRET, {expiresIn: '7d'});
    await db.query('UPDATE usuarios SET ultimo_login=NOW() WHERE id=$1', [u.id]);
    
    res.json({token, usuario: {id: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido, rol: u.rol, telefono: u.telefono}});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// Cambiar contraseña
app.put('/api/auth/cambiar-password', authMiddleware, async (req, res) => {
  try {
    const { password_actual, password_nuevo } = req.body;
    if (!password_actual || !password_nuevo) return res.status(400).json({error: 'Completa todos los campos'});
    if (password_nuevo.length < 8) return res.status(400).json({error: 'La contraseña debe tener al menos 8 caracteres'});
    
    const result = await db.query('SELECT password_hash FROM usuarios WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(password_actual, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({error: 'La contraseña actual es incorrecta'});
    
    const hash = await bcrypt.hash(password_nuevo, 12);
    await db.query('UPDATE usuarios SET password_hash=$1, actualizado_en=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ok: true, mensaje: 'Contraseña actualizada correctamente'});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// Cancelar ticket propio
app.put('/api/mis-tickets/:id/cancelar', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE tickets SET status=$1, actualizado_en=NOW() WHERE id=$2 AND usuario_id=$3 AND status NOT IN ($4,$5) RETURNING id',
      ['cerrado', req.params.id, req.user.id, 'resuelto', 'cerrado']
    );
    if (result.rows.length === 0) return res.status(404).json({error: 'Ticket no encontrado o ya está cerrado'});
    res.json({ok: true});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});


// ══ VERIFICACIÓN DE CUENTA ══

// Enviar código de verificación de teléfono
app.post('/api/auth/enviar-verificacion-tel', authMiddleware, async (req, res) => {
  try {
    const user = await db.query('SELECT * FROM usuarios WHERE id=$1', [req.user.id]);
    const u = user.rows[0];
    if (!u.telefono) return res.status(400).json({error: 'No tienes teléfono registrado'});
    if (u.telefono_verificado) return res.json({ok: true, mensaje: 'Teléfono ya verificado'});

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expira = new Date(Date.now() + 10 * 60 * 1000);
    await db.query('DELETE FROM codigos_2fa WHERE usuario_id=$1', [u.id]);
    await db.query('INSERT INTO codigos_2fa (usuario_id, codigo, expira_en) VALUES ($1,$2,$3)', [u.id, codigo, expira]);

    const tel = u.telefono.replace(/[^0-9]/g,'');
    const telFormato = tel.startsWith('1') ? '+'+tel : '+1'+tel;
    await twilioClient.messages.create({
      body: 'Wifnix: Tu código de verificación es ' + codigo + '. Válido por 10 minutos.',
      from: process.env.TWILIO_PHONE,
      to: telFormato
    });
    res.json({ok: true, mensaje: 'Código enviado a ' + u.telefono.slice(-4).padStart(u.telefono.length,'*')});
  } catch(e) {
    console.error('Verificacion tel error:', e.message);
    res.status(500).json({error: 'Error enviando SMS. Verifica tu número.'});
  }
});

// Verificar código de teléfono
app.post('/api/auth/verificar-telefono', authMiddleware, async (req, res) => {
  try {
    const { codigo } = req.body;
    const result = await db.query(
      'SELECT * FROM codigos_2fa WHERE usuario_id=$1 AND codigo=$2 AND usado=FALSE AND expira_en > NOW()',
      [req.user.id, codigo]
    );
    if (result.rows.length === 0) return res.status(401).json({error: 'Código inválido o expirado'});
    await db.query('UPDATE codigos_2fa SET usado=TRUE WHERE id=$1', [result.rows[0].id]);
    await db.query('UPDATE usuarios SET telefono_verificado=TRUE, status=$1 WHERE id=$2', ['activo', req.user.id]);
    res.json({ok: true, mensaje: 'Teléfono verificado correctamente'});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// Enviar código al registrarse (sin auth)
app.post('/api/auth/enviar-verificacion-registro', async (req, res) => {
  try {
    const { usuario_id } = req.body;
    const user = await db.query('SELECT * FROM usuarios WHERE id=$1', [usuario_id]);
    if (user.rows.length === 0) return res.status(404).json({error: 'Usuario no encontrado'});
    const u = user.rows[0];
    if (!u.telefono) return res.json({ok: true, sin_telefono: true});

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expira = new Date(Date.now() + 10 * 60 * 1000);
    await db.query('DELETE FROM codigos_2fa WHERE usuario_id=$1', [u.id]);
    await db.query('INSERT INTO codigos_2fa (usuario_id, codigo, expira_en) VALUES ($1,$2,$3)', [u.id, codigo, expira]);

    const tel = u.telefono.replace(/[^0-9]/g,'');
    const telFormato = tel.startsWith('1') ? '+'+tel : '+1'+tel;
    await twilioClient.messages.create({
      body: 'Wifnix: Bienvenido. Tu código de verificación es ' + codigo + '. Válido por 10 minutos.',
      from: process.env.TWILIO_PHONE,
      to: telFormato
    });
    res.json({ok: true, mensaje: 'Código enviado a ' + u.telefono.slice(-4).padStart(u.telefono.length,'*')});
  } catch(e) {
    console.error('Verificacion registro error:', e.message);
    res.status(500).json({error: 'Error enviando SMS.'});
  }
});

// Verificar código de registro (sin auth)
app.post('/api/auth/verificar-registro', async (req, res) => {
  try {
    const { usuario_id, codigo } = req.body;
    const result = await db.query(
      'SELECT * FROM codigos_2fa WHERE usuario_id=$1 AND codigo=$2 AND usado=FALSE AND expira_en > NOW()',
      [usuario_id, codigo]
    );
    if (result.rows.length === 0) return res.status(401).json({error: 'Código inválido o expirado'});
    await db.query('UPDATE codigos_2fa SET usado=TRUE WHERE id=$1', [result.rows[0].id]);
    await db.query('UPDATE usuarios SET telefono_verificado=TRUE WHERE id=$1', [usuario_id]);

    const user = await db.query('SELECT * FROM usuarios WHERE id=$1', [usuario_id]);
    const u = user.rows[0];
    const token = jwt.sign({userId: u.id, rol: u.rol}, process.env.JWT_SECRET, {expiresIn: '7d'});
    await db.query('UPDATE usuarios SET ultimo_login=NOW() WHERE id=$1', [u.id]);
    res.json({ok: true, token, usuario: {id: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido, rol: u.rol, telefono: u.telefono, telefono_verificado: true}});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});


// ── RECUPERAR CONTRASEÑA ──
app.post('/api/auth/recuperar-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({error: 'Email requerido'});
    
    const result = await db.query('SELECT id, nombre FROM usuarios WHERE email=$1 AND status=$2', [email.toLowerCase(), 'activo']);
    if (result.rows.length === 0) return res.json({ok: true}); // Don't reveal if email exists
    
    const u = result.rows[0];
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expira = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
    
    await db.query('DELETE FROM codigos_2fa WHERE usuario_id=$1', [u.id]);
    await db.query('INSERT INTO codigos_2fa (usuario_id, codigo, expira_en) VALUES ($1,$2,$3)', [u.id, codigo, expira]);
    
    await sendEmail(email, 'Recuperar contraseña — Wifnix', emailTemplate({
      titulo: 'Recuperar contraseña',
      saludo: 'Hola ' + (u.nombre || '') + ',',
      cuerpo: '<p style="margin:0 0 14px">Recibimos una solicitud para restablecer la contraseña de tu cuenta Wifnix.</p>' +
        '<p style="margin:0 0 14px">Usa el siguiente código para completar el proceso:</p>' +
        '<div style="background:#F0F9FF;border:2px solid #0B8FCC;border-radius:10px;padding:24px;text-align:center;margin:20px 0">' +
        '<div style="font-size:32px;font-weight:800;letter-spacing:0.3em;color:#0B8FCC;font-family:monospace">' + codigo + '</div>' +
        '<div style="font-size:12px;color:#64748B;margin-top:8px;letter-spacing:0.05em">Válido por 30 minutos</div>' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#64748B">Si no solicitaste este cambio, ignora este mensaje y tu contraseña permanecerá segura.</p>',
      despedida: 'Cordialmente,'
    }));
    
    res.json({ok: true, mensaje: 'Instrucciones enviadas a tu email'});
  } catch(e) {
    console.error('Recuperar password error:', e.message);
    res.status(500).json({error: 'Error enviando email'});
  }
});

// Verificar código y cambiar password (recuperación)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, codigo, nueva_password } = req.body;
    if (!email || !codigo || !nueva_password) return res.status(400).json({error: 'Datos incompletos'});
    if (nueva_password.length < 8) return res.status(400).json({error: 'La contraseña debe tener al menos 8 caracteres'});
    
    const user = await db.query('SELECT id FROM usuarios WHERE email=$1', [email.toLowerCase()]);
    if (user.rows.length === 0) return res.status(404).json({error: 'Email no encontrado'});
    
    const u = user.rows[0];
    const result = await db.query(
      'SELECT * FROM codigos_2fa WHERE usuario_id=$1 AND codigo=$2 AND usado=FALSE AND expira_en > NOW()',
      [u.id, codigo]
    );
    if (result.rows.length === 0) return res.status(401).json({error: 'Código inválido o expirado'});
    
    await db.query('UPDATE codigos_2fa SET usado=TRUE WHERE id=$1', [result.rows[0].id]);
    const hash = await bcrypt.hash(nueva_password, 12);
    await db.query('UPDATE usuarios SET password_hash=$1, actualizado_en=NOW() WHERE id=$2', [hash, u.id]);
    
    res.json({ok: true, mensaje: 'Contraseña actualizada correctamente'});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// Email de bienvenida al registrarse
async function sendWelcomeEmail(email, nombre, tipoCuenta, empresaNombre) {
  var esEmpresa = tipoCuenta === 'empresa' || tipoCuenta === 'empresa_servicios';
  var saludoNombre = esEmpresa && empresaNombre ? empresaNombre : nombre;
  var titulo = esEmpresa ? '¡Bienvenido a Wifnix, ' + (empresaNombre || nombre) + '!' : '¡Bienvenido a Wifnix, ' + nombre + '!';
  var saludo = esEmpresa ? 'Hola equipo de ' + (empresaNombre || 'su empresa') + ',' : 'Hola ' + nombre + ',';
  var cuerpo = esEmpresa
    ? '<p style="margin:0 0 14px">La cuenta empresarial de <strong>' + (empresaNombre || nombre) + '</strong> ha sido creada exitosamente. Ya pueden acceder al portal con beneficios especiales para empresas.</p>' +
      '<p style="margin:0 0 14px">Desde su portal empresarial podrán:</p>' +
      '<ul style="margin:0 0 14px;padding-left:20px;color:#334155">' +
      '<li style="margin-bottom:6px">Gestionar tickets de soporte técnico empresarial</li>' +
      '<li style="margin-bottom:6px">Acceder a precios preferenciales para empresas</li>' +
      '<li style="margin-bottom:6px">Solicitar cotizaciones personalizadas y proyectos a medida</li>' +
      '<li style="margin-bottom:6px">Ver garantías activas y servicios de mantenimiento</li>' +
      '<li style="margin-bottom:6px">Coordinar instalaciones y mantenimientos preventivos</li>' +
      '</ul>' +
      '<p style="margin:0;color:#64748B;font-size:14px">Para necesidades específicas o cotizaciones a gran escala, nuestro equipo está a su disposición.</p>'
    : '<p style="margin:0 0 14px">Tu cuenta ha sido creada exitosamente. Ya puedes acceder al portal para gestionar tus servicios, tickets, garantías y mucho más.</p>' +
      '<p style="margin:0 0 14px">Desde tu portal podrás:</p>' +
      '<ul style="margin:0 0 14px;padding-left:20px;color:#334155">' +
      '<li style="margin-bottom:6px">Solicitar soporte técnico y dar seguimiento a tickets</li>' +
      '<li style="margin-bottom:6px">Ver el estatus de tus garantías y órdenes</li>' +
      '<li style="margin-bottom:6px">Acceder a herramientas y calculadoras especializadas</li>' +
      '<li style="margin-bottom:6px">Recibir cotizaciones personalizadas</li>' +
      '</ul>' +
      '<p style="margin:0;color:#64748B;font-size:14px">Si tienes preguntas, no dudes en contactarnos.</p>';
  await sendEmail(email, esEmpresa ? '¡Bienvenidos a Wifnix LLC!' : '¡Bienvenido a Wifnix LLC!', emailTemplate({
    titulo: titulo,
    saludo: saludo,
    cuerpo: cuerpo,
    cta: { texto: 'Acceder al Portal', url: 'https://portal.wifnix.com' },
    despedida: esEmpresa ? 'Atentamente,' : 'Bienvenido a la familia,'
  }));
}


// ── RECUPERAR CONTRASEÑA ──
app.post('/api/auth/recuperar-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({error: 'Email requerido'});
    
    const result = await db.query('SELECT id, nombre FROM usuarios WHERE email=$1 AND status=$2', [email.toLowerCase(), 'activo']);
    if (result.rows.length === 0) return res.json({ok: true}); // Don't reveal if email exists
    
    const u = result.rows[0];
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expira = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
    
    await db.query('DELETE FROM codigos_2fa WHERE usuario_id=$1', [u.id]);
    await db.query('INSERT INTO codigos_2fa (usuario_id, codigo, expira_en) VALUES ($1,$2,$3)', [u.id, codigo, expira]);
    
    await sendEmail(email, 'Recuperar contraseña — Wifnix', emailTemplate({
      titulo: 'Recuperar contraseña',
      saludo: 'Hola ' + (u.nombre || '') + ',',
      cuerpo: '<p style="margin:0 0 14px">Recibimos una solicitud para restablecer la contraseña de tu cuenta Wifnix.</p>' +
        '<p style="margin:0 0 14px">Usa el siguiente código para completar el proceso:</p>' +
        '<div style="background:#F0F9FF;border:2px solid #0B8FCC;border-radius:10px;padding:24px;text-align:center;margin:20px 0">' +
        '<div style="font-size:32px;font-weight:800;letter-spacing:0.3em;color:#0B8FCC;font-family:monospace">' + codigo + '</div>' +
        '<div style="font-size:12px;color:#64748B;margin-top:8px;letter-spacing:0.05em">Válido por 30 minutos</div>' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#64748B">Si no solicitaste este cambio, ignora este mensaje y tu contraseña permanecerá segura.</p>',
      despedida: 'Cordialmente,'
    }));
    
    res.json({ok: true, mensaje: 'Instrucciones enviadas a tu email'});
  } catch(e) {
    console.error('Recuperar password error:', e.message);
    res.status(500).json({error: 'Error enviando email'});
  }
});

// Verificar código y cambiar password (recuperación)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, codigo, nueva_password } = req.body;
    if (!email || !codigo || !nueva_password) return res.status(400).json({error: 'Datos incompletos'});
    if (nueva_password.length < 8) return res.status(400).json({error: 'La contraseña debe tener al menos 8 caracteres'});
    
    const user = await db.query('SELECT id FROM usuarios WHERE email=$1', [email.toLowerCase()]);
    if (user.rows.length === 0) return res.status(404).json({error: 'Email no encontrado'});
    
    const u = user.rows[0];
    const result = await db.query(
      'SELECT * FROM codigos_2fa WHERE usuario_id=$1 AND codigo=$2 AND usado=FALSE AND expira_en > NOW()',
      [u.id, codigo]
    );
    if (result.rows.length === 0) return res.status(401).json({error: 'Código inválido o expirado'});
    
    await db.query('UPDATE codigos_2fa SET usado=TRUE WHERE id=$1', [result.rows[0].id]);
    const hash = await bcrypt.hash(nueva_password, 12);
    await db.query('UPDATE usuarios SET password_hash=$1, actualizado_en=NOW() WHERE id=$2', [hash, u.id]);
    
    res.json({ok: true, mensaje: 'Contraseña actualizada correctamente'});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// Email de bienvenida al registrarse



// ══ ADMIN ROUTES ══

// Dashboard admin
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_inventario','admin_tecnico','admin_contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const [usuarios, tickets, leads, ordenes] = await Promise.all([
      db.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='activo') as activos, COUNT(*) FILTER (WHERE creado_en > NOW()-INTERVAL '7 days') as nuevos FROM usuarios"),
      db.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='abierto') as abiertos, COUNT(*) FILTER (WHERE prioridad='alta') as alta FROM tickets"),
      db.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE atendido=false) as pendientes FROM leads"),
      db.query("SELECT COUNT(*) as total, COALESCE(SUM(total),0) as revenue FROM ordenes WHERE creado_en > NOW()-INTERVAL '30 days'"),
    ]);
    res.json({
      usuarios: usuarios.rows[0],
      tickets: tickets.rows[0],
      leads: leads.rows[0],
      ordenes: ordenes.rows[0]
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Todos los tickets (admin)
app.get('/api/admin/tickets', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { status, prioridad } = req.query;
    let query = 'SELECT t.*, u.nombre, u.apellido, u.email FROM tickets t LEFT JOIN usuarios u ON u.id=t.usuario_id WHERE 1=1';
    const params = [];
    if (status) { params.push(status); query += ' AND t.status=$' + params.length; }
    if (prioridad) { params.push(prioridad); query += ' AND t.prioridad=$' + params.length; }
    query += ' ORDER BY t.creado_en DESC LIMIT 100';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Actualizar ticket (admin)
app.put('/api/admin/tickets/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { status, prioridad, asignado_a, resolucion } = req.body;
    await db.query(
      'UPDATE tickets SET status=COALESCE($1,status), prioridad=COALESCE($2,prioridad), asignado_a=COALESCE($3,asignado_a), resolucion=COALESCE($4,resolucion), actualizado_en=NOW() WHERE id=$5',
      [status, prioridad, asignado_a, resolucion, req.params.id]
    );
    res.json({ok: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Todos los leads (admin)
app.get('/api/admin/leads', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const result = await db.query('SELECT * FROM leads ORDER BY fecha DESC LIMIT 200');
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Marcar lead como atendido
app.put('/api/admin/leads/:id/atender', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    await db.query('UPDATE leads SET atendido=true WHERE id=$1', [req.params.id]);
    res.json({ok: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Todas las garantias (admin)
app.get('/api/admin/garantias', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const result = await db.query(
      'SELECT g.*, u.nombre, u.apellido, u.email FROM garantias g LEFT JOIN usuarios u ON u.id=g.usuario_id ORDER BY g.creado_en DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Crear garantia (admin)
app.post('/api/admin/garantias', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { usuario_id, producto_nombre, producto_serial, numero_factura, fecha_instalacion, fecha_vencimiento, descripcion } = req.body;
    const result = await db.query(
      'INSERT INTO garantias (usuario_id, producto_nombre, producto_serial, numero_factura, fecha_instalacion, fecha_vencimiento, descripcion) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [usuario_id, producto_nombre, producto_serial, numero_factura, fecha_instalacion, fecha_vencimiento, descripcion]
    );
    res.json({ok: true, id: result.rows[0].id});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// DELETE garantía individual (admin)
app.delete('/api/admin/garantias/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const r = await db.query('DELETE FROM garantias WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({error:'Garantía no encontrada'});
    res.json({ok:true, eliminada: r.rows[0].id});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Mensaje en ticket (admin)
app.post('/api/admin/tickets/:id/mensaje', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { mensaje } = req.body;
    await db.query(
      'INSERT INTO ticket_mensajes (ticket_id, autor_id, autor_rol, mensaje) VALUES ($1,$2,$3,$4)',
      [req.params.id, req.user.id, req.user.rol, mensaje]
    );
    await db.query('UPDATE tickets SET actualizado_en=NOW() WHERE id=$1', [req.params.id]);
    res.json({ok: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});


// ══ PRODUCTOS AVANZADO ══

// Producto individual
app.get('/api/productos/:id', async (req, res) => {
  try {
    let userRol = "public";
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
        const { rows } = await db.query('SELECT rol FROM usuarios WHERE id=$1 AND status=$2', [decoded.userId, 'activo']);
        if (rows.length) userRol = rows[0].rol;
      } catch {}
    }
    const result = await db.query('SELECT * FROM productos WHERE id=$1 AND activo=true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({error:'No encontrado'});
    const p = result.rows[0];
    const precio = getPrecioParaRol(p, userRol);
    res.json({
      ...p,
      precio_mostrar: precio,
      precio_publico: undefined,
      precio_cliente: undefined,
      precio_revendedor: undefined,
      precio_empresa: undefined,
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Crear producto (admin)
app.post('/api/admin/productos-v2', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','inventario'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { sku, nombre_es, descripcion_es, marca, modelo, categoria_id,
            precio_publico, precio_cliente, precio_empresa, precio_revendedor,
            precio_anterior, precio_sugerido_reventa,
            stock, stock_minimo, es_nuevo, es_hot, imagen_principal, imagenes, archivos, specs } = req.body;
    const result = await db.query(
      `INSERT INTO productos (sku, nombre_es, descripcion_es, marca, modelo, categoria_id,
        precio_publico, precio_cliente, precio_empresa, precio_revendedor,
        precio_anterior, precio_sugerido_reventa,
        stock, stock_minimo, es_nuevo, es_hot, imagen_principal, imagenes, archivos, specs, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [sku, nombre_es, descripcion_es, marca, modelo, categoria_id||null,
       precio_publico, precio_cliente, precio_empresa, precio_revendedor,
       precio_anterior||null, precio_sugerido_reventa||null,
       stock||0, stock_minimo||5, es_nuevo||false, es_hot||false,
       imagen_principal||null, imagenes||[], JSON.stringify(archivos||[]), JSON.stringify(specs||{}), req.user.id]
    );
    res.json({ok:true, id: result.rows[0].id});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Actualizar producto (admin)
app.put('/api/admin/productos-v2/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','inventario'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { nombre_es, descripcion_es, marca, modelo,
            precio_publico, precio_cliente, precio_empresa, precio_revendedor,
            precio_anterior, precio_sugerido_reventa,
            stock, stock_minimo, es_nuevo, es_hot, activo,
            imagen_principal, imagenes, archivos, specs } = req.body;

    // Check if price changed to set precio_anterior
    const current = await db.query('SELECT precio_publico FROM productos WHERE id=$1', [req.params.id]);
    let precioAnt = precio_anterior;
    if (current.rows.length && precio_publico && current.rows[0].precio_publico != precio_publico) {
      precioAnt = current.rows[0].precio_publico;
    }

    await db.query(
      `UPDATE productos SET nombre_es=$1, descripcion_es=$2, marca=$3, modelo=$4,
        precio_publico=$5, precio_cliente=$6, precio_empresa=$7, precio_revendedor=$8,
        precio_anterior=$9, precio_sugerido_reventa=$10,
        stock=$11, stock_minimo=$12, es_nuevo=$13, es_hot=$14, activo=$15,
        imagen_principal=$16, imagenes=$17, archivos=$18, specs=$19,
        actualizado_en=NOW() WHERE id=$20`,
      [nombre_es, descripcion_es, marca, modelo,
       precio_publico, precio_cliente, precio_empresa, precio_revendedor,
       precioAnt||null, precio_sugerido_reventa||null,
       stock, stock_minimo, es_nuevo, es_hot, activo,
       imagen_principal, imagenes||[], JSON.stringify(archivos||[]), JSON.stringify(specs||{}), req.params.id]
    );

    // If stock came back, notify users who requested restock
    if (stock > 0) {
      const prod = await db.query('SELECT notificar_restock, nombre_es FROM productos WHERE id=$1', [req.params.id]);
      if (prod.rows[0] && prod.rows[0].notificar_restock && prod.rows[0].notificar_restock.length > 0) {
        // Send email notifications (fire and forget)
        prod.rows[0].notificar_restock.forEach(function(email) {
          sendEmail(email, 'Producto disponible — ' + prod.rows[0].nombre_es,
            '<div style="font-family:Arial,sans-serif;padding:24px;background:#06090F;color:#F0F4F8"><h2 style="color:#29B6F6">Producto disponible</h2><p>El producto <strong>' + prod.rows[0].nombre_es + '</strong> que solicitaste ya está disponible en Wifnix.</p><a href="https://wifnix.com" style="display:inline-block;padding:10px 20px;background:#0B8FCC;color:white;text-decoration:none;border-radius:6px;margin-top:12px">Ver producto</a></div>'
          ).catch(function(){});
        });
        // Clear notification list
        await db.query('UPDATE productos SET notificar_restock=ARRAY[]::text[] WHERE id=$1', [req.params.id]);
      }
    }

    res.json({ok:true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Notificar restock (usuario)
app.post('/api/productos/:id/notificar-restock', authMiddleware, async (req, res) => {
  try {
    await db.query(
      'UPDATE productos SET notificar_restock=array_append(notificar_restock, $1) WHERE id=$2 AND NOT ($1=ANY(notificar_restock))',
      [req.user.email, req.params.id]
    );
    res.json({ok:true, mensaje:'Te notificaremos cuando el producto esté disponible'});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Upload imagen producto (base64)
app.post('/api/admin/productos/:id/imagen', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','inventario'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { imagen_base64, tipo } = req.body; // tipo: 'principal' o 'galeria'
    if (tipo === 'principal') {
      await db.query('UPDATE productos SET imagen_principal=$1 WHERE id=$2', [imagen_base64, req.params.id]);
    } else {
      await db.query('UPDATE productos SET imagenes=array_append(imagenes,$1) WHERE id=$2', [imagen_base64, req.params.id]);
    }
    res.json({ok:true});
  } catch(e) { res.status(500).json({error: e.message}); }
});


app.post('/api/admin/usuarios', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { nombre, apellido, email, password, rol, telefono, empresa_nombre } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({error:'Datos requeridos'});
    const existe = await db.query('SELECT id FROM usuarios WHERE email=$1', [email.toLowerCase()]);
    if (existe.rows.length) return res.status(409).json({error:'Email ya registrado'});
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query('INSERT INTO usuarios (nombre,apellido,email,password_hash,rol,telefono,empresa_nombre) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[nombre,apellido||'',email.toLowerCase(),hash,rol||'cliente',telefono||'',empresa_nombre||'']);
    res.json({ok:true,id:result.rows[0].id});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/admin/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== 'super_admin') return res.status(403).json({error:'Solo super admin'});
    if (req.params.id === req.user.id) return res.status(400).json({error:'No puedes eliminarte'});
    const id = req.params.id;
    await db.query('DELETE FROM ticket_mensajes WHERE usuario_id=$1',[id]);
    await db.query('DELETE FROM tickets WHERE usuario_id=$1',[id]);
    await db.query('DELETE FROM garantias WHERE usuario_id=$1',[id]);
    await db.query('DELETE FROM ordenes WHERE usuario_id=$1',[id]);
    await db.query('DELETE FROM codigos_2fa WHERE usuario_id=$1',[id]);
    await db.query('DELETE FROM sesiones WHERE usuario_id=$1',[id]);
    await db.query('DELETE FROM usuarios WHERE id=$1',[id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/ventas', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const result = await db.query('SELECT o.*, u.nombre, u.apellido, u.email FROM ordenes o LEFT JOIN usuarios u ON u.id=o.usuario_id ORDER BY o.creado_en DESC LIMIT 100');
    res.json(result.rows);
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/cotizaciones', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const result = await db.query("SELECT * FROM leads WHERE estimado IS NOT NULL AND estimado != '' ORDER BY fecha DESC LIMIT 100");
    res.json(result.rows);
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/contabilidad', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const [mes,ano,total] = await Promise.all([
      db.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as ordenes FROM ordenes WHERE creado_en > NOW()-INTERVAL '30 days'"),
      db.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as ordenes FROM ordenes WHERE creado_en > NOW()-INTERVAL '365 days'"),
      db.query('SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as ordenes FROM ordenes'),
    ]);
    res.json({mes:mes.rows[0],ano:ano.rows[0],total:total.rows[0]});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/auditoria', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','auditor','admin'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const [users,tickets,leads] = await Promise.all([
      db.query("SELECT 'registro' as tipo, nombre||' '||apellido as descripcion, email, creado_en as fecha FROM usuarios ORDER BY creado_en DESC LIMIT 20"),
      db.query("SELECT 'ticket' as tipo, 'Ticket #'||numero||': '||asunto as descripcion, status, creado_en as fecha FROM tickets ORDER BY creado_en DESC LIMIT 20"),
      db.query("SELECT 'lead' as tipo, nombre||' — '||herramienta as descripcion, email, fecha FROM leads ORDER BY fecha DESC LIMIT 20"),
    ]);
    const all = [...users.rows,...tickets.rows,...leads.rows].sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);}).slice(0,50);
    res.json(all);
  } catch(e){res.status(500).json({error:e.message});}
});


// Iniciar trabajo en ticket

app.post('/api/admin/tickets/:id/iniciar', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const q = 'UPDATE tickets SET trabajando=true, tiempo_inicio=NOW(), asignado_a=$1, status=$2, actualizado_en=NOW() WHERE id=$3';
    await db.query(q, [req.user.id, 'en_proceso', req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/tickets/:id/pausar', authMiddleware, async (req, res) => {
  try {
    const tk = await db.query('SELECT tiempo_inicio, tiempo_total_segundos FROM tickets WHERE id=$1',[req.params.id]);
    if (!tk.rows.length) return res.status(404).json({error:'No encontrado'});
    let segs = parseInt(tk.rows[0].tiempo_total_segundos) || 0;
    if (tk.rows[0].tiempo_inicio) segs += Math.floor((Date.now() - new Date(tk.rows[0].tiempo_inicio).getTime()) / 1000);
    await db.query('UPDATE tickets SET trabajando=false, tiempo_inicio=NULL, tiempo_total_segundos=$1, actualizado_en=NOW() WHERE id=$2',[segs, req.params.id]);
    res.json({ok:true, segundos:segs});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/admin/tickets/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    await db.query('DELETE FROM ticket_mensajes WHERE ticket_id=$1',[req.params.id]);
    await db.query('DELETE FROM tickets WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/tickets/:id/mensajes', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const result = await db.query('SELECT m.*, u.nombre, u.apellido FROM ticket_mensajes m LEFT JOIN usuarios u ON u.id=m.usuario_id WHERE m.ticket_id=$1 ORDER BY m.creado_en ASC',[req.params.id]);
    res.json(result.rows);
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/tickets/:id/mensaje', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({error:'Mensaje requerido'});
    await db.query('INSERT INTO ticket_mensajes (ticket_id, usuario_id, mensaje, es_interno) VALUES ($1,$2,$3,$4)',[req.params.id, req.user.id, mensaje, true]);
    await db.query('UPDATE tickets SET actualizado_en=NOW() WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});


// Editar usuario (admin)
app.put('/api/admin/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { nombre, apellido, telefono, rol, status, empresa_nombre, empresa_tipo, empresa_ein } = req.body;
    await db.query(
      'UPDATE usuarios SET nombre=COALESCE($1,nombre), apellido=COALESCE($2,apellido), telefono=COALESCE($3,telefono), rol=COALESCE($4,rol), status=COALESCE($5,status), empresa_nombre=COALESCE($6,empresa_nombre), empresa_tipo=COALESCE($7,empresa_tipo), empresa_ein=COALESCE($8,empresa_ein), actualizado_en=NOW() WHERE id=$9',
      [nombre, apellido, telefono, rol, status, empresa_nombre, empresa_tipo, empresa_ein, req.params.id]
    );
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});


// Aplicar para reseller (público - desde el portal de registro)
app.post('/api/reseller/aplicar', authMiddleware, async (req, res) => {
  try {
    const { tipo_empresa, registro_comerciante, ein, experiencia, volumen_estimado, documento_registro, documento_identificacion, notas_solicitante } = req.body;
    if (!tipo_empresa || !registro_comerciante || !experiencia || !volumen_estimado) {
      return res.status(400).json({error: 'Datos requeridos faltantes'});
    }
    const existe = await db.query('SELECT id FROM solicitudes_reseller WHERE usuario_id=$1 AND status IN ($2,$3)', [req.user.id, 'pendiente', 'info_solicitada']);
    if (existe.rows.length) return res.status(409).json({error: 'Ya tienes una solicitud activa'});
    const r = await db.query(
      'INSERT INTO solicitudes_reseller (usuario_id, tipo_empresa, registro_comerciante, ein, experiencia, volumen_estimado, documento_registro, documento_identificacion, notas_solicitante) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [req.user.id, tipo_empresa, registro_comerciante, ein||null, experiencia, volumen_estimado, documento_registro||null, documento_identificacion||null, notas_solicitante||null]
    );
    const userInfo = await db.query('SELECT email, nombre, apellido FROM usuarios WHERE id=$1', [req.user.id]);
    const u = userInfo.rows[0];
    sendEmail(u.email, 'Solicitud de Reseller Recibida — Wifnix', emailTemplate({
      titulo: 'Hemos recibido tu solicitud',
      saludo: 'Hola ' + ((u.nombre||'') + ' ' + (u.apellido||'')).trim() + ',',
      cuerpo: '<p style="margin:0 0 14px">Tu aplicación para convertirte en <strong>reseller autorizado</strong> de Wifnix ha sido recibida correctamente.</p>' +
        '<p style="margin:0 0 14px">Nuestro equipo de validación revisará tu solicitud y los documentos enviados. Te responderemos en un plazo máximo de <strong>48 horas hábiles</strong>.</p>' +
        '<div style="background:#F0F9FF;border-left:3px solid #0B8FCC;padding:14px 18px;margin:18px 0;border-radius:4px"><strong style="color:#0B8FCC;font-size:14px">Mientras tanto:</strong><br><span style="color:#334155;font-size:14px;line-height:1.7">Ya puedes acceder al portal como <strong>usuario regular</strong>. Una vez aprobada tu solicitud, tu cuenta cambiará automáticamente a reseller con todos los beneficios y precios especiales.</span></div>' +
        '<p style="margin:0 0 14px">Si necesitamos información adicional o documentos complementarios, te contactaremos por este mismo medio.</p>' +
        '<p style="margin:0;color:#64748B;font-size:14px">Gracias por tu interés en formar parte de la red Wifnix.</p>',
      cta: { texto: 'Acceder al Portal', url: 'https://portal.wifnix.com' },
      despedida: 'Cordialmente,'
    }));
    sendEmail('customerservice@wifnix.com', 'Nueva solicitud de reseller — ' + (u.nombre||'') + ' ' + (u.apellido||''), emailTemplate({
      titulo: 'Nueva solicitud de reseller',
      saludo: 'Hola equipo,',
      cuerpo: '<p style="margin:0 0 14px">Se ha recibido una nueva aplicación para reseller autorizado:</p>' +
        '<table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">' +
        '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B;width:140px">Cliente</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0">' + (u.nombre||'') + ' ' + (u.apellido||'') + '</td></tr>' +
        '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Email</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0">' + u.email + '</td></tr>' +
        '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Tipo de empresa</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0">' + tipo_empresa + '</td></tr>' +
        '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Volumen estimado</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0"><strong style="color:#059669">' + volumen_estimado + '</strong></td></tr>' +
        '</table>' +
        '<p style="margin:14px 0 6px;font-weight:600;color:#0F172A">Experiencia previa:</p>' +
        '<div style="background:#F8FAFC;border-radius:6px;padding:12px 16px;color:#334155;font-size:14px;line-height:1.6">' + experiencia + '</div>',
      cta: { texto: 'Revisar en Admin', url: 'https://admin.wifnix.com' },
      despedida: 'Sistema automatizado de Wifnix,'
    }));
    res.json({ok:true, id: r.rows[0].id});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Ver mi solicitud (cliente)
app.get('/api/reseller/mi-solicitud', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM solicitudes_reseller WHERE usuario_id=$1 ORDER BY fecha_solicitud DESC LIMIT 1', [req.user.id]);
    res.json(r.rows[0] || null);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Listar todas las solicitudes (admin)
app.get('/api/admin/solicitudes-reseller', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const r = await db.query(
      'SELECT s.*, u.nombre, u.apellido, u.email, u.telefono, u.empresa_nombre FROM solicitudes_reseller s LEFT JOIN usuarios u ON u.id=s.usuario_id ORDER BY s.fecha_solicitud DESC'
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Aprobar / Rechazar / Solicitar info (admin)
app.put('/api/admin/solicitudes-reseller/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { accion, notas_admin, razon_rechazo, info_adicional_solicitada } = req.body;
    if (!['aprobar','rechazar','solicitar_info'].includes(accion)) return res.status(400).json({error:'Acción inválida'});
    
    const sol = await db.query('SELECT s.*, u.email, u.nombre FROM solicitudes_reseller s LEFT JOIN usuarios u ON u.id=s.usuario_id WHERE s.id=$1', [req.params.id]);
    if (!sol.rows.length) return res.status(404).json({error:'No encontrada'});
    const s = sol.rows[0];
    
    let nuevoStatus;
    if (accion === 'aprobar') {
      nuevoStatus = 'aprobada';
      await db.query("UPDATE usuarios SET rol='empresa_revendedora', verificacion='aprobada', verificacion_admin_id=$1, verificacion_fecha=NOW() WHERE id=$2", [req.user.id, s.usuario_id]);
      sendEmail(s.email, '¡Aprobado! Eres reseller autorizado Wifnix', emailTemplate({
        titulo: '¡Bienvenido a la red Wifnix! 🎉',
        saludo: 'Hola ' + (s.nombre||'') + ',',
        cuerpo: '<p style="margin:0 0 14px">Nos complace informarte que tu solicitud para ser <strong>reseller autorizado</strong> de Wifnix ha sido <strong style="color:#059669">aprobada</strong>.</p>' +
          '<p style="margin:0 0 14px">A partir de este momento tienes acceso al portal con precios especiales para revendedores. Inicia sesión en tu portal para ver el catálogo personalizado y comenzar a generar órdenes.</p>' +
          (notas_admin ? '<div style="background:#F0F9FF;border-left:3px solid #0B8FCC;padding:12px 16px;margin:16px 0;border-radius:4px"><strong style="color:#0B8FCC;font-size:13px">Notas del equipo:</strong><br><span style="color:#334155;font-size:14px">' + notas_admin + '</span></div>' : ''),
        cta: { texto: 'Acceder al Portal', url: 'https://portal.wifnix.com' },
        despedida: 'Bienvenido a la familia Wifnix,'
      }));
    } else if (accion === 'rechazar') {
      nuevoStatus = 'rechazada';
      sendEmail(s.email, 'Decisión sobre tu solicitud de reseller — Wifnix', emailTemplate({
        titulo: 'Decisión sobre tu solicitud',
        saludo: 'Hola ' + (s.nombre||'') + ',',
        cuerpo: '<p style="margin:0 0 14px">Hemos revisado con cuidado tu solicitud para convertirte en reseller autorizado de Wifnix. Lamentablemente, en este momento no podemos aprobar tu aplicación.</p>' +
          (razon_rechazo ? '<div style="background:#FEF2F2;border-left:3px solid #DC2626;padding:12px 16px;margin:16px 0;border-radius:4px"><strong style="color:#DC2626;font-size:13px">Razón:</strong><br><span style="color:#334155;font-size:14px">' + razon_rechazo + '</span></div>' : '') +
          '<p style="margin:14px 0 0">Puedes continuar usando Wifnix como cliente y volver a aplicar en el futuro cuando consideres que cumples con los requisitos. Estamos aquí para apoyarte.</p>',
        despedida: 'Atentamente,'
      }));
    } else {
      nuevoStatus = 'info_solicitada';
      sendEmail(s.email, 'Información adicional requerida — Wifnix', emailTemplate({
        titulo: 'Necesitamos información adicional',
        saludo: 'Hola ' + (s.nombre||'') + ',',
        cuerpo: '<p style="margin:0 0 14px">Para continuar procesando tu solicitud de reseller, necesitamos que nos compartas lo siguiente:</p>' +
          '<div style="background:#FFFBEB;border-left:3px solid #F59E0B;padding:14px 18px;margin:16px 0;border-radius:4px;color:#334155;font-size:15px;line-height:1.6">' + info_adicional_solicitada + '</div>' +
          '<p style="margin:14px 0 0">Por favor responde a este correo o accede a tu portal para enviarnos la información solicitada. Una vez recibida, completaremos la revisión de tu solicitud.</p>',
        cta: { texto: 'Acceder a mi Portal', url: 'https://portal.wifnix.com' },
        despedida: 'Cordialmente,'
      }));
    }
    
    await db.query('UPDATE solicitudes_reseller SET status=$1, revisado_por=$2, notas_admin=$3, razon_rechazo=$4, info_adicional_solicitada=$5, fecha_decision=NOW() WHERE id=$6',
      [nuevoStatus, req.user.id, notas_admin||null, razon_rechazo||null, info_adicional_solicitada||null, req.params.id]);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error: e.message}); }
});


// AI mejorar texto - usa Claude
app.post('/api/admin/ai-mejorar-texto', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_contabilidad'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const { texto, contexto } = req.body;
    if (!texto) return res.status(400).json({error:'Texto requerido'});
    if (!anthropic) return res.status(503).json({error:'AI no configurada'});
    
    const prompt = (contexto || 'Mejora este texto manteniendo su significado, hazlo más profesional y claro.') + '\n\nTexto original:\n' + texto + '\n\nDevuelve SOLO el texto mejorado sin explicaciones, sin comillas y sin prefijos.';
    
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const textoMejorado = msg.content[0].text.trim();
    res.json({ texto: textoMejorado });
  } catch(e) {
    console.error('AI error:', e.message);
    res.status(500).json({error: e.message});
  }
});


// Verificación por EMAIL (alternativa a SMS mientras A2P 10DLC no esté listo)
app.post('/api/auth/enviar-verificacion-email', authMiddleware, async (req, res) => {
  try {
    const u = await db.query('SELECT email, nombre, email_verificado FROM usuarios WHERE id=$1', [req.user.id]);
    if (!u.rows.length) return res.status(404).json({error:'Usuario no encontrado'});
    if (u.rows[0].email_verificado) return res.json({ok:true, ya_verificado: true, mensaje: 'Email ya verificado'});
    
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    await db.query('INSERT INTO codigos_2fa (usuario_id, codigo, expira_en) VALUES ($1, $2, NOW() + INTERVAL \'15 minutes\')', [req.user.id, codigo]);
    
    await sendEmail(u.rows[0].email, 'Código de verificación — Wifnix', emailTemplate({
      titulo: 'Verifica tu correo electrónico',
      saludo: 'Hola ' + (u.rows[0].nombre || '') + ',',
      cuerpo: '<p style="margin:0 0 14px">Para verificar tu cuenta y acceder a todas las funciones del portal, usa el siguiente código:</p>' +
        '<div style="background:#F0F9FF;border:2px solid #0B8FCC;border-radius:10px;padding:24px;text-align:center;margin:20px 0">' +
        '<div style="font-size:32px;font-weight:800;letter-spacing:0.3em;color:#0B8FCC;font-family:monospace">' + codigo + '</div>' +
        '<div style="font-size:12px;color:#64748B;margin-top:8px;letter-spacing:0.05em">Válido por 15 minutos</div>' +
        '</div>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#64748B">Si no solicitaste este código, ignora este mensaje.</p>',
      despedida: 'Cordialmente,'
    }));
    
    res.json({ok:true, mensaje: 'Código enviado a tu email'});
  } catch(e) {
    console.error('Email verif error:', e.message);
    res.status(500).json({error:'Error enviando código'});
  }
});

app.post('/api/auth/verificar-email', authMiddleware, async (req, res) => {
  try {
    const { codigo } = req.body;
    if (!codigo) return res.status(400).json({error:'Código requerido'});
    
    const r = await db.query(
      'SELECT * FROM codigos_2fa WHERE usuario_id=$1 AND codigo=$2 AND usado=FALSE AND expira_en > NOW() ORDER BY creado_en DESC LIMIT 1',
      [req.user.id, codigo]
    );
    if (!r.rows.length) return res.status(401).json({error:'Código inválido o expirado'});
    
    await db.query('UPDATE codigos_2fa SET usado=TRUE WHERE id=$1', [r.rows[0].id]);
    await db.query('UPDATE usuarios SET email_verificado=TRUE WHERE id=$1', [req.user.id]);
    
    res.json({ok:true, mensaje: 'Email verificado correctamente'});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});


// Eliminar mi propia cuenta (cualquier usuario)
app.delete('/api/auth/mi-cuenta', authMiddleware, async (req, res) => {
  try {
    const { confirmacion } = req.body;
    if (confirmacion !== 'ELIMINAR MI CUENTA') return res.status(400).json({error: 'Confirmación incorrecta. Debes escribir exactamente: ELIMINAR MI CUENTA'});
    const id = req.user.id;
    await db.query('DELETE FROM ticket_mensajes WHERE usuario_id=$1', [id]);
    await db.query('DELETE FROM tickets WHERE usuario_id=$1', [id]);
    await db.query('DELETE FROM garantias WHERE usuario_id=$1', [id]);
    await db.query('DELETE FROM ordenes WHERE usuario_id=$1', [id]);
    await db.query('DELETE FROM solicitudes_reseller WHERE usuario_id=$1', [id]);
    await db.query('DELETE FROM codigos_2fa WHERE usuario_id=$1', [id]);
    await db.query('DELETE FROM usuarios WHERE id=$1', [id]);
    res.json({ok: true, mensaje: 'Cuenta eliminada permanentemente'});
  } catch(e) {
    console.error('Eliminar cuenta error:', e.message);
    res.status(500).json({error: e.message});
  }
});


// =========================================
// SNAPSHOTS DE HERRAMIENTAS
// =========================================

// Crear snapshot (usuario logueado)
app.post('/api/snapshots/crear', authMiddleware, async (req, res) => {
  try {
    const { herramienta, datos_entrada, resultado, estimado_dolares, notas } = req.body;
    if (!herramienta || !resultado) return res.status(400).json({error:'Datos incompletos'});
    
    const r = await db.query(
      'INSERT INTO snapshots_herramientas (usuario_id, herramienta, datos_entrada, resultado, estimado_dolares, notas) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.user.id, herramienta, JSON.stringify(datos_entrada||{}), JSON.stringify(resultado), estimado_dolares||null, notas||null]
    );
    
    // Notify admin about new lead (only first snapshot of user)
    try {
      const userInfo = await db.query('SELECT email, nombre, apellido, telefono FROM usuarios WHERE id=$1', [req.user.id]);
      const u = userInfo.rows[0];
      const snapCount = await db.query('SELECT COUNT(*) FROM snapshots_herramientas WHERE usuario_id=$1', [req.user.id]);
      
      if (parseInt(snapCount.rows[0].count) <= 3) { // Notify on first 3 snapshots
        sendEmail('customerservice@wifnix.com', 'Nuevo cálculo guardado — ' + (u.nombre||'') + ' ' + (u.apellido||''), emailTemplate({
          titulo: 'Nuevo lead con cálculo guardado',
          saludo: 'Hola equipo,',
          cuerpo: '<p style="margin:0 0 14px">Un cliente acaba de guardar un cálculo en la herramienta <strong>' + herramienta + '</strong>.</p>' +
            '<table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">' +
            '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B;width:140px">Cliente</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0">' + (u.nombre||'') + ' ' + (u.apellido||'') + '</td></tr>' +
            '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Email</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0">' + u.email + '</td></tr>' +
            '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Teléfono</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0">' + (u.telefono||'No provisto') + '</td></tr>' +
            '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Herramienta</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0"><strong style="color:#0B8FCC">' + herramienta + '</strong></td></tr>' +
            (estimado_dolares ? '<tr><td style="background:#F8FAFC;font-weight:600;color:#64748B">Estimado</td><td style="background:#FFFFFF;border-left:1px solid #E2E8F0"><strong style="color:#059669">$' + parseFloat(estimado_dolares).toLocaleString() + '</strong></td></tr>' : '') +
            '</table>',
          cta: { texto: 'Ver en Admin', url: 'https://admin.wifnix.com' },
          despedida: 'Sistema automatizado de Wifnix,'
        }));
      }
    } catch(e) { console.error('Email notif snapshot:', e.message); }
    
    res.json({ok:true, id: r.rows[0].id});
  } catch(e) {
    console.error('Snapshot crear error:', e.message);
    res.status(500).json({error: e.message});
  }
});

// Ver mis snapshots (cliente)
app.get('/api/snapshots/mis-calculos', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT id, herramienta, datos_entrada, resultado, estimado_dolares, notas, creado_en FROM snapshots_herramientas WHERE usuario_id=$1 ORDER BY creado_en DESC', [req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Ver snapshot específico (cliente)
app.get('/api/snapshots/:id', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM snapshots_herramientas WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({error:'No encontrado'});
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Admin - listar todos los snapshots
app.get('/api/admin/snapshots', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_contabilidad','admin_inventario','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({error:'Sin acceso'});
    const r = await db.query(
      'SELECT s.*, u.nombre, u.apellido, u.email, u.telefono FROM snapshots_herramientas s LEFT JOIN usuarios u ON u.id=s.usuario_id ORDER BY s.creado_en DESC LIMIT 200'
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({error: e.message}); }
});


// =========================================
// RESEÑAS DE PRODUCTOS
// =========================================

// Helper: verifica si el usuario puede reseñar un producto
async function puedeResenarProducto(usuarioId, productoId) {
  const { rows } = await db.query(
    `SELECT o.id as orden_id, o.completado_en, 
            EXTRACT(DAY FROM (now() - o.completado_en)) as dias
     FROM ordenes o
     WHERE o.usuario_id = $1 
       AND o.status IN ('completado', 'pagado')
       AND o.items::text ILIKE '%' || $2::text || '%'
       AND o.completado_en IS NOT NULL
       AND o.completado_en > now() - interval '30 days'
     ORDER BY o.completado_en DESC LIMIT 1`,
    [usuarioId, productoId]
  );
  if (!rows.length) return { puede: false, razon: 'No has comprado este producto o pasaron más de 30 días' };
  
  // Verificar si ya reseñó esta orden
  const existe = await db.query(
    'SELECT id FROM resenas_productos WHERE usuario_id=$1 AND producto_id=$2 AND orden_id=$3',
    [usuarioId, productoId, rows[0].orden_id]
  );
  if (existe.rows.length) return { puede: false, razon: 'Ya reseñaste este producto', ya_resenada: true, resena_id: existe.rows[0].id };
  
  return { puede: true, orden_id: rows[0].orden_id, dias_restantes: 30 - parseInt(rows[0].dias) };
}

// GET reseñas de un producto (público)
app.get('/api/resenas/producto/:productoId', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT r.id, r.rating, r.titulo, r.comentario, r.fotos, r.creado_en,
              u.nombre, u.apellido,
              SUBSTRING(u.email, 1, 2) || '***' as email_parcial
       FROM resenas_productos r
       LEFT JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.producto_id = $1 AND r.aprobada = TRUE AND r.oculta = FALSE
       ORDER BY r.creado_en DESC LIMIT 50`,
      [req.params.productoId]
    );
    
    // Calcular estadísticas
    const stats = await db.query(
      `SELECT 
        COUNT(*) as total,
        ROUND(AVG(rating)::numeric, 1) as promedio,
        SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as estrellas_5,
        SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as estrellas_4,
        SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as estrellas_3,
        SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as estrellas_2,
        SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as estrellas_1
       FROM resenas_productos
       WHERE producto_id = $1 AND aprobada = TRUE AND oculta = FALSE`,
      [req.params.productoId]
    );
    
    res.json({ resenas: r.rows, stats: stats.rows[0] });
  } catch(e) {
    console.error('Reseñas listar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Verificar si usuario puede reseñar (cliente logueado)
app.get('/api/resenas/puedo-resenar/:productoId', authMiddleware, async (req, res) => {
  try {
    const result = await puedeResenarProducto(req.user.id, req.params.productoId);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Crear reseña (cliente logueado)
app.post('/api/resenas/crear', authMiddleware, async (req, res) => {
  try {
    const { producto_id, rating, titulo, comentario, fotos } = req.body;
    if (!producto_id || !rating || !comentario) return res.status(400).json({ error: 'Datos incompletos' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating inválido' });
    
    const check = await puedeResenarProducto(req.user.id, producto_id);
    if (!check.puede) return res.status(403).json({ error: check.razon });
    
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + 30);
    
    const r = await db.query(
      `INSERT INTO resenas_productos (producto_id, usuario_id, orden_id, rating, titulo, comentario, fotos, fecha_limite_edicion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [producto_id, req.user.id, check.orden_id, rating, titulo || null, comentario, JSON.stringify(fotos || []), fechaLimite]
    );
    
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) {
    console.error('Reseña crear:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Editar reseña propia (dentro de 30 días)
app.put('/api/resenas/:id', authMiddleware, async (req, res) => {
  try {
    const { rating, titulo, comentario, fotos } = req.body;
    
    const existe = await db.query(
      'SELECT fecha_limite_edicion FROM resenas_productos WHERE id=$1 AND usuario_id=$2',
      [req.params.id, req.user.id]
    );
    if (!existe.rows.length) return res.status(404).json({ error: 'Reseña no encontrada' });
    if (new Date(existe.rows[0].fecha_limite_edicion) < new Date()) {
      return res.status(403).json({ error: 'El período de edición de 30 días ha expirado' });
    }
    
    await db.query(
      `UPDATE resenas_productos SET rating=$1, titulo=$2, comentario=$3, fotos=$4, actualizado_en=now() 
       WHERE id=$5 AND usuario_id=$6`,
      [rating, titulo || null, comentario, JSON.stringify(fotos || []), req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Eliminar reseña propia (dentro de 30 días)
app.delete('/api/resenas/:id', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(
      'DELETE FROM resenas_productos WHERE id=$1 AND usuario_id=$2 AND fecha_limite_edicion > now() RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No se puede eliminar (período expirado o no existe)' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: listar todas las reseñas
app.get('/api/admin/resenas', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { rows } = await db.query(
      `SELECT r.*, p.nombre_es as producto_nombre, p.sku, u.nombre, u.apellido, u.email
       FROM resenas_productos r
       LEFT JOIN productos p ON p.id = r.producto_id
       LEFT JOIN usuarios u ON u.id = r.usuario_id
       ORDER BY r.creado_en DESC LIMIT 200`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: moderar reseña (aprobar/ocultar)
app.put('/api/admin/resenas/:id/moderar', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { aprobada, oculta, motivo_ocultacion } = req.body;
    await db.query(
      'UPDATE resenas_productos SET aprobada=$1, oculta=$2, motivo_ocultacion=$3 WHERE id=$4',
      [aprobada !== undefined ? aprobada : true, oculta !== undefined ? oculta : false, motivo_ocultacion || null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// GET categorias (público)
app.get('/api/categorias', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, slug, nombre_es, nombre_en FROM categorias ORDER BY nombre_es');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// =========================================
// CHECKOUT — CREAR ORDEN
// =========================================
app.post('/api/ordenes/crear', authMiddleware, async (req, res) => {
  try {
    const { items, contacto, entrega, instalacion_solicitada, subtotal, ivu, envio, total, pago_tipo, pago_status, ath_reference, ath_response } = req.body;
    const statusOrden = pago_status === 'pagado' ? 'pagado' : 'pendiente_pago';
    if (!items || !items.length) return res.status(400).json({ error: 'Carrito vacío' });
    if (!contacto || !contacto.email) return res.status(400).json({ error: 'Información de contacto incompleta' });
    
    // Crear la orden
    const r = await db.query(
      `INSERT INTO ordenes (usuario_id, status, tipo, items, subtotal, impuesto, total, direccion, municipio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, numero`,
      [
        req.user.id,
        statusOrden,
        instalacion_solicitada ? 'producto_instalacion' : 'producto',
        JSON.stringify(items),
        subtotal,
        ivu,
        total,
        entrega.tipo === 'recoger' ? 'RECOGER EN TIENDA' : (entrega.direccion || ''),
        entrega.pueblo || null
      ]
    );
    
    const ordenId = r.rows[0].id;
    const ordenNumero = r.rows[0].numero;
    
    // Email al cliente
    try {
      const itemsHTML = items.map(i => 
        `<tr><td style="padding:8px;border-bottom:1px solid #E2E8F0">${i.nombre}<br><span style="color:#64748B;font-size:12px">SKU: ${i.sku} · Cantidad: ${i.cantidad}</span></td><td style="padding:8px;border-bottom:1px solid #E2E8F0;text-align:right;color:#059669;font-weight:700">$${(i.precio * i.cantidad).toFixed(2)}</td></tr>`
      ).join('');
      
      // Email diferente según si está pagado o pendiente
      var emailTitulo, emailCuerpoIntro;
      if (statusOrden === 'pagado') {
        emailTitulo = '✓ Pago confirmado';
        emailCuerpoIntro = '<p style="margin:0 0 14px">¡Gracias por tu compra! Tu pago fue procesado exitosamente y tu orden <strong>WFX-' + String(ordenNumero).padStart(4, '0') + '</strong> está confirmada.</p><p style="margin:0 0 14px">Nuestro equipo comenzará a preparar tu orden de inmediato y te notificaremos cuando esté lista.</p>';
      } else if (statusOrden === 'pago_parcial') {
        emailTitulo = 'Pago parcial recibido';
        emailCuerpoIntro = '<p style="margin:0 0 14px">Recibimos tu pago parcial para la orden <strong>WFX-' + String(ordenNumero).padStart(4, '0') + '</strong>. Te enviaremos información sobre el balance pendiente en breve.</p>';
      } else {
        emailTitulo = '¡Recibimos tu orden!';
        emailCuerpoIntro = '<p style="margin:0 0 14px">Gracias por tu compra. Hemos recibido tu orden <strong>WFX-' + String(ordenNumero).padStart(4, '0') + '</strong> y nuestro equipo te contactará en menos de 24 horas para coordinar el pago y la entrega.</p>';
      }
      
      sendEmail(contacto.email, emailTitulo + ' — WFX-' + String(ordenNumero).padStart(4, '0'), emailTemplate({
        titulo: emailTitulo,
        saludo: 'Hola ' + (contacto.nombre || '') + ',',
        cuerpo: 
          emailCuerpoIntro +
          '<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px">' +
            '<tr><td colspan="2" style="background:#0B8FCC;color:white;padding:10px;font-weight:700">Productos</td></tr>' +
            itemsHTML +
            '<tr><td style="padding:8px;color:#475569">Subtotal</td><td style="padding:8px;text-align:right">$' + parseFloat(subtotal).toFixed(2) + '</td></tr>' +
            '<tr><td style="padding:8px;color:#475569">IVU (11.5%)</td><td style="padding:8px;text-align:right">$' + parseFloat(ivu).toFixed(2) + '</td></tr>' +
            '<tr><td style="padding:8px;color:#475569">Envío (' + entrega.tipo + ')</td><td style="padding:8px;text-align:right">' + (envio === 0 ? 'GRATIS' : '$' + parseFloat(envio).toFixed(2)) + '</td></tr>' +
            '<tr><td style="padding:10px;border-top:2px solid #0B8FCC;font-weight:800;font-size:16px">TOTAL</td><td style="padding:10px;border-top:2px solid #0B8FCC;text-align:right;font-weight:800;font-size:16px;color:#059669">$' + parseFloat(total).toFixed(2) + '</td></tr>' +
          '</table>' +
          (instalacion_solicitada ? '<p style="margin:14px 0;padding:12px;background:#FEF3C7;border-left:3px solid #D97706;font-size:13px">🔧 <strong>Solicitaste instalación profesional.</strong> Coordinaremos una visita técnica y te enviaremos cotización personalizada.</p>' : '') +
          (statusOrden === 'pagado' ? '<p style="margin:14px 0 0;padding:12px;background:#D1FAE5;border-left:3px solid #00E5A0;font-size:13px"><strong>✓ Pago procesado</strong> — Tu compra está confirmada y comenzaremos a preparar tu orden.</p>' : '<p style="margin:14px 0 0">En las próximas horas recibirás un email con instrucciones de pago.</p>'),
        cta: { texto: 'Ver mi cuenta', url: 'https://portal.wifnix.com' },
        despedida: 'Gracias por elegirnos,'
      }));
    } catch(e) { console.error('Email cliente:', e.message); }
    
    // Email al admin
    try {
      sendEmail('customerservice@wifnix.com', '🛒 Nueva orden #' + ordenNumero + ' — ' + contacto.nombre + ' ' + contacto.apellido, emailTemplate({
        titulo: 'Nueva orden recibida',
        saludo: 'Hola equipo,',
        cuerpo: 
          '<p style="margin:0 0 14px">Nueva orden <strong>#' + ordenNumero + '</strong> esperando confirmación.</p>' +
          '<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px">' +
            '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px;width:140px">Cliente</td><td style="background:white;padding:8px">' + contacto.nombre + ' ' + contacto.apellido + (contacto.empresa ? ' (' + contacto.empresa + ')' : '') + '</td></tr>' +
            '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Email</td><td style="background:white;padding:8px">' + contacto.email + '</td></tr>' +
            '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Teléfono</td><td style="background:white;padding:8px">' + contacto.telefono + '</td></tr>' +
            '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Entrega</td><td style="background:white;padding:8px">' + entrega.tipo + (entrega.direccion ? ' — ' + entrega.direccion + ', ' + entrega.pueblo : '') + '</td></tr>' +
            (instalacion_solicitada ? '<tr><td style="background:#FEF3C7;font-weight:700;color:#D97706;padding:8px">⚠️ Instalación</td><td style="background:#FEF3C7;padding:8px;font-weight:700">SOLICITADA</td></tr>' : '') +
            '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Total</td><td style="background:white;padding:8px;color:#059669;font-weight:800;font-size:16px">$' + parseFloat(total).toFixed(2) + '</td></tr>' +
          '</table>',
        cta: { texto: 'Ver en admin', url: 'https://admin.wifnix.com' },
        despedida: 'Sistema automatizado,'
      }));
    } catch(e) { console.error('Email admin:', e.message); }
    
    res.json({ ok: true, id: ordenId, numero: ordenNumero });
  } catch(e) {
    console.error('Crear orden:', e.message);
    res.status(500).json({ error: e.message });
  }
});



app.get('/api/ordenes/:id/pdf', async (req, res) => {
  try {
    let userId = null, userRol = null;
    const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
    if (token) { try { const d = jwt.verify(token, JWT_SECRET); userId = d.userId; userRol = d.rol; } catch {} }
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    
    const r = await db.query('SELECT o.*, u.nombre, u.apellido, u.email, u.telefono FROM ordenes o LEFT JOIN usuarios u ON u.id=o.usuario_id WHERE o.id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrada' });
    const orden = r.rows[0];
    const esAdmin = ['super_admin','admin_soporte','admin_inventario','admin_contabilidad'].includes(userRol);
    if (orden.usuario_id !== userId && !esAdmin) return res.status(403).json({ error: 'Sin acceso' });
    
    // Cargar seriales si los hay
    const ser = await db.query('SELECT s.*, p.nombre_es FROM ordenes_seriales s LEFT JOIN productos p ON p.id=s.producto_id WHERE s.orden_id=$1', [req.params.id]);
    const seriales = ser.rows;
    
    // Generar QR
    const qrUrl = 'https://portal.wifnix.com/orden/' + orden.id;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: '#0B8FCC', light: '#FFFFFF' } });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    
    // Determinar etiqueta y color según status
    const statusInfo = {
      'borrador': { label: 'BORRADOR', color: '#6B7280', subLabel: 'Sin procesar' },
      'pendiente_pago': { label: 'PENDIENTE DE PAGO', color: '#FFC107', subLabel: 'Esperando pago' },
      'pago_parcial': { label: 'PAGO PARCIAL', color: '#F59E0B', subLabel: 'Pago parcial recibido' },
      'pagado': { label: 'PAGADO', color: '#00E5A0', subLabel: 'Pago completo recibido' },
      'en_proceso': { label: 'EN PROCESO', color: '#0B8FCC', subLabel: 'Procesando orden' },
      'en_preparacion': { label: 'EN PREPARACIÓN', color: '#0B8FCC', subLabel: 'Alistando productos' },
      'listo_entrega': { label: 'LISTO PARA ENTREGA', color: '#29B6F6', subLabel: 'Listo para envío' },
      'en_transito': { label: 'EN TRÁNSITO', color: '#8B5CF6', subLabel: 'En camino' },
      'entregado': { label: 'ENTREGADO', color: '#10B981', subLabel: 'Producto entregado' },
      'instalacion_programada': { label: 'INSTALACIÓN PROGRAMADA', color: '#06B6D4', subLabel: 'Visita técnica agendada' },
      'completado': { label: 'COMPLETADO', color: '#059669', subLabel: 'Orden cerrada' },
      'cancelado': { label: 'CANCELADO', color: '#EF4444', subLabel: 'Orden cancelada' },
      'reembolsado': { label: 'REEMBOLSADO', color: '#6B7280', subLabel: 'Pago devuelto' }
    };
    const si = statusInfo[orden.status] || statusInfo['borrador'];
    
    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="WFX-' + String(orden.numero).padStart(4, '0') + '.pdf"');
    doc.pipe(res);
    
    // ============ HEADER BLANCO CON LOGO ============
    doc.rect(0, 0, 612, 130).fill('#FFFFFF');
    // Línea azul inferior decorativa
    doc.rect(0, 127, 612, 3).fill('#0B8FCC');
    
    // Logo Wifnix
    try {
      const logoPath = '/var/www/wifnix/frontend/assets/logo-wifnix.png';
      doc.image(logoPath, 40, 30, { height: 50 });
    } catch(e) {
      doc.fontSize(26).fillColor('#0B8FCC').font('Helvetica-Bold').text('WIFNIX', 40, 35);
    }
    
    // Tagline
    doc.fontSize(8).fillColor('#64748B').font('Helvetica').text('TECNOLOGÍA QUE PROTEGE TU NEGOCIO', 40, 90, { characterSpacing: 2 });
    doc.fontSize(8).fillColor('#475569').text('HC 06 Box 70500, Caguas PR 00727  |  (787) 354-9596  |  customerservice@wifnix.com', 40, 105);
    
    // Número de orden (derecha)
    doc.fontSize(10).fillColor('#64748B').font('Helvetica').text('FACTURA / INVOICE', 380, 35, { width: 192, align: 'right' });
    doc.fontSize(20).fillColor('#0B8FCC').font('Helvetica-Bold').text('WFX-' + String(orden.numero).padStart(4, '0'), 380, 50, { width: 192, align: 'right' });
    doc.fontSize(9).fillColor('#64748B').font('Helvetica').text(new Date(orden.creado_en).toLocaleDateString('es-PR', {year:'numeric',month:'long',day:'numeric'}), 380, 92, { width: 192, align: 'right' });
    
    // ============ BARRA DE STATUS ============
    doc.rect(0, 130, 612, 32).fill(si.color);
    doc.fontSize(11).fillColor('#FFFFFF').font('Helvetica-Bold').text(si.label, 40, 142, { characterSpacing: 1 });
    doc.fontSize(9).font('Helvetica').text(si.subLabel, 40, 142, { width: 532, align: 'right' });
    
    // ============ CLIENTE Y ENTREGA (2 columnas) ============
    let y = 185;
    
    // Cliente
    doc.fontSize(8).fillColor('#94A3B8').font('Helvetica-Bold').text('FACTURADO A', 40, y, { characterSpacing: 1.5 });
    doc.moveTo(40, y + 12).lineTo(280, y + 12).strokeColor('#0B8FCC').lineWidth(1).stroke();
    doc.fontSize(11).fillColor('#0F172A').font('Helvetica-Bold').text((orden.nombre || '') + ' ' + (orden.apellido || ''), 40, y + 18);
    doc.fontSize(9).font('Helvetica').fillColor('#475569').text(orden.email || '', 40, y + 34);
    if (orden.telefono) doc.text(orden.telefono, 40, y + 47);
    
    // Entrega
    doc.fontSize(8).fillColor('#94A3B8').font('Helvetica-Bold').text('ENTREGA', 320, y, { characterSpacing: 1.5 });
    doc.moveTo(320, y + 12).lineTo(572, y + 12).strokeColor('#0B8FCC').lineWidth(1).stroke();
    
    if (orden.direccion && orden.direccion !== 'RECOGER EN TIENDA') {
      doc.fontSize(11).fillColor('#0F172A').font('Helvetica-Bold').text('Envío a domicilio', 320, y + 18);
      doc.fontSize(9).font('Helvetica').fillColor('#475569').text(orden.direccion, 320, y + 34, { width: 252 });
      if (orden.municipio) doc.text(orden.municipio + ', PR', 320, y + 47);
    } else {
      doc.fontSize(11).fillColor('#0F172A').font('Helvetica-Bold').text('Recoger en tienda', 320, y + 18);
      doc.fontSize(9).font('Helvetica').fillColor('#475569').text('HC 06 Box 70500, Caguas PR', 320, y + 34);
    }
    
    if (orden.tracking_number) {
      doc.fontSize(8).fillColor('#0B8FCC').font('Helvetica-Bold').text('TRACKING: ', 320, y + 60, { continued: true }).font('Helvetica').text(orden.tracking_number + (orden.tracking_carrier ? ' (' + orden.tracking_carrier + ')' : ''));
    }
    
    // ============ PRODUCTOS ============
    y = 280;
    doc.fontSize(8).fillColor('#94A3B8').font('Helvetica-Bold').text('PRODUCTOS', 40, y, { characterSpacing: 1.5 });
    doc.moveTo(40, y + 12).lineTo(572, y + 12).strokeColor('#0B8FCC').lineWidth(1).stroke();
    
    y += 20;
    
    // Header de tabla
    doc.rect(40, y, 532, 22).fill('#0B8FCC');
    doc.fontSize(8).fillColor('#FFFFFF').font('Helvetica-Bold');
    doc.text('PRODUCTO', 50, y + 7);
    doc.text('SKU', 290, y + 7);
    doc.text('CANT', 370, y + 7, { width: 40, align: 'center' });
    doc.text('PRECIO', 420, y + 7, { width: 70, align: 'right' });
    doc.text('TOTAL', 500, y + 7, { width: 65, align: 'right' });
    
    y += 28;
    const items = Array.isArray(orden.items) ? orden.items : [];
    items.forEach((item, i) => {
      if (i % 2 === 1) doc.rect(40, y - 4, 532, 20).fill('#F8FAFC');
      doc.fontSize(9).fillColor('#0F172A').font('Helvetica');
      doc.text(item.nombre || '-', 50, y, { width: 230 });
      doc.fontSize(8).fillColor('#64748B').text(item.sku || '-', 290, y + 1);
      doc.fontSize(9).fillColor('#0F172A').text(String(item.cantidad || 1), 370, y, { width: 40, align: 'center' });
      doc.text('$' + parseFloat(item.precio || 0).toFixed(2), 420, y, { width: 70, align: 'right' });
      doc.font('Helvetica-Bold').text('$' + (parseFloat(item.precio || 0) * (item.cantidad || 1)).toFixed(2), 500, y, { width: 65, align: 'right' });
      y += 20;
      
      // Seriales de este producto
      const seriesItem = seriales.filter(s => s.producto_id === item.producto_id);
      if (seriesItem.length) {
        doc.fontSize(7).fillColor('#0B8FCC').font('Helvetica-Bold').text('S/N: ', 60, y, { continued: true }).font('Helvetica').fillColor('#475569').text(seriesItem.map(s => s.numero_serie).join(', '));
        y += 12;
      }
    });
    
    // ============ TOTALES ============
    y += 15;
    doc.moveTo(360, y).lineTo(572, y).strokeColor('#E2E8F0').lineWidth(1).stroke();
    y += 10;
    
    doc.fontSize(9).fillColor('#64748B').font('Helvetica').text('Subtotal:', 360, y);
    doc.fillColor('#0F172A').font('Helvetica-Bold').text('$' + parseFloat(orden.subtotal || 0).toFixed(2), 500, y, { width: 65, align: 'right' });
    y += 16;
    
    doc.fillColor('#64748B').font('Helvetica').text('IVU (11.5%):', 360, y);
    doc.fillColor('#0F172A').font('Helvetica-Bold').text('$' + parseFloat(orden.impuesto || 0).toFixed(2), 500, y, { width: 65, align: 'right' });
    y += 22;
    
    doc.rect(360, y - 6, 212, 32).fill('#0B8FCC');
    doc.fontSize(11).fillColor('#FFFFFF').font('Helvetica-Bold').text('TOTAL:', 372, y + 4);
    doc.fontSize(14).text('$' + parseFloat(orden.total || 0).toFixed(2), 372, y + 2, { width: 188, align: 'right' });
    y += 40;
    
    // ============ GARANTÍAS (si las hay) ============
    if (seriales.some(s => s.garantia_vencimiento)) {
      y += 10;
      doc.fontSize(8).fillColor('#94A3B8').font('Helvetica-Bold').text('GARANTÍAS', 40, y, { characterSpacing: 1.5 });
      doc.moveTo(40, y + 12).lineTo(572, y + 12).strokeColor('#0B8FCC').lineWidth(1).stroke();
      y += 22;
      
      seriales.forEach(s => {
        if (s.garantia_vencimiento) {
          doc.fontSize(9).fillColor('#0F172A').font('Helvetica-Bold').text(s.nombre_es || '-', 40, y);
          doc.fontSize(8).fillColor('#64748B').font('Helvetica').text('S/N: ' + s.numero_serie + ' | Vence: ' + new Date(s.garantia_vencimiento).toLocaleDateString('es-PR'), 40, y + 13);
          y += 32;
        }
      });
    }
    
    // ============ FOOTER ============
    const footerY = 720;
    
    // QR code
    try {
      doc.image(qrBuffer, 40, footerY - 10, { width: 60 });
      doc.fontSize(7).fillColor('#94A3B8').font('Helvetica').text('Ver orden online', 40, footerY + 52, { width: 60, align: 'center' });
    } catch(e) { console.error('QR error:', e.message); }
    
    // Mensaje de agradecimiento (centro)
    doc.fontSize(11).fillColor('#0B8FCC').font('Helvetica-Bold').text('Gracias por confiar en Wifnix', 120, footerY, { width: 360, align: 'center' });
    doc.fontSize(8).fillColor('#64748B').font('Helvetica').text('Para soporte técnico, dudas o reclamos:', 120, footerY + 18, { width: 360, align: 'center' });
    doc.fontSize(9).fillColor('#0B8FCC').font('Helvetica-Bold').text('wifnix.com  |  (787) 354-9596', 120, footerY + 32, { width: 360, align: 'center' });
    doc.fontSize(7).fillColor('#94A3B8').font('Helvetica').text('© ' + new Date().getFullYear() + ' Wifnix LLC. Caguas, Puerto Rico. Todos los derechos reservados.', 120, footerY + 50, { width: 360, align: 'center' });
    
    // Redes sociales (derecha)
    doc.fontSize(7).fillColor('#94A3B8').font('Helvetica-Bold').text('SÍGUENOS', 510, footerY, { width: 62, align: 'center', characterSpacing: 1 });
    doc.fontSize(7).fillColor('#0B8FCC').font('Helvetica').text('@wifnixllc', 510, footerY + 14, { width: 62, align: 'center' });
    doc.text('IG · FB · IN', 510, footerY + 26, { width: 62, align: 'center' });
    
    doc.end();
  } catch(e) {
    console.error('PDF orden:', e.message);
    res.status(500).json({ error: e.message });
  }
});


// =========================================
// ADMIN - GESTIÓN DE ÓRDENES (status, seriales, tracking)
// =========================================

// Cambiar status de orden (admin)
app.put('/api/admin/ordenes/:id/status', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_contabilidad','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { status, notas_admin } = req.body;
    const validos = ['borrador','pendiente_pago','pago_parcial','pagado','en_proceso','en_preparacion','listo_entrega','instalacion_programada','en_transito','entregado','completado','cancelado','reembolsado'];
    if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    
    // Obtener orden ANTES de actualizar (para comparar status y obtener email)
    const prev = await db.query('SELECT o.*, u.email, u.nombre FROM ordenes o LEFT JOIN usuarios u ON u.id=o.usuario_id WHERE o.id=$1', [req.params.id]);
    if (!prev.rows.length) return res.status(404).json({ error: 'No encontrada' });
    const ordenPrev = prev.rows[0];
    const statusAnterior = ordenPrev.status;
    
    await db.query(
      'UPDATE ordenes SET status=$1, notas_admin=COALESCE($2, notas_admin), actualizado_en=NOW() WHERE id=$3',
      [status, notas_admin || null, req.params.id]
    );
    
    // ENVIAR EMAIL AUTOMÁTICO si el status cambió
    if (status !== statusAnterior && ordenPrev.email) {
      const ordenNum = 'WFX-' + String(ordenPrev.numero).padStart(4, '0');
      let mailTitulo = null, mailCuerpo = null, mailAsunto = null;
      
      if (status === 'pagado') {
        mailAsunto = '✓ Pago confirmado — ' + ordenNum;
        mailTitulo = 'Pago confirmado';
        mailCuerpo = '<p style="margin:0 0 14px">Hemos confirmado el pago de tu orden <strong>' + ordenNum + '</strong>.</p><p style="margin:0 0 14px">Comenzamos a preparar tu orden de inmediato. Te avisaremos cuando esté lista para entrega.</p>';
      } else if (status === 'en_proceso') {
        mailAsunto = '⏳ Tu orden ' + ordenNum + ' está en proceso';
        mailTitulo = 'Orden en proceso';
        mailCuerpo = '<p style="margin:0 0 14px">Tu orden <strong>' + ordenNum + '</strong> está siendo procesada por nuestro equipo.</p><p style="margin:0 0 14px">Te mantendremos al tanto de cualquier actualización.</p>';
      } else if (status === 'en_preparacion') {
        mailAsunto = '📦 Tu orden ' + ordenNum + ' está en preparación';
        mailTitulo = 'Preparando tu orden';
        mailCuerpo = '<p style="margin:0 0 14px">Buenas noticias — tu orden <strong>' + ordenNum + '</strong> está siendo preparada por nuestro equipo.</p><p style="margin:0 0 14px">Te notificaremos cuando esté lista para entrega o envío.</p>';
      } else if (status === 'listo_entrega') {
        mailAsunto = '✅ Tu orden ' + ordenNum + ' está lista';
        mailTitulo = 'Tu orden está lista';
        mailCuerpo = '<p style="margin:0 0 14px">Tu orden <strong>' + ordenNum + '</strong> está lista para entrega.</p><p style="margin:0 0 14px">Si elegiste recoger en tienda, puedes pasar a buscarla en HC 06 Box 70500, Caguas. Si elegiste envío, será despachada en breve.</p>';
      } else if (status === 'en_transito') {
        mailAsunto = '🚚 Tu orden ' + ordenNum + ' está en camino';
        mailTitulo = 'En camino';
        var trackingInfo = '';
        if (ordenPrev.tracking_number) {
          trackingInfo = '<p style="margin:0 0 14px;padding:12px;background:#EFF6FF;border-left:3px solid #0B8FCC;font-size:13px"><strong>Tracking:</strong> ' + ordenPrev.tracking_number + (ordenPrev.tracking_carrier ? ' (' + ordenPrev.tracking_carrier + ')' : '') + '</p>';
        }
        mailCuerpo = '<p style="margin:0 0 14px">Tu orden <strong>' + ordenNum + '</strong> ha sido despachada y está en camino.</p>' + trackingInfo;
      } else if (status === 'entregado') {
        mailAsunto = '🎉 Tu orden ' + ordenNum + ' fue entregada';
        mailTitulo = 'Orden entregada';
        mailCuerpo = '<p style="margin:0 0 14px">¡Felicidades! Tu orden <strong>' + ordenNum + '</strong> fue entregada con éxito.</p><p style="margin:0 0 14px">Hemos activado automáticamente tu garantía. Puedes verla en cualquier momento desde tu portal cliente.</p><p style="margin:0 0 14px">Esperamos que disfrutes tu producto. En unos días te enviaremos un email para que compartas tu experiencia.</p>';
      } else if (status === 'completado') {
        mailAsunto = 'Orden ' + ordenNum + ' completada';
        mailTitulo = 'Orden completada';
        mailCuerpo = '<p style="margin:0 0 14px">Tu orden <strong>' + ordenNum + '</strong> ha sido marcada como completada. ¡Gracias por elegir Wifnix!</p>';
      } else if (status === 'cancelado') {
        mailAsunto = 'Orden ' + ordenNum + ' cancelada';
        mailTitulo = 'Orden cancelada';
        mailCuerpo = '<p style="margin:0 0 14px">Tu orden <strong>' + ordenNum + '</strong> ha sido cancelada.</p><p style="margin:0 0 14px">Si pagaste por adelantado, procesaremos el reembolso en los próximos días hábiles. Si tienes preguntas, contáctanos.</p>';
      } else if (status === 'reembolsado') {
        mailAsunto = 'Reembolso procesado — ' + ordenNum;
        mailTitulo = 'Reembolso procesado';
        mailCuerpo = '<p style="margin:0 0 14px">Hemos procesado el reembolso de tu orden <strong>' + ordenNum + '</strong>.</p><p style="margin:0 0 14px">El monto debería reflejarse en tu cuenta en 3-5 días hábiles dependiendo de tu banco.</p>';
      }
      
      if (mailAsunto) {
        try {
          sendEmail(ordenPrev.email, mailAsunto, emailTemplate({
            titulo: mailTitulo,
            saludo: 'Hola ' + (ordenPrev.nombre || '') + ',',
            cuerpo: mailCuerpo,
            cta: { texto: 'Ver mi orden', url: 'https://portal.wifnix.com' },
            despedida: 'Equipo Wifnix'
          }));
        } catch(e) { console.error('Email status:', e.message); }
      }
    }
    
    // Si pasa a "entregado" Y tiene seriales registrados, crear garantías automáticamente
    if (status === 'entregado' || status === 'completado') {
      const seriales = await db.query('SELECT * FROM ordenes_seriales WHERE orden_id=$1', [req.params.id]);
      const orden = await db.query('SELECT * FROM ordenes WHERE id=$1', [req.params.id]);
      const o = orden.rows[0];
      
      for (const s of seriales.rows) {
        const prod = await db.query('SELECT nombre_es, garantia_meses FROM productos WHERE id=$1', [s.producto_id]);
        if (!prod.rows.length) continue;
        const meses = s.garantia_meses || prod.rows[0].garantia_meses || 12;
        const vencimiento = new Date();
        vencimiento.setMonth(vencimiento.getMonth() + meses);
        
        // Actualizar fecha_entrega y vencimiento en el serial
        await db.query(
          'UPDATE ordenes_seriales SET fecha_entrega=NOW(), garantia_vencimiento=$1 WHERE id=$2',
          [vencimiento, s.id]
        );
        
        // Crear garantía en tabla garantias si no existe
        const yaExiste = await db.query(
          'SELECT id FROM garantias WHERE producto_serial=$1 AND usuario_id=$2',
          [s.numero_serie, o.usuario_id]
        );
        if (!yaExiste.rows.length) {
          await db.query(
            'INSERT INTO garantias (usuario_id, orden_id, producto_nombre, producto_serial, fecha_instalacion, fecha_vencimiento, status) VALUES ($1,$2,$3,$4,NOW(),$5,$6)',
            [o.usuario_id, o.id, prod.rows[0].nombre_es, s.numero_serie, vencimiento, 'activa']
          );
        }
      }
    }
    
    res.json({ ok: true });
  } catch(e) {
    console.error('Status orden:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Registrar seriales para una orden
app.post('/api/admin/ordenes/:id/seriales', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_contabilidad','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { seriales } = req.body; // array: [{producto_id, numero_serie, garantia_meses}]
    if (!Array.isArray(seriales)) return res.status(400).json({ error: 'Seriales inválidos' });
    
    for (const s of seriales) {
      if (!s.producto_id || !s.numero_serie) continue;
      try {
        await db.query(
          'INSERT INTO ordenes_seriales (orden_id, producto_id, numero_serie, garantia_meses, registrado_por) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (orden_id, numero_serie) DO UPDATE SET garantia_meses=$4',
          [req.params.id, s.producto_id, s.numero_serie, s.garantia_meses || 12, req.user.id]
        );
      } catch(e) { console.error('Serial:', e.message); }
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Eliminar serial
app.delete('/api/admin/ordenes/seriales/:serialId', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_contabilidad','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    await db.query('DELETE FROM ordenes_seriales WHERE id=$1', [req.params.serialId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Añadir/actualizar tracking de orden
app.put('/api/admin/ordenes/:id/tracking', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_contabilidad','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { tracking_number, tracking_carrier } = req.body;
    await db.query(
      'UPDATE ordenes SET tracking_number=$1, tracking_carrier=$2 WHERE id=$3',
      [tracking_number || null, tracking_carrier || null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Obtener seriales de una orden
app.get('/api/ordenes/:id/seriales', authMiddleware, async (req, res) => {
  try {
    // Verificar que es el dueño o admin
    const orden = await db.query('SELECT usuario_id FROM ordenes WHERE id=$1', [req.params.id]);
    if (!orden.rows.length) return res.status(404).json({ error: 'No encontrada' });
    const esAdmin = ['super_admin','admin_contabilidad','admin_inventario','admin_soporte'].includes(req.user.rol);
    if (orden.rows[0].usuario_id !== req.user.id && !esAdmin) return res.status(403).json({ error: 'Sin acceso' });
    
    const r = await db.query(
      `SELECT s.*, p.nombre_es as producto_nombre, p.sku
       FROM ordenes_seriales s
       LEFT JOIN productos p ON p.id = s.producto_id
       WHERE s.orden_id=$1
       ORDER BY p.nombre_es, s.numero_serie`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// =========================================
// ATH MÓVIL — PAYMENT BUTTON API
// =========================================
const ATH_API = 'https://payments.athmovil.com/api/business-transaction/ecommerce';

// Paso 1: Crear pago (devuelve ecommerceId y auth_token)
app.post('/api/ath/payment', authMiddleware, async (req, res) => {
  try {
    const { total, subtotal, tax, items, phoneNumber, metadata2 } = req.body;
    if (!total || !phoneNumber) return res.status(400).json({ error: 'Faltan datos' });
    if (parseFloat(total) > 1500) return res.status(400).json({ error: 'ATH Móvil tiene límite de $1,500' });
    
    const payload = {
      env: 'production',
      publicToken: process.env.ATH_MOVIL_PUBLIC_KEY,
      timeout: 600,
      total: parseFloat(total).toFixed(2),
      tax: parseFloat(tax || 0).toFixed(2),
      subtotal: parseFloat(subtotal || total).toFixed(2),
      metadata1: 'wifnix-checkout',
      metadata2: (metadata2 || '').substring(0, 40),
      items: items.map(i => ({
        name: (i.nombre || '').substring(0, 40),
        description: (i.sku || '').substring(0, 40),
        quantity: String(i.cantidad || 1),
        price: parseFloat(i.precio).toFixed(2),
        tax: '0.00',
        metadata: ''
      })),
      phoneNumber: phoneNumber.replace(/[^0-9]/g, '').slice(-10)
    };
    
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(ATH_API + '/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    console.error('ATH payment:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Paso 2: Verificar status del pago (polling)
app.post('/api/ath/find-payment', authMiddleware, async (req, res) => {
  try {
    const { ecommerceId } = req.body;
    if (!ecommerceId) return res.status(400).json({ error: 'Falta ecommerceId' });
    
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(ATH_API + '/business/findPayment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ecommerceId: ecommerceId, publicToken: process.env.ATH_MOVIL_PUBLIC_KEY })
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    console.error('ATH find:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Paso 3: Autorizar (completar el pago)
app.post('/api/ath/authorization', authMiddleware, async (req, res) => {
  try {
    const { authToken } = req.body;
    if (!authToken) return res.status(400).json({ error: 'Falta authToken' });
    
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(ATH_API + '/authorization', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + authToken
      }
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    console.error('ATH auth:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Cancelar pago
app.post('/api/ath/cancel', authMiddleware, async (req, res) => {
  try {
    const { ecommerceId } = req.body;
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(ATH_API + '/business/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ecommerceId: ecommerceId, publicToken: process.env.ATH_MOVIL_PUBLIC_KEY })
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});



// GET /api/admin/usuarios/:id/detalle — Perfil completo con órdenes, garantías, reseñas
app.get('/api/admin/usuarios/:id/detalle', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_inventario','admin_contabilidad'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    
    const userId = req.params.id;
    
    // Usuario
    const u = await db.query('SELECT id, email, nombre, apellido, telefono, rol::text, status::text, creado_en, ultimo_login FROM usuarios WHERE id=$1', [userId]);
    if (!u.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    // Órdenes del usuario
    const ordenes = await db.query(`
      SELECT id, numero, status::text, tipo::text, subtotal, impuesto, total, 
             direccion, municipio, tracking_number, tracking_carrier, 
             creado_en, completado_en, items
      FROM ordenes 
      WHERE usuario_id=$1
      ORDER BY creado_en DESC
    `, [userId]);
    
    // Garantías
    const garantias = await db.query(`
      SELECT id, producto_nombre, producto_serial, fecha_instalacion, fecha_vencimiento, status::text, creado_en
      FROM garantias
      WHERE usuario_id=$1
      ORDER BY creado_en DESC
    `, [userId]);
    
    // Tickets/Soporte (si existe la tabla)
    let tickets = { rows: [] };
    try {
      tickets = await db.query(`
        SELECT id, asunto, status::text, prioridad::text, creado_en
        FROM tickets
        WHERE usuario_id=$1
        ORDER BY creado_en DESC
        LIMIT 10
      `, [userId]);
    } catch(e) {}
    
    // Reseñas
    let resenas = { rows: [] };
    try {
      resenas = await db.query(`
        SELECT r.id, r.rating, r.titulo, r.comentario, r.creado_en, p.nombre_es as producto_nombre, p.sku
        FROM resenas_productos r
        LEFT JOIN productos p ON p.id = r.producto_id
        WHERE r.usuario_id=$1
        ORDER BY r.creado_en DESC
        LIMIT 10
      `, [userId]);
    } catch(e) {}
    
    // Estadísticas
    const stats = {
      total_ordenes: ordenes.rows.length,
      total_gastado: ordenes.rows.reduce((sum, o) => sum + parseFloat(o.total || 0), 0),
      garantias_activas: garantias.rows.filter(g => g.status === 'activa').length,
      tickets_abiertos: tickets.rows.filter(t => ['abierto','en_revision','en_proceso'].includes(t.status)).length,
      total_resenas: resenas.rows.length
    };
    
    res.json({
      usuario: u.rows[0],
      ordenes: ordenes.rows,
      garantias: garantias.rows,
      tickets: tickets.rows,
      resenas: resenas.rows,
      stats: stats
    });
  } catch(e) {
    console.error('Detalle usuario:', e.message);
    res.status(500).json({ error: e.message });
  }
});



// =========================================
// STRIPE — PAGOS CON TARJETA
// =========================================

// Crear Payment Intent (devuelve client_secret para el frontend)
app.post('/api/stripe/crear-intento', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe no configurado' });
    const { total } = req.body;
    if (!total || total <= 0) return res.status(400).json({ error: 'Monto inválido' });
    
    // Stripe usa centavos
    const amount = Math.round(parseFloat(total) * 100);
    
    const intent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        usuario_id: req.user.id,
        email: req.user.email || ''
      }
    });
    
    res.json({ ok: true, clientSecret: intent.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch(e) {
    console.error('Stripe intento:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Verificar estado del pago
app.post('/api/stripe/verificar', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe no configurado' });
    const { paymentIntentId } = req.body;
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    res.json({ ok: true, status: intent.status, paid: intent.status === 'succeeded' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});



// =========================================
// CITAS DE MANTENIMIENTO
// =========================================

// Config de slots
const SLOTS_SEMANA = ['08:00-10:00','10:00-12:00','12:00-14:00','14:00-16:00','16:00-18:00'];
const SLOTS_FINDE = ['09:00-11:00','11:00-13:00','13:00-15:00'];
const MAX_CITAS_POR_SLOT = 3;
const TIPOS_SERVICIO = ['Mantenimiento de aire acondicionado','Limpieza de cámaras CCTV','Revisión de redes/WiFi','Mantenimiento de servidores','Inspección de cableado','Otro servicio'];

// GET disponibilidad de un día
app.get('/api/citas/disponibilidad', authMiddleware, async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    
    const d = new Date(fecha + 'T12:00:00');
    const diaSemana = d.getDay(); // 0=domingo, 6=sabado
    
    // Validar anticipación mínima 24h
    const ahora = new Date();
    const minFecha = new Date(ahora.getTime() + 24*60*60*1000);
    if (d < minFecha) return res.json({ slots: [], mensaje: 'Requiere mínimo 24 horas de anticipación' });
    
    // Validar máximo 30 días
    const maxFecha = new Date(ahora.getTime() + 30*24*60*60*1000);
    if (d > maxFecha) return res.json({ slots: [], mensaje: 'Para fechas con más de 30 días, abre un ticket de soporte' });
    
    // Verificar si el día está bloqueado
    const bloqueado = await db.query('SELECT motivo FROM dias_bloqueados WHERE fecha=$1', [fecha]);
    if (bloqueado.rows.length) return res.json({ slots: [], mensaje: 'Día no disponible' + (bloqueado.rows[0].motivo ? ': ' + bloqueado.rows[0].motivo : '') });
    
    const esFinde = (diaSemana === 0 || diaSemana === 6);
    const slotsBase = esFinde ? SLOTS_FINDE : SLOTS_SEMANA;
    
    // Ver cuántas citas ya hay por slot ese día
    const ocupados = await db.query(
      "SELECT slot, COUNT(*) as total FROM citas_mantenimiento WHERE fecha=$1 AND status NOT IN ('cancelada','no_show') GROUP BY slot",
      [fecha]
    );
    const ocupadosMap = {};
    ocupados.rows.forEach(r => { ocupadosMap[r.slot] = parseInt(r.total); });
    
    const slots = slotsBase.map(s => ({
      slot: s,
      disponibles: MAX_CITAS_POR_SLOT - (ocupadosMap[s] || 0),
      lleno: (ocupadosMap[s] || 0) >= MAX_CITAS_POR_SLOT
    }));
    
    res.json({ slots, esFinSemana: esFinde, mensaje: esFinde ? 'Fines de semana tienen cargo adicional' : null });
  } catch(e) {
    console.error('Disponibilidad:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST crear cita (cliente)
app.post('/api/citas/crear', authMiddleware, async (req, res) => {
  try {
    const { tipo_servicio, descripcion, fecha, slot, direccion, municipio, telefono, notas_cliente, latitud, longitud, frecuencia_meses, unidades } = req.body;
    if (!tipo_servicio || !fecha || !slot) return res.status(400).json({ error: 'Faltan datos obligatorios' });
    var freqValida = frecuencia_meses && [1,3,4,6].includes(parseInt(frecuencia_meses)) ? parseInt(frecuencia_meses) : null;
    
    // Depósito dinámico: >5 unidades de AC = $80, sino $35
    var totalUnidades = 0;
    if (Array.isArray(unidades)) { unidades.forEach(function(u){ totalUnidades += parseInt(u.cantidad)||0; }); }
    var depositoMonto = totalUnidades > 5 ? 80.00 : 35.00;
    
    // Construir descripción desglosada para AC
    var descFinal = descripcion || null;
    if (Array.isArray(unidades) && unidades.length) {
      var desglose = unidades.map(function(u){ return u.cantidad + ' ' + u.tipo_unidad; }).join(', ');
      descFinal = (descripcion ? descripcion + ' | ' : '') + 'Unidades: ' + desglose;
    }
    
    const d = new Date(fecha + 'T12:00:00');
    const diaSemana = d.getDay();
    const esFinde = (diaSemana === 0 || diaSemana === 6);
    
    // Validar disponibilidad
    const ocupados = await db.query(
      "SELECT COUNT(*) as total FROM citas_mantenimiento WHERE fecha=$1 AND slot=$2 AND status NOT IN ('cancelada','no_show')",
      [fecha, slot]
    );
    if (parseInt(ocupados.rows[0].total) >= MAX_CITAS_POR_SLOT) {
      return res.status(409).json({ error: 'Ese horario ya está lleno. Selecciona otro.' });
    }
    
    // Fecha de confirmación requerida (1 semana antes de la cita)
    const fechaConfirm = new Date(d.getTime() - 7*24*60*60*1000);
    
    const r = await db.query(
      `INSERT INTO citas_mantenimiento 
       (usuario_id, tipo_servicio, descripcion, fecha, slot, es_fin_semana, direccion, municipio, telefono, notas_cliente, fecha_confirmacion_requerida, status, latitud, longitud, frecuencia_meses, recurrencia_activa, deposito_monto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, numero`,
      [req.user.id, tipo_servicio, descFinal, fecha, slot, esFinde, direccion || null, municipio || null, telefono || null, notas_cliente || null, fechaConfirm.toISOString().split('T')[0], 'solicitada', latitud || null, longitud || null, freqValida, freqValida ? true : false, depositoMonto]
    );
    
    // Guardar unidades de AC
    if (Array.isArray(unidades) && unidades.length) {
      for (const u of unidades) {
        if (u.tipo_unidad && u.cantidad) {
          await db.query('INSERT INTO citas_unidades (cita_id, tipo_unidad, cantidad) VALUES ($1,$2,$3)', [r.rows[0].id, u.tipo_unidad, parseInt(u.cantidad)]);
        }
      }
    }
    
    // Historial
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
      [r.rows[0].id, 'creada', 'Cita solicitada por el cliente', req.user.id]);
    
    // Email al admin
    try {
      const u = await db.query('SELECT nombre, apellido, email FROM usuarios WHERE id=$1', [req.user.id]);
      const cli = u.rows[0];
      sendEmail('customerservice@wifnix.com', '🔧 Nueva cita de mantenimiento CIT-' + String(r.rows[0].numero).padStart(4,'0'), emailTemplate({
        titulo: 'Nueva solicitud de mantenimiento',
        saludo: 'Hola equipo,',
        cuerpo: '<p style="margin:0 0 14px">Nuevo servicio solicitado:</p>' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px;width:140px">Cliente</td><td style="padding:8px">' + cli.nombre + ' ' + cli.apellido + '</td></tr>' +
          '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Servicio</td><td style="padding:8px">' + tipo_servicio + '</td></tr>' +
          '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Fecha</td><td style="padding:8px">' + fecha + ' (' + slot + ')' + (esFinde ? ' - FIN DE SEMANA' : '') + '</td></tr>' +
          '<tr><td style="background:#F8FAFC;font-weight:600;padding:8px">Dirección</td><td style="padding:8px">' + (direccion || 'No especificada') + (municipio ? ', ' + municipio : '') + '</td></tr>' +
          '</table>',
        cta: { texto: 'Ver en admin', url: 'https://admin.wifnix.com' },
        despedida: 'Sistema automatizado'
      }));
    } catch(e) { console.error('Email cita:', e.message); }
    
    res.json({ ok: true, id: r.rows[0].id, numero: r.rows[0].numero, esFinSemana: esFinde });
  } catch(e) {
    console.error('Crear cita:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET mis citas (cliente)
app.get('/api/citas/mis-citas', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT c.*, t.nombre as tecnico_nombre 
       FROM citas_mantenimiento c
       LEFT JOIN tecnicos t ON t.id = c.tecnico_id
       WHERE c.usuario_id=$1
       ORDER BY c.fecha DESC, c.creado_en DESC`,
      [req.user.id]
    );
    // Añadir unidades a cada cita
    for (const cita of r.rows) {
      const un = await db.query('SELECT tipo_unidad, cantidad FROM citas_unidades WHERE cita_id=$1', [cita.id]);
      cita.unidades = un.rows;
    }
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT reprogramar/cancelar cita (cliente)
app.put('/api/citas/:id/cliente', authMiddleware, async (req, res) => {
  try {
    const { accion, nueva_fecha, nuevo_slot } = req.body;
    const cita = await db.query('SELECT * FROM citas_mantenimiento WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!cita.rows.length) return res.status(404).json({ error: 'Cita no encontrada' });
    const c = cita.rows[0];
    
    // Verificar regla 24h
    const fechaCita = new Date(c.fecha + 'T08:00:00');
    const ahora = new Date();
    const horasRestantes = (fechaCita - ahora) / (1000*60*60);
    
    if (accion === 'cancelar') {
      const depositoPerdido = horasRestantes < 24 && c.deposito_pagado;
      await db.query("UPDATE citas_mantenimiento SET status='cancelada', actualizado_en=NOW() WHERE id=$1", [req.params.id]);
      await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
        [req.params.id, 'cancelada', depositoPerdido ? 'Cancelada <24h - depósito no reembolsable' : 'Cancelada por cliente', req.user.id]);
      return res.json({ ok: true, depositoPerdido });
    }
    
    if (accion === 'reprogramar') {
      if (!nueva_fecha || !nuevo_slot) return res.status(400).json({ error: 'Falta nueva fecha/slot' });
      if (horasRestantes < 24) return res.status(403).json({ error: 'No puedes reprogramar con menos de 24 horas. El depósito se mantiene si reprogramas antes.' });
      
      const d = new Date(nueva_fecha + 'T12:00:00');
      const esFinde = (d.getDay() === 0 || d.getDay() === 6);
      const fechaConfirm = new Date(d.getTime() - 7*24*60*60*1000);
      
      await db.query(
        "UPDATE citas_mantenimiento SET fecha=$1, slot=$2, es_fin_semana=$3, fecha_confirmacion_requerida=$4, status='reprogramada', actualizado_en=NOW() WHERE id=$5",
        [nueva_fecha, nuevo_slot, esFinde, fechaConfirm.toISOString().split('T')[0], req.params.id]
      );
      await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
        [req.params.id, 'reprogramada', 'Movida a ' + nueva_fecha + ' ' + nuevo_slot, req.user.id]);
      
      // Email admin
      try {
        sendEmail('customerservice@wifnix.com', '🔄 Cita reprogramada CIT-' + String(c.numero).padStart(4,'0'),
          emailTemplate({ titulo: 'Cita reprogramada', saludo: 'Hola equipo,', cuerpo: '<p>La cita CIT-' + String(c.numero).padStart(4,'0') + ' fue reprogramada a <strong>' + nueva_fecha + ' (' + nuevo_slot + ')</strong>.</p>', cta: { texto: 'Ver en admin', url: 'https://admin.wifnix.com' }, despedida: 'Sistema' }));
      } catch(e) {}
      
      return res.json({ ok: true });
    }
    
    res.status(400).json({ error: 'Acción inválida' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN =====

// GET todas las citas (admin) - para calendario
app.get('/api/admin/citas', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { desde, hasta } = req.query;
    let q = `SELECT c.*, u.nombre as cliente_nombre, u.apellido as cliente_apellido, u.email as cliente_email, t.nombre as tecnico_nombre, t.numero_empleado
             FROM citas_mantenimiento c
             LEFT JOIN usuarios u ON u.id = c.usuario_id
             LEFT JOIN tecnicos t ON t.id = c.tecnico_id`;
    const params = [];
    if (desde && hasta) {
      q += ' WHERE c.fecha BETWEEN $1 AND $2';
      params.push(desde, hasta);
    }
    q += ' ORDER BY c.fecha, c.slot';
    const r = await db.query(q, params);
    // Añadir unidades y técnicos múltiples
    for (const cita of r.rows) {
      const un = await db.query('SELECT tipo_unidad, cantidad FROM citas_unidades WHERE cita_id=$1', [cita.id]);
      cita.unidades = un.rows;
      const tec = await db.query('SELECT ct.tecnico_id, t.nombre, t.numero_empleado FROM citas_tecnicos ct JOIN tecnicos t ON t.id=ct.tecnico_id WHERE ct.cita_id=$1', [cita.id]);
      cita.tecnicos = tec.rows;
    }
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT gestionar cita (admin): asignar técnico, cambiar status, notas
app.put('/api/admin/citas/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { tecnico_id, status, notas_admin, deposito_pagado, frecuencia_meses, recurrencia_activa } = req.body;
    
    // Estado anterior para saber si estamos completando ahora
    const prev = await db.query('SELECT * FROM citas_mantenimiento WHERE id=$1', [req.params.id]);
    const citaPrev = prev.rows[0];
    
    var freqValida = frecuencia_meses !== undefined ? (frecuencia_meses && [1,3,4,6].includes(parseInt(frecuencia_meses)) ? parseInt(frecuencia_meses) : null) : citaPrev.frecuencia_meses;
    var recurActiva = recurrencia_activa !== undefined ? recurrencia_activa : citaPrev.recurrencia_activa;
    
    await db.query(
      `UPDATE citas_mantenimiento SET 
        tecnico_id=COALESCE($1, tecnico_id),
        status=COALESCE($2, status),
        notas_admin=COALESCE($3, notas_admin),
        deposito_pagado=COALESCE($4, deposito_pagado),
        frecuencia_meses=$5,
        recurrencia_activa=$6,
        actualizado_en=NOW()
       WHERE id=$7`,
      [tecnico_id || null, status || null, notas_admin || null, deposito_pagado, freqValida, recurActiva, req.params.id]
    );
    
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'admin_update', 'Actualizada por admin: ' + (status || 'cambios'), req.user.id]);
    
    // ★ AUTO-GENERAR PROXIMA CITA si se marca completada y recurrencia activa
    if (status === 'completada' && citaPrev.status !== 'completada' && recurActiva && freqValida) {
      try {
        // citaPrev.fecha puede ser Date o string; normalizar a YYYY-MM-DD
        let fechaBase;
        if (citaPrev.fecha instanceof Date) {
          fechaBase = citaPrev.fecha;
        } else {
          fechaBase = new Date(String(citaPrev.fecha).split('T')[0] + 'T12:00:00');
        }
        const proximaFecha = new Date(fechaBase.getFullYear(), fechaBase.getMonth() + freqValida, fechaBase.getDate(), 12, 0, 0);
        const proximaStr = proximaFecha.getFullYear() + '-' + String(proximaFecha.getMonth()+1).padStart(2,'0') + '-' + String(proximaFecha.getDate()).padStart(2,'0');
        const esFindeProx = (proximaFecha.getDay() === 0 || proximaFecha.getDay() === 6);
        
        // Verificar si día está bloqueado o lleno
        const bloq = await db.query('SELECT 1 FROM dias_bloqueados WHERE fecha=$1', [proximaStr]);
        const ocup = await db.query("SELECT COUNT(*) as t FROM citas_mantenimiento WHERE fecha=$1 AND slot=$2 AND status NOT IN ('cancelada','no_show')", [proximaStr, citaPrev.slot]);
        const requiereReacomodo = bloq.rows.length > 0 || parseInt(ocup.rows[0].t) >= 3;
        
        const fechaConfirmObj = new Date(proximaFecha.getTime() - 7*24*60*60*1000);
        const fechaConfirmStr = fechaConfirmObj.getFullYear() + '-' + String(fechaConfirmObj.getMonth()+1).padStart(2,'0') + '-' + String(fechaConfirmObj.getDate()).padStart(2,'0');
        
        // Copiar unidades de AC de la cita original y recalcular depósito
        const unidadesPrev = await db.query('SELECT tipo_unidad, cantidad FROM citas_unidades WHERE cita_id=$1', [citaPrev.id]);
        let totalUnidadesProx = 0;
        unidadesPrev.rows.forEach(function(u){ totalUnidadesProx += parseInt(u.cantidad)||0; });
        const depositoProx = totalUnidadesProx > 5 ? 80.00 : 35.00;
        
        // Descripción con desglose si hay unidades
        let descProx = 'Mantenimiento recurrente (cada ' + freqValida + ' meses)';
        if (unidadesPrev.rows.length) {
          const desg = unidadesPrev.rows.map(function(u){ return u.cantidad + ' ' + u.tipo_unidad; }).join(', ');
          descProx += ' | Unidades: ' + desg;
        }
        
        const nueva = await db.query(
          `INSERT INTO citas_mantenimiento 
           (usuario_id, tipo_servicio, descripcion, fecha, slot, es_fin_semana, direccion, municipio, telefono, notas_cliente, fecha_confirmacion_requerida, status, latitud, longitud, frecuencia_meses, recurrencia_activa, cita_origen_id, requiere_reacomodo, deposito_monto)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'solicitada',$12,$13,$14,true,$15,$16,$17) RETURNING id, numero`,
          [citaPrev.usuario_id, citaPrev.tipo_servicio, descProx, proximaStr, citaPrev.slot, esFindeProx, citaPrev.direccion, citaPrev.municipio, citaPrev.telefono, citaPrev.notas_cliente, fechaConfirmStr, citaPrev.latitud, citaPrev.longitud, freqValida, citaPrev.id, requiereReacomodo, depositoProx]
        );
        
        // Copiar las unidades a la nueva cita
        for (const u of unidadesPrev.rows) {
          await db.query('INSERT INTO citas_unidades (cita_id, tipo_unidad, cantidad) VALUES ($1,$2,$3)', [nueva.rows[0].id, u.tipo_unidad, u.cantidad]);
        }
        
        await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
          [nueva.rows[0].id, 'auto_generada', 'Generada automáticamente desde CIT-' + String(citaPrev.numero).padStart(4,'0') + (requiereReacomodo ? ' (REQUIERE REACOMODO)' : ''), req.user.id]);
        
        // Email cliente
        try {
          const usr = await db.query('SELECT email, nombre FROM usuarios WHERE id=$1', [citaPrev.usuario_id]);
          if (usr.rows[0]) {
            sendEmail(usr.rows[0].email, '📅 Próximo mantenimiento programado CIT-' + String(nueva.rows[0].numero).padStart(4,'0'), emailTemplate({
              titulo: 'Tu próximo mantenimiento',
              saludo: 'Hola ' + (usr.rows[0].nombre || '') + ',',
              cuerpo: '<p style="margin:0 0 14px">Tu mantenimiento de <strong>' + citaPrev.tipo_servicio + '</strong> fue completado. Programamos automáticamente tu próxima cita para el <strong>' + proximaStr + '</strong> (cada ' + freqValida + ' meses).</p><p style="margin:0 0 14px">Puedes modificar o cancelar la recurrencia desde tu portal en cualquier momento.</p>',
              cta: { texto: 'Ver mi cita', url: 'https://portal.wifnix.com' },
              despedida: 'Equipo Wifnix'
            }));
          }
        } catch(e) {}
      } catch(e) { console.error('Auto-generar cita:', e.message); }
    }
    
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET técnicos (admin)
app.get('/api/admin/tecnicos', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico','admin_inventario'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const cols = 'id, numero_empleado, nombre, especialidades, email, telefono, activo, ultimo_login, ultima_posicion_at';
    const r = req.query.todos === '1'
      ? await db.query('SELECT ' + cols + ' FROM tecnicos ORDER BY activo DESC, nombre')
      : await db.query('SELECT ' + cols + ' FROM tecnicos WHERE activo=true ORDER BY nombre');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST crear técnico (admin) — con credenciales de login
app.post('/api/admin/tecnicos', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { numero_empleado, nombre, especialidades, password, email, telefono } = req.body;
    if (!numero_empleado || !nombre) return res.status(400).json({ error: 'Faltan datos' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      'INSERT INTO tecnicos (numero_empleado, nombre, especialidades, password_hash, email, telefono) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, numero_empleado, nombre, especialidades, email, telefono, activo',
      [numero_empleado, nombre, especialidades || [], hash, email || null, telefono || null]
    );
    res.json({ ok: true, tecnico: r.rows[0] });
  } catch(e) { 
    if (e.message.includes('unique') || e.message.includes('duplicate')) return res.status(409).json({ error: 'Ese número de empleado ya existe' });
    res.status(500).json({ error: e.message }); 
  }
});

// POST login de técnico (app de campo)
app.post('/api/tecnico/login', async (req, res) => {
  try {
    const { numero_empleado, password } = req.body;
    if (!numero_empleado || !password) return res.status(400).json({ error: 'Faltan credenciales' });
    
    const r = await db.query('SELECT * FROM tecnicos WHERE numero_empleado=$1 AND activo=true', [numero_empleado]);
    if (!r.rows.length) return res.status(401).json({ error: 'Número de empleado o contraseña incorrectos' });
    
    const tec = r.rows[0];
    if (!tec.password_hash) return res.status(401).json({ error: 'Este técnico no tiene acceso configurado. Contacta al admin.' });
    
    const ok = await bcrypt.compare(password, tec.password_hash);
    if (!ok) return res.status(401).json({ error: 'Número de empleado o contraseña incorrectos' });
    
    await db.query('UPDATE tecnicos SET ultimo_login=NOW() WHERE id=$1', [tec.id]);
    
    const token = jwt.sign({ tecnicoId: tec.id, numero: tec.numero_empleado, tipo: 'tecnico' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, tecnico: { id: tec.id, nombre: tec.nombre, numero_empleado: tec.numero_empleado, especialidades: tec.especialidades } });
  } catch(e) {
    console.error('Login técnico:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Middleware para autenticar técnicos
function tecnicoAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (decoded.tipo !== 'tecnico') return res.status(403).json({ error: 'Token no válido para técnicos' });
    req.tecnico = decoded;
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Middleware flexible: acepta token de tecnico O de usuario (para rutas compartidas como ver fotos)
function authTecnicoOUsuario(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (decoded.tipo === 'tecnico') { req.tecnico = decoded; }
    else { req.user = decoded; }
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// POST crear cita (admin para un cliente)
app.post('/api/admin/citas/crear', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const { usuario_id, tipo_servicio, descripcion, fecha, slot, tecnico_id, direccion, municipio, telefono, deposito_pagado } = req.body;
    if (!usuario_id || !tipo_servicio || !fecha || !slot) return res.status(400).json({ error: 'Faltan datos' });
    
    const d = new Date(fecha + 'T12:00:00');
    const esFinde = (d.getDay() === 0 || d.getDay() === 6);
    const fechaConfirm = new Date(d.getTime() - 7*24*60*60*1000);
    
    const r = await db.query(
      `INSERT INTO citas_mantenimiento 
       (usuario_id, tipo_servicio, descripcion, fecha, slot, es_fin_semana, tecnico_id, direccion, municipio, telefono, deposito_pagado, fecha_confirmacion_requerida, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, numero`,
      [usuario_id, tipo_servicio, descripcion || null, fecha, slot, esFinde, tecnico_id || null, direccion || null, municipio || null, telefono || null, deposito_pagado || false, fechaConfirm.toISOString().split('T')[0], 'confirmada']
    );
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
      [r.rows[0].id, 'creada_admin', 'Cita creada por admin', req.user.id]);
    
    res.json({ ok: true, id: r.rows[0].id, numero: r.rows[0].numero });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Marcar depósito de cita como pagado (después de ATH/Stripe)
app.post('/api/citas/:id/pagar-deposito', authMiddleware, async (req, res) => {
  try {
    const { pago_tipo, referencia } = req.body;
    const cita = await db.query('SELECT * FROM citas_mantenimiento WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!cita.rows.length) return res.status(404).json({ error: 'Cita no encontrada' });
    
    await db.query(
      "UPDATE citas_mantenimiento SET deposito_pagado=true, deposito_pago_tipo=$1, deposito_referencia=$2, status='confirmada', actualizado_en=NOW() WHERE id=$3",
      [pago_tipo || 'manual', referencia || null, req.params.id]
    );
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'deposito_pagado', 'Depósito pagado vía ' + (pago_tipo || 'manual') + ' - Ref: ' + (referencia || 'N/A'), req.user.id]);
    
    // Email confirmación
    try {
      const cit = cita.rows[0];
      const u = await db.query('SELECT nombre, email FROM usuarios WHERE id=$1', [req.user.id]);
      sendEmail(u.rows[0].email, '✓ Cita confirmada CIT-' + String(cit.numero).padStart(4,'0'), emailTemplate({
        titulo: 'Cita confirmada',
        saludo: 'Hola ' + (u.rows[0].nombre || '') + ',',
        cuerpo: '<p style="margin:0 0 14px">Tu depósito fue recibido y tu cita de <strong>' + cit.tipo_servicio + '</strong> está confirmada para el <strong>' + cit.fecha + ' (' + cit.slot + ')</strong>.</p><p style="margin:0 0 14px">El depósito de $35 se descontará del total del servicio. Te contactaremos un día antes para confirmar.</p>',
        cta: { texto: 'Ver mi cita', url: 'https://portal.wifnix.com' },
        despedida: 'Equipo Wifnix'
      }));
    } catch(e) {}
    
    res.json({ ok: true });
  } catch(e) {
    console.error('Pagar depósito:', e.message);
    res.status(500).json({ error: e.message });
  }
});



// Días bloqueados (admin)
app.get('/api/admin/dias-bloqueados', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico','admin_inventario'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const r = await db.query('SELECT * FROM dias_bloqueados ORDER BY fecha');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/dias-bloqueados', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { fecha, motivo } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    await db.query('INSERT INTO dias_bloqueados (fecha, motivo, creado_por) VALUES ($1,$2,$3) ON CONFLICT (fecha) DO UPDATE SET motivo=$2', [fecha, motivo || null, req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/dias-bloqueados/:fecha', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    await db.query('DELETE FROM dias_bloqueados WHERE fecha=$1', [req.params.fecha]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Notificaciones admin: citas solicitadas (nuevas)
app.get('/api/admin/citas/notificaciones', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico','admin_inventario'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const r = await db.query(
      `SELECT c.id, c.numero, c.tipo_servicio, c.fecha, c.slot, c.creado_en, u.nombre, u.apellido
       FROM citas_mantenimiento c LEFT JOIN usuarios u ON u.id=c.usuario_id
       WHERE c.status='solicitada' ORDER BY c.creado_en DESC`
    );
    res.json({ count: r.rows.length, citas: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Aprobar cita (admin) -> habilita pago del cliente
app.post('/api/admin/citas/:id/aprobar', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const cita = await db.query('SELECT c.*, u.email, u.nombre FROM citas_mantenimiento c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE c.id=$1', [req.params.id]);
    if (!cita.rows.length) return res.status(404).json({ error: 'No encontrada' });
    const cit = cita.rows[0];
    
    await db.query("UPDATE citas_mantenimiento SET status='aprobada', actualizado_en=NOW() WHERE id=$1", [req.params.id]);
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'aprobada', 'Aprobada por admin - pendiente de pago', req.user.id]);
    
    // Email al cliente
    if (cit.email) {
      try {
        sendEmail(cit.email, '✓ Tu cita CIT-' + String(cit.numero).padStart(4,'0') + ' fue aprobada', emailTemplate({
          titulo: 'Cita aprobada — paga tu depósito',
          saludo: 'Hola ' + (cit.nombre||'') + ',',
          cuerpo: '<p style="margin:0 0 14px">Tu cita de <strong>' + cit.tipo_servicio + '</strong> para el <strong>' + cit.fecha + ' (' + cit.slot + ')</strong> fue aprobada.</p><p style="margin:0 0 14px">Para confirmarla, paga el depósito de <strong>$35</strong> desde tu portal. Este monto se descuenta del total del servicio.</p>' + (cit.es_fin_semana ? '<p style="margin:0 0 14px;padding:10px;background:#FFF7ED;border-left:3px solid #FFC107;font-size:13px">Nota: tu cita es en fin de semana, lo cual tiene un cargo adicional al servicio.</p>' : ''),
          cta: { texto: 'Pagar depósito', url: 'https://portal.wifnix.com' },
          despedida: 'Equipo Wifnix'
        }));
      } catch(e) {}
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Cancelar recurrencia (cliente)
app.post('/api/citas/:id/cancelar-recurrencia', authMiddleware, async (req, res) => {
  try {
    const cita = await db.query('SELECT * FROM citas_mantenimiento WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!cita.rows.length) return res.status(404).json({ error: 'Cita no encontrada' });
    await db.query('UPDATE citas_mantenimiento SET recurrencia_activa=false, actualizado_en=NOW() WHERE id=$1', [req.params.id]);
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle, realizado_por) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'recurrencia_cancelada', 'Cliente canceló mantenimientos recurrentes', req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Actualizar técnico (activar/desactivar)
app.put('/api/admin/tecnicos/:id', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { activo, nombre, especialidades, email, telefono, password } = req.body;
    await db.query(
      'UPDATE tecnicos SET activo=COALESCE($1,activo), nombre=COALESCE($2,nombre), especialidades=COALESCE($3,especialidades), email=COALESCE($4,email), telefono=COALESCE($5,telefono) WHERE id=$6',
      [activo !== undefined ? activo : null, nombre || null, especialidades || null, email || null, telefono || null, req.params.id]
    );
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE tecnicos SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Auditoría de citas canceladas (admin)
app.get('/api/admin/citas/auditoria', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_contabilidad'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    
    const r = await db.query(`
      SELECT c.id, c.numero, c.tipo_servicio, c.fecha, c.slot, c.deposito_pagado, c.deposito_monto, c.creado_en, c.actualizado_en,
             u.nombre as cliente_nombre, u.apellido as cliente_apellido, u.email as cliente_email, u.telefono as cliente_telefono,
             (SELECT detalle FROM citas_historial WHERE cita_id=c.id AND accion='cancelada' ORDER BY creado_en DESC LIMIT 1) as motivo_cancelacion,
             (SELECT creado_en FROM citas_historial WHERE cita_id=c.id AND accion='cancelada' ORDER BY creado_en DESC LIMIT 1) as fecha_cancelacion
      FROM citas_mantenimiento c
      LEFT JOIN usuarios u ON u.id=c.usuario_id
      WHERE c.status='cancelada'
      ORDER BY c.actualizado_en DESC
    `);
    
    // Calcular si perdió depósito (cancelación <24h)
    const citas = r.rows.map(c => {
      if (c.fecha_cancelacion && c.deposito_pagado) {
        const fechaCita = new Date(c.fecha + 'T08:00:00');
        const cancelacion = new Date(c.fecha_cancelacion);
        const horas = (fechaCita - cancelacion) / (1000*60*60);
        c.deposito_perdido = horas < 24;
        c.horas_anticipacion = Math.round(horas);
      } else {
        c.deposito_perdido = false;
      }
      return c;
    });
    
    res.json(citas);
  } catch(e) {
    console.error('Auditoría citas:', e.message);
    res.status(500).json({ error: e.message });
  }
});



// Asignar múltiples técnicos a una cita (admin)
app.put('/api/admin/citas/:id/tecnicos', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin_soporte','admin_tecnico','admin_inventario'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { tecnico_ids } = req.body; // array de ids
    await db.query('DELETE FROM citas_tecnicos WHERE cita_id=$1', [req.params.id]);
    if (Array.isArray(tecnico_ids)) {
      for (const tid of tecnico_ids) {
        if (tid) await db.query('INSERT INTO citas_tecnicos (cita_id, tecnico_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, tid]);
      }
    }
    // Mantener compatibilidad: primer técnico en tecnico_id
    const primer = Array.isArray(tecnico_ids) && tecnico_ids.length ? tecnico_ids[0] : null;
    await db.query('UPDATE citas_mantenimiento SET tecnico_id=$1, actualizado_en=NOW() WHERE id=$2', [primer, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// ═══════════════════════════════════════
// APP DE TÉCNICOS — FLUJO DE TRABAJO
// ═══════════════════════════════════════

// Trabajos del técnico (hoy por defecto, o por fecha)
app.get('/api/tecnico/trabajos', tecnicoAuth, async (req, res) => {
  try {
    const fecha = req.query.fecha || fechaHoyPR();
    const r = await db.query(`
      SELECT c.id, c.numero, c.tipo_servicio, c.descripcion, c.fecha, c.slot, c.status,
             c.direccion, c.municipio, c.telefono, c.latitud, c.longitud, c.notas_cliente, c.notas_tecnico,
             c.hora_inicio_viaje, c.hora_llegada, c.hora_fin,
             u.nombre as cliente_nombre, u.apellido as cliente_apellido, u.telefono as cliente_telefono
      FROM citas_mantenimiento c
      JOIN citas_tecnicos ct ON ct.cita_id = c.id
      LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE ct.tecnico_id = $1 AND c.fecha = $2 AND c.status NOT IN ('cancelada')
      ORDER BY c.slot
    `, [req.tecnico.tecnicoId, fecha]);
    
    // Añadir unidades a cada trabajo
    for (const t of r.rows) {
      const un = await db.query('SELECT tipo_unidad, cantidad FROM citas_unidades WHERE cita_id=$1', [t.id]);
      t.unidades = un.rows;
    }
    res.json(r.rows);
  } catch(e) { console.error('Trabajos técnico:', e.message); res.status(500).json({ error: e.message }); }
});

// Resumen del técnico (contadores para el home)
// ═══ GPS: el técnico reporta su posición (mientras la app está abierta) ═══
app.post('/api/tecnico/posicion', tecnicoAuth, async (req, res) => {
  try {
    const { lat, lng, precision, velocidad } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'Faltan coordenadas' });
    const tid = req.tecnico.tecnicoId;

    // Traer última posición para detectar movimiento real (>30m)
    const prev = await db.query('SELECT ultima_lat, ultima_lng FROM tecnicos WHERE id=$1', [tid]);
    let seMovio = true;
    if (prev.rows[0] && prev.rows[0].ultima_lat != null && prev.rows[0].ultima_lng != null) {
      const dLat = (parseFloat(lat) - parseFloat(prev.rows[0].ultima_lat)) * 111320;
      const dLng = (parseFloat(lng) - parseFloat(prev.rows[0].ultima_lng)) * 111320 * Math.cos(parseFloat(lat) * Math.PI / 180);
      const dist = Math.sqrt(dLat*dLat + dLng*dLng);
      seMovio = dist > 30; // se considera movimiento si avanzó más de 30 metros
    }

    if (seMovio) {
      await db.query(
        'UPDATE tecnicos SET ultima_lat=$1, ultima_lng=$2, ultima_precision=$3, ultima_velocidad=$4, ultima_posicion_at=NOW(), ultimo_movimiento_at=NOW() WHERE id=$5',
        [lat, lng, precision || null, velocidad || null, tid]
      );
    } else {
      // Misma posición: actualizar solo el "último visto", NO el "último movimiento"
      await db.query(
        'UPDATE tecnicos SET ultima_lat=$1, ultima_lng=$2, ultima_precision=$3, ultima_velocidad=$4, ultima_posicion_at=NOW() WHERE id=$5',
        [lat, lng, precision || null, velocidad || null, tid]
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tecnico/resumen', tecnicoAuth, async (req, res) => {
  try {
    const hoy = fechaHoyPR();
    const r = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE c.fecha = $2) as hoy,
        COUNT(*) FILTER (WHERE c.fecha = $2 AND c.status = 'completada') as completados_hoy,
        COUNT(*) FILTER (WHERE c.fecha > $2) as proximos
      FROM citas_mantenimiento c
      JOIN citas_tecnicos ct ON ct.cita_id = c.id
      WHERE ct.tecnico_id = $1 AND c.status NOT IN ('cancelada')
    `, [req.tecnico.tecnicoId, hoy]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Iniciar viaje
app.post('/api/tecnico/trabajos/:id/iniciar-viaje', tecnicoAuth, async (req, res) => {
  try {
    await db.query("UPDATE citas_mantenimiento SET hora_inicio_viaje=NOW(), status='en_proceso', actualizado_en=NOW() WHERE id=$1", [req.params.id]);
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle) VALUES ($1,$2,$3)', [req.params.id, 'viaje_iniciado', 'Técnico en camino']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Marcar llegada
app.post('/api/tecnico/trabajos/:id/llegue', tecnicoAuth, async (req, res) => {
  try {
    await db.query("UPDATE citas_mantenimiento SET hora_llegada=NOW(), actualizado_en=NOW() WHERE id=$1", [req.params.id]);
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle) VALUES ($1,$2,$3)', [req.params.id, 'llegada', 'Técnico llegó al sitio']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Completar trabajo (con notas del técnico + firma)
app.post('/api/tecnico/trabajos/:id/completar', tecnicoAuth, async (req, res) => {
  try {
    const { notas_tecnico, firma_cliente } = req.body;
    await db.query(
      "UPDATE citas_mantenimiento SET hora_fin=NOW(), status='completada', notas_tecnico=$1, firma_cliente=$2, actualizado_en=NOW() WHERE id=$3",
      [notas_tecnico || null, firma_cliente || null, req.params.id]
    );
    await db.query('INSERT INTO citas_historial (cita_id, accion, detalle) VALUES ($1,$2,$3)', [req.params.id, 'completado_tecnico', 'Trabajo completado por el técnico']);
    
    // Disparar generación de cita recurrente si aplica (reusa lógica existente)
    const cita = await db.query('SELECT * FROM citas_mantenimiento WHERE id=$1', [req.params.id]);
    const cp = cita.rows[0];
    if (cp.recurrencia_activa && cp.frecuencia_meses) {
      try {
        let fechaBase = cp.fecha instanceof Date ? cp.fecha : new Date(String(cp.fecha).split('T')[0] + 'T12:00:00');
        const prox = new Date(fechaBase.getFullYear(), fechaBase.getMonth() + cp.frecuencia_meses, fechaBase.getDate(), 12, 0, 0);
        const proxStr = prox.getFullYear() + '-' + String(prox.getMonth()+1).padStart(2,'0') + '-' + String(prox.getDate()).padStart(2,'0');
        const esFindeProx = (prox.getDay() === 0 || prox.getDay() === 6);
        const fcObj = new Date(prox.getTime() - 7*24*60*60*1000);
        const fcStr = fcObj.getFullYear() + '-' + String(fcObj.getMonth()+1).padStart(2,'0') + '-' + String(fcObj.getDate()).padStart(2,'0');
        const bloq = await db.query('SELECT 1 FROM dias_bloqueados WHERE fecha=$1', [proxStr]);
        const ocup = await db.query("SELECT COUNT(*) as t FROM citas_mantenimiento WHERE fecha=$1 AND slot=$2 AND status NOT IN ('cancelada','no_show')", [proxStr, cp.slot]);
        const reacomodo = bloq.rows.length > 0 || parseInt(ocup.rows[0].t) >= 3;
        const unid = await db.query('SELECT tipo_unidad, cantidad FROM citas_unidades WHERE cita_id=$1', [cp.id]);
        let totUn = 0; unid.rows.forEach(u => totUn += parseInt(u.cantidad)||0);
        const dep = totUn > 5 ? 80.00 : 35.00;
        let desc = 'Mantenimiento recurrente (cada ' + cp.frecuencia_meses + ' meses)';
        if (unid.rows.length) desc += ' | Unidades: ' + unid.rows.map(u => u.cantidad + ' ' + u.tipo_unidad).join(', ');
        const nv = await db.query(
          `INSERT INTO citas_mantenimiento (usuario_id, tipo_servicio, descripcion, fecha, slot, es_fin_semana, direccion, municipio, telefono, notas_cliente, fecha_confirmacion_requerida, status, latitud, longitud, frecuencia_meses, recurrencia_activa, cita_origen_id, requiere_reacomodo, deposito_monto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'solicitada',$12,$13,$14,true,$15,$16,$17) RETURNING id`,
          [cp.usuario_id, cp.tipo_servicio, desc, proxStr, cp.slot, esFindeProx, cp.direccion, cp.municipio, cp.telefono, cp.notas_cliente, fcStr, cp.latitud, cp.longitud, cp.frecuencia_meses, cp.id, reacomodo, dep]
        );
        for (const u of unid.rows) await db.query('INSERT INTO citas_unidades (cita_id, tipo_unidad, cantidad) VALUES ($1,$2,$3)', [nv.rows[0].id, u.tipo_unidad, u.cantidad]);
      } catch(e) { console.error('Recurrencia desde técnico:', e.message); }
    }
    
    res.json({ ok: true });
  } catch(e) { console.error('Completar:', e.message); res.status(500).json({ error: e.message }); }
});



// Subir foto de trabajo (base64 desde la app del técnico)
app.post('/api/tecnico/trabajos/:id/foto', tecnicoAuth, async (req, res) => {
  try {
    const { tipo, imagen } = req.body; // tipo: 'antes' | 'despues', imagen: base64
    if (!imagen || !tipo) return res.status(400).json({ error: 'Faltan datos' });
    
    // Crear carpeta si no existe
    const dir = '/var/www/wifnix/uploads/citas';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    // Decodificar base64 (acepta cualquier subtipo: jpeg, png, heic, webp, etc.)
    const matches = imagen.match(/^data:image\/([\w.+-]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato de imagen inválido' });
    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext.length > 5) ext = 'jpg';
    const data = Buffer.from(matches[2], 'base64');
    
    const nombre = req.params.id + '_' + tipo + '_' + Date.now() + '.' + ext;
    fs.writeFileSync(dir + '/' + nombre, data);
    
    await db.query(
      'INSERT INTO citas_fotos (cita_id, tecnico_id, tipo, archivo) VALUES ($1,$2,$3,$4)',
      [req.params.id, req.tecnico.tecnicoId, tipo, nombre]
    );
    res.json({ ok: true, archivo: nombre });
  } catch(e) { console.error('Foto:', e.message); res.status(500).json({ error: e.message }); }
});

// Ver fotos de una cita (para técnico y para cliente vía portal)
app.get('/api/citas/:id/fotos', authTecnicoOUsuario, async (req, res) => {
  try {
    const r = await db.query("SELECT id, tipo, archivo, creado_en FROM citas_fotos WHERE cita_id=$1 ORDER BY tipo, creado_en", [req.params.id]);
    res.json(r.rows.map(f => ({ ...f, url: 'https://api.wifnix.com/uploads/citas/' + f.archivo })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// INSPECCIÓN DE VEHÍCULO (FLOTA WIFNIX)
// 2 por día: 'salida' (tomar) y 'entrega' (devolver). Fotos se borran a 10 días vía cron.
// ═══════════════════════════════════════════

// Crear inspección (devuelve id para luego subir fotos)
app.post('/api/tecnico/inspeccion', tecnicoAuth, async (req, res) => {
  try {
    const { tipo, millaje, latitud, longitud, precision_gps, notas, placa, unidad_numero } = req.body;
    if (!tipo || !['salida','entrega'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (salida/entrega)' });

    // Validación cronológica: no permitir 'entrega' sin una 'salida' previa el mismo día
    if (tipo === 'entrega') {
      const salidaHoy = await db.query(
        `SELECT id FROM inspecciones_vehiculo
         WHERE tecnico_id=$1 AND tipo='salida' AND creada::date = (NOW() AT TIME ZONE 'America/Puerto_Rico')::date
         LIMIT 1`,
        [req.tecnico.tecnicoId]
      );
      if (!salidaHoy.rows.length) {
        return res.status(400).json({ error: 'Primero debes hacer la inspección de TOMA del vehículo (mañana) antes de la entrega.' });
      }
    }

    const r = await db.query(
      `INSERT INTO inspecciones_vehiculo (tecnico_id, tipo, millaje, latitud, longitud, precision_gps, notas, placa, unidad_numero)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.tecnico.tecnicoId, tipo, millaje || null, latitud || null, longitud || null, precision_gps || null, notas || null, placa || null, unidad_numero || null]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { console.error('Inspeccion crear:', e.message); res.status(500).json({ error: e.message }); }
});

// Subir foto de inspección
// Estado de inspección del día (¿ya hizo toma/entrega hoy?)
app.get('/api/tecnico/inspeccion/estado-hoy', tecnicoAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT tipo, unidad_numero, placa FROM inspecciones_vehiculo
       WHERE tecnico_id=$1 AND creada::date = (NOW() AT TIME ZONE 'America/Puerto_Rico')::date
       ORDER BY creada ASC`,
      [req.tecnico.tecnicoId]
    );
    const tipos = r.rows.map(x => x.tipo);
    const salidaRow = r.rows.find(x => x.tipo === 'salida');
    res.json({
      ok: true,
      salida: tipos.includes('salida'),
      entrega: tipos.includes('entrega'),
      toma_unidad: salidaRow ? salidaRow.unidad_numero : null,
      toma_placa: salidaRow ? salidaRow.placa : null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tecnico/inspeccion/:id/foto', tecnicoAuth, async (req, res) => {
  try {
    const { tipo, imagen } = req.body; // tipo: 'frente'|'atras'|'izquierdo'|'derecho'|'millaje'|...
    if (!imagen || !tipo) return res.status(400).json({ error: 'Faltan datos' });

    // Validar que la inspección pertenece a este técnico
    const chk = await db.query('SELECT id FROM inspecciones_vehiculo WHERE id=$1 AND tecnico_id=$2', [req.params.id, req.tecnico.tecnicoId]);
    if (!chk.rows.length) return res.status(404).json({ error: 'Inspección no encontrada' });

    const dir = '/var/www/wifnix/uploads/inspecciones';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const matches = imagen.match(/^data:image\/([\w.+-]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato de imagen inválido' });
    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext.length > 5) ext = 'jpg';
    const data = Buffer.from(matches[2], 'base64');

    const nombre = 'insp_' + req.params.id + '_' + tipo + '_' + Date.now() + '.' + ext;
    fs.writeFileSync(dir + '/' + nombre, data);

    await db.query(
      'INSERT INTO inspeccion_fotos (inspeccion_id, tipo, url) VALUES ($1,$2,$3)',
      [req.params.id, tipo, nombre]
    );
    res.json({ ok: true, archivo: nombre });
  } catch(e) { console.error('Inspeccion foto:', e.message); res.status(500).json({ error: e.message }); }
});

// ADMIN: listar inspecciones (con fotos que aún no expiran)
// ═══ GPS: el admin ve todos los técnicos en vivo ═══
app.get('/api/admin/tecnicos-gps', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const hoy = fechaHoyPR();
    // Técnicos activos con su última posición
    const t = await db.query(`
      SELECT id, numero_empleado, nombre, telefono,
             ultima_lat, ultima_lng, ultima_precision, ultima_velocidad,
             ultima_posicion_at, ultimo_movimiento_at
      FROM tecnicos WHERE activo = true
      ORDER BY numero_empleado
    `);

    const ahora = Date.now();
    const tecnicos = [];
    for (const tec of t.rows) {
      // ¿Tiene una cita en proceso hoy? ¿Cuál es su próxima cita?
      const citas = await db.query(`
        SELECT c.tipo_servicio, c.slot, c.status, c.direccion, c.municipio, c.latitud, c.longitud
        FROM citas_mantenimiento c
        JOIN citas_tecnicos ct ON ct.cita_id = c.id
        WHERE ct.tecnico_id = $1 AND c.fecha = $2 AND c.status NOT IN ('cancelada','completada')
        ORDER BY c.slot
      `, [tec.id, hoy]);

      const enProceso = citas.rows.find(x => x.status === 'en_proceso');
      const proxima = citas.rows[0] || null;

      // Estado de conexión
      let online = false, minSinSenal = null;
      if (tec.ultima_posicion_at) {
        minSinSenal = Math.round((ahora - new Date(tec.ultima_posicion_at).getTime()) / 60000);
        online = minSinSenal < 3; // reportó hace menos de 3 min
      }

      // ¿Lleva mucho tiempo parado? (>15 min sin moverse y NO está en cita)
      let minParado = null, alertaParado = false;
      if (tec.ultimo_movimiento_at) {
        minParado = Math.round((ahora - new Date(tec.ultimo_movimiento_at).getTime()) / 60000);
        if (online && !enProceso && minParado >= 15) alertaParado = true;
      }

      let estado = 'desconectado';
      if (online && enProceso) estado = 'en_cita';
      else if (online && alertaParado) estado = 'parado';
      else if (online) estado = 'en_ruta';

      tecnicos.push({
        id: tec.id,
        numero: tec.numero_empleado,
        nombre: tec.nombre,
        telefono: tec.telefono,
        lat: tec.ultima_lat ? parseFloat(tec.ultima_lat) : null,
        lng: tec.ultima_lng ? parseFloat(tec.ultima_lng) : null,
        precision: tec.ultima_precision,
        velocidad: tec.ultima_velocidad ? parseFloat(tec.ultima_velocidad) : null,
        online, estado,
        min_sin_senal: minSinSenal,
        min_parado: minParado,
        alerta_parado: alertaParado,
        en_cita: enProceso ? { servicio: enProceso.tipo_servicio, direccion: enProceso.direccion, municipio: enProceso.municipio } : null,
        proxima_cita: proxima ? { servicio: proxima.tipo_servicio, slot: proxima.slot, direccion: proxima.direccion, municipio: proxima.municipio } : null,
        total_citas_hoy: citas.rows.length
      });
    }

    res.json({ ok: true, tecnicos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/inspecciones', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { rows } = await db.query(
      `SELECT iv.id, iv.tipo, iv.millaje, iv.latitud, iv.longitud, iv.precision_gps, iv.notas, iv.creada, iv.placa, iv.unidad_numero,
              t.nombre AS tecnico_nombre, t.numero_empleado,
              COALESCE(json_agg(json_build_object('tipo', f.tipo, 'url', 'https://api.wifnix.com/uploads/inspecciones/' || f.url) ORDER BY f.id)
                       FILTER (WHERE f.id IS NOT NULL), '[]') AS fotos
       FROM inspecciones_vehiculo iv
       JOIN tecnicos t ON t.id = iv.tecnico_id
       LEFT JOIN inspeccion_fotos f ON f.inspeccion_id = iv.id
       GROUP BY iv.id, t.nombre, t.numero_empleado
       ORDER BY iv.creada DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch(e) { console.error('Admin inspecciones:', e.message); res.status(500).json({ error: e.message }); }
});

// Cliente valora al técnico
app.post('/api/citas/:id/valorar', authMiddleware, async (req, res) => {
  try {
    const { rating, comentario } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating inválido' });
    
    const cita = await db.query('SELECT * FROM citas_mantenimiento WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!cita.rows.length) return res.status(404).json({ error: 'Cita no encontrada' });
    const c = cita.rows[0];
    if (c.status !== 'completada') return res.status(400).json({ error: 'Solo puedes valorar servicios completados' });
    
    // Buscar el técnico asignado
    const tec = await db.query('SELECT tecnico_id FROM citas_tecnicos WHERE cita_id=$1 LIMIT 1', [req.params.id]);
    if (!tec.rows.length) return res.status(400).json({ error: 'Esta cita no tiene técnico asignado' });
    
    await db.query(
      'INSERT INTO valoraciones_tecnico (cita_id, tecnico_id, usuario_id, rating, comentario) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cita_id) DO UPDATE SET rating=$4, comentario=$5',
      [req.params.id, tec.rows[0].tecnico_id, req.user.id, rating, comentario || null]
    );
    res.json({ ok: true });
  } catch(e) { console.error('Valorar:', e.message); res.status(500).json({ error: e.message }); }
});



// ═══════════════════════════════════════
// MENSAJERÍA ADMIN ↔ TÉCNICO (1-a-1)
// ═══════════════════════════════════════

// --- LADO TÉCNICO ---
// Ver su conversación con la oficina
app.get('/api/tecnico/mensajes', tecnicoAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT id, emisor, texto, leido, creado_en FROM mensajes WHERE tecnico_id=$1 ORDER BY creado_en ASC', [req.tecnico.tecnicoId]);
    // Marcar como leídos los mensajes que vienen del admin
    await db.query("UPDATE mensajes SET leido=true WHERE tecnico_id=$1 AND emisor='admin' AND leido=false", [req.tecnico.tecnicoId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Enviar mensaje a la oficina
app.post('/api/tecnico/mensajes', tecnicoAuth, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    const r = await db.query("INSERT INTO mensajes (tecnico_id, emisor, texto) VALUES ($1,'tecnico',$2) RETURNING id, emisor, texto, leido, creado_en", [req.tecnico.tecnicoId, texto.trim()]);
    res.json({ ok: true, mensaje: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Contar no leídos (mensajes del admin sin leer) — para el badge
app.get('/api/tecnico/mensajes/no-leidos', tecnicoAuth, async (req, res) => {
  try {
    const r = await db.query("SELECT COUNT(*) as n FROM mensajes WHERE tecnico_id=$1 AND emisor='admin' AND leido=false", [req.tecnico.tecnicoId]);
    res.json({ noLeidos: parseInt(r.rows[0].n) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- LADO ADMIN ---
// Lista de técnicos con su último mensaje + conteo de no leídos (del técnico)
app.get('/api/admin/mensajes/tecnicos', authMiddleware, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT t.id, t.nombre, t.numero_empleado,
        (SELECT texto FROM mensajes m WHERE m.tecnico_id=t.id ORDER BY creado_en DESC LIMIT 1) as ultimo_texto,
        (SELECT creado_en FROM mensajes m WHERE m.tecnico_id=t.id ORDER BY creado_en DESC LIMIT 1) as ultimo_fecha,
        (SELECT COUNT(*) FROM mensajes m WHERE m.tecnico_id=t.id AND m.emisor='tecnico' AND m.leido=false) as no_leidos
      FROM tecnicos t
      WHERE t.activo=true
      ORDER BY ultimo_fecha DESC NULLS LAST, t.nombre
    `);
    res.json(r.rows.map(t => ({ ...t, no_leidos: parseInt(t.no_leidos) })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ver conversación con un técnico (y marcar leídos los del técnico)
app.get('/api/admin/mensajes/:tecnicoId', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT id, emisor, texto, leido, creado_en FROM mensajes WHERE tecnico_id=$1 ORDER BY creado_en ASC', [req.params.tecnicoId]);
    await db.query("UPDATE mensajes SET leido=true WHERE tecnico_id=$1 AND emisor='tecnico' AND leido=false", [req.params.tecnicoId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin envía mensaje a un técnico
app.post('/api/admin/mensajes/:tecnicoId', authMiddleware, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    const r = await db.query("INSERT INTO mensajes (tecnico_id, emisor, texto) VALUES ($1,'admin',$2) RETURNING id, emisor, texto, leido, creado_en", [req.params.tecnicoId, texto.trim()]);
    res.json({ ok: true, mensaje: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Total de no leídos para el admin (suma de todos los técnicos) — badge global
app.get('/api/admin/mensajes-no-leidos', authMiddleware, async (req, res) => {
  try {
    const r = await db.query("SELECT COUNT(*) as n FROM mensajes WHERE emisor='tecnico' AND leido=false");
    res.json({ noLeidos: parseInt(r.rows[0].n) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Cliente ve su valoración de una cita (si existe)
app.get('/api/citas/:id/valoracion', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT rating, comentario, creado_en FROM valoraciones_tecnico WHERE cita_id=$1', [req.params.id]);
    if (!r.rows.length) return res.json(null);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
  const irAlPortal = (q) => res.redirect(oauth.PORTAL() + '/?' + new URLSearchParams(q).toString());

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

app.get('/api/google/resenas', async (req, res) => {
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


app.listen(PORT, () => {
  console.log(`\n🚀 Wifnix API corriendo en puerto ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌ No configurado'}`);
  console.log(`🤖 Claude AI: ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌ No configurado'}`);
});

module.exports = app;
