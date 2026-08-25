-- ══════════════════════════════════════════════════════════════
-- WIFNIX — entrar con Google, Apple, Microsoft o Facebook
--
-- Correr una sola vez contra la base de producción:
--   psql -U postgres -d wifnix -f migracion-oauth.sql
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- Quien entra con Google no tiene contraseña, y la columna era NOT
-- NULL. Guardar una cadena vacía o un hash falso sería peor: acabaría
-- pareciendo una contraseña válida en alguna comparación futura.
ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;

-- Una fila por cada cuenta externa enlazada. Un mismo usuario puede
-- tener las cuatro.
CREATE TABLE IF NOT EXISTS identidades_oauth (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- google | apple | microsoft | facebook
  proveedor     VARCHAR(20) NOT NULL,

  -- El identificador que da el proveedor. Es lo ÚNICO estable: el
  -- correo se cambia, esto no. Por eso la búsqueda va por aquí y
  -- nunca por correo.
  sujeto        VARCHAR(255) NOT NULL,

  -- El correo tal como lo entregó el proveedor, para auditoría.
  -- No se usa para identificar.
  email         VARCHAR(255),

  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  ultimo_login  TIMESTAMPTZ,

  -- La misma cuenta externa no puede colgar de dos usuarios.
  UNIQUE (proveedor, sujeto)
);

CREATE INDEX IF NOT EXISTS idx_identidades_usuario ON identidades_oauth(usuario_id);
CREATE INDEX IF NOT EXISTS idx_identidades_email   ON identidades_oauth(lower(email));

COMMIT;
