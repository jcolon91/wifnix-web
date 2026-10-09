/* ══════════════════════════════════════════════════════════════
   WIFNIX AI STUDIO — anuncios con IA, pagados con créditos

   El cliente recarga créditos con Stripe (el dinero cae en la cuenta
   de Wifnix), y cada imagen o video que genera se descuenta de su
   saldo. Los modelos se usan directo con cada proveedor (Google,
   MiniMax) y Higgsfield solo para lo que es exclusivo suyo (Genjutsu).
   Las conexiones con cada uno viven en ai-proveedores.js.

   Las reglas que sostienen el negocio, en orden de importancia:

   1. NUNCA SE VENDE BAJO COSTO. Antes de cada generación se calcula
      el costo real: Higgsfield lo dice (/estimate); Google y MiniMax
      por su tarifa oficial guardada en ai_modelos. Si no hay costo,
      no se genera. Precio = costo × multiplicador, hacia arriba, con
      mínimo. La base de datos rechaza ventas bajo costo.

   2. SE COBRA ANTES, SE DEVUELVE SI FALLA. El saldo se descuenta en
      la misma transacción que crea la generación, con la billetera
      bloqueada (FOR UPDATE). Si el proveedor la rechaza o falla, el
      cliente recibe su dinero de vuelta.

   3. NADA SE COBRA NI SE ACREDITA DOS VECES. Índices únicos en
      ai_movimientos: una recarga por sesión de Stripe, un cargo y un
      reembolso por generación.

   4. LO DUDOSO NO SE REEMBOLSA SOLO. Si un envío se corta y el
      proveedor pudo haberlo aceptado (y cobrado), la generación pasa
      a "revision" y Jesús la resuelve desde el admin.

   5. LOS ARCHIVOS DEL CLIENTE SON SUYOS. Lo que sube y lo que genera
      se guarda en el VPS y se referencia por id ("subida:…",
      "gen:…"), nunca por URL libre: nadie puede usar archivos ajenos
      ni hacer que un proveedor baje una URL arbitraria.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const prov = require('./ai-proveedores');
const { ErrorProv, usdAMicros } = prov;

// ── Configuración (se lee al usarse: dotenv corre después del require) ──

function entero(v, defecto, minimo) {
  const n = parseInt(v, 10);
  return Math.max(minimo, Number.isFinite(n) ? n : defecto);
}

function cfg() {
  const e = process.env;
  const mult = parseFloat(e.AI_MULTIPLICADOR || '2');
  return {
    // Nunca menos de 1.10: por debajo, Stripe (~3% + 30¢) y el redondeo se comen la ganancia.
    multiplicador: Number.isFinite(mult) ? Math.max(1.1, mult) : 2,
    minimoCentavos: entero(e.AI_MINIMO_CENTAVOS, 25, 1),
    maximoCentavos: entero(e.AI_MAXIMO_CENTAVOS, 2500, 100),
    paquetes: (e.AI_PAQUETES || '10,25,50,100').split(',')
      .map((x) => parseInt(x.trim(), 10)).filter((x) => x >= 5 && x <= 1000),
    webhookToken: e.AI_WEBHOOK_TOKEN || '',
    stripeWebhookSecret: e.STRIPE_AI_WEBHOOK_SECRET || '',
    apiUrl: (e.API_URL || 'https://api.wifnix.com').replace(/\/+$/, ''),
    studioUrl: (e.AI_STUDIO_URL || 'https://portal.wifnix.com/ai-studio.html').replace(/\/+$/, ''),
    storageDir: e.AI_STORAGE_DIR || '/var/www/wifnix/ai-media',
    firma: e.AI_FIRMA_SECRET || e.JWT_SECRET || '',
    alertaEmail: e.AI_ALERTA_EMAIL || '',
    modeloEstratega: e.AI_ESTRATEGA_MODELO || 'claude-sonnet-4-5',
    // Lo que paga el cliente por cada estrategia (Claude cuesta ~5¢ por consulta).
    estrategaCentavos: entero(e.AI_ESTRATEGA_CENTAVOS, 15, 0),
    // Modo asistido: la IA convierte la idea del cliente en un prompt profesional.
    asistidoCentavos: entero(e.AI_ASISTIDO_CENTAVOS, 10, 0),
    modeloAsistido: e.AI_ASISTIDO_MODELO || e.AI_ESTRATEGA_MODELO || 'claude-sonnet-4-5',
    cuotaSubidasMB: entero(e.AI_CUOTA_SUBIDAS_MB, 1024, 50),
  };
}

const ESTADOS_ABIERTOS = ['pendiente', 'en_cola', 'en_proceso'];
const ESTADOS_REEMBOLSO = ['fallido', 'nsfw', 'cancelado'];
const MAX_INTENTOS_ENVIO = 5;
const MSG_REVISION = 'Estamos verificando esta generación. Si no se completó, se te devuelve el crédito.';
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_SUBIDA = /^[0-9a-f]{32}\.(jpg|png|webp|mp4)$/;
const EXT_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' };

function precioCentavos(costoUsd, multiplicador, minimo) {
  const micros = usdAMicros(costoUsd);
  const multBp = BigInt(Math.round(multiplicador * 100));
  const num = micros * multBp;
  const den = 10000n * 100n;
  let cent = num / den + (num % den ? 1n : 0n);
  const costoCent = micros / 10000n + (micros % 10000n ? 1n : 0n);
  if (cent < costoCent) cent = costoCent;
  if (cent < BigInt(minimo)) cent = BigInt(minimo);
  return Number(cent);
}

// Bytes mágicos: no se confía en lo que diga el navegador.
function detectarArchivo(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  // MP4: "ftyp" en el byte 4. QuickTime (.mov, marca "qt  ") no lo aceptan los modelos.
  if (b.length > 12 && b.slice(4, 8).toString('ascii') === 'ftyp'
      && /^(isom|iso[2-9]|mp41|mp42|avc1|M4V |dash|mmp4)$/.test(b.slice(8, 12).toString('latin1'))) return 'video/mp4';
  return null;
}

// ── Validación de lo que manda el cliente ─────────────────────
// Devuelve la entrada canónica: { prompt, imagenes:[ref], video:ref, ...parámetros }
function validarEntrada(modelo, cuerpo) {
  const ent = modelo.entradas || {};
  const prompt = typeof cuerpo.prompt === 'string' ? cuerpo.prompt.trim() : '';
  if (modelo.prompt_requerido !== false && prompt.length < 3) return { error: 'Escribe qué quieres generar.' };
  if (prompt.length > 2500) return { error: 'La descripción es muy larga (máximo 2,500 caracteres).' };
  const entrada = { prompt, imagenes: [] };

  const [minImg, maxImg] = ent.imagenes || [0, 0];
  const imgs = Array.isArray(cuerpo.imagenes) ? cuerpo.imagenes : [];
  if (imgs.length < minImg) return { error: minImg === 1 ? 'Este modelo necesita una imagen. Súbela primero.' : `Este modelo necesita al menos ${minImg} imágenes.` };
  if (imgs.length > maxImg) return { error: maxImg ? `Máximo ${maxImg} imagen(es) para este modelo.` : 'Este modelo no usa imágenes.' };
  for (const r of imgs) {
    if (typeof r !== 'string' || !esRef(r)) return { error: 'Imagen no válida.' };
    entrada.imagenes.push(r);
  }
  if (ent.video) {
    if (typeof cuerpo.video !== 'string' || !esRef(cuerpo.video)) return { error: 'Este modelo necesita un video. Súbelo primero.' };
    entrada.video = cuerpo.video;
  }

  for (const [clave, regla] of Object.entries(modelo.parametros || {})) {
    if (cuerpo[clave] === undefined || cuerpo[clave] === null || cuerpo[clave] === '') {
      if (Array.isArray(regla)) entrada[clave] = regla[0];
      continue;
    }
    if (Array.isArray(regla)) {
      const v = regla.find((op) => String(op) === String(cuerpo[clave]));
      if (v === undefined) return { error: `Valor no válido para ${clave}.` };
      entrada[clave] = v;
    } else if (regla === 'texto') {
      const v = String(cuerpo[clave]).trim();
      if (v.length > 500) return { error: `${clave} es muy largo.` };
      if (v) entrada[clave] = v;
    }
  }
  // Reglas del proveedor, ej. "1080p solo en 8 segundos": se fijan
  // ANTES de calcular el precio, así el cliente paga lo que se pide.
  for (const r of modelo.reglas || []) {
    if (Object.entries(r.cuando || {}).every(([k, v]) => String(entrada[k]) === String(v))) Object.assign(entrada, r.fijar || {});
  }
  return { entrada };
}

function esRef(r) {
  const [tipo, a, b] = r.split(':');
  if (tipo === 'subida') return RE_SUBIDA.test(a || '') && b === undefined;
  if (tipo === 'gen') return RE_UUID.test(a || '') && /^\d{1,2}$/.test(b || '');
  return false;
}

// ── El módulo ─────────────────────────────────────────────────

function crearStudio(deps) {
  const { db, stripe, anthropic, sendEmail, checkPermiso } = deps;
  const proveedores = deps.proveedores || prov.crearProveedores(deps.fetch || globalThis.fetch);
  const log = deps.log || console;

  async function enTransaccion(fn) {
    const cliente = await db.connect();
    try {
      await cliente.query('BEGIN');
      const r = await fn(cliente);
      await cliente.query('COMMIT');
      return r;
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      cliente.release();
    }
  }

  async function asegurarBilletera(q, uid) {
    await q.query('INSERT INTO ai_billeteras (usuario_id) VALUES ($1) ON CONFLICT DO NOTHING', [uid]);
  }

  // Mueve dinero y lo anota en el libro mayor (dentro de una transacción).
  // Si ya se había hecho, devuelve null y no toca nada.
  async function mover(q, uid, delta, tipo, { generacionId = null, stripeRef = null, nota = null } = {}) {
    await asegurarBilletera(q, uid);
    const { rows: [b] } = await q.query(
      'SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1 FOR UPDATE', [uid]);
    const despues = Number(b.saldo_centavos) + delta;
    const ins = await q.query(
      `INSERT INTO ai_movimientos (usuario_id, tipo, monto_centavos, saldo_despues, generacion_id, stripe_ref, nota)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
      [uid, tipo, delta, despues, generacionId, stripeRef, nota]);
    if (!ins.rowCount) return null;
    await q.query('UPDATE ai_billeteras SET saldo_centavos=$1, actualizado_en=NOW() WHERE usuario_id=$2', [despues, uid]);
    return despues;
  }

  async function alertar(asunto, detalle) {
    log.error('[AI Studio]', asunto, detalle || '');
    const to = cfg().alertaEmail;
    if (to && sendEmail) {
      await sendEmail(to, `[Wifnix AI Studio] ${asunto}`,
        `<p>${asunto}</p><pre>${String(detalle || '').replace(/[<>&]/g, '')}</pre>`).catch(() => {});
    }
  }

  const proveedorDe = (modelo) => proveedores[modelo.proveedor];

  async function modeloActivo(clave) {
    const { rows } = await db.query('SELECT * FROM ai_modelos WHERE clave=$1 AND activo', [String(clave || '')]);
    const m = rows[0];
    return m && proveedorDe(m) && proveedorDe(m).configurado() ? m : null;
  }

  // ── Archivos: firmas, rutas y referencias ──

  function firmar(texto) {
    const f = cfg().firma;
    if (!f || f.length < 32) throw new Error('AI_FIRMA_SECRET no configurado (mínimo 32 caracteres)');
    return crypto.createHmac('sha256', f).update(texto).digest('base64url');
  }
  function firmaValida(texto, sig) {
    const a = Buffer.from(firmar(texto));
    const b = Buffer.from(String(sig || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const dirUsuario = (uid) => path.join(cfg().storageDir, uid);
  const dirSubidas = (uid) => path.join(cfg().storageDir, uid, 'subidas');

  function enlaceArchivo(genId, n, exp) {
    return `${cfg().apiUrl}/api/ai/archivo/${genId}/${n}?exp=${exp}&sig=${firmar(`gen:${genId}:${n}:${exp}`)}`;
  }
  function enlaceSubida(uid, nombre, exp) {
    return `${cfg().apiUrl}/api/ai/subida/${uid}/${nombre}?exp=${exp}&sig=${firmar(`sub:${uid}:${nombre}:${exp}`)}`;
  }

  // Convierte una referencia en archivo local + enlace público firmado.
  // Solo resuelve archivos del mismo usuario. exp fijo = mismos enlaces
  // en cada reintento (Higgsfield compara el cuerpo con Idempotency-Key).
  async function resolverRef(uid, ref, exp) {
    const [tipo, a, b] = ref.split(':');
    if (tipo === 'subida') {
      const ruta = path.join(dirSubidas(uid), a);
      if (!fs.existsSync(ruta)) throw new Error('ref');
      return { ruta, mime: EXT_MIME[a.split('.').pop()], url: enlaceSubida(uid, a, exp) };
    }
    if (tipo === 'gen') {
      const n = parseInt(b, 10);
      const { rows: [g] } = await db.query('SELECT archivos FROM ai_generaciones WHERE id=$1 AND usuario_id=$2', [a, uid]);
      const ar = g && g.archivos && g.archivos[n];
      if (!ar || !fs.existsSync(path.join(dirUsuario(uid), ar.nombre))) throw new Error('ref');
      return { ruta: path.join(dirUsuario(uid), ar.nombre), mime: EXT_MIME[ar.nombre.split('.').pop()], url: enlaceArchivo(a, n, exp) };
    }
    throw new Error('ref');
  }

  async function resolverMedia(uid, entrada, exp) {
    const imagenes = [];
    for (const r of entrada.imagenes || []) {
      const m = await resolverRef(uid, r, exp);
      if (!m.mime.startsWith('image/')) throw new Error('ref');
      imagenes.push(m);
    }
    let video = null;
    if (entrada.video) {
      video = await resolverRef(uid, entrada.video, exp);
      if (video.mime !== 'video/mp4') throw new Error('ref');
    }
    return { imagenes, video };
  }

  async function cotizar(uid, modelo, entrada) {
    const c = cfg();
    const media = await resolverMedia(uid, entrada, Math.floor(Date.now() / 1000) + 86400);
    const costoUsd = await proveedorDe(modelo).costo(modelo, entrada, media);
    const mult = modelo.multiplicador ? Math.max(1.1, Number(modelo.multiplicador)) : c.multiplicador;
    return { costoUsd, precio: precioCentavos(costoUsd, mult, c.minimoCentavos) };
  }

  function urlWebhookHF() {
    const c = cfg();
    return c.webhookToken ? `${c.apiUrl}/api/ai/higgsfield/webhook/${c.webhookToken}` : undefined;
  }

  // ── Enviar al proveedor ──

  async function enviarGeneracion(gen) {
    // Reserva: solo un proceso a la vez manda esta generación. Si se
    // encuentra una reserva vencida, un envío anterior se interrumpió
    // (el servidor se reinició, falló la BD) y no sabemos si llegó.
    // Una sola sentencia: el CTE bloquea la fila y conserva la reserva previa.
    const { rows: [g] } = await db.query(
      `WITH previo AS (SELECT id, enviando_hasta FROM ai_generaciones WHERE id=$1 FOR UPDATE)
       UPDATE ai_generaciones a
          SET enviando_hasta = NOW() + INTERVAL '8 minutes', intentos_envio = a.intentos_envio + 1, actualizado_en = NOW()
         FROM previo
        WHERE a.id = previo.id AND a.estado='pendiente' AND a.proveedor_id IS NULL
          AND (previo.enviando_hasta IS NULL OR previo.enviando_hasta < NOW())
       RETURNING a.*, previo.enviando_hasta AS reserva_previa`, [gen.id]);
    if (!g) return 'ocupado';
    const { rows: [modelo] } = await db.query('SELECT * FROM ai_modelos WHERE clave=$1', [g.modelo_clave]);
    const p = proveedorDe(modelo);
    if (g.reserva_previa && !p.idempotente) {
      return aRevision(g, new ErrorProv(-1, 'Envío anterior interrumpido; reenviarlo podría cobrar dos veces'));
    }

    let r;
    try {
      const exp = Math.floor(new Date(g.creado_en).getTime() / 1000) + 86400;
      const media = await resolverMedia(g.usuario_id, g.entrada, exp);
      r = await p.enviar(modelo, { genId: g.id, entrada: g.entrada, media, webhook: modelo.proveedor === 'higgsfield' ? urlWebhookHF() : undefined });
    } catch (err) {
      if (err.message === 'ref') err = new ErrorProv(422, 'Archivo de entrada no disponible');
      if (!(err instanceof ErrorProv)) {
        // Error inesperado durante la llamada: con un proveedor sin
        // idempotencia no se sabe si cobró. Con Higgsfield se reintenta.
        if (!p.idempotente) return aRevision(g, err);
        await db.query('UPDATE ai_generaciones SET enviando_hasta=NULL WHERE id=$1', [g.id]);
        throw err;
      }
      return manejarErrorEnvio(g, p, err);
    }

    // Contestó en el acto (imágenes de Google y MiniMax).
    if (r.final) {
      if (r.final.estado === 'completado') {
        try {
          const archivos = await escribirArchivos(g, r.final.archivos);
          await terminar(g.id, 'completado', { archivos });
        } catch (err) {
          // El proveedor ya cobró y no pudimos guardar: a revisión, no reembolso.
          await terminar(g.id, 'revision', { error: MSG_REVISION });
          await alertar('No se pudo guardar una imagen ya generada', `${g.id}: ${err.message}`);
        }
      } else if (r.final.estado === 'revision') {
        await aRevision(g, new Error(r.final.error));
      } else {
        await terminar(g.id, r.final.estado, { error: r.final.error });
      }
      return 'terminado';
    }

    await db.query(
      `UPDATE ai_generaciones SET proveedor_id=$1, estado=$2, enviando_hasta=NULL, actualizado_en=NOW()
       WHERE id=$3 AND estado='pendiente'`, [r.id, r.estado || 'en_cola', g.id]);
    return 'enviado';
  }

  async function manejarErrorEnvio(g, p, err) {
    const ambiguo = prov.esAmbiguo(err);
    // Sin Idempotency-Key, reintentar un envío dudoso podría generar
    // (y pagar) dos veces: va directo a revisión.
    if (ambiguo && !p.idempotente) return aRevision(g, err);
    if (prov.esReintentable(err) && g.intentos_envio < MAX_INTENTOS_ENVIO) {
      log.warn('[AI Studio] envío a reintentar', g.id, err.message);
      await db.query(
        `UPDATE ai_generaciones SET enviando_hasta=NULL, envio_ambiguo = envio_ambiguo OR $2, actualizado_en=NOW()
         WHERE id=$1`, [g.id, ambiguo]);
      return 'reintentar';
    }
    if (g.envio_ambiguo || ambiguo) return aRevision(g, err);
    if (err.status === 403) await alertar(`Saldo agotado en ${p.nombre}: recarga la cuenta del proveedor`, err.message);
    if (err.status === 401 || err.status === 0) await alertar(`Credenciales o configuración inválidas en ${p.nombre}`, err.message);
    await terminar(g.id, 'fallido', { error: mensajeCliente(err) });
    return 'reembolsado';
  }

  async function aRevision(g, err) {
    await terminar(g.id, 'revision', { error: MSG_REVISION });
    await alertar('Generación en revisión: verifica en la consola del proveedor',
      `Generación ${g.id} (${g.modelo_clave}). Último error: ${err.message}. Resuélvela con PUT /api/admin/ai/generaciones/${g.id}/resolver`);
    return 'revision';
  }

  function mensajeCliente(err) {
    if (err.status === 451) return 'El contenido fue rechazado por moderación. No se te cobró.';
    if (err.status === 422 || err.status === 400) return 'El modelo rechazó los parámetros o los archivos. No se te cobró.';
    if ([0, 401, 403].includes(err.status)) return 'El servicio no está disponible ahora mismo. No se te cobró.';
    if ([423, 429, 503].includes(err.status)) return 'El modelo está ocupado. Intenta en unos minutos. No se te cobró.';
    return 'No se pudo completar. No se te cobró.';
  }

  // Cierra una generación. Idempotente. Si terminó mal, devuelve el
  // dinero en la misma transacción.
  async function terminar(genId, estado, { salida = null, error = null, archivos = null } = {}) {
    const cerrada = await enTransaccion(async (q) => {
      const { rows: [g] } = await q.query('SELECT * FROM ai_generaciones WHERE id=$1 FOR UPDATE', [genId]);
      if (!g || !ESTADOS_ABIERTOS.includes(g.estado)) return null;
      const terminal = !ESTADOS_ABIERTOS.includes(estado);
      await q.query(
        `UPDATE ai_generaciones SET estado=$1, salida=COALESCE($2, salida), error=$3, archivos=COALESCE($4, archivos),
         enviando_hasta=NULL, actualizado_en=NOW(), terminado_en=CASE WHEN $5 THEN NOW() ELSE NULL END WHERE id=$6`,
        [estado, salida ? JSON.stringify(salida) : null, error, archivos ? JSON.stringify(archivos) : null, terminal, genId]);
      if (ESTADOS_REEMBOLSO.includes(estado)) {
        await mover(q, g.usuario_id, Number(g.precio_centavos), 'reembolso', { generacionId: g.id, nota: estado });
      }
      return { ...g, estado };
    });
    if (cerrada && estado === 'completado' && !archivos) {
      guardarArchivos(genId).catch((e) => log.error('[AI Studio] guardar', e.message));
    }
    return cerrada;
  }

  // Pregunta al proveedor cómo va y actualiza la generación.
  async function refrescar(genId) {
    const { rows: [g] } = await db.query(
      `SELECT g.id, g.estado, g.proveedor_id, m.* , g.id AS gen_id FROM ai_generaciones g
       JOIN ai_modelos m ON m.clave=g.modelo_clave WHERE g.id=$1`, [genId]);
    if (!g || !g.proveedor_id || !ESTADOS_ABIERTOS.includes(g.estado)) return;
    const s = await proveedores[g.proveedor].estado(g, g.proveedor_id);
    if (!s || !s.estado) return;
    if (s.estado === 'completado') {
      if (!s.salida || !(s.salida.items || []).length) {
        return aRevision({ id: g.gen_id, modelo_clave: g.clave }, new Error('El proveedor dijo "completado" sin archivos'));
      }
      return terminar(g.gen_id, 'completado', { salida: s.salida });
    }
    if (ESTADOS_REEMBOLSO.includes(s.estado)) {
      const msg = s.estado === 'nsfw'
        ? 'El contenido fue rechazado por moderación. Se te devolvió el crédito.'
        : (s.error && s.error.includes('crédito') ? s.error : 'La generación falló. Se te devolvió el crédito.');
      return terminar(g.gen_id, s.estado, { error: msg });
    }
    await db.query(`UPDATE ai_generaciones SET estado=$1, actualizado_en=NOW() WHERE id=$2 AND estado = ANY($3)`,
      [s.estado, g.gen_id, ESTADOS_ABIERTOS]);
  }

  async function escribirArchivos(g, items) {
    const dir = dirUsuario(g.usuario_id);
    await fs.promises.mkdir(dir, { recursive: true });
    const archivos = [];
    for (let i = 0; i < items.length; i++) {
      let it = items[i];
      if (!it.buffer && (it.url || it.file_id)) {
        const { rows: [m] } = await db.query('SELECT proveedor FROM ai_modelos WHERE clave=$1', [g.modelo_clave]);
        it = { ...(await proveedores[m.proveedor].descargar(it)), tipo: it.tipo };
      }
      if (!it.buffer || it.buffer.length > 300 * 1024 * 1024) throw new Error('Archivo vacío o demasiado grande');
      const ext = MIME_EXT[it.mime] || (it.tipo === 'video' ? 'mp4' : 'png');
      const nombre = `${g.id}-${i}.${ext}`;
      await fs.promises.writeFile(path.join(dir, nombre), it.buffer);
      archivos.push({ nombre, tipo: it.tipo, bytes: it.buffer.length });
    }
    return archivos;
  }

  // Los proveedores borran los archivos en horas o días: se copian al VPS.
  async function guardarArchivos(genId) {
    const { rows: [g] } = await db.query(
      `SELECT g.*, m.proveedor FROM ai_generaciones g JOIN ai_modelos m ON m.clave=g.modelo_clave WHERE g.id=$1`, [genId]);
    if (!g || g.estado !== 'completado' || g.archivos) return;
    await db.query('UPDATE ai_generaciones SET copias_intentos=copias_intentos+1 WHERE id=$1', [g.id]);
    try {
      if (!g.salida || !(g.salida.items || []).length) throw new Error('sin archivos que copiar');
      const archivos = await escribirArchivos(g, g.salida.items);
      await db.query('UPDATE ai_generaciones SET archivos=$1 WHERE id=$2 AND archivos IS NULL', [JSON.stringify(archivos), g.id]);
    } catch (err) {
      // Cobrado y sin entregar: tras varios intentos, a revisión con alerta.
      if (g.copias_intentos + 1 >= 8 || !g.salida) {
        const { rowCount } = await db.query(
          `UPDATE ai_generaciones SET estado='revision', error=$1, actualizado_en=NOW()
           WHERE id=$2 AND estado='completado' AND archivos IS NULL`, [MSG_REVISION, g.id]);
        if (rowCount) await alertar('No se pudo copiar una generación completada', `${g.id}: ${err.message}`);
      }
      throw err;
    }
  }

  function vistaGeneracion(g) {
    const exp = Math.floor(Date.now() / 1000) + 7200;
    const archivos = (g.archivos || []).map((a, n) => ({ tipo: a.tipo, url: enlaceArchivo(g.id, n, exp), ref: `gen:${g.id}:${n}` }));
    return {
      id: g.id, modelo: g.modelo_clave, estado: g.estado,
      prompt: g.entrada && g.entrada.prompt, precio_centavos: Number(g.precio_centavos),
      error: g.error, archivos, copiando: g.estado === 'completado' && !archivos.length,
      creado_en: g.creado_en, terminado_en: g.terminado_en,
    };
  }

  // Subidas de más de 7 días y temporales de más de 1 hora se borran.
  async function limpiarSubidas() {
    const base = cfg().storageDir;
    if (!fs.existsSync(base)) return;
    const ahora = Date.now();
    const borrarViejos = async (dir, edadMs) => {
      if (!fs.existsSync(dir)) return;
      for (const f of await fs.promises.readdir(dir)) {
        const ruta = path.join(dir, f);
        const st = await fs.promises.stat(ruta).catch(() => null);
        if (st && st.isFile() && ahora - st.mtimeMs > edadMs) await fs.promises.unlink(ruta).catch(() => {});
      }
    };
    await borrarViejos(path.join(base, '_tmp'), 3600 * 1000);
    for (const uid of await fs.promises.readdir(base)) {
      if (RE_UUID.test(uid)) await borrarViejos(dirSubidas(uid), 7 * 86400 * 1000);
    }
  }

  async function bytesSubidos(uid) {
    const dir = dirSubidas(uid);
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    for (const f of await fs.promises.readdir(dir)) {
      const st = await fs.promises.stat(path.join(dir, f)).catch(() => null);
      if (st) total += st.size;
    }
    return total;
  }

  // ── Reconciliador ──
  let corriendo = false;
  async function reconciliar() {
    if (corriendo) return;
    corriendo = true;
    let conexion;
    try {
      // Candado y liberación por la MISMA conexión.
      conexion = await db.connect();
      const { rows: [l] } = await conexion.query('SELECT pg_try_advisory_lock(717171) AS ok');
      if (!l.ok) return;
      try {
        const { rows: pend } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado='pendiente' AND proveedor_id IS NULL
           AND actualizado_en < NOW() - INTERVAL '20 seconds'
           AND (enviando_hasta IS NULL OR enviando_hasta < NOW()) ORDER BY creado_en LIMIT 20`);
        for (const g of pend) await enviarGeneracion(g).catch((e) => log.error('[AI Studio] reenviar', e.message));
        const { rows: abiertas } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado IN ('pendiente','en_cola','en_proceso')
           AND proveedor_id IS NOT NULL AND actualizado_en < NOW() - INTERVAL '45 seconds' LIMIT 50`);
        for (const a of abiertas) await refrescar(a.id).catch((e) => log.error('[AI Studio] estado', e.message));
        const { rows: viejas } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado IN ('pendiente','en_cola','en_proceso')
           AND creado_en < NOW() - INTERVAL '3 hours' LIMIT 20`);
        for (const v of viejas) {
          if (await terminar(v.id, 'revision', { error: MSG_REVISION })) await alertar('Generación atascada pasó a revisión', `Generación ${v.id}`);
        }
        const { rows: sinCopia } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado='completado' AND archivos IS NULL LIMIT 10`);
        for (const c of sinCopia) await guardarArchivos(c.id).catch((e) => log.error('[AI Studio] copiar', e.message));
        await limpiarSubidas().catch((e) => log.error('[AI Studio] limpiar', e.message));
      } finally {
        await conexion.query('SELECT pg_advisory_unlock(717171)');
      }
    } catch (err) {
      log.error('[AI Studio] reconciliar', err.message);
    } finally {
      if (conexion) conexion.release();
      corriendo = false;
    }
  }

  // ── Stripe ──

  async function procesarEventoStripe(event) {
    const o = event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (!o.metadata || o.metadata.tipo !== 'ai_creditos' || o.payment_status !== 'paid') return 'ignorado';
      const uid = o.client_reference_id || o.metadata.usuario_id;
      const centavos = Number(o.amount_total); // lo que de verdad cobró Stripe
      if (!uid || !(centavos > 0)) return 'ignorado';
      const r = await enTransaccion((q) => mover(q, uid, centavos, 'recarga', { stripeRef: o.id, nota: 'Stripe Checkout' }));
      return r === null ? 'duplicado' : 'acreditado';
    }
    if (event.type === 'charge.refunded') {
      const pi = o.payment_intent && await stripe.paymentIntents.retrieve(o.payment_intent);
      if (!pi || !pi.metadata || pi.metadata.tipo !== 'ai_creditos') return 'ignorado';
      const uid = pi.metadata.usuario_id;
      const refunds = await stripe.refunds.list({ charge: o.id, limit: 100 });
      for (const rf of refunds.data) {
        if (rf.status !== 'succeeded') continue;
        await enTransaccion(async (q) => {
          await asegurarBilletera(q, uid);
          const { rows: [b] } = await q.query('SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1 FOR UPDATE', [uid]);
          const saldo = Number(b.saldo_centavos);
          const quitar = Math.min(saldo, rf.amount);
          const hecho = await mover(q, uid, -quitar, 'contracargo', { stripeRef: rf.id, nota: `Reembolso Stripe ${rf.amount}¢` });
          if (hecho !== null && quitar < rf.amount) {
            await q.query('UPDATE ai_billeteras SET congelada=true, motivo_congelada=$1 WHERE usuario_id=$2',
              [`Reembolso de ${rf.amount}¢ con solo ${saldo}¢ de saldo`, uid]);
          }
        });
      }
      return 'procesado';
    }
    if (event.type === 'charge.dispute.created') {
      const pi = o.payment_intent && await stripe.paymentIntents.retrieve(o.payment_intent);
      if (!pi || !pi.metadata || pi.metadata.tipo !== 'ai_creditos') return 'ignorado';
      await asegurarBilletera(db, pi.metadata.usuario_id);
      await db.query(`UPDATE ai_billeteras SET congelada=true, motivo_congelada='Disputa en Stripe' WHERE usuario_id=$1`,
        [pi.metadata.usuario_id]);
      await alertar('Disputa de pago en AI Studio', `Usuario ${pi.metadata.usuario_id}, PI ${pi.id}`);
      return 'congelada';
    }
    return 'ignorado';
  }

  // Va ANTES de express.json() en server.js: Stripe firma el cuerpo crudo.
  function montarWebhookStripe(app) {
    app.post('/api/ai/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
      const secreto = cfg().stripeWebhookSecret;
      if (!stripe || !secreto) return res.sendStatus(503);
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secreto);
      } catch {
        return res.status(400).send('Firma inválida');
      }
      try {
        await procesarEventoStripe(event);
        res.json({ received: true });
      } catch (err) {
        log.error('[AI Studio] webhook Stripe', event.type, err.message);
        res.sendStatus(500);
      }
    });
  }

  // ── Rutas ───────────────────────────────────────────────────

  function montar(app, authMiddleware) {
    const porUsuario = (max, ventanaMin) => rateLimit({
      windowMs: ventanaMin * 60 * 1000, max,
      keyGenerator: (req) => req.user.id,
      message: { error: 'Demasiadas solicitudes. Espera unos minutos.' },
      validate: false,
    });

    async function billeteraDe(uid) {
      await asegurarBilletera(db, uid);
      const { rows: [b] } = await db.query('SELECT * FROM ai_billeteras WHERE usuario_id=$1', [uid]);
      return b;
    }
    async function exigirActivo(req, res) {
      const b = await billeteraDe(req.user.id);
      if (!b.acepto_terminos_en) { res.status(403).json({ error: 'Acepta los términos de AI Studio primero.', codigo: 'terminos' }); return null; }
      if (b.congelada) { res.status(403).json({ error: 'Tu cuenta de AI Studio está en revisión. Contáctanos.', codigo: 'congelada' }); return null; }
      return b;
    }
    const envolver = (fn) => (req, res) => fn(req, res).catch((err) => {
      log.error('[AI Studio]', req.method, req.path, err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Error interno de AI Studio' });
    });
    const errorCotizar = (res, err) => {
      if (err.message === 'ref') return res.status(400).json({ error: 'Uno de los archivos ya no está disponible. Súbelo otra vez.' });
      if (!(err instanceof ErrorProv)) throw err;
      log.error('[AI Studio] cotizar', err.message);
      return res.status(502).json({ error: 'No se pudo calcular el precio ahora. No se te cobró.' });
    };

    app.get('/api/ai/estado', authMiddleware, envolver(async (req, res) => {
      const b = await billeteraDe(req.user.id);
      res.json({
        saldo_centavos: Number(b.saldo_centavos), acepto_terminos: !!b.acepto_terminos_en,
        congelada: b.congelada, paquetes: cfg().paquetes, estratega_centavos: cfg().estrategaCentavos, asistido_centavos: cfg().asistidoCentavos,
        disponible: !!stripe && Object.values(proveedores).some((p) => p.configurado()),
        es_admin: !!(checkPermiso && await checkPermiso(req.user.id, 'puede_ver_finanzas')),
      });
    }));

    app.post('/api/ai/terminos', authMiddleware, envolver(async (req, res) => {
      if (req.body.acepto !== true) return res.status(400).json({ error: 'Debes aceptar los términos.' });
      await asegurarBilletera(db, req.user.id);
      await db.query('UPDATE ai_billeteras SET acepto_terminos_en=COALESCE(acepto_terminos_en, NOW()) WHERE usuario_id=$1', [req.user.id]);
      res.json({ ok: true });
    }));

    app.get('/api/ai/modelos', authMiddleware, envolver(async (req, res) => {
      const { rows } = await db.query(
        `SELECT clave, nombre, descripcion, tipo, proveedor, entradas, prompt_requerido, parametros
         FROM ai_modelos WHERE activo ORDER BY orden, nombre`);
      // Solo los de proveedores configurados; el proveedor no sale del servidor.
      res.json(rows.filter((m) => proveedores[m.proveedor] && proveedores[m.proveedor].configurado())
        .map(({ proveedor, ...m }) => m));
    }));

    app.post('/api/ai/creditos/checkout', authMiddleware, porUsuario(10, 15), envolver(async (req, res) => {
      if (!stripe) return res.status(503).json({ error: 'Pagos no disponibles' });
      if (!(await exigirActivo(req, res))) return;
      const monto = parseInt(req.body.monto, 10);
      const c = cfg();
      if (!c.paquetes.includes(monto)) return res.status(400).json({ error: 'Paquete no válido' });
      const meta = { tipo: 'ai_creditos', usuario_id: req.user.id };
      const s = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: monto * 100,
          product_data: { name: `Créditos Wifnix AI Studio · $${monto}` } } }],
        customer_email: req.user.email, client_reference_id: req.user.id, metadata: meta,
        payment_intent_data: { metadata: meta, description: `Wifnix AI Studio · créditos $${monto}` },
        success_url: `${c.studioUrl}?recarga=ok`, cancel_url: `${c.studioUrl}?recarga=cancelada`,
      });
      res.json({ url: s.url });
    }));

    // Subidas: imágenes (10 MB) y videos MP4 (100 MB) se guardan en el VPS.
    const subida = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const d = path.join(cfg().storageDir, '_tmp');
          fs.mkdir(d, { recursive: true }, (e) => cb(e, d));
        },
        filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
      }),
      limits: { fileSize: 100 * 1024 * 1024, files: 1 },
    });
    const recibir = (req, res, next) => subida.single('archivo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pasa de 100 MB.' : 'No se pudo leer el archivo.' });
      next();
    });

    // Antes de aceptar 100 MB: términos, billetera activa y cuota.
    const antesDeSubir = envolver(async (req, res) => {
      if (!(await exigirActivo(req, res))) return;
      if (await bytesSubidos(req.user.id) > cfg().cuotaSubidasMB * 1024 * 1024) {
        return res.status(413).json({ error: 'Llegaste al límite de archivos subidos. Se liberan solos a los 7 días.' });
      }
      req.puedeSubir = true;
    });
    const verificarSubida = (req, res, next) => antesDeSubir(req, res).then(() => { if (req.puedeSubir) next(); });

    app.post('/api/ai/subir', authMiddleware, porUsuario(40, 15), verificarSubida, recibir, envolver(async (req, res) => {
      const tmp = req.file && req.file.path;
      try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió el archivo' });
        const fd = await fs.promises.open(tmp, 'r');
        const cab = Buffer.alloc(16);
        await fd.read(cab, 0, 16, 0);
        await fd.close();
        const mime = detectarArchivo(cab);
        if (!mime) return res.status(400).json({ error: 'Solo imágenes JPG, PNG o WEBP, o video MP4.' });
        if (mime.startsWith('image/') && req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'La imagen pasa de 10 MB.' });
        const nombre = `${crypto.randomBytes(16).toString('hex')}.${MIME_EXT[mime]}`;
        await fs.promises.mkdir(dirSubidas(req.user.id), { recursive: true });
        await fs.promises.rename(tmp, path.join(dirSubidas(req.user.id), nombre));
        const exp = Math.floor(Date.now() / 1000) + 7200;
        res.json({ ref: `subida:${nombre}`, tipo: mime.startsWith('image/') ? 'imagen' : 'video', url: enlaceSubida(req.user.id, nombre, exp) });
      } finally {
        if (tmp) fs.promises.unlink(tmp).catch(() => {});
      }
    }));

    app.post('/api/ai/cotizar', authMiddleware, porUsuario(60, 15), envolver(async (req, res) => {
      const modelo = await modeloActivo(req.body.modelo);
      if (!modelo) return res.status(404).json({ error: 'Modelo no disponible' });
      const v = validarEntrada(modelo, req.body);
      if (v.error) return res.status(400).json({ error: v.error });
      let precio;
      try { ({ precio } = await cotizar(req.user.id, modelo, v.entrada)); } catch (err) { return errorCotizar(res, err); }
      if (precio > cfg().maximoCentavos) return res.status(400).json({ error: 'Esta configuración excede el máximo por generación.' });
      res.json({ precio_centavos: precio, ajustes: v.entrada });
    }));

    app.post('/api/ai/generar', authMiddleware, porUsuario(30, 15), envolver(async (req, res) => {
      if (!(await exigirActivo(req, res))) return;
      const modelo = await modeloActivo(req.body.modelo);
      if (!modelo) return res.status(404).json({ error: 'Modelo no disponible' });
      const v = validarEntrada(modelo, req.body);
      if (v.error) return res.status(400).json({ error: v.error });

      let costoUsd, precio;
      try { ({ costoUsd, precio } = await cotizar(req.user.id, modelo, v.entrada)); } catch (err) { return errorCotizar(res, err); }
      if (precio > cfg().maximoCentavos) return res.status(400).json({ error: 'Esta configuración excede el máximo por generación.' });
      const aprobado = parseInt(req.body.precio_aprobado_centavos, 10);
      if (!(aprobado >= precio)) return res.status(409).json({ error: 'El precio cambió. Revísalo y confirma de nuevo.', precio_centavos: precio });

      let gen;
      try {
        gen = await enTransaccion(async (q) => {
          await asegurarBilletera(q, req.user.id);
          const { rows: [b] } = await q.query('SELECT saldo_centavos, congelada FROM ai_billeteras WHERE usuario_id=$1 FOR UPDATE', [req.user.id]);
          if (b.congelada) { const e = new Error('congelada'); e.codigo = 'congelada'; throw e; }
          if (Number(b.saldo_centavos) < precio) { const e = new Error('saldo'); e.codigo = 'saldo'; e.saldo = Number(b.saldo_centavos); throw e; }
          const { rows: [g] } = await q.query(
            `INSERT INTO ai_generaciones (usuario_id, modelo_clave, entrada, costo_usd, precio_centavos)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [req.user.id, modelo.clave, JSON.stringify(v.entrada), costoUsd, precio]);
          await mover(q, req.user.id, -precio, 'cargo', { generacionId: g.id, nota: modelo.nombre });
          return g;
        });
      } catch (err) {
        if (err.codigo === 'saldo') return res.status(402).json({ error: 'Saldo insuficiente. Recarga créditos para continuar.', codigo: 'saldo', precio_centavos: precio, saldo_centavos: err.saldo });
        if (err.codigo === 'congelada') return res.status(403).json({ error: 'Tu cuenta de AI Studio está en revisión.', codigo: 'congelada' });
        throw err;
      }

      await enviarGeneracion(gen);
      const { rows: [actual] } = await db.query('SELECT * FROM ai_generaciones WHERE id=$1', [gen.id]);
      const { rows: [b] } = await db.query('SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1', [req.user.id]);
      res.status(202).json({ generacion: vistaGeneracion(actual), saldo_centavos: Number(b.saldo_centavos) });
    }));

    app.get('/api/ai/generaciones', authMiddleware, envolver(async (req, res) => {
      const lim = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 30));
      const { rows } = await db.query('SELECT * FROM ai_generaciones WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT $2', [req.user.id, lim]);
      res.json(rows.map(vistaGeneracion));
    }));

    app.get('/api/ai/generaciones/:id', authMiddleware, envolver(async (req, res) => {
      if (!RE_UUID.test(req.params.id)) return res.status(404).json({ error: 'No encontrada' });
      let { rows: [g] } = await db.query('SELECT * FROM ai_generaciones WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
      if (!g) return res.status(404).json({ error: 'No encontrada' });
      if (g.proveedor_id && ESTADOS_ABIERTOS.includes(g.estado) && Date.now() - new Date(g.actualizado_en).getTime() > 15000) {
        await refrescar(g.id).catch(() => {});
        ({ rows: [g] } = await db.query('SELECT * FROM ai_generaciones WHERE id=$1', [g.id]));
      }
      res.json(vistaGeneracion(g));
    }));

    app.get('/api/ai/movimientos', authMiddleware, envolver(async (req, res) => {
      const { rows } = await db.query(
        `SELECT tipo, monto_centavos, saldo_despues, nota, creado_en FROM ai_movimientos
         WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 100`, [req.user.id]);
      res.json(rows.map((m) => ({ ...m, monto_centavos: Number(m.monto_centavos), saldo_despues: Number(m.saldo_despues) })));
    }));

    // Archivos con enlace firmado: los ve el cliente y los bajan los
    // proveedores. sendFile soporta Range (Safari lo exige para video).
    const cabeceras = { 'Cache-Control': 'private, max-age=3600', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' };
    const vigente = (exp) => exp > Date.now() / 1000;

    app.get('/api/ai/archivo/:id/:n', envolver(async (req, res) => {
      const { id } = req.params;
      const n = parseInt(req.params.n, 10);
      const exp = parseInt(req.query.exp, 10);
      if (!RE_UUID.test(id) || !(n >= 0) || !vigente(exp) || !firmaValida(`gen:${id}:${n}:${exp}`, req.query.sig)) return res.sendStatus(404);
      const { rows: [g] } = await db.query('SELECT usuario_id, archivos FROM ai_generaciones WHERE id=$1', [id]);
      const a = g && g.archivos && g.archivos[n];
      if (!a) return res.sendStatus(404);
      res.sendFile(path.join(dirUsuario(g.usuario_id), a.nombre), { headers: cabeceras });
    }));

    app.get('/api/ai/subida/:uid/:nombre', envolver(async (req, res) => {
      const { uid, nombre } = req.params;
      const exp = parseInt(req.query.exp, 10);
      if (!RE_UUID.test(uid) || !RE_SUBIDA.test(nombre) || !vigente(exp) || !firmaValida(`sub:${uid}:${nombre}:${exp}`, req.query.sig)) return res.sendStatus(404);
      const ruta = path.join(dirSubidas(uid), nombre);
      if (!fs.existsSync(ruta)) return res.sendStatus(404);
      res.sendFile(ruta, { headers: cabeceras });
    }));

    // El Estratega: análisis → ángulos → guion → prompts.
    // ── Modo asistido: mejorar el prompt con IA ──
    // Guía por familia de modelo: lo que cada uno entiende mejor.
    const GUIAS = {
      imagen: 'Image model (photorealistic). Describe subject, wardrobe, action, setting, lighting (time of day, quality), camera (shot type, lens, angle), composition and mood. Put any on-image text in double quotes. Vertical social-ad framing unless told otherwise.',
      veo: 'Veo video model with native audio, max 8 seconds. Describe one continuous shot: subject, action beat by beat, camera movement, lighting, ambience sounds. Spoken lines go in double quotes after "says:". Keep dialogue short enough for the duration.',
      hailuo: 'Hailuo video model, 6-10 seconds, no audio. Focus on clear physical motion with strong verbs, camera movement and pacing. If a start image is given, describe what moves from that frame; do not redescribe static details.',
      kling: 'Kling video model, 5-10 seconds. Describe the motion from the start image, camera move (push in, orbit, handheld), and timing. Be concrete and physical.',
      genjutsu: 'Higgsfield Genjutsu edits an existing video using reference images. Write short instructions about what to replace or keep (identity, wardrobe, product), not a full scene description.',
    };
    function guiaDe(m) {
      if (m.entradas && m.entradas.video) return GUIAS.genjutsu;
      if (m.tipo === 'imagen') return GUIAS.imagen;
      if (/veo/.test(m.ruta)) return GUIAS.veo;
      if (/hailuo/i.test(m.ruta)) return GUIAS.hailuo;
      return GUIAS.kling;
    }

    // Cobra un servicio de IA (Estratega, asistido) antes de llamarlo.
    async function cobrarServicio(uid, centavos, nota) {
      if (!(centavos > 0)) return true;
      try {
        await enTransaccion(async (q) => {
          const { rows: [w] } = await q.query('SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1 FOR UPDATE', [uid]);
          if (Number(w.saldo_centavos) < centavos) throw Object.assign(new Error('saldo'), { codigo: 'saldo' });
          await mover(q, uid, -centavos, 'cargo', { nota });
        });
        return true;
      } catch (err) {
        if (err.codigo === 'saldo') return false;
        throw err;
      }
    }
    const devolverServicio = (uid, centavos, nota) => (centavos > 0
      ? enTransaccion((q) => mover(q, uid, centavos, 'reembolso', { nota })).catch((e) => log.error('[AI Studio] devolver', e.message))
      : null);

    app.post('/api/ai/mejorar-prompt', authMiddleware, porUsuario(30, 15), envolver(async (req, res) => {
      if (!(await exigirActivo(req, res))) return;
      const modelo = await modeloActivo(req.body.modelo);
      if (!modelo) return res.status(404).json({ error: 'Modelo no disponible' });
      const idea = typeof req.body.prompt === 'string' ? req.body.prompt.trim().slice(0, 1500) : '';
      if (idea.length < 3) return res.status(400).json({ error: 'Escribe tu idea, aunque sea corta.' });

      // La foto de inicio (si hay) se le enseña a la IA para que describa el movimiento correcto.
      const contenido = [];
      const ref = Array.isArray(req.body.imagenes) && typeof req.body.imagenes[0] === 'string' && esRef(req.body.imagenes[0]) ? req.body.imagenes[0] : null;
      if (ref) {
        try {
          const m = await resolverRef(req.user.id, ref, Math.floor(Date.now() / 1000) + 600);
          const st = await fs.promises.stat(m.ruta);
          if (m.mime.startsWith('image/') && st.size <= 5 * 1024 * 1024) {
            contenido.push({ type: 'image', source: { type: 'base64', media_type: m.mime, data: (await fs.promises.readFile(m.ruta)).toString('base64') } });
          }
        } catch { return res.status(400).json({ error: 'La imagen ya no está disponible. Súbela otra vez.' }); }
      }
      const ajustes = Object.keys(modelo.parametros || {}).filter((k) => req.body[k] !== undefined).map((k) => `${k}=${req.body[k]}`).join(', ');
      contenido.push({ type: 'text', text: `Client idea (may be in Spanish): ${idea}\n${ajustes ? 'Settings: ' + ajustes + '\n' : ''}${ref ? 'The attached image is the start frame.' : ''}` });

      const precio = cfg().asistidoCentavos;
      if (!(await cobrarServicio(req.user.id, precio, 'Prompt asistido'))) {
        return res.status(402).json({ error: 'Recarga créditos para usar el modo asistido.', codigo: 'saldo' });
      }
      let msg;
      try {
        msg = await anthropic.messages.create({
          model: cfg().modeloAsistido, max_tokens: 900,
          system: `You are a senior prompt director for AI ad production at Wifnix AI Studio.
Rewrite the client's idea into ONE optimized prompt for this model: ${modelo.nombre}.
${guiaDe(modelo)}
Rules: write the prompt in English; keep any spoken dialogue or on-screen text in the client's language (Spanish if they wrote Spanish); keep the client's intent, product and setting; do not add real people, celebrities, brands or logos they did not mention; no emojis.
Respond ONLY with valid JSON: {"prompt":"...","notas":"one short sentence in Spanish explaining what you improved"}`,
          messages: [{ role: 'user', content: contenido }],
        });
      } catch (err) {
        log.error('[AI Studio] asistido', err.message);
        await devolverServicio(req.user.id, precio, 'Prompt asistido no respondió');
        return res.status(502).json({ error: 'El asistente no está disponible ahora. Se te devolvió el crédito.' });
      }
      const texto = (msg.content || []).map((x) => x.text || '').join('');
      let r;
      try { r = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)); } catch { r = null; }
      if (!r || typeof r.prompt !== 'string' || r.prompt.trim().length < 3) {
        await devolverServicio(req.user.id, precio, 'Prompt asistido incompleto');
        return res.status(502).json({ error: 'El asistente devolvió una respuesta incompleta. Se te devolvió el crédito.' });
      }
      const { rows: [b] } = await db.query('SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1', [req.user.id]);
      res.json({ prompt: r.prompt.trim().slice(0, 2500), notas: typeof r.notas === 'string' ? r.notas.slice(0, 300) : '', saldo_centavos: Number(b.saldo_centavos), cobrado_centavos: precio });
    }));

    app.post('/api/ai/estratega', authMiddleware, porUsuario(12, 60), envolver(async (req, res) => {
      const b = await exigirActivo(req, res);
      if (!b) return;
      const precioE = cfg().estrategaCentavos;
      const limpio = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
      const producto = limpio(req.body.producto, 1500);
      const mercado = limpio(req.body.mercado, 200) || 'Puerto Rico';
      const publico = limpio(req.body.publico, 500);
      const formato = limpio(req.body.formato, 100) || 'UGC realista';
      const idioma = limpio(req.body.idioma, 50) || 'español de Puerto Rico';
      if (producto.length < 10) return res.status(400).json({ error: 'Describe tu producto o servicio.' });
      if (!(await cobrarServicio(req.user.id, precioE, 'Estratega'))) {
        return res.status(402).json({ error: 'Recarga créditos para usar el Estratega.', codigo: 'saldo' });
      }
      const devolver = () => devolverServicio(req.user.id, precioE, 'Estratega no respondió');

      const { rows: mods } = await db.query(`SELECT clave, nombre, tipo, entradas FROM ai_modelos WHERE activo ORDER BY orden`);
      const disponibles = mods.filter((m) => m.tipo === 'imagen' || !(m.entradas && m.entradas.video));
      const lista = disponibles.map((m) => `${m.clave} (${m.tipo}: ${m.nombre})`).join(', ');
      const imgDefecto = (disponibles.find((m) => m.tipo === 'imagen') || {}).clave || '';
      const vidDefecto = (disponibles.find((m) => m.tipo === 'video') || {}).clave || '';

      const sistema = `Eres el Estratega de Wifnix AI Studio: un estratega creativo de anuncios de respuesta directa para Meta, TikTok y Reels.
Trabajas en tres pasos: 1) análisis del cliente ideal (problema, lo que ya intentó, lo que desea, objeciones), 2) ángulos de venta con ganchos, 3) un guion de 20 a 30 segundos dividido en escenas.
Para cada escena escribes un prompt de imagen (primer cuadro, fotorrealista, vertical 9:16, describe persona, lugar, luz y producto) y un prompt de video (qué acción ocurre y qué dice la persona, en máximo 8 segundos).
Los prompts de imagen y video van en inglés (los modelos rinden mejor); los diálogos y textos en pantalla, en ${idioma}.
No inventes resultados, testimonios ni cifras del cliente. No uses personas reales ni famosas. No uses emojis.
Responde SOLO con JSON válido con esta forma exacta:
{"analisis":{"problema":"","ya_intento":"","desea":"","objeciones":[""]},"angulos":[{"nombre":"","gancho":""}],"guion":{"angulo":"","duracion_seg":0,"escenas":[{"n":1,"segundos":0,"dialogo":"","texto_pantalla":"","prompt_imagen":"","prompt_video":"","modelo_imagen":"${imgDefecto}","modelo_video":"${vidDefecto}"}]}}
Modelos disponibles: ${lista}.`;

      let msg;
      try {
        msg = await anthropic.messages.create({
          model: cfg().modeloEstratega, max_tokens: 3000, system: sistema,
          messages: [{ role: 'user', content: `Producto o servicio: ${producto}\nMercado: ${mercado}\nPúblico: ${publico || 'definelo tú'}\nFormato: ${formato}` }],
        });
      } catch (err) {
        log.error('[AI Studio] estratega', err.message);
        await devolver();
        return res.status(502).json({ error: 'El Estratega no está disponible ahora. Se te devolvió el crédito.' });
      }
      const texto = (msg.content || []).map((p) => p.text || '').join('');
      try {
        res.json(JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)));
      } catch {
        await devolver();
        res.status(502).json({ error: 'El Estratega devolvió una respuesta incompleta. Se te devolvió el crédito.' });
      }
    }));

    // Webhook de Higgsfield: solo un aviso; el estado real se consulta a la API.
    app.post('/api/ai/higgsfield/webhook/:token', (req, res) => {
      const t = cfg().webhookToken;
      const dado = Buffer.from(String(req.params.token));
      const esperado = Buffer.from(t);
      if (!t || dado.length !== esperado.length || !crypto.timingSafeEqual(dado, esperado)) return res.sendStatus(404);
      const id = req.body && req.body.request_id;
      res.json({ ok: true });
      if (typeof id === 'string' && RE_UUID.test(id)) {
        db.query(`SELECT g.id FROM ai_generaciones g JOIN ai_modelos m ON m.clave=g.modelo_clave
                  WHERE m.proveedor='higgsfield' AND g.proveedor_id=$1`, [id])
          .then(({ rows }) => rows[0] && refrescar(rows[0].id))
          .catch((e) => log.error('[AI Studio] webhook HF', e.message));
      }
    });

    // ── Galería de ejemplos (pública) ──
    const dirEjemplos = () => path.join(cfg().storageDir, '_ejemplos');
    const RE_EJEMPLO = /^[0-9a-f]{32}\.(jpg|png|webp|mp4)$/;
    const vistaEjemplo = (e) => ({
      id: e.id, titulo: e.titulo, descripcion: e.descripcion, categoria: e.categoria, tipo: e.tipo,
      url: `${cfg().apiUrl}/api/ai/ejemplo/${e.id}/archivo`,
      modelo: e.modelo_clave, modelo_nombre: e.modelo_nombre || null,
      prompt: e.prompt || null, parametros: e.parametros || {},
    });

    app.get('/api/ai/ejemplos', envolver(async (req, res) => {
      const { rows } = await db.query(
        `SELECT e.*, m.nombre AS modelo_nombre FROM ai_ejemplos e LEFT JOIN ai_modelos m ON m.clave=e.modelo_clave
         WHERE e.publicado ORDER BY e.orden, e.creado_en DESC LIMIT 60`);
      res.set('Cache-Control', 'public, max-age=300');
      res.json(rows.map(vistaEjemplo));
    }));

    app.get('/api/ai/ejemplo/:id/archivo', envolver(async (req, res) => {
      if (!RE_UUID.test(req.params.id)) return res.sendStatus(404);
      const { rows: [e] } = await db.query('SELECT archivo FROM ai_ejemplos WHERE id=$1 AND publicado', [req.params.id]);
      if (!e || !RE_EJEMPLO.test(e.archivo)) return res.sendStatus(404);
      const ruta = path.join(dirEjemplos(), e.archivo);
      if (!fs.existsSync(ruta)) return res.sendStatus(404);
      res.sendFile(ruta, { headers: { 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' } });
    }));

    // Catálogo público: qué modelos hay y desde cuánto, para la página de venta.
    app.get('/api/ai/catalogo', envolver(async (req, res) => {
      const c = cfg();
      const { rows } = await db.query(`SELECT * FROM ai_modelos WHERE activo ORDER BY orden, nombre`);
      const lista = rows.filter((m) => proveedores[m.proveedor] && proveedores[m.proveedor].configurado()).map((m) => {
        let desde = null;
        if (m.tarifa && m.tarifa.precios) {
          // El precio más bajo posible: combinación más barata y duración más corta.
          let seg = 1n;
          if (m.tarifa.por_segundo) {
            const ops = (m.parametros || {})[m.tarifa.por_segundo];
            seg = BigInt(Math.min(...(Array.isArray(ops) ? ops : [1]).map((x) => parseInt(x, 10)).filter((x) => x > 0)));
          }
          const extra = m.tarifa.extra ? usdAMicros(m.tarifa.extra) : 0n;
          const micros = Object.values(m.tarifa.precios).map((p) => usdAMicros(p) * seg + extra).sort((a, b) => (a < b ? -1 : 1))[0];
          const mult = m.multiplicador ? Math.max(1.1, Number(m.multiplicador)) : c.multiplicador;
          if (micros !== undefined) desde = precioCentavos(prov.microsAUsd(micros), mult, c.minimoCentavos);
        }
        const grupo = m.entradas && m.entradas.video ? 'genjutsu' : m.tipo;
        return { clave: m.clave, nombre: m.nombre, descripcion: m.descripcion, tipo: m.tipo, grupo, desde_centavos: desde };
      });
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ modelos: lista, paquetes: c.paquetes, estratega_centavos: c.estrategaCentavos });
    }));

    // ── Admin ──
    const soloFinanzas = async (req, res) => {
      if (await checkPermiso(req.user.id, 'puede_ver_finanzas')) return true;
      res.status(403).json({ error: 'Sin permiso' });
      return false;
    };

    app.get('/api/admin/ai/resumen', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      const dias = Math.min(365, Math.max(1, parseInt(req.query.dias, 10) || 30));
      const { rows: [t] } = await db.query(
        `SELECT COALESCE(SUM(monto_centavos) FILTER (WHERE tipo='recarga'),0)::bigint AS recargas,
                COALESCE(-SUM(monto_centavos) FILTER (WHERE tipo='contracargo'),0)::bigint AS contracargos
         FROM ai_movimientos WHERE creado_en > NOW() - ($1 || ' days')::interval`, [dias]);
      const { rows: porModelo } = await db.query(
        `SELECT g.modelo_clave AS modelo, m.proveedor, COUNT(*)::int AS generaciones,
                SUM(g.precio_centavos)::bigint AS ingreso_centavos, CEIL(SUM(g.costo_usd) * 100)::bigint AS costo_centavos
         FROM ai_generaciones g JOIN ai_modelos m ON m.clave=g.modelo_clave
         WHERE g.estado='completado' AND g.creado_en > NOW() - ($1 || ' days')::interval
         GROUP BY g.modelo_clave, m.proveedor ORDER BY ingreso_centavos DESC`, [dias]);
      const { rows: [s] } = await db.query(
        `SELECT COALESCE(SUM(saldo_centavos),0)::bigint AS saldo_clientes, COUNT(*) FILTER (WHERE congelada)::int AS congeladas FROM ai_billeteras`);
      const { rows: [ab] } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE estado IN ('pendiente','en_cola','en_proceso'))::int AS abiertas,
                COUNT(*) FILTER (WHERE estado='revision')::int AS revision FROM ai_generaciones`);
      const ingreso = porModelo.reduce((x, m) => x + Number(m.ingreso_centavos), 0);
      const costo = porModelo.reduce((x, m) => x + Number(m.costo_centavos), 0);
      res.json({
        dias, recargas_centavos: Number(t.recargas), contracargos_centavos: Number(t.contracargos),
        ingreso_generaciones_centavos: ingreso, costo_proveedores_centavos: costo, ganancia_bruta_centavos: ingreso - costo,
        // Dinero cobrado que todavía se le debe al cliente en generaciones. No es ganancia.
        saldo_pendiente_clientes_centavos: Number(s.saldo_clientes),
        billeteras_congeladas: s.congeladas, generaciones_abiertas: ab.abiertas, generaciones_en_revision: ab.revision,
        por_modelo: porModelo.map((m) => ({ ...m, ingreso_centavos: Number(m.ingreso_centavos), costo_centavos: Number(m.costo_centavos) })),
      });
    }));

    app.get('/api/admin/ai/revision', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      const { rows } = await db.query(
        `SELECT g.id, g.modelo_clave, m.proveedor, g.precio_centavos, g.costo_usd, g.creado_en, g.intentos_envio, g.proveedor_id, u.email
         FROM ai_generaciones g JOIN usuarios u ON u.id=g.usuario_id JOIN ai_modelos m ON m.clave=g.modelo_clave
         WHERE g.estado='revision' ORDER BY g.creado_en`);
      res.json(rows);
    }));

    //  { "accion": "reembolsar" }                        → no se generó: devolver el crédito
    //  { "accion": "vincular", "proveedor_id": "..." }   → sí se generó: recuperarla
    //  { "accion": "cerrar" }                            → se cobró y no hay nada que recuperar
    app.put('/api/admin/ai/generaciones/:id/resolver', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      const { accion } = req.body;
      const idProv = String(req.body.proveedor_id || '');
      const r = await enTransaccion(async (q) => {
        const { rows: [g] } = await q.query('SELECT * FROM ai_generaciones WHERE id=$1 FOR UPDATE', [req.params.id]);
        if (!g || g.estado !== 'revision') return { error: 'No está en revisión' };
        if (accion === 'reembolsar') {
          await q.query(`UPDATE ai_generaciones SET estado='fallido', error=$1, actualizado_en=NOW() WHERE id=$2`, ['No se completó. Se te devolvió el crédito.', g.id]);
          await mover(q, g.usuario_id, Number(g.precio_centavos), 'reembolso', { generacionId: g.id, nota: 'revisión' });
          return { ok: true };
        }
        if (accion === 'vincular' && /^[\w./-]{1,200}$/.test(idProv)) {
          await q.query(`UPDATE ai_generaciones SET estado='en_cola', proveedor_id=$1, error=NULL, terminado_en=NULL,
            actualizado_en=NOW() - INTERVAL '2 minutes' WHERE id=$2`, [idProv, g.id]);
          return { ok: true, recuperar: g.id };
        }
        if (accion === 'cerrar') {
          await q.query(`UPDATE ai_generaciones SET estado='fallido', error=$1, actualizado_en=NOW() WHERE id=$2`, ['No se pudo completar.', g.id]);
          return { ok: true };
        }
        return { error: 'Acción no válida' };
      });
      if (r.error) return res.status(400).json(r);
      if (r.recuperar) await refrescar(r.recuperar).catch(() => {});
      res.json({ ok: true });
    }));

    // Publicar como ejemplo una creación PROPIA (nunca la de un cliente:
    // su contenido no se publica sin su permiso).
    app.post('/api/admin/ai/ejemplos', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      const genId = String(req.body.generacion_id || '');
      const n = Math.max(0, parseInt(req.body.n, 10) || 0);
      const titulo = String(req.body.titulo || '').trim().slice(0, 120);
      if (!RE_UUID.test(genId) || !titulo) return res.status(400).json({ error: 'Falta la generación o el título.' });
      const { rows: [g] } = await db.query(
        `SELECT * FROM ai_generaciones WHERE id=$1 AND usuario_id=$2 AND estado='completado'`, [genId, req.user.id]);
      const a = g && g.archivos && g.archivos[n];
      if (!a) return res.status(404).json({ error: 'Solo puedes publicar tus propias creaciones completadas.' });
      const ext = a.nombre.split('.').pop();
      const nombre = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
      await fs.promises.mkdir(dirEjemplos(), { recursive: true });
      await fs.promises.copyFile(path.join(dirUsuario(req.user.id), a.nombre), path.join(dirEjemplos(), nombre));
      // Los parámetros sirven para "Crear algo así"; los archivos de entrada no se publican.
      const { prompt, imagenes, video, ...parametros } = g.entrada || {};
      const { rows: [e] } = await db.query(
        `INSERT INTO ai_ejemplos (titulo, descripcion, categoria, tipo, archivo, modelo_clave, prompt, parametros, generacion_id, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [titulo, String(req.body.descripcion || '').trim().slice(0, 300) || null,
         String(req.body.categoria || '').trim().slice(0, 40) || null, a.tipo, nombre, g.modelo_clave,
         req.body.mostrar_prompt === false ? null : prompt, JSON.stringify(parametros), g.id,
         parseInt(req.body.orden, 10) || 100]);
      res.status(201).json(vistaEjemplo(e));
    }));

    app.get('/api/admin/ai/ejemplos', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      const { rows } = await db.query(`SELECT e.*, m.nombre AS modelo_nombre FROM ai_ejemplos e
        LEFT JOIN ai_modelos m ON m.clave=e.modelo_clave ORDER BY e.orden, e.creado_en DESC`);
      res.json(rows.map((e) => ({ ...vistaEjemplo(e), publicado: e.publicado, orden: e.orden })));
    }));

    app.put('/api/admin/ai/ejemplos/:id', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      if (!RE_UUID.test(req.params.id)) return res.sendStatus(404);
      const b = req.body;
      const { rowCount } = await db.query(
        `UPDATE ai_ejemplos SET titulo=COALESCE($1, titulo), descripcion=COALESCE($2, descripcion),
           categoria=COALESCE($3, categoria), publicado=COALESCE($4, publicado), orden=COALESCE($5, orden) WHERE id=$6`,
        [typeof b.titulo === 'string' && b.titulo.trim() ? b.titulo.trim().slice(0, 120) : null,
         typeof b.descripcion === 'string' ? b.descripcion.trim().slice(0, 300) : null,
         typeof b.categoria === 'string' ? b.categoria.trim().slice(0, 40) : null,
         typeof b.publicado === 'boolean' ? b.publicado : null,
         Number.isFinite(parseInt(b.orden, 10)) ? parseInt(b.orden, 10) : null, req.params.id]);
      if (!rowCount) return res.sendStatus(404);
      res.json({ ok: true });
    }));

    app.delete('/api/admin/ai/ejemplos/:id', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      if (!RE_UUID.test(req.params.id)) return res.sendStatus(404);
      const { rows: [e] } = await db.query('DELETE FROM ai_ejemplos WHERE id=$1 RETURNING archivo', [req.params.id]);
      if (!e) return res.sendStatus(404);
      if (RE_EJEMPLO.test(e.archivo)) await fs.promises.unlink(path.join(dirEjemplos(), e.archivo)).catch(() => {});
      res.json({ ok: true });
    }));

    app.put('/api/admin/ai/billeteras/:uid/descongelar', authMiddleware, envolver(async (req, res) => {
      if (!(await soloFinanzas(req, res))) return;
      await db.query('UPDATE ai_billeteras SET congelada=false, motivo_congelada=NULL WHERE usuario_id=$1', [req.params.uid]);
      res.json({ ok: true });
    }));
  }

  function iniciarReconciliador(cadaMs = 45000) {
    const t = setInterval(reconciliar, cadaMs);
    if (t.unref) t.unref();
    return t;
  }

  return {
    montarWebhookStripe, montar, iniciarReconciliador,
    reconciliar, refrescar, procesarEventoStripe, terminar, enviarGeneracion,
  };
}

module.exports = { crearStudio, precioCentavos, usdAMicros, validarEntrada, detectarArchivo, ErrorProv };
