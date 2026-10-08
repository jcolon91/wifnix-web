/* ══════════════════════════════════════════════════════════════
   WIFNIX AI STUDIO — anuncios con IA, pagados con créditos

   El cliente recarga créditos con Stripe (el dinero cae en la cuenta
   de Wifnix), y cada imagen o video que genera se descuenta de su
   saldo. Higgsfield es el motor interno; el cliente nunca lo ve ni
   toca la llave.

   Las reglas que sostienen el negocio, en orden de importancia:

   1. NUNCA SE VENDE BAJO COSTO. Antes de cada generación se le pide
      a Higgsfield el costo exacto (/estimate). Si no contesta, no se
      genera: no se adivina un precio. El precio al cliente es
      costo × multiplicador, redondeado hacia arriba, con un mínimo.
      La base de datos además rechaza cualquier fila con precio menor
      que el costo (constraint ai_gen_nunca_bajo_costo).

   2. SE COBRA ANTES, SE DEVUELVE SI FALLA. El saldo se descuenta en
      la misma transacción que crea la generación, con la billetera
      bloqueada (FOR UPDATE), así que dos pestañas no pueden gastar
      el mismo dólar. Si Higgsfield falla, la rechaza por contenido o
      no la acepta, el cliente recibe su dinero de vuelta. Higgsfield
      tampoco le cobra a Wifnix las fallidas, así que nadie pierde.

   3. NADA SE COBRA NI SE ACREDITA DOS VECES. Stripe y Higgsfield
      reintentan webhooks. Índices únicos en ai_movimientos hacen que
      la misma sesión de Stripe acredite una sola vez, y que cada
      generación tenga como máximo un cargo y un reembolso. El id de
      la generación viaja como Idempotency-Key a Higgsfield, así que
      reintentar un envío cortado no genera (ni cobra) dos veces.

   4. EL WEBHOOK DE HIGGSFIELD NO SE CREE. Higgsfield no firma sus
      webhooks. Se usa solo como aviso: el resultado real se consulta
      siempre al endpoint autenticado de estado.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

// ── Configuración (se lee al usarse, no al cargar el módulo,
//    porque dotenv corre después del require en server.js) ──────

// Un valor mal escrito en el .env no puede apagar una protección:
// si no es un número válido, se usa el valor por defecto.
function entero(v, defecto, minimo) {
  const n = parseInt(v, 10);
  return Math.max(minimo, Number.isFinite(n) ? n : defecto);
}

function cfg() {
  const e = process.env;
  const mult = parseFloat(e.AI_MULTIPLICADOR || '2');
  return {
    hfUrl: (e.HF_API_URL || 'https://api.higgsfield.ai').replace(/\/+$/, ''),
    hfCred: e.HF_CREDENTIALS || '',
    // Nunca menos de 1.10: por debajo, la comisión de Stripe (~3% + 30¢)
    // y el redondeo se comen la ganancia.
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
  };
}

const ESTADOS_ABIERTOS = ['pendiente', 'en_cola', 'en_proceso'];
const ESTADOS_REEMBOLSO = ['fallido', 'nsfw', 'cancelado'];
const MAPA_ESTADO = {
  queued: 'en_cola', in_progress: 'en_proceso', completed: 'completado',
  failed: 'fallido', nsfw: 'nsfw', canceled: 'cancelado',
};
const MAX_INTENTOS_ENVIO = 5;

// ── Dinero: aritmética entera, sin floats ─────────────────────

// "0.094" → 94000 micro-dólares. Higgsfield devuelve el costo como
// texto decimal; convertirlo con parseFloat metería error de redondeo.
function usdAMicros(usd) {
  const s = String(usd).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Costo inválido: ' + s);
  const [ent, dec = ''] = s.split('.');
  return BigInt(ent) * 1000000n + BigInt((dec + '000000').slice(0, 6))
    + (dec.length > 6 && /[1-9]/.test(dec.slice(6)) ? 1n : 0n); // redondea hacia arriba
}

// Precio al cliente en centavos: ceil(costo × multiplicador), con mínimo.
function precioCentavos(costoUsd, multiplicador, minimo) {
  const micros = usdAMicros(costoUsd);
  const multBp = BigInt(Math.round(multiplicador * 100)); // 2.00 → 200
  const num = micros * multBp;            // micro-dólares × 100
  const den = 10000n * 100n;              // a centavos y quita el ×100
  let cent = num / den + (num % den ? 1n : 0n);
  const costoCent = micros / 10000n + (micros % 10000n ? 1n : 0n);
  if (cent < costoCent) cent = costoCent;  // imposible con mult ≥ 1.1, pero por si acaso
  if (cent < BigInt(minimo)) cent = BigInt(minimo);
  return Number(cent);
}

// ── Higgsfield ────────────────────────────────────────────────

class ErrorHF extends Error {
  constructor(status, detalle) {
    super(`Higgsfield ${status}: ${detalle}`);
    this.status = status;
    this.detalle = detalle;
  }
}

function crearClienteHF(fetchImpl) {
  async function llamar(metodo, ruta, cuerpo, { idempotencia, webhook } = {}) {
    const c = cfg();
    if (!c.hfCred.includes(':')) throw new ErrorHF(0, 'HF_CREDENTIALS no configurado');
    let url = `${c.hfUrl}/${ruta.replace(/^\/+/, '')}`;
    if (webhook) url += `?hf_webhook=${encodeURIComponent(webhook)}`;
    const headers = { Authorization: `Key ${c.hfCred}`, Accept: 'application/json' };
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencia) headers['Idempotency-Key'] = idempotencia;
    let r;
    try {
      r = await fetchImpl(url, {
        method: metodo, headers,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      throw new ErrorHF(-1, 'Sin respuesta: ' + err.message); // red o timeout: ambiguo
    }
    const texto = await r.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = null; }
    if (!r.ok) {
      const det = datos && datos.detail
        ? (typeof datos.detail === 'string' ? datos.detail : JSON.stringify(datos.detail))
        : texto.slice(0, 300);
      throw new ErrorHF(r.status, det);
    }
    return datos;
  }

  return {
    async estimar(ruta, entrada) {
      const d = await llamar('POST', `estimate/${ruta}`, entrada);
      if (!d || d.usd === undefined || d.usd === null) throw new ErrorHF(0, 'Estimado sin usd');
      return String(d.usd);
    },
    enviar(ruta, entrada, idempotencia, webhook) {
      return llamar('POST', ruta, entrada, { idempotencia, webhook });
    },
    estado(requestId) {
      return llamar('GET', `requests/${encodeURIComponent(requestId)}/status`);
    },
    async subir(buffer, contentType) {
      const d = await llamar('POST', 'files/generate-upload-url', { content_type: contentType });
      // A la URL prefirmada NO se le mandan las credenciales de Higgsfield.
      let r;
      try {
        r = await fetchImpl(d.upload_url, {
          method: 'PUT', headers: d.upload_headers || { 'Content-Type': contentType },
          body: buffer, signal: AbortSignal.timeout(60000),
        });
      } catch (err) { throw new ErrorHF(-1, 'Subida sin respuesta: ' + err.message); }
      if (!r.ok) throw new ErrorHF(r.status, 'Subida rechazada');
      return d.public_url;
    },
  };
}

// Qué hacer con cada error de Higgsfield al ENVIAR una generación.
//  'reintentar' → se queda pendiente y el reconciliador lo reintenta
//                 con el mismo Idempotency-Key (no cobra doble).
//  'reembolsar' → no va a funcionar; se le devuelve el dinero al cliente.
function decidirError(err) {
  if (err.status === -1 || err.status >= 500 || err.status === 423) return 'reintentar';
  if (err.status === 400 && /concurren/i.test(err.detalle || '')) return 'reintentar';
  return 'reembolsar';
}

// ── Validación de lo que manda el cliente ─────────────────────

function validarEntrada(modelo, cuerpo) {
  const prompt = typeof cuerpo.prompt === 'string' ? cuerpo.prompt.trim() : '';
  if (prompt.length < 3) return { error: 'Escribe qué quieres generar.' };
  if (prompt.length > 2500) return { error: 'La descripción es muy larga (máximo 2,500 caracteres).' };
  const entrada = { prompt };

  if (modelo.requiere_imagen) {
    const u = typeof cuerpo.image_url === 'string' ? cuerpo.image_url.trim() : '';
    if (!/^https:\/\/[^\s]+$/i.test(u) || u.length > 2000) {
      return { error: 'Este modelo necesita una imagen de inicio. Súbela primero.' };
    }
    entrada.image_url = u;
  }

  // Solo pasan los parámetros que el modelo declara, con valores válidos.
  for (const [clave, regla] of Object.entries(modelo.parametros || {})) {
    if (cuerpo[clave] === undefined || cuerpo[clave] === null || cuerpo[clave] === '') {
      if (Array.isArray(regla)) entrada[clave] = regla[0]; // valor por defecto: el primero
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
  return { entrada };
}

// Bytes mágicos: no se confía en el mimetype que manda el navegador.
function detectarImagen(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF'
    && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// ── El módulo ─────────────────────────────────────────────────

function crearStudio(deps) {
  const { db, stripe, anthropic, sendEmail, checkPermiso } = deps;
  const hf = deps.hf || crearClienteHF(deps.fetch || globalThis.fetch);
  const fetchArchivos = deps.fetch || globalThis.fetch;
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

  // Mueve dinero en la billetera y lo anota en el libro mayor.
  // Debe llamarse dentro de una transacción. Si el movimiento ya se
  // había hecho (mismo stripe_ref o misma generación+tipo), no hace
  // nada y devuelve null: así los reintentos de webhooks son inofensivos.
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
    // Si despues < 0 el CHECK de la tabla aborta la transacción entera.
    await q.query('UPDATE ai_billeteras SET saldo_centavos=$1, actualizado_en=NOW() WHERE usuario_id=$2',
      [despues, uid]);
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

  async function modeloActivo(clave) {
    const { rows } = await db.query('SELECT * FROM ai_modelos WHERE clave=$1 AND activo', [String(clave || '')]);
    return rows[0] || null;
  }

  async function cotizar(modelo, entrada) {
    const c = cfg();
    const costoUsd = await hf.estimar(modelo.ruta, entrada);
    const mult = modelo.multiplicador ? Math.max(1.1, Number(modelo.multiplicador)) : c.multiplicador;
    const precio = precioCentavos(costoUsd, mult, c.minimoCentavos);
    return { costoUsd, precio };
  }

  function urlWebhookHF() {
    const c = cfg();
    return c.webhookToken ? `${c.apiUrl}/api/ai/higgsfield/webhook/${c.webhookToken}` : undefined;
  }

  // Intenta mandar a Higgsfield una generación ya cobrada.
  async function enviarGeneracion(gen) {
    // Reserva: solo un proceso a la vez puede mandar esta generación.
    // Sin esto, /generar y el reconciliador podían enviarla en paralelo.
    const { rows: [g] } = await db.query(
      `UPDATE ai_generaciones
         SET enviando_hasta = NOW() + INTERVAL '90 seconds', intentos_envio = intentos_envio + 1, actualizado_en = NOW()
       WHERE id=$1 AND estado='pendiente' AND hf_request_id IS NULL
         AND (enviando_hasta IS NULL OR enviando_hasta < NOW())
       RETURNING *`, [gen.id]);
    if (!g) return 'ocupado';
    const { rows: [modelo] } = await db.query('SELECT * FROM ai_modelos WHERE clave=$1', [g.modelo_clave]);

    let r;
    try {
      r = await hf.enviar(modelo.ruta, g.entrada, g.id, urlWebhookHF());
      if (!r || !r.request_id) throw new ErrorHF(-1, 'Respuesta sin request_id');
    } catch (err) {
      if (!(err instanceof ErrorHF)) {
        await db.query('UPDATE ai_generaciones SET enviando_hasta=NULL WHERE id=$1', [g.id]);
        throw err;
      }
      return manejarErrorEnvio(g, err);
    }

    await db.query(
      `UPDATE ai_generaciones SET hf_request_id=$1, estado=$2, enviando_hasta=NULL, actualizado_en=NOW()
       WHERE id=$3 AND estado='pendiente'`,
      [r.request_id, MAPA_ESTADO[r.status] || 'en_cola', g.id]);
    // Fuera del try: si consultar el estado falla, NO es motivo de
    // reembolso (ya está en Higgsfield). El reconciliador lo reintenta.
    if (['completed', 'failed', 'nsfw', 'canceled'].includes(r.status)) {
      await refrescar(r.request_id).catch((e) => log.error('[AI Studio] estado inicial', e.message));
    }
    return 'enviado';
  }

  async function manejarErrorEnvio(g, err) {
    // Sin respuesta o error 500: Higgsfield pudo haberla aceptado y cobrado.
    // 503 y 423 son rechazos claros (modelo pausado): no son ambiguos.
    const ambiguo = err.status === -1 || (err.status >= 500 && err.status !== 503);
    if (decidirError(err) === 'reintentar' && g.intentos_envio < MAX_INTENTOS_ENVIO) {
      log.warn('[AI Studio] envío a reintentar', g.id, err.message);
      await db.query(
        `UPDATE ai_generaciones SET enviando_hasta=NULL, envio_ambiguo = envio_ambiguo OR $2, actualizado_en=NOW()
         WHERE id=$1`, [g.id, ambiguo]);
      return 'reintentar';
    }
    if (g.envio_ambiguo || ambiguo) {
      // Nunca se reembolsa sola: si Higgsfield cobró, Wifnix perdería.
      await terminar(g.id, 'revision', {
        error: 'Estamos verificando esta generación. Si no se completó, se te devuelve el crédito.' });
      await alertar('Generación en revisión: verifica en console.higgsfield.ai',
        `Generación ${g.id} (${g.modelo_clave}). Último error: ${err.message}. Resuélvela con PUT /api/admin/ai/generaciones/${g.id}/resolver`);
      return 'revision';
    }
    if (err.status === 403) await alertar('Saldo de Higgsfield agotado: recarga en console.higgsfield.ai', err.message);
    if (err.status === 401 || err.status === 0) await alertar('Credenciales de Higgsfield inválidas', err.message);
    await terminar(g.id, 'fallido', { error: mensajeCliente(err) });
    return 'reembolsado';
  }

  function mensajeCliente(err) {
    if (err.status === 422 || err.status === 400) return 'El modelo rechazó los parámetros. No se te cobró.';
    if (err.status === 403 || err.status === 401 || err.status === 0) return 'El servicio no está disponible ahora mismo. No se te cobró.';
    if (err.status === 423 || err.status === 503) return 'Ese modelo está pausado temporalmente. No se te cobró.';
    return 'No se pudo completar. No se te cobró.';
  }

  // Cierra una generación. Idempotente: si ya estaba cerrada no hace nada.
  // Si terminó mal, devuelve el dinero en la misma transacción.
  async function terminar(genId, estado, { salida = null, error = null } = {}) {
    const cerrada = await enTransaccion(async (q) => {
      const { rows: [g] } = await q.query('SELECT * FROM ai_generaciones WHERE id=$1 FOR UPDATE', [genId]);
      if (!g || !ESTADOS_ABIERTOS.includes(g.estado)) return null;
      const terminal = !ESTADOS_ABIERTOS.includes(estado);
      await q.query(
        `UPDATE ai_generaciones SET estado=$1, salida=COALESCE($2, salida), error=$3,
         actualizado_en=NOW(), terminado_en=CASE WHEN $4 THEN NOW() ELSE NULL END WHERE id=$5`,
        [estado, salida ? JSON.stringify(salida) : null, error, terminal, genId]);
      if (ESTADOS_REEMBOLSO.includes(estado)) {
        await mover(q, g.usuario_id, Number(g.precio_centavos), 'reembolso',
          { generacionId: g.id, nota: estado });
      }
      return { ...g, estado };
    });
    if (cerrada && estado === 'completado') guardarArchivos(genId).catch((e) => log.error('[AI Studio] guardar', e.message));
    return cerrada;
  }

  // Pregunta a Higgsfield cómo va una generación y actualiza la nuestra.
  async function refrescar(requestId) {
    const { rows: [g] } = await db.query('SELECT id, estado FROM ai_generaciones WHERE hf_request_id=$1', [requestId]);
    if (!g || !ESTADOS_ABIERTOS.includes(g.estado)) return;
    const s = await hf.estado(requestId);
    const estado = MAPA_ESTADO[s.status];
    if (!estado) return;
    if (estado === 'completado') {
      const salida = { images: s.images || [], video: s.video || null, audio: s.audio || null };
      return terminar(g.id, 'completado', { salida });
    }
    if (ESTADOS_REEMBOLSO.includes(estado)) {
      const msg = estado === 'nsfw'
        ? 'El contenido fue rechazado por moderación. Se te devolvió el crédito.'
        : 'La generación falló. Se te devolvió el crédito.';
      return terminar(g.id, estado, { error: msg });
    }
    if (estado !== g.estado) {
      await db.query(`UPDATE ai_generaciones SET estado=$1, actualizado_en=NOW()
        WHERE id=$2 AND estado = ANY($3)`, [estado, g.id, ESTADOS_ABIERTOS]);
    }
  }

  // Higgsfield borra los archivos a los 7 días: se copian al VPS.
  async function guardarArchivos(genId) {
    const { rows: [g] } = await db.query('SELECT * FROM ai_generaciones WHERE id=$1', [genId]);
    if (!g || g.estado !== 'completado' || g.archivos || !g.salida) return;
    const urls = [];
    for (const im of g.salida.images || []) if (im && im.url) urls.push({ url: im.url, tipo: 'imagen' });
    if (g.salida.video && g.salida.video.url) urls.push({ url: g.salida.video.url, tipo: 'video' });
    const dir = path.join(cfg().storageDir, g.usuario_id);
    await fs.promises.mkdir(dir, { recursive: true });
    const archivos = [];
    for (let i = 0; i < urls.length; i++) {
      const r = await fetchArchivos(urls[i].url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error('Descarga ' + r.status);
      const ct = (r.headers.get('content-type') || '').split(';')[0];
      const ext = { 'video/mp4': 'mp4', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[ct]
        || (urls[i].tipo === 'video' ? 'mp4' : 'png');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 300 * 1024 * 1024) throw new Error('Archivo demasiado grande');
      const nombre = `${g.id}-${i}.${ext}`;
      await fs.promises.writeFile(path.join(dir, nombre), buf);
      archivos.push({ nombre, tipo: urls[i].tipo, bytes: buf.length });
    }
    await db.query('UPDATE ai_generaciones SET archivos=$1 WHERE id=$2 AND archivos IS NULL',
      [JSON.stringify(archivos), g.id]);
  }

  // Enlaces firmados de 2 horas para ver/descargar sin poner el JWT en la URL.
  function firmar(genId, n, exp) {
    if (!cfg().firma || cfg().firma.length < 32) throw new Error('AI_FIRMA_SECRET no configurado (mínimo 32 caracteres)');
    return crypto.createHmac('sha256', cfg().firma).update(`${genId}:${n}:${exp}`).digest('base64url');
  }
  function enlaceArchivo(genId, n) {
    const exp = Math.floor(Date.now() / 1000) + 7200;
    return `${cfg().apiUrl}/api/ai/archivo/${genId}/${n}?exp=${exp}&sig=${firmar(genId, n, exp)}`;
  }

  function vistaGeneracion(g) {
    const archivos = (g.archivos || []).map((a, n) => ({ tipo: a.tipo, url: enlaceArchivo(g.id, n) }));
    // Mientras se copian al VPS, se enseñan los enlaces originales.
    if (!archivos.length && g.salida) {
      for (const im of g.salida.images || []) if (im && im.url) archivos.push({ tipo: 'imagen', url: im.url });
      if (g.salida.video && g.salida.video.url) archivos.push({ tipo: 'video', url: g.salida.video.url });
    }
    return {
      id: g.id, modelo: g.modelo_clave, estado: g.estado,
      prompt: g.entrada && g.entrada.prompt, precio_centavos: Number(g.precio_centavos),
      error: g.error, archivos, creado_en: g.creado_en, terminado_en: g.terminado_en,
    };
  }

  // ── Reconciliador: lo que se quedó a medias se arregla solo ──
  let corriendo = false;
  async function reconciliar() {
    if (corriendo) return;
    corriendo = true;
    // El candado y su liberación tienen que ir por la MISMA conexión:
    // con el pool cada query puede caer en una distinta y el candado
    // quedaría tomado para siempre.
    let conexion;
    try {
      conexion = await db.connect();
      const { rows: [l] } = await conexion.query('SELECT pg_try_advisory_lock(717171) AS ok');
      if (!l.ok) return;
      try {
        // 1. Cobradas que nunca llegaron a Higgsfield.
        const { rows: pend } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado='pendiente' AND hf_request_id IS NULL
           AND actualizado_en < NOW() - INTERVAL '20 seconds'
           AND (enviando_hasta IS NULL OR enviando_hasta < NOW()) ORDER BY creado_en LIMIT 20`);
        for (const g of pend) await enviarGeneracion(g).catch((e) => log.error('[AI Studio] reenviar', e.message));
        // 2. En Higgsfield, sin noticias en un minuto (webhook perdido).
        const { rows: abiertas } = await db.query(
          `SELECT hf_request_id FROM ai_generaciones WHERE estado IN ('pendiente','en_cola','en_proceso')
           AND hf_request_id IS NOT NULL AND actualizado_en < NOW() - INTERVAL '60 seconds' LIMIT 50`);
        for (const a of abiertas) await refrescar(a.hf_request_id).catch((e) => log.error('[AI Studio] estado', e.message));
        // 3. Abiertas por más de 3 horas: algo raro pasó. A revisión,
        //    sin reembolso automático (Higgsfield pudo haber cobrado).
        const { rows: viejas } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado IN ('pendiente','en_cola','en_proceso')
           AND creado_en < NOW() - INTERVAL '3 hours' LIMIT 20`);
        for (const v of viejas) {
          if (await terminar(v.id, 'revision', { error: 'Estamos verificando esta generación. Si no se completó, se te devuelve el crédito.' })) {
            await alertar('Generación atascada pasó a revisión', `Generación ${v.id}`);
          }
        }
        // 4. Completadas cuyos archivos no se pudieron copiar.
        const { rows: sinCopia } = await db.query(
          `SELECT id FROM ai_generaciones WHERE estado='completado' AND archivos IS NULL
           AND terminado_en > NOW() - INTERVAL '6 days' LIMIT 10`);
        for (const c of sinCopia) await guardarArchivos(c.id).catch((e) => log.error('[AI Studio] copiar', e.message));
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

  // ── Stripe ──────────────────────────────────────────────────

  async function procesarEventoStripe(event) {
    const o = event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (!o.metadata || o.metadata.tipo !== 'ai_creditos' || o.payment_status !== 'paid') return 'ignorado';
      const uid = o.client_reference_id || o.metadata.usuario_id;
      const centavos = Number(o.amount_total); // lo que de verdad cobró Stripe, no lo que diga metadata
      if (!uid || !(centavos > 0)) return 'ignorado';
      const r = await enTransaccion((q) => mover(q, uid, centavos, 'recarga',
        { stripeRef: o.id, nota: 'Stripe Checkout' }));
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
          const { rows: [b] } = await q.query(
            'SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1 FOR UPDATE', [uid]);
          const saldo = Number(b.saldo_centavos);
          const quitar = Math.min(saldo, rf.amount);
          const hecho = await mover(q, uid, -quitar, 'contracargo',
            { stripeRef: rf.id, nota: `Reembolso Stripe ${rf.amount}¢` });
          // Ya gastó parte de lo reembolsado: se congela para revisión.
          if (hecho !== null && quitar < rf.amount) {
            await q.query(`UPDATE ai_billeteras SET congelada=true, motivo_congelada=$1 WHERE usuario_id=$2`,
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

  // Va ANTES de express.json() en server.js: Stripe firma el cuerpo
  // crudo, y si json() lo parsea primero la firma ya no se puede verificar.
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
        res.sendStatus(500); // Stripe reintenta; los índices únicos evitan duplicar
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
    const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

    async function billeteraDe(uid) {
      await asegurarBilletera(db, uid);
      const { rows: [b] } = await db.query('SELECT * FROM ai_billeteras WHERE usuario_id=$1', [uid]);
      return b;
    }

    // Lo que toda ruta de uso exige: términos aceptados y billetera activa.
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

    app.get('/api/ai/estado', authMiddleware, envolver(async (req, res) => {
      const b = await billeteraDe(req.user.id);
      const c = cfg();
      res.json({
        saldo_centavos: Number(b.saldo_centavos),
        acepto_terminos: !!b.acepto_terminos_en,
        congelada: b.congelada,
        paquetes: c.paquetes,
        disponible: !!(c.hfCred && stripe),
      });
    }));

    app.post('/api/ai/terminos', authMiddleware, envolver(async (req, res) => {
      if (req.body.acepto !== true) return res.status(400).json({ error: 'Debes aceptar los términos.' });
      await asegurarBilletera(db, req.user.id);
      await db.query('UPDATE ai_billeteras SET acepto_terminos_en=COALESCE(acepto_terminos_en, NOW()) WHERE usuario_id=$1',
        [req.user.id]);
      res.json({ ok: true });
    }));

    app.get('/api/ai/modelos', authMiddleware, envolver(async (req, res) => {
      const { rows } = await db.query(
        `SELECT clave, nombre, descripcion, tipo, requiere_imagen, parametros
         FROM ai_modelos WHERE activo ORDER BY orden, nombre`);
      res.json(rows); // la ruta de Higgsfield no sale del servidor
    }));

    app.post('/api/ai/creditos/checkout', authMiddleware, porUsuario(10, 15), envolver(async (req, res) => {
      if (!stripe) return res.status(503).json({ error: 'Pagos no disponibles' });
      if (!(await exigirActivo(req, res))) return;
      const monto = parseInt(req.body.monto, 10);
      if (!cfg().paquetes.includes(monto)) return res.status(400).json({ error: 'Paquete no válido' });
      const c = cfg();
      const meta = { tipo: 'ai_creditos', usuario_id: req.user.id };
      const s = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd', unit_amount: monto * 100,
            product_data: { name: `Créditos Wifnix AI Studio · $${monto}` },
          },
        }],
        customer_email: req.user.email,
        client_reference_id: req.user.id,
        metadata: meta,
        payment_intent_data: { metadata: meta, description: `Wifnix AI Studio · créditos $${monto}` },
        success_url: `${c.studioUrl}?recarga=ok`,
        cancel_url: `${c.studioUrl}?recarga=cancelada`,
      });
      res.json({ url: s.url });
    }));

    const recibirImagen = (req, res, next) => subida.single('imagen')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La imagen pasa de 10 MB.' : 'No se pudo leer la imagen.' });
      next();
    });

    app.post('/api/ai/subir', authMiddleware, porUsuario(40, 15), recibirImagen, envolver(async (req, res) => {
      if (!(await exigirActivo(req, res))) return;
      if (!req.file) return res.status(400).json({ error: 'No se recibió la imagen' });
      const tipo = detectarImagen(req.file.buffer);
      if (!tipo) return res.status(400).json({ error: 'Solo JPG, PNG o WEBP' });
      try {
        res.json({ url: await hf.subir(req.file.buffer, tipo) });
      } catch (err) {
        if (!(err instanceof ErrorHF)) throw err;
        log.error('[AI Studio] subir', err.message);
        res.status(502).json({ error: 'No se pudo subir la imagen. Intenta otra vez.' });
      }
    }));

    // Cotizar: el cliente ve el precio exacto antes de gastar.
    app.post('/api/ai/cotizar', authMiddleware, porUsuario(60, 15), envolver(async (req, res) => {
      const modelo = await modeloActivo(req.body.modelo);
      if (!modelo) return res.status(404).json({ error: 'Modelo no disponible' });
      const v = validarEntrada(modelo, req.body);
      if (v.error) return res.status(400).json({ error: v.error });
      try {
        const { precio } = await cotizar(modelo, v.entrada);
        if (precio > cfg().maximoCentavos) return res.status(400).json({ error: 'Esta configuración excede el máximo por generación.' });
        res.json({ precio_centavos: precio });
      } catch (err) {
        if (!(err instanceof ErrorHF)) throw err;
        log.error('[AI Studio] cotizar', err.message);
        res.status(502).json({ error: 'No se pudo calcular el precio ahora. Intenta en un momento.' });
      }
    }));

    app.post('/api/ai/generar', authMiddleware, porUsuario(30, 15), envolver(async (req, res) => {
      if (!(await exigirActivo(req, res))) return;
      const modelo = await modeloActivo(req.body.modelo);
      if (!modelo) return res.status(404).json({ error: 'Modelo no disponible' });
      const v = validarEntrada(modelo, req.body);
      if (v.error) return res.status(400).json({ error: v.error });

      // 1. Costo real, ahora mismo. Sin estimado no hay generación.
      let costoUsd, precio;
      try {
        ({ costoUsd, precio } = await cotizar(modelo, v.entrada));
      } catch (err) {
        if (!(err instanceof ErrorHF)) throw err;
        log.error('[AI Studio] cotizar al generar', err.message);
        return res.status(502).json({ error: 'No se pudo calcular el precio ahora. No se te cobró.' });
      }
      if (precio > cfg().maximoCentavos) return res.status(400).json({ error: 'Esta configuración excede el máximo por generación.' });
      // 2. El cliente aprobó un precio: si subió desde la cotización, se le avisa.
      const aprobado = parseInt(req.body.precio_aprobado_centavos, 10);
      if (!(aprobado >= precio)) {
        return res.status(409).json({ error: 'El precio cambió. Revísalo y confirma de nuevo.', precio_centavos: precio });
      }

      // 3. Cobrar y crear, juntos o nada.
      let gen;
      try {
        gen = await enTransaccion(async (q) => {
          await asegurarBilletera(q, req.user.id);
          const { rows: [b] } = await q.query(
            'SELECT saldo_centavos, congelada FROM ai_billeteras WHERE usuario_id=$1 FOR UPDATE', [req.user.id]);
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
        if (err.codigo === 'saldo') {
          return res.status(402).json({ error: 'Saldo insuficiente. Recarga créditos para continuar.',
            codigo: 'saldo', precio_centavos: precio, saldo_centavos: err.saldo });
        }
        if (err.codigo === 'congelada') return res.status(403).json({ error: 'Tu cuenta de AI Studio está en revisión.', codigo: 'congelada' });
        throw err;
      }

      // 4. Mandar a Higgsfield. Si se corta, el reconciliador lo reintenta.
      await enviarGeneracion(gen);
      const { rows: [actual] } = await db.query('SELECT * FROM ai_generaciones WHERE id=$1', [gen.id]);
      const { rows: [b] } = await db.query('SELECT saldo_centavos FROM ai_billeteras WHERE usuario_id=$1', [req.user.id]);
      res.status(202).json({ generacion: vistaGeneracion(actual), saldo_centavos: Number(b.saldo_centavos) });
    }));

    app.get('/api/ai/generaciones', authMiddleware, envolver(async (req, res) => {
      const lim = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 30));
      const { rows } = await db.query(
        'SELECT * FROM ai_generaciones WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT $2', [req.user.id, lim]);
      res.json(rows.map(vistaGeneracion));
    }));

    app.get('/api/ai/generaciones/:id', authMiddleware, envolver(async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'No encontrada' });
      let { rows: [g] } = await db.query('SELECT * FROM ai_generaciones WHERE id=$1 AND usuario_id=$2',
        [req.params.id, req.user.id]);
      if (!g) return res.status(404).json({ error: 'No encontrada' });
      // Si lleva rato sin noticias, se pregunta a Higgsfield aquí mismo.
      if (g.hf_request_id && ESTADOS_ABIERTOS.includes(g.estado)
          && Date.now() - new Date(g.actualizado_en).getTime() > 15000) {
        await refrescar(g.hf_request_id).catch(() => {});
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

    // Archivos guardados: enlace firmado, sin JWT. sendFile soporta
    // Range, que Safari en iPhone exige para reproducir video.
    app.get('/api/ai/archivo/:id/:n', envolver(async (req, res) => {
      const { id } = req.params;
      const n = parseInt(req.params.n, 10);
      const exp = parseInt(req.query.exp, 10);
      const sig = String(req.query.sig || '');
      if (!/^[0-9a-f-]{36}$/i.test(id) || !(n >= 0) || !(exp > Date.now() / 1000)) return res.sendStatus(404);
      const esperado = Buffer.from(firmar(id, n, exp));
      const dado = Buffer.from(sig);
      if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) return res.sendStatus(404);
      const { rows: [g] } = await db.query('SELECT usuario_id, archivos FROM ai_generaciones WHERE id=$1', [id]);
      const a = g && g.archivos && g.archivos[n];
      if (!a) return res.sendStatus(404);
      res.sendFile(path.join(cfg().storageDir, g.usuario_id, a.nombre), {
        headers: {
          'Cache-Control': 'private, max-age=3600',
          // helmet() pone same-origin por defecto, y entonces el portal
          // (otro subdominio) no podría mostrar el video ni la imagen.
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }));

    // El Estratega: análisis del cliente → ángulos → guion → prompts.
    // Es el valor propio de Wifnix sobre el motor de generación.
    app.post('/api/ai/estratega', authMiddleware, porUsuario(12, 60), envolver(async (req, res) => {
      const b = await exigirActivo(req, res);
      if (!b) return;
      // Solo para quien tiene saldo: evita que lo usen gratis sin comprar.
      if (Number(b.saldo_centavos) < cfg().minimoCentavos) {
        return res.status(402).json({ error: 'Recarga créditos para usar el Estratega.', codigo: 'saldo' });
      }
      const limpio = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
      const producto = limpio(req.body.producto, 1500);
      const mercado = limpio(req.body.mercado, 200) || 'Puerto Rico';
      const publico = limpio(req.body.publico, 500);
      const formato = limpio(req.body.formato, 100) || 'UGC realista';
      const idioma = limpio(req.body.idioma, 50) || 'español de Puerto Rico';
      if (producto.length < 10) return res.status(400).json({ error: 'Describe tu producto o servicio.' });

      const sistema = `Eres el Estratega de Wifnix AI Studio: un estratega creativo de anuncios de respuesta directa para Meta, TikTok y Reels.
Trabajas en tres pasos: 1) análisis del cliente ideal (problema, lo que ya intentó, lo que desea, objeciones), 2) ángulos de venta con ganchos, 3) un guion de 20 a 30 segundos dividido en escenas.
Para cada escena escribes un prompt de imagen (primer cuadro, fotorrealista, vertical 9:16, describe persona, lugar, luz y producto) y un prompt de video (qué acción ocurre y qué dice la persona, en máximo 10 segundos).
Los prompts de imagen y video van en inglés (los modelos rinden mejor); los diálogos y textos en pantalla, en ${idioma}.
No inventes resultados, testimonios ni cifras del cliente. No uses personas reales ni famosas. No uses emojis.
Responde SOLO con JSON válido con esta forma exacta:
{"analisis":{"problema":"","ya_intento":"","desea":"","objeciones":[""]},"angulos":[{"nombre":"","gancho":""}],"guion":{"angulo":"","duracion_seg":0,"escenas":[{"n":1,"segundos":0,"dialogo":"","texto_pantalla":"","prompt_imagen":"","prompt_video":"","modelo":"kling-pro-imagen-a-video"}]}}
Para "modelo" usa una de: soul-imagen, kling-pro-imagen-a-video, kling-std-imagen-a-video, kling-pro-texto-a-video, hailuo-imagen-a-video, hailuo-texto-a-video.`;

      const contenido = `Producto o servicio: ${producto}\nMercado: ${mercado}\nPúblico: ${publico || 'definelo tú'}\nFormato: ${formato}`;
      let msg;
      try {
        msg = await anthropic.messages.create({
          model: cfg().modeloEstratega, max_tokens: 3000, system: sistema,
          messages: [{ role: 'user', content: contenido }],
        });
      } catch (err) {
        log.error('[AI Studio] estratega', err.message);
        return res.status(502).json({ error: 'El Estratega no está disponible ahora. Intenta en un momento.' });
      }
      const texto = (msg.content || []).map((p) => p.text || '').join('');
      const json = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
      try {
        res.json(JSON.parse(json));
      } catch {
        res.status(502).json({ error: 'El Estratega devolvió una respuesta incompleta. Intenta otra vez.' });
      }
    }));

    // Webhook de Higgsfield: solo es un aviso. El token secreto en la
    // ruta filtra basura; el estado real se consulta a la API.
    app.post('/api/ai/higgsfield/webhook/:token', (req, res) => {
      const t = cfg().webhookToken;
      const dado = Buffer.from(String(req.params.token));
      const esperado = Buffer.from(t);
      if (!t || dado.length !== esperado.length || !crypto.timingSafeEqual(dado, esperado)) return res.sendStatus(404);
      const id = req.body && req.body.request_id;
      res.json({ ok: true }); // Higgsfield exige respuesta en < 10 s
      if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
        refrescar(id).catch((e) => log.error('[AI Studio] webhook HF', e.message));
      }
    });

    // ── Admin: cuánto entra, cuánto cuesta, cuánto queda ──
    app.get('/api/admin/ai/resumen', authMiddleware, envolver(async (req, res) => {
      if (!(await checkPermiso(req.user.id, 'puede_ver_finanzas'))) return res.status(403).json({ error: 'Sin permiso' });
      const dias = Math.min(365, Math.max(1, parseInt(req.query.dias, 10) || 30));
      const { rows: [t] } = await db.query(
        `SELECT
           COALESCE(SUM(monto_centavos) FILTER (WHERE tipo='recarga'),0)::bigint AS recargas,
           COALESCE(-SUM(monto_centavos) FILTER (WHERE tipo='contracargo'),0)::bigint AS contracargos
         FROM ai_movimientos WHERE creado_en > NOW() - ($1 || ' days')::interval`, [dias]);
      const { rows: porModelo } = await db.query(
        `SELECT modelo_clave AS modelo, COUNT(*)::int AS generaciones,
           SUM(precio_centavos)::bigint AS ingreso_centavos,
           ROUND(SUM(costo_usd) * 100)::bigint AS costo_centavos
         FROM ai_generaciones WHERE estado='completado' AND creado_en > NOW() - ($1 || ' days')::interval
         GROUP BY modelo_clave ORDER BY ingreso_centavos DESC`, [dias]);
      const { rows: [s] } = await db.query(
        `SELECT COALESCE(SUM(saldo_centavos),0)::bigint AS saldo_clientes,
                COUNT(*) FILTER (WHERE congelada)::int AS congeladas FROM ai_billeteras`);
      const { rows: [ab] } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE estado IN ('pendiente','en_cola','en_proceso'))::int AS abiertas,
                COUNT(*) FILTER (WHERE estado='revision')::int AS revision FROM ai_generaciones`);
      const ingreso = porModelo.reduce((x, m) => x + Number(m.ingreso_centavos), 0);
      const costo = porModelo.reduce((x, m) => x + Number(m.costo_centavos), 0);
      res.json({
        dias,
        recargas_centavos: Number(t.recargas),
        contracargos_centavos: Number(t.contracargos),
        ingreso_generaciones_centavos: ingreso,
        costo_higgsfield_centavos: costo,
        ganancia_bruta_centavos: ingreso - costo,
        // Lo que los clientes tienen sin gastar: dinero cobrado que
        // todavía le debes en generaciones. No lo cuentes como ganancia.
        saldo_pendiente_clientes_centavos: Number(s.saldo_clientes),
        billeteras_congeladas: s.congeladas,
        generaciones_abiertas: ab.abiertas,
        generaciones_en_revision: ab.revision,
        por_modelo: porModelo.map((m) => ({ ...m, ingreso_centavos: Number(m.ingreso_centavos), costo_centavos: Number(m.costo_centavos) })),
      });
    }));

    // Resolver una generación en revisión después de mirarla en
    // console.higgsfield.ai:
    //  { "accion": "reembolsar" }            → no se generó: se devuelve el crédito
    //  { "accion": "vincular", "hf_request_id": "..." } → sí se generó: se recupera
    //  { "accion": "cerrar" }                → se cobró y no hay nada que recuperar
    app.put('/api/admin/ai/generaciones/:id/resolver', authMiddleware, envolver(async (req, res) => {
      if (!(await checkPermiso(req.user.id, 'puede_ver_finanzas'))) return res.status(403).json({ error: 'Sin permiso' });
      const { accion } = req.body;
      const r = await enTransaccion(async (q) => {
        const { rows: [g] } = await q.query('SELECT * FROM ai_generaciones WHERE id=$1 FOR UPDATE', [req.params.id]);
        if (!g || g.estado !== 'revision') return { error: 'No está en revisión' };
        if (accion === 'reembolsar') {
          await q.query(`UPDATE ai_generaciones SET estado='fallido', error=$1, actualizado_en=NOW() WHERE id=$2`,
            ['No se completó. Se te devolvió el crédito.', g.id]);
          await mover(q, g.usuario_id, Number(g.precio_centavos), 'reembolso', { generacionId: g.id, nota: 'revisión' });
          return { ok: true };
        }
        if (accion === 'vincular' && /^[0-9a-f-]{36}$/i.test(String(req.body.hf_request_id || ''))) {
          await q.query(`UPDATE ai_generaciones SET estado='en_cola', hf_request_id=$1, error=NULL, terminado_en=NULL,
            actualizado_en=NOW() - INTERVAL '2 minutes' WHERE id=$2`, [req.body.hf_request_id, g.id]);
          return { ok: true, recuperar: req.body.hf_request_id };
        }
        if (accion === 'cerrar') {
          await q.query(`UPDATE ai_generaciones SET estado='fallido', error=$1, actualizado_en=NOW() WHERE id=$2`,
            ['No se pudo completar.', g.id]);
          return { ok: true };
        }
        return { error: 'Acción no válida' };
      });
      if (r.error) return res.status(400).json(r);
      if (r.recuperar) await refrescar(r.recuperar).catch(() => {});
      res.json({ ok: true });
    }));

    app.get('/api/admin/ai/revision', authMiddleware, envolver(async (req, res) => {
      if (!(await checkPermiso(req.user.id, 'puede_ver_finanzas'))) return res.status(403).json({ error: 'Sin permiso' });
      const { rows } = await db.query(
        `SELECT g.id, g.modelo_clave, g.precio_centavos, g.costo_usd, g.creado_en, g.intentos_envio, u.email
         FROM ai_generaciones g JOIN usuarios u ON u.id=g.usuario_id WHERE g.estado='revision' ORDER BY g.creado_en`);
      res.json(rows);
    }));

    app.put('/api/admin/ai/billeteras/:uid/descongelar', authMiddleware, envolver(async (req, res) => {
      if (!(await checkPermiso(req.user.id, 'puede_ver_finanzas'))) return res.status(403).json({ error: 'Sin permiso' });
      await db.query('UPDATE ai_billeteras SET congelada=false, motivo_congelada=NULL WHERE usuario_id=$1', [req.params.uid]);
      res.json({ ok: true });
    }));
  }

  function iniciarReconciliador(cadaMs = 60000) {
    const t = setInterval(reconciliar, cadaMs);
    if (t.unref) t.unref();
    return t;
  }

  return {
    montarWebhookStripe, montar, iniciarReconciliador,
    // expuestos para pruebas
    reconciliar, refrescar, procesarEventoStripe, terminar,
  };
}

module.exports = { crearStudio, crearClienteHF, precioCentavos, usdAMicros, validarEntrada, decidirError, detectarImagen, ErrorHF };
