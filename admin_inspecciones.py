with open('/var/www/wifnix/admin/index.html','r') as f:
    c = f.read()

if "renderInspecciones" in c:
    print("Ya existe renderInspecciones. Abortando.")
    raise SystemExit

# ─────────────────────────────────────────────
# 1. Entrada en el menú, después de "Mantenimientos" (citas)
# ─────────────────────────────────────────────
old_menu = """    {id: 'citas', label: 'Mantenimientos', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'},"""
new_menu = old_menu + """
    {id: 'inspecciones', label: 'Inspecciones flota', icon: '<path d="M3 9l1-3h16l1 3"/><path d="M5 9h14v8H5z"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>'},"""
if old_menu in c:
    c = c.replace(old_menu, new_menu)
    print("1. Entrada de menú: OK")
else:
    print("1. NO coincidió la entrada de menú")

# ─────────────────────────────────────────────
# 2. Loader en el mapa de secciones
# ─────────────────────────────────────────────
old_load = """    contabilidad: renderContabilidad, productos: renderProductos, auditoria: renderAuditoria, resenas: renderResenas, citas: renderCitas,
    mensajes: renderMensajes"""
new_load = """    contabilidad: renderContabilidad, productos: renderProductos, auditoria: renderAuditoria, resenas: renderResenas, citas: renderCitas,
    mensajes: renderMensajes, inspecciones: renderInspecciones"""
if old_load in c:
    c = c.replace(old_load, new_load)
    print("2. Loader: OK")
else:
    print("2. NO coincidió el loader")

# ─────────────────────────────────────────────
# 3. Función renderInspecciones — insertar antes de renderGarantias
# ─────────────────────────────────────────────
anchor = "async function renderGarantias() {"
func = """async function renderInspecciones() {
  var main = document.getElementById('main');
  main.innerHTML = '<div class="ph">' +
    '<div><h1>Inspecciones de flota</h1><p>Inspecciones de vehículos de la compañía · fotos disponibles 10 días</p></div>' +
    '</div>' +
    '<div id="insp-list"><div class="loading">Cargando...</div></div>';

  var data = await api('/api/admin/inspecciones') || [];
  var el = document.getElementById('insp-list');
  if (!data.length) { el.innerHTML = '<div class="card"><div class="empty">Sin inspecciones registradas</div></div>'; return; }

  el.innerHTML = data.map(function(iv) {
    var fecha = new Date(iv.creada);
    var fStr = fecha.toLocaleDateString('es-PR', {weekday:'short', day:'numeric', month:'short'}) + ' · ' + fecha.toLocaleTimeString('es-PR', {hour:'2-digit', minute:'2-digit'});
    var esSalida = iv.tipo === 'salida';
    var tipoBadge = esSalida
      ? '<span style="background:rgba(11,143,204,0.12);color:#0B8FCC;padding:4px 10px;border-radius:20px;font-size:0.7rem;font-weight:800">🚗 Tomó vehículo</span>'
      : '<span style="background:rgba(0,179,119,0.12);color:#00B377;padding:4px 10px;border-radius:20px;font-size:0.7rem;font-weight:800">🏁 Entregó vehículo</span>';
    var maps = (iv.latitud && iv.longitud) ? 'https://maps.google.com/?q=' + iv.latitud + ',' + iv.longitud : null;
    var fotos = (iv.fotos || []);
    var fotosHTML = fotos.length
      ? '<div style="display:flex;gap:8px;overflow-x:auto;margin-top:12px;padding-bottom:4px">' + fotos.map(function(f){
          return '<a href="' + f.url + '" target="_blank" style="flex-shrink:0;position:relative"><img src="' + f.url + '" style="width:90px;height:90px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.1)"><span style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.65);color:#fff;font-size:0.58rem;padding:2px 6px;border-radius:5px;font-weight:700">' + f.tipo + '</span></a>';
        }).join('') + '</div>'
      : '<div style="font-size:0.78rem;color:var(--gray2);margin-top:10px;font-style:italic">Fotos ya expiradas (más de 10 días)</div>';

    return '<div class="card" style="margin-bottom:12px">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:1rem;font-weight:800;color:var(--white)">' + (iv.tecnico_nombre || 'Técnico') + ' <span style="font-size:0.74rem;color:var(--gray2);font-weight:600">#' + (iv.numero_empleado || '') + '</span></div>' +
          '<div style="font-size:0.78rem;color:var(--gray);margin-top:3px">' + fStr + '</div>' +
        '</div>' +
        tipoBadge +
      '</div>' +
      '<div style="display:flex;gap:18px;margin-top:12px;flex-wrap:wrap">' +
        '<div><div style="font-size:0.66rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Millaje</div><div style="font-size:0.95rem;color:var(--white);font-weight:700;margin-top:2px">' + (iv.millaje ? Number(iv.millaje).toLocaleString('en-US') + ' mi' : '—') + '</div></div>' +
        '<div><div style="font-size:0.66rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Ubicación</div><div style="font-size:0.95rem;margin-top:2px">' + (maps ? '<a href="' + maps + '" target="_blank" style="color:#0B8FCC;text-decoration:none">Ver mapa →</a>' : '—') + '</div></div>' +
        '<div><div style="font-size:0.66rem;color:var(--gray2);text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Fotos</div><div style="font-size:0.95rem;color:var(--white);font-weight:700;margin-top:2px">' + fotos.length + '</div></div>' +
      '</div>' +
      fotosHTML +
    '</div>';
  }).join('');
}

async function renderGarantias() {"""

if anchor in c:
    c = c.replace(anchor, func, 1)
    print("3. Función renderInspecciones: OK")
else:
    print("3. NO coincidió ancla renderGarantias")

with open('/var/www/wifnix/admin/index.html','w') as f:
    f.write(c)
print("---")
print("renderInspecciones:", c.count('function renderInspecciones') + c.count('async function renderInspecciones'))
