/* ══════════════════════════════════════════════════════════════
   WIFNIX AI STUDIO — conectores con cada proveedor de IA

   Cada proveedor habla distinto. Este archivo los traduce a una sola
   forma para que ai-studio.js (el dinero) no tenga que saber de cuál
   se trata:

     costo(modelo, entrada, media)  → costo real en USD (texto decimal)
     enviar(modelo, ctx)            → { id } si es asíncrono,
                                      { final } si contesta en el acto
     estado(modelo, id)             → { estado, salida, error }
     descargar(item)                → { buffer, mime }

   Higgsfield (solo Genjutsu y Kling) tiene /estimate: el costo exacto
   se le pregunta. Google y MiniMax no: el costo sale de la tarifa
   oficial guardada en ai_modelos.tarifa. Si una combinación no está
   en la tarifa, NO se genera.

   "idempotente" dice si se puede reintentar un envío cortado sin
   riesgo de generar (y pagar) dos veces. Solo Higgsfield acepta
   Idempotency-Key. Con los demás, un envío sin respuesta clara no se
   reintenta: va a revisión.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');

// ── Dinero en enteros: micro-dólares (1 USD = 1,000,000) ──────

function usdAMicros(usd) {
  const s = String(usd).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Costo inválido: ' + s);
  const [ent, dec = ''] = s.split('.');
  return BigInt(ent) * 1000000n + BigInt((dec + '000000').slice(0, 6))
    + (dec.length > 6 && /[1-9]/.test(dec.slice(6)) ? 1n : 0n); // redondea hacia arriba
}

function microsAUsd(m) {
  const b = BigInt(m);
  return `${b / 1000000n}.${String(b % 1000000n).padStart(6, '0')}`;
}

// Costo desde la tarifa guardada en la base de datos:
//   { "claves": ["resolution","duration"],
//     "precios": { "768P|6": "0.28", ... },
//     "por_segundo": "durationSeconds"   (opcional: multiplica por la duración)
//     "extra": "0.01" }                  (opcional: colchón fijo, ej. tokens de razonamiento)
function costoPorTarifa(tarifa, entrada) {
  if (!tarifa || !tarifa.precios) throw new ErrorProv(0, 'Modelo sin tarifa');
  const clave = (tarifa.claves || []).map((k) => String(entrada[k])).join('|');
  const precio = tarifa.precios[clave];
  if (precio === undefined) throw new ErrorProv(0, `Sin tarifa para "${clave}"`);
  let micros = usdAMicros(precio);
  if (tarifa.por_segundo) {
    const seg = parseInt(entrada[tarifa.por_segundo], 10);
    if (!(seg > 0 && seg <= 120)) throw new ErrorProv(0, 'Duración inválida para la tarifa');
    micros *= BigInt(seg);
  }
  if (tarifa.extra) micros += usdAMicros(tarifa.extra);
  return microsAUsd(micros);
}

// ── Errores, en un solo idioma para todos los proveedores ─────
//  status -1 → no hubo respuesta (el proveedor pudo haberlo recibido)
//  status  0 → error de configuración nuestro (llave, tarifa)
//  el resto  → códigos tipo HTTP: 400/422 parámetros, 401 llave,
//              403 sin saldo en el proveedor, 429/503/423 ocupado,
//              451 rechazado por contenido, 5xx error del proveedor
class ErrorProv extends Error {
  constructor(status, detalle) {
    super(`Proveedor ${status}: ${detalle}`);
    this.status = status;
    this.detalle = detalle;
  }
}

// ¿Pudo el proveedor haber aceptado (y cobrado) aunque no lo sepamos?
function esAmbiguo(err) {
  return err.status === -1 || err.status === 500 || err.status === 502 || err.status === 504;
}
// ¿Vale la pena reintentar el envío?
function esReintentable(err) {
  if (esAmbiguo(err)) return true;
  if ([423, 429, 503].includes(err.status)) return true;
  return err.status === 400 && /concurren|rate|busy/i.test(err.detalle || '');
}

async function leerJson(r) {
  const texto = await r.text();
  try { return texto ? JSON.parse(texto) : null; } catch { return { _texto: texto.slice(0, 300) }; }
}

function detalleDe(datos) {
  if (!datos) return '';
  if (datos.detail) return typeof datos.detail === 'string' ? datos.detail : JSON.stringify(datos.detail);
  if (datos.error) return typeof datos.error === 'string' ? datos.error : (datos.error.message || JSON.stringify(datos.error));
  if (datos.base_resp) return `${datos.base_resp.status_code} ${datos.base_resp.status_msg || ''}`;
  return datos._texto || JSON.stringify(datos).slice(0, 300);
}

async function llamar(fetchImpl, url, { metodo = 'GET', headers = {}, cuerpo, timeout = 30000 } = {}) {
  let r;
  try {
    r = await fetchImpl(url, {
      method: metodo,
      headers: cuerpo === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeout),
    });
    var datos = await leerJson(r);
  } catch (err) {
    throw new ErrorProv(-1, 'Sin respuesta completa: ' + err.message);
  }
  if (!r.ok) throw new ErrorProv(r.status, detalleDe(datos));
  return datos;
}

async function bajar(fetchImpl, url, headers = {}) {
  const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error('Descarga ' + r.status);
  const mime = ((r.headers && r.headers.get && r.headers.get('content-type')) || '').split(';')[0];
  return { buffer: Buffer.from(await r.arrayBuffer()), mime };
}

const b64 = (ruta) => fs.readFileSync(ruta).toString('base64');

// ══════════════════════════════════════════════════════════════
// HIGGSFIELD — Genjutsu (solo existe ahí) y Kling
// docs.higgsfield.ai · Authorization: Key id:secreto
// ══════════════════════════════════════════════════════════════
function higgsfield(fetchImpl) {
  const base = () => (process.env.HF_API_URL || 'https://api.higgsfield.ai').replace(/\/+$/, '');
  const cred = () => process.env.HF_CREDENTIALS || '';
  const hdr = () => ({ Authorization: `Key ${cred()}`, Accept: 'application/json' });
  const MAPA = { queued: 'en_cola', in_progress: 'en_proceso', completed: 'completado',
    failed: 'fallido', nsfw: 'nsfw', canceled: 'cancelado' };

  function payload(modelo, entrada, media) {
    const p = {};
    for (const k of Object.keys(modelo.parametros || {})) if (entrada[k] !== undefined) p[k] = entrada[k];
    if (entrada.prompt) p.prompt = entrada.prompt;
    if (media.video) {                       // Genjutsu: video + 1 a 8 imágenes
      p.video_url = media.video.url;
      p.image_urls = media.imagenes.map((m) => m.url);
    } else if (media.imagenes.length) {      // Kling imagen-a-video
      p.image_url = media.imagenes[0].url;
    }
    return p;
  }

  return {
    nombre: 'higgsfield',
    idempotente: true,
    configurado: () => cred().includes(':'),
    async costo(modelo, entrada, media) {
      if (!cred().includes(':')) throw new ErrorProv(0, 'HF_CREDENTIALS no configurado');
      const d = await llamar(fetchImpl, `${base()}/estimate/${modelo.ruta}`,
        { metodo: 'POST', headers: hdr(), cuerpo: payload(modelo, entrada, media) });
      if (!d || d.usd === undefined || d.usd === null) throw new ErrorProv(0, 'Estimado sin usd');
      return String(d.usd);
    },
    async enviar(modelo, ctx) {
      if (!cred().includes(':')) throw new ErrorProv(0, 'HF_CREDENTIALS no configurado');
      let url = `${base()}/${modelo.ruta}`;
      if (ctx.webhook) url += `?hf_webhook=${encodeURIComponent(ctx.webhook)}`;
      const d = await llamar(fetchImpl, url, {
        metodo: 'POST', headers: { ...hdr(), 'Idempotency-Key': ctx.genId },
        cuerpo: payload(modelo, ctx.entrada, ctx.media) });
      if (!d || !d.request_id) throw new ErrorProv(-1, 'Respuesta sin request_id');
      return { id: d.request_id, estado: MAPA[d.status] || 'en_cola' };
    },
    async estado(modelo, id) {
      const s = await llamar(fetchImpl, `${base()}/requests/${encodeURIComponent(id)}/status`, { headers: hdr() });
      const estado = MAPA[s.status];
      if (!estado) return { estado: 'en_proceso' };
      const items = [];
      for (const im of s.images || []) if (im && im.url) items.push({ tipo: 'imagen', url: im.url });
      if (s.video && s.video.url) items.push({ tipo: 'video', url: s.video.url });
      return { estado, salida: items.length ? { items } : null, error: s.error || null };
    },
    descargar: (item) => bajar(fetchImpl, item.url),
  };
}

// ══════════════════════════════════════════════════════════════
// GOOGLE — Gemini API: Nano Banana (imágenes) y Veo (video)
// generativelanguage.googleapis.com · x-goog-api-key
// ══════════════════════════════════════════════════════════════
function google(fetchImpl) {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const llave = () => process.env.GOOGLE_AI_API_KEY || '';
  const hdr = () => ({ 'x-goog-api-key': llave() });

  // Busca imágenes o videos en la respuesta de la Interactions API
  // (steps[].content[] con type image/video) o en la forma vieja
  // (candidates[].content.parts[].inlineData). Así no se rompe si
  // Google mueve el campo de sitio.
  function buscarMedia(obj, tipo, encontrados = []) {
    if (!obj || typeof obj !== 'object') return encontrados;
    if (Array.isArray(obj)) { obj.forEach((x) => buscarMedia(x, tipo, encontrados)); return encontrados; }
    if (obj.thought === true || obj.type === 'thought') return encontrados; // borradores internos, no el resultado
    const mime = obj.mime_type || obj.mimeType || '';
    if ((obj.type === tipo || mime.startsWith(tipo + '/')) && typeof obj.data === 'string' && obj.data.length > 100) {
      encontrados.push({ buffer: Buffer.from(obj.data, 'base64'), mime: mime || (tipo === 'image' ? 'image/png' : 'video/mp4') });
      return encontrados;
    }
    for (const v of Object.values(obj)) if (v && typeof v === 'object') buscarMedia(v, tipo, encontrados);
    return encontrados;
  }

  return {
    nombre: 'google',
    idempotente: false,
    configurado: () => !!llave(),
    async costo(modelo, entrada) { return costoPorTarifa(modelo.tarifa, entrada); },

    async enviar(modelo, ctx) {
      if (!llave()) throw new ErrorProv(0, 'GOOGLE_AI_API_KEY no configurado');
      const { entrada, media } = ctx;

      if (modelo.tipo === 'imagen') {
        // Nano Banana: contesta en el acto con la imagen en base64.
        const input = media.imagenes.map((m) => ({ type: 'image', mime_type: m.mime, data: b64(m.ruta) }));
        input.push({ type: 'text', text: entrada.prompt });
        const cuerpo = {
          model: modelo.ruta, input,
          response_format: { type: 'image', mime_type: 'image/png',
            aspect_ratio: entrada.aspect_ratio, image_size: entrada.image_size },
          ...(modelo.opciones || {}),
        };
        const d = await llamar(fetchImpl, `${BASE}/interactions`,
          { metodo: 'POST', headers: hdr(), cuerpo, timeout: 150000 });
        const imagenes = buscarMedia(d, 'image');
        if (!imagenes.length) {
          // Google cobra los tokens aunque no salga imagen. Solo se
          // reembolsa solo si Google dice que fue por sus filtros.
          if (/SAFETY|PROHIBITED|BLOCK|blocked|IMAGE_OTHER|RECITATION/.test(JSON.stringify(d || {}))) {
            return { final: { estado: 'nsfw', error: 'Google bloqueó la imagen por sus filtros de contenido. Se te devolvió el crédito.' } };
          }
          return { final: { estado: 'revision', error: 'Respuesta de Google sin imagen: ' + JSON.stringify(d || {}).slice(0, 300) } };
        }
        return { final: { estado: 'completado', archivos: imagenes.map((x) => ({ ...x, tipo: 'imagen' })) } };
      }

      // Veo: operación larga, se consulta después.
      const instancia = { prompt: entrada.prompt };
      if (media.imagenes.length) {
        instancia.image = { inlineData: { mimeType: media.imagenes[0].mime, data: b64(media.imagenes[0].ruta) } };
      }
      const cuerpo = {
        instances: [instancia],
        parameters: {
          aspectRatio: entrada.aspectRatio,
          resolution: entrada.resolution,
          durationSeconds: String(entrada.durationSeconds),
          // Requisito de Google: texto-a-video "allow_all", con imagen "allow_adult".
          personGeneration: media.imagenes.length ? 'allow_adult' : 'allow_all',
        },
      };
      const d = await llamar(fetchImpl, `${BASE}/models/${modelo.ruta}:predictLongRunning`,
        { metodo: 'POST', headers: hdr(), cuerpo, timeout: 60000 });
      if (!d || !d.name) throw new ErrorProv(-1, 'Respuesta sin nombre de operación');
      return { id: d.name, estado: 'en_proceso' };
    },

    async estado(modelo, id) {
      if (!/^[\w./-]+$/.test(id)) throw new ErrorProv(0, 'Operación inválida');
      const op = await llamar(fetchImpl, `${BASE}/${id}`, { headers: hdr() });
      if (!op.done) return { estado: 'en_proceso' };
      if (op.error) return { estado: 'fallido', error: 'La generación falló. Se te devolvió el crédito.' };
      const muestras = (((op.response || {}).generateVideoResponse || {}).generatedSamples) || [];
      const uris = muestras.map((m) => m && m.video && m.video.uri).filter(Boolean);
      // Google no cobra los videos bloqueados: llegan sin muestras.
      if (!uris.length) return { estado: 'nsfw', error: 'Google bloqueó el video por sus filtros de contenido. Se te devolvió el crédito.' };
      return { estado: 'completado', salida: { items: uris.map((u) => ({ tipo: 'video', url: u })) } };
    },

    // Los videos de Veo solo se bajan con la llave, y Google los borra a los 2 días.
    descargar: (item) => bajar(fetchImpl, item.url, hdr()),
  };
}

// ══════════════════════════════════════════════════════════════
// MINIMAX — Hailuo (video) e image-01
// api.minimax.io · Authorization: Bearer · base_resp.status_code 0 = ok
// ══════════════════════════════════════════════════════════════
function minimax(fetchImpl) {
  const host = () => (process.env.MINIMAX_API_HOST || 'https://api.minimax.io').replace(/\/+$/, '');
  const llave = () => process.env.MINIMAX_API_KEY || '';
  const hdr = () => ({ Authorization: `Bearer ${llave()}` });

  // MiniMax contesta 200 aunque falle: el error real va en base_resp.
  function revisar(d) {
    const br = d && d.base_resp;
    if (br && br.status_code === 0) return d;
    const codigo = br ? br.status_code : -1;
    const msg = br ? `${codigo} ${br.status_msg || ''}` : 'Respuesta sin base_resp';
    const mapa = { 1004: 401, 2049: 401, 1008: 403, 1002: 429, 1039: 429, 1026: 451, 1027: 451, 2013: 422 };
    throw new ErrorProv(br ? (mapa[codigo] || 400) : -1, msg);
  }
  const llamarMM = async (ruta, opciones) => revisar(await llamar(fetchImpl, `${host()}${ruta}`, { headers: hdr(), ...opciones }));

  return {
    nombre: 'minimax',
    idempotente: false,
    configurado: () => !!llave(),
    async costo(modelo, entrada) { return costoPorTarifa(modelo.tarifa, entrada); },

    async enviar(modelo, ctx) {
      if (!llave()) throw new ErrorProv(0, 'MINIMAX_API_KEY no configurado');
      const { entrada, media } = ctx;

      if (modelo.tipo === 'imagen') {
        const d = await llamarMM('/v1/image_generation', { metodo: 'POST', timeout: 120000, cuerpo: {
          model: modelo.ruta, prompt: entrada.prompt, aspect_ratio: entrada.aspect_ratio,
          n: 1, prompt_optimizer: true, response_format: 'url' } });
        const urls = ((d.data || {}).image_urls) || [];
        if (!urls.length) return { final: { estado: 'nsfw', error: 'No se generó la imagen (contenido rechazado). Se te devolvió el crédito.' } };
        return { final: { estado: 'completado', archivos: urls.map((u) => ({ url: u, tipo: 'imagen' })) } };
      }

      const cuerpo = {
        model: modelo.ruta, prompt: entrada.prompt,
        duration: parseInt(entrada.duration, 10), resolution: entrada.resolution,
        prompt_optimizer: true,
      };
      if (media.imagenes.length) cuerpo.first_frame_image = media.imagenes[0].url;
      const d = await llamarMM('/v1/video_generation', { metodo: 'POST', cuerpo, timeout: 60000 });
      if (!d.task_id) throw new ErrorProv(-1, 'Respuesta sin task_id');
      return { id: String(d.task_id), estado: 'en_cola' };
    },

    async estado(modelo, id) {
      const d = await llamarMM(`/v1/query/video_generation?task_id=${encodeURIComponent(id)}`, {});
      if (d.status === 'Success' && d.file_id) {
        // Se guarda el file_id, no el enlace: el enlace vence en minutos.
        return { estado: 'completado', salida: { items: [{ tipo: 'video', file_id: String(d.file_id) }] } };
      }
      if (d.status === 'Fail') return { estado: 'fallido', error: 'La generación falló. Se te devolvió el crédito.' };
      return { estado: 'en_proceso' };
    },

    async descargar(item) {
      let url = item.url;
      if (item.file_id) {
        const d = await llamarMM(`/v1/files/retrieve?file_id=${encodeURIComponent(item.file_id)}`, {});
        url = d.file && d.file.download_url;
        if (!url) throw new Error('MiniMax no devolvió enlace de descarga');
      }
      return bajar(fetchImpl, url);
    },
  };
}

function crearProveedores(fetchImpl) {
  return { higgsfield: higgsfield(fetchImpl), google: google(fetchImpl), minimax: minimax(fetchImpl) };
}

module.exports = {
  crearProveedores, costoPorTarifa, usdAMicros, microsAUsd, ErrorProv, esAmbiguo, esReintentable,
};
