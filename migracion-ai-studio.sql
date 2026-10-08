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
-- activo=true se puede pedir: el cliente nunca manda una ruta libre
-- de Higgsfield.
CREATE TABLE IF NOT EXISTS ai_modelos (
  clave            TEXT PRIMARY KEY,
  ruta             TEXT NOT NULL,          -- ruta en api.higgsfield.ai
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  tipo             TEXT NOT NULL CHECK (tipo IN ('imagen','video')),
  requiere_imagen  BOOLEAN NOT NULL DEFAULT false,
  -- Parámetros permitidos y sus valores válidos. Lo que no esté aquí
  -- no se reenvía a Higgsfield.
  parametros       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Si es NULL se usa AI_MULTIPLICADOR del .env
  multiplicador    NUMERIC(5,2) CHECK (multiplicador IS NULL OR multiplicador >= 1.10),
  activo           BOOLEAN NOT NULL DEFAULT true,
  orden            INT NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS ai_generaciones (
  -- Este id es también el Idempotency-Key que se manda a Higgsfield:
  -- si el envío se corta y se reintenta, Higgsfield no cobra dos veces.
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modelo_clave     TEXT NOT NULL REFERENCES ai_modelos(clave),
  entrada          JSONB NOT NULL,
  costo_usd        NUMERIC(12,6) NOT NULL,   -- lo que cobra Higgsfield
  precio_centavos  BIGINT NOT NULL CHECK (precio_centavos > 0),  -- lo que paga el cliente
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','en_cola','en_proceso','completado','fallido','nsfw','cancelado','revision')),
  -- 'revision': no se sabe si Higgsfield la aceptó (y cobró). Nunca se
  -- reembolsa sola: la resuelve Jesús desde el admin.
  hf_request_id    TEXT UNIQUE,
  intentos_envio   INT NOT NULL DEFAULT 0,
  -- Hubo un envío sin respuesta clara: Higgsfield pudo haberla aceptado.
  envio_ambiguo    BOOLEAN NOT NULL DEFAULT false,
  -- Reserva del envío: evita que dos procesos la manden a la vez.
  enviando_hasta   TIMESTAMPTZ,
  error            TEXT,
  salida           JSONB,     -- URLs que devuelve Higgsfield (expiran a los 7 días)
  archivos         JSONB,     -- copias guardadas en el VPS
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminado_en     TIMESTAMPTZ,
  -- Garantía de "ganancias y no pérdidas" a nivel de base de datos:
  -- no se puede guardar una generación que se venda bajo costo.
  CONSTRAINT ai_gen_nunca_bajo_costo CHECK (precio_centavos >= CEIL(costo_usd * 100))
);
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
-- Rutas y parámetros verificados contra el OpenAPI público de
-- Higgsfield (docs.higgsfield.ai/docs/openapi.json, oct 2026).
-- Para añadir más modelos: búscalos en console.higgsfield.ai y
-- haz INSERT aquí con su ruta y parámetros.
INSERT INTO ai_modelos (clave, ruta, nombre, descripcion, tipo, requiere_imagen, parametros, orden) VALUES
 ('soul-imagen', 'higgsfield-ai/soul/standard', 'Imagen realista',
  'Fotos de personaje, producto o escena para usar como primer cuadro del video.',
  'imagen', false,
  '{"aspect_ratio":["9:16","4:5","1:1","16:9","3:4","4:3"],"resolution":["2K","4K"],"num_images":[1,2,3,4]}', 10),
 ('kling-pro-imagen-a-video', 'kling-video/v2.5-turbo/pro/image-to-video', 'Video desde imagen · Pro',
  'Anima una foto: el personaje habla, usa el producto o se mueve en escena.',
  'video', true,
  '{"duration":[5,10],"negative_prompt":"texto"}', 20),
 ('kling-std-imagen-a-video', 'kling-video/v2.5-turbo/standard/image-to-video', 'Video desde imagen · Estándar',
  'Igual que Pro, más económico. Bueno para probar ideas.',
  'video', true,
  '{"duration":[5,10],"negative_prompt":"texto"}', 30),
 ('kling-pro-texto-a-video', 'kling-video/v2.5-turbo/pro/text-to-video', 'Video desde texto · Pro',
  'Escenas sin foto de referencia: ambiente, producto en uso, B-roll.',
  'video', false,
  '{"duration":[5,10],"negative_prompt":"texto"}', 40),
 ('hailuo-imagen-a-video', 'minimax/hailuo-2.3/standard/image-to-video', 'Video desde imagen · Hailuo',
  'Alternativa de movimiento natural, clips de 6 o 10 segundos.',
  'video', true,
  '{"duration":[6,10]}', 50),
 ('hailuo-texto-a-video', 'minimax/hailuo-2.3/standard/text-to-video', 'Video desde texto · Hailuo',
  'Escenas desde texto con clips de 6 o 10 segundos.',
  'video', false,
  '{"duration":[6,10]}', 60)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
