-- ══════════════════════════════════════════════════════════════
-- WIFNIX AI STUDIO — créditos prepagados + generación con Higgsfield
--
-- Correr una sola vez en el VPS:
--   psql -U postgres -d wifnix -f migracion-ai-studio.sql
--
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Todo el dinero va en CENTAVOS enteros (BIGINT). Nunca floats:
-- 0.1 + 0.2 no da 0.3 en coma flotante, y en una billetera eso es
-- dinero que aparece o desaparece.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- Una billetera por usuario. El CHECK es la última línea de defensa:
-- aunque el código tuviera un error, Postgres no deja que el saldo
-- baje de cero.
CREATE TABLE IF NOT EXISTS ai_billeteras (
  usuario_id          UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  saldo_centavos      BIGINT NOT NULL DEFAULT 0 CHECK (saldo_centavos >= 0),
  congelada           BOOLEAN NOT NULL DEFAULT false,
  motivo_congelada    TEXT,
  acepto_terminos_en  TIMESTAMPTZ,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Modelos que el cliente puede usar. Solo lo que esté aquí con
-- activo=true se puede pedir: el cliente nunca manda una ruta libre.
CREATE TABLE IF NOT EXISTS ai_modelos (
  clave            TEXT PRIMARY KEY,
  proveedor        TEXT NOT NULL CHECK (proveedor IN ('google','minimax','higgsfield')),
  ruta             TEXT NOT NULL,          -- id o ruta del modelo en la API del proveedor
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  tipo             TEXT NOT NULL CHECK (tipo IN ('imagen','video')),
  -- Qué archivos acepta: {"imagenes":[mínimo,máximo], "video": true|false}
  entradas         JSONB NOT NULL DEFAULT '{"imagenes":[0,0]}'::jsonb,
  prompt_requerido BOOLEAN NOT NULL DEFAULT true,
  -- Parámetros permitidos y sus valores válidos. Lo que no esté aquí
  -- no se reenvía al proveedor. El primero de cada lista es el de defecto.
  parametros       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Reglas del proveedor, ej. 1080p solo en 8 s: [{"cuando":{...},"fijar":{...}}]
  reglas           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Tarifa oficial en USD para proveedores sin /estimate (Google, MiniMax).
  -- Si una combinación no está aquí, no se genera.
  tarifa           JSONB,
  tarifa_fuente    TEXT,                   -- de dónde salió y cuándo se verificó
  opciones         JSONB,                  -- campos extra fijos para el proveedor
  -- Si es NULL se usa AI_MULTIPLICADOR del .env
  multiplicador    NUMERIC(5,2) CHECK (multiplicador IS NULL OR multiplicador >= 1.10),
  activo           BOOLEAN NOT NULL DEFAULT true,
  orden            INT NOT NULL DEFAULT 100,
  CONSTRAINT ai_modelo_con_precio CHECK (proveedor = 'higgsfield' OR tarifa IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS ai_generaciones (
  -- Este id es también el Idempotency-Key que se manda a Higgsfield.
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modelo_clave     TEXT NOT NULL REFERENCES ai_modelos(clave),
  entrada          JSONB NOT NULL,
  costo_usd        NUMERIC(12,6) NOT NULL,   -- lo que cobra el proveedor
  precio_centavos  BIGINT NOT NULL CHECK (precio_centavos > 0),  -- lo que paga el cliente
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','en_cola','en_proceso','completado','fallido','nsfw','cancelado','revision')),
  -- 'revision': no se sabe si el proveedor la aceptó (y cobró). Nunca se
  -- reembolsa sola: la resuelve Jesús desde el admin.
  proveedor_id     TEXT,      -- id del trabajo en el proveedor
  intentos_envio   INT NOT NULL DEFAULT 0,
  -- Hubo un envío sin respuesta clara: el proveedor pudo haberla aceptado.
  envio_ambiguo    BOOLEAN NOT NULL DEFAULT false,
  -- Reserva del envío: evita que dos procesos la manden a la vez.
  enviando_hasta   TIMESTAMPTZ,
  copias_intentos  INT NOT NULL DEFAULT 0,
  error            TEXT,
  salida           JSONB,     -- lo que devuelve el proveedor (sus enlaces vencen)
  archivos         JSONB,     -- copias guardadas en el VPS
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminado_en     TIMESTAMPTZ,
  -- Garantía de "ganancias y no pérdidas" a nivel de base de datos:
  -- no se puede guardar una generación que se venda bajo costo.
  CONSTRAINT ai_gen_nunca_bajo_costo CHECK (precio_centavos >= CEIL(costo_usd * 100))
);
CREATE INDEX IF NOT EXISTS ai_gen_proveedor_idx ON ai_generaciones (proveedor_id) WHERE proveedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_gen_usuario_idx ON ai_generaciones (usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ai_gen_abiertas_idx ON ai_generaciones (estado)
  WHERE estado IN ('pendiente','en_cola','en_proceso');

-- Libro mayor: cada centavo que entra o sale queda aquí, firmado
-- (+ entra, - sale). saldo_despues permite auditar la billetera
-- movimiento por movimiento.
CREATE TABLE IF NOT EXISTS ai_movimientos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('recarga','cargo','reembolso','contracargo','ajuste')),
  monto_centavos   BIGINT NOT NULL,
  saldo_despues    BIGINT NOT NULL,
  generacion_id    UUID REFERENCES ai_generaciones(id),
  stripe_ref       TEXT,
  nota             TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_mov_usuario_idx ON ai_movimientos (usuario_id, creado_en DESC);
-- Stripe reintenta webhooks: la misma sesión pagada solo acredita una vez.
CREATE UNIQUE INDEX IF NOT EXISTS ai_mov_stripe_unico ON ai_movimientos (tipo, stripe_ref)
  WHERE stripe_ref IS NOT NULL;
-- Una generación se cobra una vez y se reembolsa una vez, como máximo.
CREATE UNIQUE INDEX IF NOT EXISTS ai_mov_gen_unico ON ai_movimientos (generacion_id, tipo)
  WHERE generacion_id IS NOT NULL;

-- ── Modelos iniciales ────────────────────────────────────────
-- Precios oficiales en USD, verificados el 8 de octubre de 2026.
-- Si un proveedor cambia su precio, cambia "tarifa" aquí y vuelve a correr
-- este archivo (actualiza tarifas y parámetros sin tocar activo, orden ni
-- multiplicador), o haz UPDATE directo. Revísalos una vez al mes.
INSERT INTO ai_modelos (clave, proveedor, ruta, nombre, descripcion, tipo, entradas, prompt_requerido, parametros, reglas, tarifa, tarifa_fuente, opciones, orden) VALUES

-- GOOGLE · imágenes (ai.google.dev/gemini-api/docs/pricing)
 ('nano-banana', 'google', 'gemini-nano-banana-2.1', 'Imagen · Nano Banana',
  'Fotos realistas de personaje, producto o escena. Puedes darle fotos de referencia.',
  'imagen', '{"imagenes":[0,4]}', true,
  '{"aspect_ratio":["9:16","4:5","1:1","16:9","3:4","4:3"],"image_size":["1K","2K","4K"]}', '[]',
  '{"claves":["image_size"],"precios":{"1K":"0.0336","2K":"0.0504","4K":"0.113"},"extra":"0.01"}',
  'Google Gemini API pricing, gemini-nano-banana-2.1, 2026-10-08. extra = colchón por tokens de razonamiento',
  '{"generation_config":{"thinking_level":"minimal"}}', 10),
 ('nano-banana-pro', 'google', 'gemini-3-pro-image', 'Imagen · Nano Banana Pro',
  'La de más calidad: textos dentro de la imagen, escenas complejas, varias referencias.',
  'imagen', '{"imagenes":[0,6]}', true,
  '{"aspect_ratio":["9:16","4:5","1:1","16:9","3:4","4:3"],"image_size":["1K","2K","4K"]}', '[]',
  '{"claves":["image_size"],"precios":{"1K":"0.134","2K":"0.134","4K":"0.24"},"extra":"0.03"}',
  'Google Gemini API pricing, gemini-3-pro-image, 2026-10-08. extra = colchón por tokens de razonamiento', NULL, 20),

-- GOOGLE · video Veo 3.1 (modelos "preview": Google puede retirarlos desde el 22-oct-2026)
 ('veo-fast', 'google', 'veo-3.1-fast-generate-preview', 'Video · Veo 3.1 Fast',
  'Video con audio y voces. Desde texto o animando una foto.',
  'video', '{"imagenes":[0,1]}', true,
  '{"aspectRatio":["9:16","16:9"],"resolution":["720p","1080p"],"durationSeconds":["8","6","4"]}',
  '[{"cuando":{"resolution":"1080p"},"fijar":{"durationSeconds":"8"}}]',
  '{"claves":["resolution"],"precios":{"720p":"0.10","1080p":"0.12"},"por_segundo":"durationSeconds"}',
  'Google Gemini API pricing (Veo 3.1 Fast), 2026-09', NULL, 30),
 ('veo-lite', 'google', 'veo-3.1-lite-generate-preview', 'Video · Veo 3.1 Lite',
  'La versión más económica de Veo, con audio.',
  'video', '{"imagenes":[0,1]}', true,
  '{"aspectRatio":["9:16","16:9"],"resolution":["720p","1080p"],"durationSeconds":["8","6","4"]}',
  '[{"cuando":{"resolution":"1080p"},"fijar":{"durationSeconds":"8"}}]',
  '{"claves":["resolution"],"precios":{"720p":"0.05","1080p":"0.08"},"por_segundo":"durationSeconds"}',
  'Google Gemini API pricing (Veo 3.1 Lite), 2026-09', NULL, 40),

-- MINIMAX · video Hailuo e imagen (platform.minimax.io/docs/guides/pricing-paygo)
 ('hailuo', 'minimax', 'MiniMax-Hailuo-2.3', 'Video · Hailuo 2.3',
  'Movimiento natural y expresiones realistas. Desde texto o animando una foto.',
  'video', '{"imagenes":[0,1]}', true,
  '{"resolution":["768P","1080P"],"duration":[6,10]}',
  '[{"cuando":{"resolution":"1080P"},"fijar":{"duration":6}}]',
  '{"claves":["resolution","duration"],"precios":{"768P|6":"0.28","768P|10":"0.56","1080P|6":"0.49"}}',
  'MiniMax pay-as-you-go pricing, 2026-10-08', NULL, 50),
 ('hailuo-fast', 'minimax', 'MiniMax-Hailuo-2.3-Fast', 'Video · Hailuo 2.3 Fast',
  'El video más económico. Anima una foto.',
  'video', '{"imagenes":[1,1]}', true,
  '{"resolution":["768P","1080P"],"duration":[6,10]}',
  '[{"cuando":{"resolution":"1080P"},"fijar":{"duration":6}}]',
  '{"claves":["resolution","duration"],"precios":{"768P|6":"0.19","768P|10":"0.32","1080P|6":"0.33"}}',
  'MiniMax pay-as-you-go pricing, 2026-10-08', NULL, 60),
 ('minimax-imagen', 'minimax', 'image-01', 'Imagen · Rápida',
  'Imágenes rápidas y económicas para probar ideas.',
  'imagen', '{"imagenes":[0,0]}', true,
  '{"aspect_ratio":["9:16","1:1","16:9","4:3","3:4"]}', '[]',
  '{"claves":[],"precios":{"":"0.0035"}}',
  'MiniMax pay-as-you-go pricing, 2026-10-08', NULL, 70),

-- HIGGSFIELD · Genjutsu (solo existe ahí). Precio exacto por /estimate.
 ('genjutsu-movimiento', 'higgsfield', 'higgsfield/genjutsu/motion-transfer/v1.0', 'Genjutsu · Transferir movimiento',
  'Grábate actuando la escena y tu personaje hace los mismos movimientos. Video de 4 a 30 s.',
  'video', '{"imagenes":[1,8],"video":true}', false,
  '{"resolution":["720p","480p","1080p"]}', '[]', NULL,
  'Higgsfield /estimate (precio exacto en cada generación)', NULL, 80),
 ('genjutsu-objeto', 'higgsfield', 'higgsfield/genjutsu/object-swap/v1.0', 'Genjutsu · Cambiar objeto',
  'Cambia un objeto del video por tu producto, usando fotos de referencia. Video de 4 a 30 s.',
  'video', '{"imagenes":[1,8],"video":true}', true,
  '{"resolution":["720p","480p","1080p"]}', '[]', NULL,
  'Higgsfield /estimate (precio exacto en cada generación)', NULL, 90),

-- HIGGSFIELD · Kling (la API oficial de Kling solo vende paquetes prepagados)
 ('kling-imagen-a-video', 'higgsfield', 'kling-video/v2.5-turbo/pro/image-to-video', 'Video · Kling 2.5 Pro',
  'Anima una foto con movimiento de cámara cinematográfico.',
  'video', '{"imagenes":[1,1]}', true,
  '{"duration":[5,10],"negative_prompt":"texto"}', '[]', NULL,
  'Higgsfield /estimate (precio exacto en cada generación)', NULL, 100)
ON CONFLICT (clave) DO UPDATE SET
  ruta = EXCLUDED.ruta, proveedor = EXCLUDED.proveedor, entradas = EXCLUDED.entradas,
  prompt_requerido = EXCLUDED.prompt_requerido, parametros = EXCLUDED.parametros, reglas = EXCLUDED.reglas,
  tarifa = EXCLUDED.tarifa, tarifa_fuente = EXCLUDED.tarifa_fuente, opciones = EXCLUDED.opciones;

COMMIT;
