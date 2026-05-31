with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Revertir el click a abrirProductoApp (detalle nativo) usando el id
# ─────────────────────────────────────────────
old_click = '''onclick=\\'verProductoWeb("' + encodeURIComponent(p.sku) + '")\\'>'''
new_click = '''onclick="abrirProductoApp('&#39;' + p.id + '&#39;')">'''
if old_click in c:
    c = c.replace(old_click, new_click)
    print("1. click -> abrirProductoApp(id): OK")
else:
    print("1. NO coincidió onclick (buscando alterno)")
    # intento alterno por si el escape difiere
    import re
    if 'verProductoWeb(' in c:
        c = re.sub(r"onclick=\\\\'verProductoWeb\([^)]*\)\\\\'>", '''onclick="abrirProductoApp('&#39;' + p.id + '&#39;')">''', c)
        print("   reemplazo alterno aplicado")

# ─────────────────────────────────────────────
# 2. Reemplazar la vieja función abrirProductoApp por el detalle nativo completo
#    (busca desde "function abrirProductoApp(p) {" hasta su cierre antes de "function agregarApp")
# ─────────────────────────────────────────────
start = c.find('function abrirProductoApp(')
end = c.find('function agregarApp(')
if start != -1 and end != -1 and end > start:
    nueva = '''function abrirProductoApp(id) {
  var p = productosApp.find(function(x){ return x.id === id; });
  var modal = document.createElement('div');
  modal.id = 'modal-producto';
  modal.style.cssText = 'position:fixed;inset:0;background:#06090F;z-index:9999;overflow-y:auto;-webkit-overflow-scrolling:touch';
  modal.innerHTML = '<div class="loading" style="padding-top:80px">Cargando producto...</div>';
  document.body.appendChild(modal);
  // Cargar datos completos por id (specs, imagenes)
  api('/api/productos/' + id).then(function(full){
    var prod = full && !full.error ? full : p;
    if (!prod) { modal.innerHTML = '<div class="empty" style="padding-top:80px"><p>Producto no disponible</p><button onclick="document.getElementById(\\'modal-producto\\').remove()" style="margin-top:14px;padding:11px 20px;background:var(--bl);color:#fff;border:none;border-radius:10px;font-weight:700">Volver</button></div>'; return; }
    pintarProductoApp(modal, prod);
  }).catch(function(){ if (p) pintarProductoApp(modal, p); });
}

function pintarProductoApp(modal, p) {
  var precioInfo = getPrecioApp(p);
  var puedeComprar = precioInfo && p.stock > 0;
  // Galería
  var imgs = [];
  if (p.imagen_principal) imgs.push(p.imagen_principal);
  if (Array.isArray(p.imagenes)) imgs = imgs.concat(p.imagenes.filter(function(u){ return u && u !== p.imagen_principal; }));
  var galeria;
  if (imgs.length) {
    galeria = '<div style="position:relative;background:#0B121C">' +
      '<div id="prod-gal" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch">' +
      imgs.map(function(u){ return '<div style="flex:0 0 100%;scroll-snap-align:center;aspect-ratio:1.1;display:flex;align-items:center;justify-content:center"><img src="' + u + '" style="width:100%;height:100%;object-fit:contain"></div>'; }).join('') +
      '</div>' +
      (imgs.length > 1 ? '<div style="position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:6px">' + imgs.map(function(){ return '<div style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.4)"></div>'; }).join('') + '</div>' : '') +
    '</div>';
  } else {
    galeria = '<div style="aspect-ratio:1.3;background:#0B121C;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:60px;height:60px;stroke:#5A6B7C;fill:none;stroke-width:1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg></div>';
  }
  // Specs
  var specsHTML = '';
  if (p.specs && typeof p.specs === 'object' && Object.keys(p.specs).length) {
    var rows = Object.keys(p.specs).map(function(k){
      return '<tr style="border-bottom:1px solid var(--line)"><td style="padding:10px 12px;font-weight:700;color:var(--gray);width:42%;background:rgba(11,143,204,0.04)">' + k + '</td><td style="padding:10px 12px;color:#F0F4F8">' + p.specs[k] + '</td></tr>';
    }).join('');
    specsHTML = '<div style="font-size:0.78rem;font-weight:800;color:#F0F4F8;margin:20px 0 8px">Especificaciones</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;border:1px solid var(--line);border-radius:8px;overflow:hidden"><tbody>' + rows + '</tbody></table>';
  }
  var stockColor = p.stock===0?'var(--red)':p.stock<5?'var(--warn)':'var(--green)';
  var stockText = p.stock===0?'Sin stock':p.stock<5?'Stock bajo ('+p.stock+')':'En stock ('+p.stock+')';

  modal.innerHTML =
    '<div style="position:sticky;top:0;z-index:5;background:rgba(6,9,15,0.9);backdrop-filter:blur(12px);padding:calc(12px + env(safe-area-inset-top)) 16px 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)">' +
      '<button onclick="document.getElementById(\\'modal-producto\\').remove()" style="width:38px;height:38px;border-radius:10px;background:var(--card);border:1px solid var(--line);color:#fff;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center">‹</button>' +
      '<div style="font-size:0.95rem;font-weight:700;color:#F0F4F8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + p.nombre_es + '</div>' +
    '</div>' +
    galeria +
    '<div style="padding:20px;max-width:600px;margin:0 auto">' +
      '<div style="font-size:0.7rem;color:var(--gray2);text-transform:uppercase;font-weight:700">' + (p.marca||'') + (p.modelo?' · '+p.modelo:'') + '</div>' +
      '<h1 style="font-size:1.3rem;font-weight:800;color:#F0F4F8;margin:5px 0 12px;line-height:1.3">' + p.nombre_es + '</h1>' +
      (precioInfo ? '<div style="font-size:1.8rem;font-weight:800;color:var(--bl-l);margin-bottom:6px">$' + parseFloat(precioInfo.precio).toFixed(2) + '</div>' : '<div style="font-size:1rem;color:var(--gray);margin-bottom:6px">Inicia sesión para ver el precio</div>') +
      '<div style="font-size:0.84rem;color:' + stockColor + ';margin-bottom:18px">' + stockText + '</div>' +
      (p.descripcion_es ? '<div style="font-size:0.9rem;color:var(--gray);line-height:1.65;margin-bottom:6px;white-space:pre-line">' + p.descripcion_es + '</div>' : '') +
      specsHTML +
      '<div style="height:90px"></div>' +
    '</div>' +
    '<div style="position:fixed;bottom:0;left:0;right:0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:rgba(6,9,15,0.95);backdrop-filter:blur(12px);border-top:1px solid var(--line);max-width:600px;margin:0 auto">' +
      (puedeComprar ? '<button onclick="agregarApp(\\'' + p.id + '\\')" style="width:100%;padding:16px;background:var(--green);color:#06090F;border:none;border-radius:13px;font-size:0.98rem;font-weight:800;cursor:pointer;font-family:inherit">Añadir al carrito</button>' : (p.stock===0 ? '<button disabled style="width:100%;padding:16px;background:rgba(255,255,255,0.06);color:var(--gray);border:none;border-radius:13px;font-weight:700">Sin stock</button>' : '<button disabled style="width:100%;padding:16px;background:rgba(255,255,255,0.06);color:var(--gray);border:none;border-radius:13px;font-weight:700">Inicia sesión para comprar</button>')) +
    '</div>';
}

'''
    c = c[:start] + nueva + c[end:]
    print("2. Detalle nativo de producto: OK")
else:
    print("2. NO se encontró el rango de abrirProductoApp/agregarApp")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)

print("---")
print("abrirProductoApp:", c.count('function abrirProductoApp'))
print("pintarProductoApp:", c.count('function pintarProductoApp'))
print("agregarApp:", c.count('function agregarApp'))
print("verProductoWeb restante:", c.count('verProductoWeb'))
