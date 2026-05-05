-- ============================================================
-- WIFNIX LLC — DATABASE SCHEMA COMPLETO
-- PostgreSQL 15+
-- ============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'public',              -- Sin login, ve catálogo sin precios
  'cliente',             -- Cliente regular, full price
  'tecnico_independiente', -- Técnico/revendedor, resell price
  'empresa_revendedora', -- Compra equipos para reventa
  'empresa_servicios',   -- Contrata servicios Wifnix, full price
  'admin_soporte',       -- Maneja garantías y soporte
  'admin_inventario',    -- Maneja stock y productos
  'admin_tecnico',       -- Maneja técnicos y órdenes de trabajo
  'admin_contabilidad',  -- Ve reportes y finanzas
  'super_admin'          -- Acceso total, asignado por dueño
);

CREATE TYPE user_status AS ENUM (
  'pendiente',           -- Registro incompleto o en revisión
  'activo',
  'suspendido',
  'bloqueado'
);

CREATE TYPE verification_status AS ENUM (
  'no_requerida',
  'pendiente',
  'aprobada',
  'rechazada'
);

CREATE TYPE order_status AS ENUM (
  'borrador',
  'pendiente_pago',
  'pagado',
  'en_proceso',
  'instalacion_programada',
  'completado',
  'cancelado',
  'reembolsado'
);

CREATE TYPE payment_method AS ENUM (
  'stripe',
  'paypal',
  'ath_movil',
  'klarna',
  'transferencia',
  'efectivo',
  'credito_interno'
);

CREATE TYPE payment_status AS ENUM (
  'pendiente',
  'procesando',
  'completado',
  'fallido',
  'reembolsado'
);

CREATE TYPE ticket_status AS ENUM (
  'abierto',
  'en_revision',
  'en_proceso',
  'resuelto',
  'cerrado'
);

CREATE TYPE ticket_priority AS ENUM (
  'baja', 'media', 'alta', 'critica'
);

CREATE TYPE chat_sender AS ENUM (
  'usuario', 'ia', 'tecnico', 'sistema'
);

-- ============================================================
-- TABLA: USUARIOS
-- ============================================================

CREATE TABLE usuarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  rol             user_role NOT NULL DEFAULT 'cliente',
  status          user_status NOT NULL DEFAULT 'activo',

  -- Perfil personal
  nombre          VARCHAR(100),
  apellido        VARCHAR(100),
  telefono        VARCHAR(20),
  foto_url        TEXT,
  bio             TEXT,

  -- Empresa (para roles empresariales)
  empresa_nombre  VARCHAR(200),
  empresa_tipo    VARCHAR(100),
  empresa_ein     VARCHAR(20),        -- EIN federal
  empresa_registro VARCHAR(50),       -- Registro de comerciante PR

  -- Verificación para revendedores/empresas
  verificacion    verification_status DEFAULT 'no_requerida',
  verificacion_doc TEXT,              -- URL del documento subido
  verificacion_notas TEXT,
  verificacion_fecha TIMESTAMPTZ,
  verificacion_admin_id UUID,

  -- Descuento personalizado (override del rol)
  descuento_personalizado DECIMAL(5,2) DEFAULT 0,

  -- Metadata
  ultimo_login    TIMESTAMPTZ,
  ip_registro     INET,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_status ON usuarios(status);

-- ============================================================
-- TABLA: PERMISOS DE ADMIN
-- ============================================================

CREATE TABLE admin_permisos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  asignado_por    UUID REFERENCES usuarios(id),

  -- Módulos con acceso
  puede_ver_ventas        BOOLEAN DEFAULT FALSE,
  puede_crear_ventas      BOOLEAN DEFAULT FALSE,
  puede_ver_clientes      BOOLEAN DEFAULT FALSE,
  puede_editar_clientes   BOOLEAN DEFAULT FALSE,
  puede_ver_productos     BOOLEAN DEFAULT FALSE,
  puede_editar_productos  BOOLEAN DEFAULT FALSE,
  puede_ver_inventario    BOOLEAN DEFAULT FALSE,
  puede_editar_inventario BOOLEAN DEFAULT FALSE,
  puede_ver_reportes      BOOLEAN DEFAULT FALSE,
  puede_ver_finanzas      BOOLEAN DEFAULT FALSE,
  puede_gestionar_garantias BOOLEAN DEFAULT FALSE,
  puede_gestionar_tecnicos BOOLEAN DEFAULT FALSE,
  puede_crear_admins      BOOLEAN DEFAULT FALSE,
  acceso_total            BOOLEAN DEFAULT FALSE,

  notas           TEXT,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(usuario_id)
);

-- ============================================================
-- TABLA: CATEGORÍAS DE PRODUCTOS
-- ============================================================

CREATE TABLE categorias (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(100) UNIQUE NOT NULL,
  nombre_es       VARCHAR(200) NOT NULL,
  nombre_en       VARCHAR(200),
  descripcion_es  TEXT,
  descripcion_en  TEXT,
  padre_id        UUID REFERENCES categorias(id),
  icono_svg       TEXT,
  orden           INTEGER DEFAULT 0,
  activo          BOOLEAN DEFAULT TRUE,
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías iniciales
INSERT INTO categorias (slug, nombre_es, nombre_en, orden) VALUES
('cctv',              'CCTV & Seguridad',         'CCTV & Security',        1),
('cctv-analogas',     'Cámaras Análogas',          'Analog Cameras',         2),
('cctv-ip',           'Cámaras IP',                'IP Cameras',             3),
('nvr',               'NVR',                        'NVR',                    4),
('dvr',               'DVR',                        'DVR',                    5),
('control-acceso',    'Control de Acceso',          'Access Control',         6),
('cctv-accesorios',   'Accesorios CCTV',            'CCTV Accessories',       7),
('network',           'Network & Redes',            'Network',                8),
('routers',           'Routers',                    'Routers',                9),
('switches',          'Switches / PoE',             'Switches / PoE',         10),
('wifi',              'Puntos de Acceso WiFi',      'WiFi Access Points',     11),
('cableado',          'Cableado Estructurado',      'Structured Cabling',     12),
('backup',            'Backup & Energía',           'Backup & Power',         13),
('ups',               'UPS',                        'UPS',                    14),
('generadores',       'Generadores',                'Generators',             15),
('hvac',              'HVAC',                       'HVAC',                   16),
('splits',            'Mini-Splits',                'Mini-Splits',            17),
('accesorios',        'Accesorios Generales',       'General Accessories',    18);

-- ============================================================
-- TABLA: PRODUCTOS
-- ============================================================

CREATE TABLE productos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku               VARCHAR(50) UNIQUE NOT NULL,
  categoria_id      UUID REFERENCES categorias(id),

  -- Nombres y descripción
  nombre_es         VARCHAR(300) NOT NULL,
  nombre_en         VARCHAR(300),
  descripcion_es    TEXT,
  descripcion_en    TEXT,
  specs             JSONB,              -- Especificaciones técnicas
  marca             VARCHAR(100),
  modelo            VARCHAR(100),

  -- Precios por nivel de usuario
  precio_publico    DECIMAL(10,2),      -- Precio sin login (null = oculto)
  precio_cliente    DECIMAL(10,2),      -- Cliente regular
  precio_revendedor DECIMAL(10,2),      -- Técnico independiente / revendedor
  precio_empresa    DECIMAL(10,2),      -- Empresa que contrata servicios

  -- Inventario
  stock             INTEGER DEFAULT 0,
  stock_minimo      INTEGER DEFAULT 5,
  stock_maximo      INTEGER DEFAULT 100,
  ubicacion         VARCHAR(100),       -- Almacén, estante, etc.

  -- Imágenes
  imagen_principal  TEXT,
  imagenes          TEXT[],             -- Array de URLs

  -- Metadata
  activo            BOOLEAN DEFAULT TRUE,
  destacado         BOOLEAN DEFAULT FALSE,
  creado_por        UUID REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(activo);
CREATE INDEX idx_productos_stock ON productos(stock);

-- ============================================================
-- TABLA: SERVICIOS
-- ============================================================

CREATE TABLE servicios (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              VARCHAR(100) UNIQUE NOT NULL,
  categoria         VARCHAR(100),

  nombre_es         VARCHAR(300) NOT NULL,
  nombre_en         VARCHAR(300),
  descripcion_es    TEXT,
  descripcion_en    TEXT,
  incluye_es        TEXT[],
  incluye_en        TEXT[],

  -- Precios (null = cotización, string para rangos)
  precio_base       DECIMAL(10,2),
  precio_cliente    DECIMAL(10,2),
  precio_empresa    DECIMAL(10,2),
  precio_descripcion VARCHAR(50),       -- Ej: "desde", "por hora", "+"

  duracion_estimada VARCHAR(100),
  requiere_visita   BOOLEAN DEFAULT TRUE,
  activo            BOOLEAN DEFAULT TRUE,

  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: ORDENES / PEDIDOS
-- ============================================================

CREATE TABLE ordenes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero            SERIAL,             -- #1001, #1002...
  usuario_id        UUID REFERENCES usuarios(id),

  status            order_status DEFAULT 'borrador',
  tipo              VARCHAR(50),        -- 'producto', 'servicio', 'mixto', 'plan'

  -- Items en formato JSON para flexibilidad
  items             JSONB NOT NULL DEFAULT '[]',
  notas_cliente     TEXT,
  notas_internas    TEXT,

  -- Totales
  subtotal          DECIMAL(10,2) DEFAULT 0,
  descuento_monto   DECIMAL(10,2) DEFAULT 0,
  descuento_codigo  VARCHAR(50),
  impuesto          DECIMAL(10,2) DEFAULT 0,
  total             DECIMAL(10,2) DEFAULT 0,

  -- Asignación interna
  tecnico_asignado  UUID REFERENCES usuarios(id),
  admin_asignado    UUID REFERENCES usuarios(id),
  fecha_programada  TIMESTAMPTZ,

  -- Dirección del servicio
  direccion         TEXT,
  municipio         VARCHAR(100),

  -- Timestamps
  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW(),
  completado_en     TIMESTAMPTZ
);

CREATE INDEX idx_ordenes_usuario ON ordenes(usuario_id);
CREATE INDEX idx_ordenes_status ON ordenes(status);
CREATE INDEX idx_ordenes_tecnico ON ordenes(tecnico_asignado);

-- ============================================================
-- TABLA: PAGOS
-- ============================================================

CREATE TABLE pagos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id          UUID REFERENCES ordenes(id),
  usuario_id        UUID REFERENCES usuarios(id),

  metodo            payment_method NOT NULL,
  status            payment_status DEFAULT 'pendiente',

  monto             DECIMAL(10,2) NOT NULL,
  moneda            CHAR(3) DEFAULT 'USD',

  -- Referencias externas de cada gateway
  stripe_payment_id       VARCHAR(200),
  stripe_client_secret    TEXT,
  paypal_order_id         VARCHAR(200),
  paypal_capture_id       VARCHAR(200),
  ath_movil_reference     VARCHAR(200),
  klarna_order_id         VARCHAR(200),

  -- Metadata del pago
  metadata          JSONB,
  error_mensaje     TEXT,

  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW(),
  completado_en     TIMESTAMPTZ
);

CREATE INDEX idx_pagos_orden ON pagos(orden_id);
CREATE INDEX idx_pagos_status ON pagos(status);

-- ============================================================
-- TABLA: GARANTÍAS
-- ============================================================

CREATE TABLE garantias (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID REFERENCES usuarios(id),
  orden_id          UUID REFERENCES ordenes(id),

  -- Producto/servicio
  producto_nombre   VARCHAR(300),
  producto_serial   VARCHAR(100),
  numero_factura    VARCHAR(100),
  fecha_instalacion DATE,
  fecha_vencimiento DATE,

  -- Reclamación
  descripcion       TEXT NOT NULL,
  evidencia_urls    TEXT[],
  status            ticket_status DEFAULT 'abierto',
  prioridad         ticket_priority DEFAULT 'media',

  -- Asignación
  asignado_a        UUID REFERENCES usuarios(id),
  notas_tecnico     TEXT,
  resolucion        TEXT,

  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW(),
  resuelto_en       TIMESTAMPTZ
);

-- ============================================================
-- TABLA: TICKETS DE SOPORTE
-- ============================================================

CREATE TABLE tickets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero            SERIAL,
  usuario_id        UUID REFERENCES usuarios(id),

  asunto            VARCHAR(500) NOT NULL,
  descripcion       TEXT,
  categoria         VARCHAR(100),       -- 'tecnico', 'facturacion', 'garantia', 'otro'
  status            ticket_status DEFAULT 'abierto',
  prioridad         ticket_priority DEFAULT 'media',

  asignado_a        UUID REFERENCES usuarios(id),
  resolucion        TEXT,

  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW(),
  resuelto_en       TIMESTAMPTZ
);

-- ============================================================
-- TABLA: MENSAJES DE TICKETS
-- ============================================================

CREATE TABLE ticket_mensajes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id         UUID REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id        UUID REFERENCES usuarios(id),
  mensaje           TEXT NOT NULL,
  adjuntos          TEXT[],
  es_interno        BOOLEAN DEFAULT FALSE,  -- Notas internas del admin
  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: CHAT SESIONES (IA + Técnico)
-- ============================================================

CREATE TABLE chat_sesiones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID REFERENCES usuarios(id),
  session_token     VARCHAR(100) UNIQUE,  -- Para usuarios sin login

  status            VARCHAR(50) DEFAULT 'activa',  -- activa, con_tecnico, cerrada
  tecnico_id        UUID REFERENCES usuarios(id),

  -- Metadata
  pagina_origen     TEXT,
  resumen_ia        TEXT,               -- Resumen del problema generado por IA
  ticket_generado   UUID REFERENCES tickets(id),

  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW(),
  cerrado_en        TIMESTAMPTZ
);

-- ============================================================
-- TABLA: MENSAJES DE CHAT
-- ============================================================

CREATE TABLE chat_mensajes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sesion_id         UUID REFERENCES chat_sesiones(id) ON DELETE CASCADE,
  remitente         chat_sender NOT NULL,
  usuario_id        UUID REFERENCES usuarios(id),  -- null si es IA o sistema

  mensaje           TEXT NOT NULL,
  metadata          JSONB,             -- Acciones sugeridas, botones, etc.

  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_sesion ON chat_mensajes(sesion_id);

-- ============================================================
-- TABLA: CÓDIGOS DE DESCUENTO
-- ============================================================

CREATE TABLE codigos_descuento (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo            VARCHAR(50) UNIQUE NOT NULL,
  descripcion       TEXT,

  tipo              VARCHAR(20) DEFAULT 'porcentaje',  -- porcentaje, fijo
  valor             DECIMAL(10,2) NOT NULL,

  -- Restricciones
  usos_maximos      INTEGER,           -- NULL = ilimitado
  usos_actuales     INTEGER DEFAULT 0,
  valido_desde      TIMESTAMPTZ DEFAULT NOW(),
  valido_hasta      TIMESTAMPTZ,

  -- Aplica a
  roles_aplicables  user_role[],       -- NULL = todos
  solo_primer_orden BOOLEAN DEFAULT FALSE,

  activo            BOOLEAN DEFAULT TRUE,
  creado_por        UUID REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: INVENTARIO — MOVIMIENTOS
-- ============================================================

CREATE TABLE inventario_movimientos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id       UUID REFERENCES productos(id),
  usuario_id        UUID REFERENCES usuarios(id),  -- Quien hizo el movimiento

  tipo              VARCHAR(50),   -- 'entrada', 'salida', 'ajuste', 'venta', 'devolucion'
  cantidad          INTEGER NOT NULL,
  stock_anterior    INTEGER,
  stock_nuevo       INTEGER,
  motivo            TEXT,
  orden_id          UUID REFERENCES ordenes(id),

  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: CLIENTES DESTACADOS (logos en web)
-- ============================================================

CREATE TABLE clientes_destacados (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(200) NOT NULL,
  logo_url          TEXT,
  website           TEXT,
  industria         VARCHAR(100),
  activo            BOOLEAN DEFAULT TRUE,
  orden             INTEGER DEFAULT 0,
  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- Logos actuales de Wifnix
INSERT INTO clientes_destacados (nombre, industria, orden) VALUES
('Transdev', 'Transporte', 1),
('Facciola', 'Panadería', 2),
('Don Ruiz Coffee', 'Café', 3),
('Paseos', 'Bienes Raíces', 4),
('Carrier', 'HVAC', 5),
('La Península', 'Panadería', 6),
('Manuel Gas', 'Energía', 7);

-- ============================================================
-- TABLA: CONFIGURACIÓN DEL SISTEMA
-- ============================================================

CREATE TABLE configuracion (
  clave             VARCHAR(100) PRIMARY KEY,
  valor             TEXT,
  descripcion       TEXT,
  actualizado_en    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
('empresa_nombre',      'Wifnix LLC',                    'Nombre de la empresa'),
('empresa_slogan',      'Tú tienes tecnología, nosotros soluciones.', 'Slogan oficial'),
('empresa_email',       'sales@wifnix.com',              'Email principal'),
('empresa_tel1',        '(787) 354-9596',                'Teléfono 1'),
('empresa_tel2',        '(787) 565-0031',                'Teléfono 2'),
('empresa_whatsapp',    '17873549596',                   'WhatsApp (formato internacional)'),
('impuesto_pr',         '10.5',                          'IVU Puerto Rico (%)'),
('descuento_cliente',   '0',                             'Descuento clientes regulares (%)'),
('descuento_revendedor','20',                            'Descuento revendedores/técnicos (%)'),
('descuento_empresa',   '0',                             'Descuento empresas de servicios (%)'),
('stripe_activo',       'false',                         'Stripe habilitado'),
('paypal_activo',       'false',                         'PayPal habilitado'),
('ath_movil_activo',    'false',                         'ATH Móvil habilitado'),
('klarna_activo',       'false',                         'Klarna habilitado'),
('chat_ia_activo',      'true',                          'Chat IA habilitado'),
('registro_abierto',    'true',                          'Permitir nuevos registros'),
('mantenimiento',       'false',                         'Modo mantenimiento');

-- ============================================================
-- TABLA: SESIONES / TOKENS
-- ============================================================

CREATE TABLE sesiones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  token             TEXT UNIQUE NOT NULL,
  refresh_token     TEXT UNIQUE,
  ip                INET,
  user_agent        TEXT,
  activa            BOOLEAN DEFAULT TRUE,
  expira_en         TIMESTAMPTZ NOT NULL,
  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sesiones_token ON sesiones(token);
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);

-- ============================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_updated
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_productos_updated
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ordenes_updated
  BEFORE UPDATE ON ordenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_servicios_updated
  BEFORE UPDATE ON servicios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- USUARIO ADMIN INICIAL (cambiar contraseña inmediatamente)
-- ============================================================

INSERT INTO usuarios (
  email, password_hash, rol, status,
  nombre, apellido
) VALUES (
  'admin@wifnix.com',
  crypt('WifnixAdmin2025!', gen_salt('bf')),
  'super_admin',
  'activo',
  'Wifnix',
  'Admin'
);

-- Dar permisos totales al admin inicial
INSERT INTO admin_permisos (
  usuario_id, asignado_por,
  puede_ver_ventas, puede_crear_ventas,
  puede_ver_clientes, puede_editar_clientes,
  puede_ver_productos, puede_editar_productos,
  puede_ver_inventario, puede_editar_inventario,
  puede_ver_reportes, puede_ver_finanzas,
  puede_gestionar_garantias, puede_gestionar_tecnicos,
  puede_crear_admins, acceso_total
) VALUES (
  (SELECT id FROM usuarios WHERE email = 'admin@wifnix.com'),
  (SELECT id FROM usuarios WHERE email = 'admin@wifnix.com'),
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE
);

-- ============================================================
-- VISTAS ÚTILES
-- ============================================================

-- Vista: resumen de usuarios por rol
CREATE VIEW v_usuarios_resumen AS
SELECT
  rol,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'activo') as activos,
  COUNT(*) FILTER (WHERE verificacion = 'pendiente') as pendientes_verificacion
FROM usuarios
GROUP BY rol;

-- Vista: ventas del mes
CREATE VIEW v_ventas_mes AS
SELECT
  DATE_TRUNC('month', p.creado_en) as mes,
  COUNT(DISTINCT o.id) as total_ordenes,
  SUM(p.monto) FILTER (WHERE p.status = 'completado') as ingresos,
  COUNT(*) FILTER (WHERE p.metodo = 'stripe') as stripe,
  COUNT(*) FILTER (WHERE p.metodo = 'paypal') as paypal,
  COUNT(*) FILTER (WHERE p.metodo = 'ath_movil') as ath_movil,
  COUNT(*) FILTER (WHERE p.metodo = 'klarna') as klarna
FROM pagos p
JOIN ordenes o ON o.id = p.orden_id
GROUP BY DATE_TRUNC('month', p.creado_en)
ORDER BY mes DESC;

-- Vista: inventario con alertas
CREATE VIEW v_inventario_alertas AS
SELECT
  p.id, p.sku, p.nombre_es, p.stock,
  p.stock_minimo,
  CASE
    WHEN p.stock = 0 THEN 'sin_stock'
    WHEN p.stock <= p.stock_minimo THEN 'stock_bajo'
    ELSE 'ok'
  END as alerta
FROM productos p
WHERE p.activo = TRUE
ORDER BY p.stock ASC;
