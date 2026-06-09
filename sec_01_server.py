#!/usr/bin/env python3
# ============================================================
# WIFNIX — PARCHE DE SEGURIDAD 1/2  (backend server.js)
# Cubre: JWT fail-closed, escalada de privilegios en cambio de rol,
#        abuso del chat (rate-limit + historial desde BD),
#        subida de fotos (bytes magicos), CORS, limite JSON,
#        checkPermiso (lista blanca), requireRoles muerto, fuga en webhook.
#
# Metodo: idempotente. Si un bloque ya fue parcheado, su 'old' ya no existe
#         y se reporta como "ya aplicado / no encontrado" sin romper nada.
#
# ⚠️ ANTES DE CORRER: asegurate de tener JWT_SECRET (>=32 chars) en el .env,
#    o el API NO arrancara (eso es intencional: fail-closed).
# ============================================================
import sys

RUTA = "/var/www/wifnix/backend/server.js"

EDITS = [

# ---------- 1) CRITICO: JWT_SECRET sin fallback (fail-closed) ----------
("JWT_SECRET fail-closed",
"""const JWT_SECRET = process.env.JWT_SECRET || 'wifnix_jwt_secret_change_in_production';
const JWT_EXPIRES = '7d';""",
"""const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET no configurado o demasiado corto (minimo 32 caracteres). Define JWT_SECRET en el archivo .env antes de iniciar.');
  process.exit(1);
}
const JWT_EXPIRES = process.env.JWT_EXPIRES || '2d';"""),

# ---------- 2) CORS: subdominios + localhost solo fuera de produccion ----------
("CORS subdominios",
"""app.use(cors({
  origin: [
    'https://wifnix.com',
    'https://www.wifnix.com',
    'http://localhost:3000',
    'http://localhost:8080',
  ],
  credentials: true,
}));""",
"""const ORIGINS = [
  'https://wifnix.com',
  'https://www.wifnix.com',
  'https://app.wifnix.com',
  'https://tecnicos.wifnix.com',
  'https://admin.wifnix.com',
];
if (process.env.NODE_ENV !== 'production') {
  ORIGINS.push('http://localhost:3000', 'http://localhost:8080');
}
app.use(cors({
  origin: ORIGINS,
  credentials: true,
}));"""),

# ---------- 3) Rate-limit dedicado para el chat (anti abuso de creditos) ----------
("Rate-limit chat",
"""const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api', limiter);
app.use('/api/auth', authLimiter);""",
"""const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const chatLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados mensajes, intenta mas tarde' } });
app.use('/api', limiter);
app.use('/api/auth', authLimiter);
app.use('/api/chat', chatLimiter);"""),

# ---------- 4) Limite del body JSON (anti DoS por payload) ----------
("Limite JSON 2mb",
"app.use(express.json({ limit: '10mb' }));",
"app.use(express.json({ limit: '2mb' }));"),

# ---------- 5) Eliminar requireRoles (codigo muerto con logica laxa) ----------
("Eliminar requireRoles",
"""function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const adminRoles = ['super_admin','admin_soporte','admin_inventario','admin_tecnico','admin_contabilidad'];
    const isAdmin = adminRoles.includes(req.user.rol);
    if (!roles.includes(req.user.rol) && !isAdmin) {
      return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    }
    next();
  };
}""",
"// requireRoles eliminado: era codigo muerto con logica laxa (cualquier admin pasaba). La autorizacion real usa checkPermiso()."),

# ---------- 6) checkPermiso: lista blanca de columnas (cierra SQLi latente) ----------
("checkPermiso lista blanca",
"""async function checkPermiso(userId, permiso) {
  const { rows } = await db.query(
    `SELECT ${permiso}, acceso_total FROM admin_permisos WHERE usuario_id = $1`,
    [userId]
  );
  if (!rows.length) return false;
  return rows[0].acceso_total || rows[0][permiso];
}""",
"""const PERMISOS_VALIDOS = new Set(['puede_ver_ventas','puede_crear_ventas','puede_ver_clientes','puede_editar_clientes','puede_ver_productos','puede_editar_productos','puede_ver_inventario','puede_editar_inventario','puede_ver_reportes','puede_ver_finanzas','puede_gestionar_garantias','puede_gestionar_tecnicos','puede_crear_admins']);
async function checkPermiso(userId, permiso) {
  if (!PERMISOS_VALIDOS.has(permiso)) return false;
  const { rows } = await db.query(
    `SELECT ${permiso}, acceso_total FROM admin_permisos WHERE usuario_id = $1`,
    [userId]
  );
  if (!rows.length) return false;
  return rows[0].acceso_total || rows[0][permiso];
}"""),

# ---------- 7) ALTO: anti escalada de privilegios en cambio de rol ----------
("Anti escalada de rol",
"""  const { rol, permisos } = req.body;
  const { id } = req.params;

  await db.query('UPDATE usuarios SET rol=$1 WHERE id=$2', [rol, id]);""",
"""  const { rol, permisos } = req.body;
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

  await db.query('UPDATE usuarios SET rol=$1 WHERE id=$2', [rol, id]);"""),

# ---------- 8) Subida de imagen: allowlist estricto en el filtro ----------
("Multer allowlist",
"""const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes permitidas'));
  },
});""",
"""const TIPOS_IMG = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (TIPOS_IMG.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imagenes JPG, PNG o WEBP'));
  },
});"""),

# ---------- 9) Subida de imagen: validar por BYTES MAGICOS (no confiar en cliente) ----------
("Foto bytes magicos",
"""    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

    // En producción: subir a Cloudinary o S3
    // Por ahora guardamos como base64 (temporal)
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;""",
"""    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });

    // Validar por bytes magicos: NO confiar en el mimetype enviado por el cliente
    const b = req.file.buffer;
    let mime = null;
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) mime = 'image/jpeg';
    else if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) mime = 'image/png';
    else if (b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
    if (!mime) return res.status(400).json({ error: 'El archivo no es una imagen valida (JPG, PNG o WEBP)' });

    const base64 = b.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;"""),

# ---------- 10) ALTO: chat usa historial desde la BD, no del cliente ----------
("Chat historial desde BD",
"""    // Preparar historial para Claude
    const messages = [
      ...historial.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: mensaje },
    ];""",
"""    // Historial reconstruido desde la base de datos (no se confia en el cliente)
    const { rows: hist } = await db.query(
      `SELECT remitente, mensaje FROM chat_mensajes WHERE sesion_id=$1 ORDER BY creado_en DESC LIMIT 20`,
      [sesion_id]
    );
    let messages = hist.reverse().map(h => ({
      role: h.remitente === 'ia' ? 'assistant' : 'user',
      content: h.mensaje,
    }));
    while (messages.length && messages[0].role === 'assistant') messages.shift();"""),

# ---------- 11) Webhook: no filtrar detalle del error ----------
("Webhook sin fuga",
"      return res.status(400).send(`Webhook Error: ${err.message}`);",
"      return res.status(400).send('Webhook signature verification failed');"),

]

try:
    s = open(RUTA, encoding="utf-8").read()
except FileNotFoundError:
    print("ERROR: no existe", RUTA); sys.exit(1)

original = s
ok = 0
miss = 0
for label, old, new in EDITS:
    if old in s:
        s = s.replace(old, new, 1)
        print("OK      ->", label)
        ok += 1
    else:
        print("NO/YA   ->", label, "(no encontrado; quiza ya aplicado o el texto difiere)")
        miss += 1

if s != original:
    open(RUTA, "w", encoding="utf-8").write(s)
    print("------------------------------------------------------------")
    print("Archivo actualizado:", RUTA)
else:
    print("------------------------------------------------------------")
    print("Sin cambios (nada que aplicar).")

print("Aplicados:", ok, "| No encontrados:", miss)
print("AHORA VALIDA:  node --check", RUTA)
print("LUEGO:         pm2 restart wifnix-api")
print("RECORDATORIO:  JWT_SECRET (>=32) y NODE_ENV=production deben estar en el .env")
