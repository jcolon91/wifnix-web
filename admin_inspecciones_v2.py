with open('/var/www/wifnix/admin/index.html','r') as f:
    c = f.read()

# ═══════════════════════════════════════════════
# 1. Añadir Leaflet CSS + JS en el <head> si no está
# ═══════════════════════════════════════════════
if 'unpkg.com/leaflet' not in c:
    head_close = '</head>'
    leaflet = '''<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>'''
    c = c.replace(head_close, leaflet, 1)
    print("1. Leaflet CSS/JS añadido: OK")
else:
    print("1. Leaflet ya estaba")

# ═══════════════════════════════════════════════
# 2. Añadir modal de mapa antes de </body>
# ═══════════════════════════════════════════════
if 'id="map-modal"' not in c:
    body_close = '</body>'
    modal = '''<!-- MODAL MAPA INSPECCION -->
<div id="map-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)cerrarMapaInsp()">
  <div style="background:var(--card,#1a1d24);border-radius:16px;overflow:hidden;width:100%;max-width:640px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div id="map-modal-title" style="font-weight:800;color:var(--white,#fff);font-size:0.95rem">Ubicación</div>
      <button onclick="cerrarMapaInsp()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1.1rem">×</button>
    </div>
    <div id="insp-map" style="width:100%;height:400px"></div>
  </div>
</div>
</body>'''
    c = c.replace(body_close, modal, 1)
    print("2. Modal de mapa añadido: OK")
else:
    print("2. Modal ya estaba")

# ═══════════════════════════════════════════════
# 3. Reescribir renderInspecciones (agrupar + datos + mapa modal)
# ═══════════════════════════════════════════════
import re
m = re.search(r"async function renderInspecciones\(\) \{.*?\n\}", c, re.DOTALL)
if not m:
    print("3. NO se encontró renderInspecciones")
else:
    nuevo = """async function renderInspecciones() {
  var main = document.getElementById('main');
  main.innerHTML = '<div class="ph">' +
    '<div><h1>Inspecciones de flota</h1><p>Inspecciones de vehiculos de la compania · fotos disponibles 10 dias</p></div>' +
    '</div>' +
    '<div id="insp-list"><div class="loading">Cargando...</div></div>';

  var data = await api('/api/admin/inspecciones') || [];
  var el = document.getElementById('insp-list');
  if (!data.length) { el.innerHTML = '<div class="card"><div class="empty">Sin inspecciones registradas</div></div>'; return; }

  // Guardar para el mapa
  window._inspData = data;

  // Agrupar por tecnico + fecha (dia)
  var grupos = {};
  data.forEach(function(iv){
    var d = new Date(iv.creada);
    var diaKey = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+'|'+(iv.numero_empleado||'');
    if (!grupos[diaKey]) grupos[diaKey] = { tecnico_nombre: iv.tecnico_nombre, numero_empleado: iv.numero_empleado, fecha: d, salida: null, entrega: null };
    if (iv.tipo === 'salida') grupos[diaKey].salida = iv;
    else grupos[diaKey].entrega = iv;
  });

  // Ordenar grupos por fecha desc
  var lista = Object.keys(grupos).map(function(k){ return grupos[k]; });
  lista.sort(function(a,b){ return b.fecha - a.fecha; });

  function tarjetaInsp(iv, esSalida) {
    if (!iv) {
      return '<div style="flex:1;min-width:260px;border:1.5px dashed rgba(255,255,255,0.12);border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:center;color:var(--gray2);font-size:0.82rem;font-style:italic">' +
        (esSalida ? 'Sin inspeccion de toma' : 'Sin inspeccion de entrega (pendiente)') + '</div>';
    }
    var hora = new Date(iv.creada).toLocaleTimeString('es-PR', {hour:'2-digit', minute:'2-digit'});
    var color = esSalida ? '#0B8FCC' : '#00B377';
    var titulo = esSalida ? 'TOMA (manana)' : 'ENTREGA (tarde)';
    var fotos = (iv.fotos || []);
    var tieneMapa = !!(iv.latitud && iv.longitud);
    var fotosHTML = fotos.length
      ? '<div style="display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:4px">' + fotos.map(function(f){
          return '<img onclick="ampliarFoto(\\''+f.url+'\\')" src="' + f.url + '" style="flex-shrink:0;width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer" title="'+f.tipo+'">';
        }).join('') + '</div>'
      : '<div style="font-size:0.74rem;color:var(--gray2);margin-top:8px;font-style:italic">Fotos expiradas (+10 dias)</div>';

    return '<div style="flex:1;min-width:260px;border:1px solid rgba(255,255,255,0.08);border-left:4px solid '+color+';border-radius:12px;padding:16px;background:rgba(255,255,255,0.02)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<span style="font-size:0.7rem;font-weight:800;color:'+color+';letter-spacing:0.05em">'+titulo+'</span>' +
        '<span style="font-size:0.74rem;color:var(--gray)">'+hora+'</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><div style="font-size:0.62rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Unidad</div><div style="font-size:0.9rem;color:var(--white);font-weight:700">'+(iv.unidad_numero||'—')+'</div></div>' +
        '<div><div style="font-size:0.62rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Tablilla</div><div style="font-size:0.9rem;color:var(--white);font-weight:700">'+(iv.placa||'—')+'</div></div>' +
        '<div><div style="font-size:0.62rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Millaje</div><div style="font-size:0.9rem;color:var(--white);font-weight:700">'+(iv.millaje?Number(iv.millaje).toLocaleString('en-US')+' mi':'—')+'</div></div>' +
        '<div><div style="font-size:0.62rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Ubicacion</div><div style="font-size:0.9rem">'+(tieneMapa?'<span onclick="abrirMapaInsp('+iv.id+')" style="color:'+color+';cursor:pointer;font-weight:700">Ver mapa</span>':'—')+'</div></div>' +
      '</div>' +
      fotosHTML +
    '</div>';
  }

  el.innerHTML = lista.map(function(g){
    var fStr = g.fecha.toLocaleDateString('es-PR', {weekday:'long', day:'numeric', month:'long'});
    // Aviso si unidad/tablilla no machan entre toma y entrega
    var aviso = '';
    if (g.salida && g.entrega) {
      var difUnidad = (g.salida.unidad_numero||'') !== (g.entrega.unidad_numero||'');
      var difPlaca = (g.salida.placa||'') !== (g.entrega.placa||'');
      if (difUnidad || difPlaca) {
        aviso = '<div style="background:rgba(232,150,17,0.12);border:1px solid rgba(232,150,17,0.3);color:#E89611;border-radius:8px;padding:8px 12px;font-size:0.78rem;font-weight:600;margin-top:10px">⚠ La unidad o tablilla NO coinciden entre la toma y la entrega</div>';
      }
    }
    return '<div class="card" style="margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
        '<div style="font-size:1rem;font-weight:800;color:var(--white)">'+(g.tecnico_nombre||'Tecnico')+' <span style="font-size:0.74rem;color:var(--gray2);font-weight:600">#'+(g.numero_empleado||'')+'</span></div>' +
        '<div style="font-size:0.8rem;color:var(--gray);text-transform:capitalize">'+fStr+'</div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
        tarjetaInsp(g.salida, true) +
        tarjetaInsp(g.entrega, false) +
      '</div>' +
      aviso +
    '</div>';
  }).join('');
}

var _inspMap = null;
function abrirMapaInsp(id) {
  var iv = (window._inspData||[]).find(function(x){ return x.id === id; });
  if (!iv || !iv.latitud || !iv.longitud) return;
  document.getElementById('map-modal-title').textContent = (iv.tecnico_nombre||'Tecnico') + ' · ' + (iv.tipo==='salida'?'Toma':'Entrega');
  document.getElementById('map-modal').style.display = 'flex';
  setTimeout(function(){
    if (_inspMap) { _inspMap.remove(); _inspMap = null; }
    _inspMap = L.map('insp-map').setView([iv.latitud, iv.longitud], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(_inspMap);
    L.marker([iv.latitud, iv.longitud]).addTo(_inspMap);
    _inspMap.invalidateSize();
  }, 150);
}
function cerrarMapaInsp() {
  document.getElementById('map-modal').style.display = 'none';
  if (_inspMap) { _inspMap.remove(); _inspMap = null; }
}
function ampliarFoto(url) {
  window.open(url, '_blank');
}"""
    c = c.replace(m.group(0), nuevo, 1)
    print("3. renderInspecciones reescrito: OK")

with open('/var/www/wifnix/admin/index.html','w') as f:
    f.write(c)
print("---")
print("abrirMapaInsp:", c.count('function abrirMapaInsp'))
print("map-modal:", c.count('id="map-modal"'))
print("unidad_numero:", c.count('unidad_numero'))
