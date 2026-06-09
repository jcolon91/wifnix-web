p = '/var/www/wifnix/admin/index.html'
c = open(p).read()
log = []

# ═══════════════════════════════════════════════════════
# 1. Añadir item "GPS Técnicos" al menú, después de Inspecciones flota
# ═══════════════════════════════════════════════════════
ancla_menu = """    {id: 'inspecciones', label: 'Inspecciones flota', icon: '<path d="M3 9l1-3h16l1 3"/><path d="M5 9h14v8H5z"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>'},"""
nuevo_item = ancla_menu + """
    {id: 'gps_tecnicos', label: 'GPS Técnicos', icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>'},"""
if ancla_menu in c:
    c = c.replace(ancla_menu, nuevo_item, 1)
    log.append("1. Item de menu GPS Tecnicos: OK")
else:
    log.append("1. NO se encontro item inspecciones en menu")

# ═══════════════════════════════════════════════════════
# 2. Registrar el loader
# ═══════════════════════════════════════════════════════
ancla_loaders = "mensajes: renderMensajes, inspecciones: renderInspecciones"
nuevo_loader = "mensajes: renderMensajes, inspecciones: renderInspecciones, gps_tecnicos: renderGpsTecnicos"
if ancla_loaders in c:
    c = c.replace(ancla_loaders, nuevo_loader, 1)
    log.append("2. Loader registrado: OK")
else:
    log.append("2. NO se encontro objeto loaders")

# ═══════════════════════════════════════════════════════
# 3. Insertar la función renderGpsTecnicos antes de renderInspecciones
# ═══════════════════════════════════════════════════════
ancla_fn = "async function renderInspecciones() {"

funcion = '''// ════════════════════════════════════════════════
// GPS TÉCNICOS (mapa en vivo)
// ════════════════════════════════════════════════
var gpsMap = null, gpsMarkers = {}, gpsRefresh = null;
var GPS_COLORES = ['#0B8FCC','#8B5CF6','#00B377','#E89611','#E5484D','#0EA5E9','#EC4899','#14B8A6','#F59E0B','#6366F1'];

function gpsColorTecnico(idx) { return GPS_COLORES[idx % GPS_COLORES.length]; }

function gpsEstadoTexto(t) {
  if (!t.online) return { txt:'Desconectado', col:'#94A8B8' };
  if (t.estado === 'en_cita') return { txt:'En cita', col:'#00B377' };
  if (t.estado === 'parado') return { txt:'Parado ' + t.min_parado + ' min', col:'#E5484D' };
  return { txt:'En ruta', col:'#0B8FCC' };
}

function gpsPin(color, alerta) {
  var anillo = alerta ? ';box-shadow:0 0 0 4px rgba(229,72,77,0.35),0 2px 6px rgba(0,0,0,0.4);animation:gpsPulse 1.2s infinite' : ';box-shadow:0 2px 6px rgba(0,0,0,0.4)';
  return L.divIcon({
    className:'gps-pin',
    html:'<div style="background:'+color+';width:26px;height:26px;border-radius:50%;border:3px solid #fff'+anillo+'"></div>',
    iconSize:[26,26], iconAnchor:[13,13]
  });
}

async function renderGpsTecnicos() {
  var main = document.getElementById('main');
  main.innerHTML =
    '<div class="ph"><div><h1>GPS Técnicos</h1><p>Ubicación en vivo · se actualiza automáticamente</p></div>' +
      '<div style="font-size:0.72rem;color:var(--gray)">Reporta mientras la app del técnico está abierta</div></div>' +
    '<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:340px"><div id="gps-map" style="width:100%;height:560px;border-radius:14px;border:1px solid var(--line);overflow:hidden;background:#e8eef3"></div></div>' +
      '<div style="width:300px;flex-shrink:0">' +
        '<div id="gps-alertas"></div>' +
        '<div style="background:var(--white);border:1px solid var(--line);border-radius:14px;padding:14px 16px">' +
          '<div style="font-size:0.78rem;font-weight:800;color:var(--ink);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.04em">Técnicos</div>' +
          '<div id="gps-lista"><div class="loading">Cargando...</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Inicializar mapa
  setTimeout(function(){
    if (gpsMap) { gpsMap.remove(); gpsMap = null; gpsMarkers = {}; }
    gpsMap = L.map('gps-map', { zoomControl:true, attributionControl:false }).setView([18.234, -66.039], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(gpsMap);
    setTimeout(function(){ gpsMap.invalidateSize(); }, 200);
    cargarGpsTecnicos();
  }, 100);

  // Auto-refresco cada 18 seg
  if (gpsRefresh) clearInterval(gpsRefresh);
  gpsRefresh = setInterval(cargarGpsTecnicos, 18000);
}

async function cargarGpsTecnicos() {
  if (!document.getElementById('gps-map')) { if (gpsRefresh) clearInterval(gpsRefresh); return; }
  var d = await api('/api/admin/tecnicos-gps');
  if (!d || !d.ok) return;
  var tecnicos = d.tecnicos || [];

  var conUbi = tecnicos.filter(function(t){ return t.lat != null && t.lng != null; });
  var bounds = [];

  // Pintar/actualizar marcadores
  tecnicos.forEach(function(t, i){
    var color = gpsColorTecnico(i);
    if (t.lat == null || t.lng == null) return;
    bounds.push([t.lat, t.lng]);
    var est = gpsEstadoTexto(t);
    var destino = t.en_cita ? ('En: ' + (t.en_cita.servicio||'') + (t.en_cita.municipio?' · '+t.en_cita.municipio:'')) :
                  (t.proxima_cita ? ('Próx: ' + (t.proxima_cita.servicio||'') + (t.proxima_cita.slot?' · '+t.proxima_cita.slot:'')) : 'Sin citas hoy');
    var senal = (t.min_sin_senal != null) ? (t.min_sin_senal <= 0 ? 'ahora' : 'hace ' + t.min_sin_senal + ' min') : 'sin datos';
    var tip = '<div style="min-width:180px">' +
      '<div style="font-weight:800;font-size:0.86rem;color:#0F1F2E">' + t.nombre + ' <span style="color:#94A8B8;font-weight:600">#' + t.numero + '</span></div>' +
      '<div style="font-size:0.78rem;color:' + est.col + ';font-weight:700;margin:3px 0">● ' + est.txt + '</div>' +
      '<div style="font-size:0.74rem;color:#5B7184">' + destino + '</div>' +
      '<div style="font-size:0.7rem;color:#94A8B8;margin-top:3px">Última señal: ' + senal + '</div>' +
      (t.telefono ? '<div style="font-size:0.7rem;color:#94A8B8">Tel: ' + t.telefono + '</div>' : '') +
      '</div>';

    if (gpsMarkers[t.id]) {
      gpsMarkers[t.id].setLatLng([t.lat, t.lng]);
      gpsMarkers[t.id].setIcon(gpsPin(color, t.alerta_parado));
      gpsMarkers[t.id].setPopupContent(tip);
      if (gpsMarkers[t.id]._tooltipBound) gpsMarkers[t.id].setTooltipContent(tip);
    } else {
      var m = L.marker([t.lat, t.lng], { icon: gpsPin(color, t.alerta_parado) }).addTo(gpsMap);
      m.bindPopup(tip);
      m.bindTooltip(tip, { direction:'top', offset:[0,-14], opacity:0.97 });
      m._tooltipBound = true;
      gpsMarkers[t.id] = m;
    }
  });

  // Quitar marcadores de técnicos que ya no vienen
  Object.keys(gpsMarkers).forEach(function(id){
    if (!tecnicos.find(function(t){ return t.id === id; })) {
      gpsMap.removeLayer(gpsMarkers[id]); delete gpsMarkers[id];
    }
  });

  // Ajustar vista la primera vez
  if (bounds.length && !gpsMap._ajustado) {
    gpsMap.fitBounds(bounds, { padding:[50,50], maxZoom:14 });
    gpsMap._ajustado = true;
  }

  // ── Panel de alertas ──
  var alertas = tecnicos.filter(function(t){ return t.alerta_parado; });
  var ah = '';
  if (alertas.length) {
    ah = '<div style="background:#fff1f1;border:1px solid #fecaca;border-radius:14px;padding:14px 16px;margin-bottom:14px">' +
      '<div style="font-size:0.76rem;font-weight:800;color:#E5484D;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">⚠ Alertas (' + alertas.length + ')</div>' +
      alertas.map(function(t){
        return '<div style="font-size:0.8rem;color:#0F1F2E;margin-bottom:5px"><strong>' + t.nombre + '</strong> parado hace <strong>' + t.min_parado + ' min</strong> sin estar en cita</div>';
      }).join('') + '</div>';
  }
  var elA = document.getElementById('gps-alertas');
  if (elA) elA.innerHTML = ah;

  // ── Lista lateral (leyenda) ──
  var lh = tecnicos.map(function(t, i){
    var color = gpsColorTecnico(i);
    var est = gpsEstadoTexto(t);
    var senal = (t.min_sin_senal != null) ? (t.min_sin_senal <= 0 ? 'ahora' : 'hace ' + t.min_sin_senal + 'm') : '—';
    var clickable = (t.lat != null) ? 'cursor:pointer' : 'opacity:0.5';
    return '<div onclick="gpsCentrar(\\''+t.id+'\\')" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);'+clickable+'">' +
      '<span style="width:14px;height:14px;border-radius:50%;background:'+color+';flex-shrink:0;border:2px solid #fff;box-shadow:0 0 0 1px '+color+'"></span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:0.82rem;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + t.nombre + ' <span style="color:var(--gray2);font-weight:500">#' + t.numero + '</span></div>' +
        '<div style="font-size:0.72rem;color:'+est.col+';font-weight:600">● ' + est.txt + ' <span style="color:var(--gray2);font-weight:400">· ' + senal + '</span></div>' +
      '</div>' +
    '</div>';
  }).join('');
  var elL = document.getElementById('gps-lista');
  if (elL) elL.innerHTML = lh || '<div style="font-size:0.8rem;color:var(--gray)">No hay técnicos activos</div>';
}

function gpsCentrar(id) {
  if (gpsMarkers[id] && gpsMap) {
    var ll = gpsMarkers[id].getLatLng();
    gpsMap.setView(ll, 16);
    gpsMarkers[id].openPopup();
  }
}

async function renderInspecciones() {'''

if ancla_fn in c:
    c = c.replace(ancla_fn, funcion, 1)
    log.append("3. Funcion renderGpsTecnicos: OK")
else:
    log.append("3. NO se encontro renderInspecciones")

# ═══════════════════════════════════════════════════════
# 4. Añadir animación de pulso para alertas (CSS, antes de </style> o en algun <style>)
# ═══════════════════════════════════════════════════════
if 'gpsPulse' not in c:
    anim = '@keyframes gpsPulse { 0%,100% { box-shadow:0 0 0 4px rgba(229,72,77,0.35),0 2px 6px rgba(0,0,0,0.4); } 50% { box-shadow:0 0 0 9px rgba(229,72,77,0.08),0 2px 6px rgba(0,0,0,0.4); } }\n.leaflet-tooltip{font-family:inherit!important;border-radius:10px!important;border:none!important;box-shadow:0 4px 14px rgba(0,0,0,0.18)!important;padding:8px 11px!important}'
    # Insertar antes del primer </style>
    c = c.replace('</style>', anim + '\n</style>', 1)
    log.append("4. Animacion de pulso CSS: OK")
else:
    log.append("4. Animacion ya existe")

open(p,'w').write(c)
print("\n".join(log))
print("---")
print("renderGpsTecnicos:", c.count('renderGpsTecnicos'))
print("cargarGpsTecnicos:", c.count('cargarGpsTecnicos'))
print("gps_tecnicos en menu/loader:", c.count('gps_tecnicos'))
