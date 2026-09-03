/* ══════════════════════════════════════════════════════════════
   WIFNIX — entrar con Google, Apple, Microsoft o Facebook

   Todo el flujo ocurre en el servidor. El navegador nunca ve un
   secreto ni un token del proveedor: solo se va al proveedor, vuelve
   con un código de un solo uso y lo cambia por el JWT de Wifnix.

   Las tres decisiones que sostienen la seguridad de este archivo:

   1. El usuario se busca por (proveedor, sujeto), NUNCA por correo.
      El "sub" del proveedor es lo único estable: el correo se puede
      cambiar, y buscar por correo es como se roban las cuentas.

   2. Solo se enlaza con una cuenta que ya existe si el proveedor
      JURA que el correo está verificado. Si no, cualquiera que abra
      una cuenta en un proveedor flojo poniendo el correo ajeno se
      llevaría la cuenta de Wifnix por delante.

   3. La firma del id_token se comprueba SIEMPRE contra las llaves
      públicas del proveedor. Un id_token sin verificar es texto que
      manda cualquiera.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

// Sin respaldo por defecto: mismo motivo que en server.js. De este
// secreto sale ademas la llave que cifra el `state` del OAuth, que es
// lo que protege el verificador de PKCE. Si fuera conocido, PKCE
// dejaria de servir para nada.
const SECRETO = process.env.JWT_SECRET;
if (!SECRETO || SECRETO.length < 32) {
  throw new Error('FALTA JWT_SECRET en el .env (minimo 32 caracteres).');
}
const BASE = process.env.API_URL || 'https://api.wifnix.com';
const PORTAL = process.env.PORTAL_URL || 'https://portal.wifnix.com';

/* ── LOS CUATRO PROVEEDORES ─────────────────────────────────── */

const PROVEEDORES = {
  google: {
    nombre: 'Google',
    autorizar: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    emisor: ['https://accounts.google.com', 'accounts.google.com'],
    alcance: 'openid email profile',
    id: () => process.env.GOOGLE_CLIENT_ID,
    secreto: () => process.env.GOOGLE_CLIENT_SECRET,
    pkce: true,
  },
  microsoft: {
    nombre: 'Microsoft',
    autorizar: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    // Con el inquilino "common" el emisor lleva dentro el id del
    // inquilino de cada quien, así que se comprueba por forma.
    emisorRe: /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/,
    alcance: 'openid email profile',
    id: () => process.env.MICROSOFT_CLIENT_ID,
    secreto: () => process.env.MICROSOFT_CLIENT_SECRET,
    pkce: true,
  },
  apple: {
    nombre: 'Apple',
    autorizar: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    emisor: ['https://appleid.apple.com'],
    alcance: 'name email',
    id: () => process.env.APPLE_CLIENT_ID,
    // Apple no da un secreto fijo: hay que firmarlo cada vez.
    secreto: () => secretoDeApple(),
    // Al pedir datos del usuario, Apple contesta por POST.
    respuestaPorPost: true,
    pkce: false,
  },
  facebook: {
    nombre: 'Facebook',
    autorizar: 'https://www.facebook.com/v21.0/dialog/oauth',
    token: 'https://graph.facebook.com/v21.0/oauth/access_token',
    // Facebook no entrega id_token en el flujo clásico: el perfil se
    // pide a la Graph API con el token de acceso.
    perfilPorApi: 'https://graph.facebook.com/v21.0/me?fields=id,name,email',
    alcance: 'email public_profile',
    id: () => process.env.FACEBOOK_CLIENT_ID,
    secreto: () => process.env.FACEBOOK_CLIENT_SECRET,
    pkce: false,
  },
};

function configurado(clave) {
  const p = PROVEEDORES[clave];
  if (!p) return false;
  if (clave === 'apple') {
    return !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID &&
              process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
  }
  return !!(p.id() && p.secreto());
}

function disponibles() {
  return Object.keys(PROVEEDORES).filter(configurado);
}

function redireccion(clave) {
  return `${BASE}/api/auth/oauth/${clave}/callback`;
}

/* ── EL PARÁMETRO "state" ───────────────────────────────────────
   Caduca en diez minutos y es lo que impide que alguien te empuje a
   completar SU inicio de sesión en TU navegador.

   Va CIFRADO, no solo firmado, y la razón importa: dentro viaja el
   verificador de PKCE. Firmarlo solo lo hace inmanipulable, pero
   sigue siendo base64 — cualquiera que vea la URL lo abre y lee el
   verificador. Y un verificador legible deja el PKCE en nada: quien
   intercepte el código de autorización tendría también con qué
   canjearlo, que es justo lo que el PKCE existe para impedir.

   AES-256-GCM cifra y autentica de una vez, así que sustituye al
   HMAC en lugar de sumarse a él. */

const LLAVE = crypto.createHash('sha256').update('wx-oauth-state|' + SECRETO).digest();

function firmar(datos) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', LLAVE, iv);
  const cuerpo = Buffer.concat([c.update(JSON.stringify(datos), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), cuerpo].map((b) => b.toString('base64url')).join('.');
}

function abrirFirmado(texto, vidaMs) {
  if (typeof texto !== 'string') return null;
  const partes = texto.split('.');
  if (partes.length !== 3) return null;
  let datos;
  try {
    const [iv, etiqueta, cuerpo] = partes.map((p) => Buffer.from(p, 'base64url'));
    if (iv.length !== 12 || etiqueta.length !== 16) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', LLAVE, iv);
    d.setAuthTag(etiqueta);
    // Si alguien tocó un solo bit, final() lanza. No hace falta
    // comparar nada a mano: GCM ya autentica.
    datos = JSON.parse(Buffer.concat([d.update(cuerpo), d.final()]).toString('utf8'));
  } catch (e) { return null; }
  if (!datos || !datos.t || Date.now() - datos.t > vidaMs) return null;
  return datos;
}

/* ── PKCE ───────────────────────────────────────────────────── */

function verificadorPkce() {
  return crypto.randomBytes(32).toString('base64url');
}
function retoPkce(verificador) {
  return crypto.createHash('sha256').update(verificador).digest('base64url');
}

/* ── EL SECRETO DE APPLE ────────────────────────────────────────
   Apple no reparte un secreto: exige un JWT firmado con la llave .p8
   que descargas una sola vez del portal de desarrolladores. Caduca
   como mucho a los seis meses, así que se firma en cada uso. */

function secretoDeApple() {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY } = process.env;
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_CLIENT_ID || !APPLE_PRIVATE_KEY) return null;

  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = { alg: 'ES256', kid: APPLE_KEY_ID };
  const cuerpo = {
    iss: APPLE_TEAM_ID,
    iat: ahora,
    exp: ahora + 3600,
    aud: 'https://appleid.apple.com',
    sub: APPLE_CLIENT_ID,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sinFirma = b64(cabecera) + '.' + b64(cuerpo);

  // La llave llega por variable de entorno, donde los saltos de línea
  // suelen venir escapados.
  const llave = crypto.createPrivateKey(APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'));
  const der = crypto.sign('sha256', Buffer.from(sinFirma), {
    key: llave,
    dsaEncoding: 'ieee-p1363',   // JWT quiere r||s, no DER
  });
  return sinFirma + '.' + der.toString('base64url');
}

/* ── VERIFICAR EL id_token ──────────────────────────────────────
   Sin librerías: node sabe construir una llave pública desde un JWK
   y comprobar RS256 o ES256. */

const cacheLlaves = new Map();   // url → { cuando, llaves }
const VIDA_LLAVES = 6 * 60 * 60 * 1000;

async function llavesDe(url) {
  const guardado = cacheLlaves.get(url);
  if (guardado && Date.now() - guardado.cuando < VIDA_LLAVES) return guardado.llaves;
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudieron leer las llaves de ' + url);
  const { keys } = await r.json();
  cacheLlaves.set(url, { cuando: Date.now(), llaves: keys || [] });
  return keys || [];
}

async function verificarIdToken(idToken, prov, clienteId) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new Error('id_token mal formado');

  const cabecera = JSON.parse(Buffer.from(partes[0], 'base64url').toString());
  const cuerpo = JSON.parse(Buffer.from(partes[1], 'base64url').toString());

  let llaves = await llavesDe(prov.jwks);
  let jwk = llaves.find((k) => k.kid === cabecera.kid);
  if (!jwk) {
    // El proveedor rota llaves: si no está, se relee una vez.
    cacheLlaves.delete(prov.jwks);
    llaves = await llavesDe(prov.jwks);
    jwk = llaves.find((k) => k.kid === cabecera.kid);
  }
  if (!jwk) throw new Error('El proveedor firmó con una llave desconocida');

  const algoritmo = cabecera.alg;
  if (!['RS256', 'ES256'].includes(algoritmo)) throw new Error('Algoritmo no admitido: ' + algoritmo);

  const publica = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const firmado = Buffer.from(partes[0] + '.' + partes[1]);
  const firma = Buffer.from(partes[2], 'base64url');

  const valida = algoritmo === 'ES256'
    ? crypto.verify('sha256', firmado, { key: publica, dsaEncoding: 'ieee-p1363' }, firma)
    : crypto.verify('sha256', firmado, publica, firma);
  if (!valida) throw new Error('La firma del id_token no cuadra');

  const ahora = Math.floor(Date.now() / 1000);
  if (cuerpo.exp && cuerpo.exp < ahora - 60) throw new Error('id_token caducado');
  if (cuerpo.iat && cuerpo.iat > ahora + 300) throw new Error('id_token del futuro');

  // Para quién se emitió. Sin esto, vale un token emitido para otra
  // aplicación cualquiera del mismo proveedor.
  const aud = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
  if (!aud.includes(clienteId)) throw new Error('El id_token no es para esta aplicación');

  if (prov.emisor && !prov.emisor.includes(cuerpo.iss)) throw new Error('Emisor inesperado');
  if (prov.emisorRe && !prov.emisorRe.test(cuerpo.iss || '')) throw new Error('Emisor inesperado');

  return cuerpo;
}

/* ── ARRANCAR EL VIAJE ──────────────────────────────────────── */

function urlDeEntrada(clave, destino) {
  const prov = PROVEEDORES[clave];
  const verificador = prov.pkce ? verificadorPkce() : null;
  const estado = firmar({ p: clave, t: Date.now(), v: verificador, d: destino || null });

  const q = new URLSearchParams({
    client_id: prov.id(),
    redirect_uri: redireccion(clave),
    response_type: 'code',
    scope: prov.alcance,
    state: estado,
  });
  if (prov.respuestaPorPost) q.set('response_mode', 'form_post');
  if (prov.pkce) { q.set('code_challenge', retoPkce(verificador)); q.set('code_challenge_method', 'S256'); }
  if (clave === 'google') q.set('prompt', 'select_account');

  return prov.autorizar + '?' + q.toString();
}

/* ── LA VUELTA: código por perfil ───────────────────────────── */

async function perfilDesdeCodigo(clave, codigo, estadoAbierto, cuerpoApple) {
  const prov = PROVEEDORES[clave];
  const secreto = prov.secreto();
  if (!secreto) throw new Error('El proveedor ' + clave + ' no está configurado');

  const cuerpo = new URLSearchParams({
    client_id: prov.id(),
    client_secret: secreto,
    code: codigo,
    grant_type: 'authorization_code',
    redirect_uri: redireccion(clave),
  });
  if (prov.pkce && estadoAbierto.v) cuerpo.set('code_verifier', estadoAbierto.v);

  const r = await fetch(prov.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: cuerpo.toString(),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('El proveedor rechazó el código: ' + (datos.error_description || datos.error || r.status));

  /* Facebook: no hay id_token, se pregunta a la Graph API. */
  if (prov.perfilPorApi) {
    const token = datos.access_token;
    // La prueba del secreto impide que alguien use un token robado
    // desde otra aplicación contra la nuestra.
    const prueba = crypto.createHmac('sha256', secreto).update(token).digest('hex');
    const p = await fetch(prov.perfilPorApi + '&access_token=' + encodeURIComponent(token) +
                          '&appsecret_proof=' + prueba);
    const perfil = await p.json().catch(() => ({}));
    if (!p.ok || !perfil.id) throw new Error('No se pudo leer el perfil de Facebook');
    return {
      sujeto: String(perfil.id),
      email: perfil.email ? String(perfil.email).toLowerCase() : null,
      // Facebook solo devuelve el correo si ya lo confirmó.
      emailVerificado: !!perfil.email,
      nombre: perfil.name || null,
    };
  }

  /* Los demás sí traen id_token, y se verifica. */
  const reclamos = await verificarIdToken(datos.id_token, prov, prov.id());

  // Apple manda el nombre UNA sola vez, en el POST de vuelta y fuera
  // del token. Si no se guarda ahora, no vuelve nunca.
  let nombre = reclamos.name || null;
  if (clave === 'apple' && cuerpoApple && cuerpoApple.user) {
    try {
      const u = typeof cuerpoApple.user === 'string' ? JSON.parse(cuerpoApple.user) : cuerpoApple.user;
      if (u && u.name) nombre = [u.name.firstName, u.name.lastName].filter(Boolean).join(' ') || null;
    } catch (e) { /* si viene mal, se sigue sin nombre */ }
  }

  return {
    sujeto: String(reclamos.sub),
    email: reclamos.email ? String(reclamos.email).toLowerCase() : null,
    emailVerificado: reclamos.email_verified === true || reclamos.email_verified === 'true',
    nombre,
  };
}

/* ── CÓDIGOS DE UN SOLO USO ─────────────────────────────────────
   El JWT de Wifnix no viaja en la URL de vuelta: los enlaces quedan
   en el historial, en los registros del servidor y en la cabecera
   Referer. Vuelve un código que solo sirve una vez y solo un minuto,
   y el portal lo cambia por el token con una petición POST. */

const canjes = new Map();
const VIDA_CANJE = 60 * 1000;

function guardarCanje(carga) {
  const codigo = crypto.randomBytes(32).toString('base64url');
  canjes.set(codigo, { carga, cuando: Date.now() });
  return codigo;
}

function usarCanje(codigo) {
  const c = canjes.get(codigo);
  if (!c) return null;
  canjes.delete(codigo);                       // un solo uso, pase lo que pase
  if (Date.now() - c.cuando > VIDA_CANJE) return null;
  return c.carga;
}

// Limpieza perezosa: sin esto el mapa crece con cada intento que
// nadie llegó a canjear.
setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of canjes) if (ahora - v.cuando > VIDA_CANJE) canjes.delete(k);
}, 5 * 60 * 1000).unref();

module.exports = {
  PROVEEDORES, PORTAL,
  configurado, disponibles, redireccion,
  urlDeEntrada, perfilDesdeCodigo,
  firmar, abrirFirmado,
  guardarCanje, usarCanje,
};
