/* ============================================================
   WIFNIX CORE — utilidades compartidas (portal, admin, checkout)
   Cargar ANTES de los scripts de cada página:
   <script src="/assets/wifnix-core.js"></script>
   ============================================================ */
(function (global) {
  'use strict';

  // -- Config base --
  var API_BASE = 'https://api.wifnix.com';

  // Detecta qué token usar según la página.
  // Admin usa 'wifnix_admin_token'; el resto usa 'wifnix_token'.
  function _tokenKey() {
    // Si la página define WIFNIX_TOKEN_KEY, lo respeta. Sino, deduce por hostname.
    if (global.WIFNIX_TOKEN_KEY) return global.WIFNIX_TOKEN_KEY;
    if (location.hostname.indexOf('admin') === 0 || location.hostname.indexOf('admin.') !== -1) {
      return 'wifnix_admin_token';
    }
    return 'wifnix_token';
  }

  function getToken() {
    try { return localStorage.getItem(_tokenKey()); } catch (e) { return null; }
  }

  function setToken(t) {
    try { localStorage.setItem(_tokenKey(), t); } catch (e) {}
  }

  function clearToken() {
    try { localStorage.removeItem(_tokenKey()); } catch (e) {}
  }

  /* ------------------------------------------------------------
     api(path, opts)
     - Une la base de la URL
     - Pone Content-Type y Authorization automáticamente
     - Convierte body objeto -> JSON string (evita el bug "[object Object]")
     - opts.raw = true  -> devuelve el Response crudo (sin .json())
     - opts.on401:
         'reload'  (default sólo si la página lo pide explícitamente)
         'silent'  -> no hace nada, devuelve null  (ideal para polling/campana)
         'throw'   -> lanza error
     ------------------------------------------------------------ */
  async function api(path, opts) {
    var o = opts || {};
    o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
    var tk = getToken();
    if (tk) o.headers['Authorization'] = 'Bearer ' + tk;
    if (o.body && typeof o.body === 'object') o.body = JSON.stringify(o.body);

    var url = path.indexOf('http') === 0 ? path : API_BASE + path;
    var r;
    try {
      r = await fetch(url, o);
    } catch (netErr) {
      // Error de red: no desloguea
      if (o.on401 === 'throw') throw netErr;
      return null;
    }

    if (r.status === 401) {
      var mode = o.on401 || 'silent';
      if (mode === 'reload') { clearToken(); location.reload(); return null; }
      if (mode === 'throw') { throw new Error('401'); }
      return null; // silent
    }

    if (o.raw) return r;
    try { return await r.json(); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------
     Fechas — Postgres devuelve `date` como objeto Date de JS,
     y a veces como string 'YYYY-MM-DD' o ISO con T.
     Estas funciones normalizan SIEMPRE a algo seguro.
     ------------------------------------------------------------ */

  // Devuelve 'YYYY-MM-DD' a partir de Date | string ISO | 'YYYY-MM-DD'
  function fechaISO(valor) {
    if (!valor) return '';
    if (valor instanceof Date) {
      return valor.getFullYear() + '-' +
        String(valor.getMonth() + 1).padStart(2, '0') + '-' +
        String(valor.getDate()).padStart(2, '0');
    }
    // string: corta cualquier parte de hora
    return String(valor).split('T')[0];
  }

  // Crea un Date "seguro" al mediodía (evita corrimientos por timezone)
  function fechaObj(valor) {
    var iso = fechaISO(valor);
    if (!iso) return null;
    return new Date(iso + 'T12:00:00');
  }

  // Suma meses a una fecha y devuelve 'YYYY-MM-DD'
  function sumarMeses(valor, meses) {
    var d = fechaObj(valor);
    if (!d) return '';
    var n = new Date(d.getFullYear(), d.getMonth() + meses, d.getDate(), 12, 0, 0);
    return fechaISO(n);
  }

  // Formato bonito en español PR. tipo: 'corto' | 'largo' | 'conHora'
  function fechaPR(valor, tipo) {
    var d = fechaObj(valor);
    if (!d) return '—';
    if (tipo === 'largo') {
      return d.toLocaleDateString('es-PR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (tipo === 'conHora') {
      var real = (valor instanceof Date) ? valor : new Date(valor);
      return real.toLocaleString('es-PR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('es-PR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ------------------------------------------------------------
     Estados de orden — etiquetas en lenguaje humano para el CLIENTE
     (internamente la BD sigue teniendo todos los estados)
     ------------------------------------------------------------ */
  var ESTADO_ORDEN_CLIENTE = {
    borrador:               { label: 'Borrador',        color: '#6B7280' },
    pendiente_pago:         { label: 'Pendiente de pago', color: '#FFC107' },
    pago_parcial:           { label: 'Pago parcial',     color: '#F59E0B' },
    pagado:                 { label: 'Pagada',           color: '#00E5A0' },
    en_proceso:             { label: 'En preparación',   color: '#0B8FCC' },
    en_preparacion:         { label: 'En preparación',   color: '#0B8FCC' },
    listo_entrega:          { label: 'Lista',            color: '#29B6F6' },
    instalacion_programada: { label: 'Instalación programada', color: '#06B6D4' },
    en_transito:            { label: 'En camino',        color: '#8B5CF6' },
    entregado:              { label: 'Entregada',        color: '#10B981' },
    completado:             { label: 'Completada',       color: '#059669' },
    cancelado:              { label: 'Cancelada',        color: '#EF4444' },
    reembolsado:            { label: 'Reembolsada',      color: '#6B7280' }
  };

  function estadoOrden(status) {
    return ESTADO_ORDEN_CLIENTE[status] || { label: status, color: '#6B7280' };
  }

  // Estados de cita
  var ESTADO_CITA = {
    solicitada:   { label: 'Solicitada', color: '#FFC107' },
    aprobada:     { label: 'Aprobada — paga tu depósito', color: '#0B8FCC' },
    confirmada:   { label: 'Confirmada', color: '#00E5A0' },
    reprogramada: { label: 'Reprogramada', color: '#0B8FCC' },
    en_proceso:   { label: 'En proceso', color: '#8B5CF6' },
    completada:   { label: 'Completada', color: '#059669' },
    cancelada:    { label: 'Cancelada', color: '#EF4444' },
    no_show:      { label: 'No asistió', color: '#6B7280' }
  };

  function estadoCita(status) {
    return ESTADO_CITA[status] || ESTADO_CITA.solicitada;
  }

  // Formato de número de orden / cita
  function numOrden(n) { return 'WFX-' + String(n).padStart(4, '0'); }
  function numCita(n)  { return 'CIT-' + String(n).padStart(4, '0'); }

  // Dinero
  function money(v) { return '$' + parseFloat(v || 0).toFixed(2); }

  // -- Exponer en window.Wifnix --
  global.Wifnix = {
    API_BASE: API_BASE,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    api: api,
    fechaISO: fechaISO,
    fechaObj: fechaObj,
    fechaPR: fechaPR,
    sumarMeses: sumarMeses,
    estadoOrden: estadoOrden,
    estadoCita: estadoCita,
    numOrden: numOrden,
    numCita: numCita,
    money: money
  };

})(window);
