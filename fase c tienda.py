with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Reemplazar el placeholder del view-tienda
# ─────────────────────────────────────────────
old_view = '''    <!-- TAB TIENDA (placeholder, se construye en Fase C) -->
    <div class="view" id="view-tienda">
      <div class="empty" style="padding-top:80px">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
        <p>La tienda llegará aquí muy pronto</p>
        <a href="https://wifnix.com" target="_blank" style="display:inline-block;margin-top:14px;padding:11px 20px;background:var(--bl);color:#fff;border-radius:10px;font-weight:700;font-size:0.85rem">Ir a la tienda web</a>
      </div>
    </div>'''

new_view = '''    <!-- TAB TIENDA -->
    <div class="view" id="view-tienda">
      <div style="position:relative;margin-bottom:14px">
        <input type="text" id="tienda-search" placeholder="Buscar productos..." oninput="renderProductosApp()" style="width:100%;padding:13px 14px 13px 42px;background:var(--card);border:1px solid var(--line);border-radius:12px;color:var(--white);font-size:0.92rem">
        <svg viewBox="0 0 24 24" style="position:absolute;left:14px;top:13px;width:20px;height:20px;stroke:var(--gray2);fill:none;stroke-width:2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </div>
      <div id="tienda-cats" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:6px;-webkit-overflow-scrolling:touch"></div>
      <div id="tienda-count" style="font-size:0.76rem;color:var(--gray2);margin-bottom:12px"></div>
      <div id="tienda-products"><div class="loading">Cargando productos...</div></div>
    </div>'''

if old_view in c:
    c = c.replace(old_view, new_view)
    print("1. view-tienda reemplazado: OK")
else:
    print("1. NO coincidió view-tienda")

# ─────────────────────────────────────────────
# 2. Añadir botón flotante de carrito + estilos
# ─────────────────────────────────────────────
old_css = '  .toast { position:fixed;'
new_css = '''  /* Tienda */
  .cat-chip { white-space:nowrap; padding:8px 15px; background:var(--card); border:1px solid var(--line); border-radius:20px; font-size:0.8rem; font-weight:600; color:var(--gray); cursor:pointer; transition:all .15s; flex-shrink:0; }
  .cat-chip.active { background:var(--bl); color:#fff; border-color:var(--bl); }
  .prod-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .prod-card { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; cursor:pointer; transition:transform .12s; }
  .prod-card:active { transform:scale(0.97); }
  .prod-img { width:100%; aspect-ratio:1; background:var(--bg2); display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .prod-img img { width:100%; height:100%; object-fit:cover; }
  .prod-img svg { width:40px; height:40px; stroke:var(--gray2); fill:none; stroke-width:1.2; }
  .prod-info { padding:11px; }
  .prod-brand { font-size:0.64rem; color:var(--gray2); text-transform:uppercase; font-weight:700; letter-spacing:0.03em; }
  .prod-name { font-size:0.82rem; font-weight:600; color:var(--white); margin:3px 0 6px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.1em; }
  .prod-price { font-size:1.05rem; font-weight:800; color:var(--bl-l); }
  .prod-stock { font-size:0.66rem; margin-top:3px; }
  .cart-fab { position:fixed; right:18px; bottom:96px; width:56px; height:56px; border-radius:50%; background:var(--green); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 20px rgba(0,229,160,0.4); z-index:65; transition:transform .15s; }
  .cart-fab:active { transform:scale(0.92); }
  .cart-fab svg { width:24px; height:24px; stroke:#06090F; fill:none; stroke-width:2; }
  .cart-fab .cart-count { position:absolute; top:-4px; right:-4px; background:var(--red); color:#fff; font-size:0.62rem; font-weight:800; min-width:20px; height:20px; border-radius:10px; display:flex; align-items:center; justify-content:center; padding:0 5px; border:2px solid var(--bg); }
  .toast { position:fixed;'''
c = c.replace(old_css, new_css, 1)
print("2. CSS tienda: OK")

# ─────────────────────────────────────────────
# 3. Añadir FAB del carrito en el HTML (solo visible en tab tienda)
# ─────────────────────────────────────────────
old_fab = '<div class="toast" id="toast"></div>'
new_fab = '''<div class="cart-fab hidden" id="cart-fab" onclick="abrirCarrito()">
  <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
  <span class="cart-count hidden" id="cart-count">0</span>
</div>
<div class="toast" id="toast"></div>'''
c = c.replace(old_fab, new_fab)
print("3. FAB carrito: OK")

# ─────────────────────────────────────────────
# 4. Añadir lógica JS de tienda antes de "// ---- INIT ----"
# ─────────────────────────────────────────────
js = '''
// ═══ TIENDA ═══
var productosApp = [];
var categoriasApp = [];
var catActivaApp = 'todos';
var carritoApp = [];
try { carritoApp = JSON.parse(localStorage.getItem('wifnix_carrito') || '[]'); } catch(e) { carritoApp = []; }

function getPrecioApp(p) {
  if (p.precio_mostrar === null || p.precio_mostrar === undefined) return null;
  return { precio: p.precio_mostrar };
}

async function cargarTienda() {
  if (productosApp.length) { renderCatsApp(); renderProductosApp(); actualizarCarritoFab(); return; }
  var cont = document.getElementById('tienda-products');
  try {
    var headers = {};
    if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
    var r = await fetch(API + '/api/productos?limit=200', { headers: headers });
    var data = await r.json();
    productosApp = data.productos || [];
    try {
      var rc = await fetch(API + '/api/categorias');
      var dc = await rc.json();
      categoriasApp = dc.categorias || dc || [];
    } catch(e) { categoriasApp = []; }
    renderCatsApp();
    renderProductosApp();
    actualizarCarritoFab();
  } catch(e) {
    cont.innerHTML = '<div class="empty"><p>Error cargando productos</p></div>';
  }
}

function renderCatsApp() {
  var cont = document.getElementById('tienda-cats');
  var html = '<button class="cat-chip ' + (catActivaApp==='todos'?'active':'') + '" onclick="setCatApp(\\'todos\\')">Todos</button>';
  html += categoriasApp.map(function(cat){
    var slug = cat.slug || cat;
    var nombre = cat.nombre_es || cat.nombre || cat;
    return '<button class="cat-chip ' + (catActivaApp===slug?'active':'') + '" onclick="setCatApp(\\'' + slug + '\\')">' + nombre + '</button>';
  }).join('');
  cont.innerHTML = html;
}

function setCatApp(slug) {
  catActivaApp = slug;
  renderCatsApp();
  renderProductosApp();
  document.getElementById('view-tienda').scrollIntoView({ block:'start' });
  window.scrollTo(0,0);
}

function renderProductosApp() {
  var q = (document.getElementById('tienda-search').value || '').toLowerCase().trim();
  var cont = document.getElementById('tienda-products');
  var filtrados = productosApp.filter(function(p){
    if (catActivaApp !== 'todos' && p.categoria_slug !== catActivaApp) return false;
    if (q) {
      var t = ((p.nombre_es||'') + ' ' + (p.marca||'') + ' ' + (p.modelo||'') + ' ' + (p.sku||'')).toLowerCase();
      if (!t.includes(q)) return false;
    }
    return true;
  });
  document.getElementById('tienda-count').textContent = filtrados.length + ' producto' + (filtrados.length!==1?'s':'');
  if (!filtrados.length) {
    cont.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><p>No hay productos</p></div>';
    return;
  }
  cont.innerHTML = '<div class="prod-grid">' + filtrados.map(function(p){
    var precioInfo = getPrecioApp(p);
    var stockClass = p.stock === 0 ? 'var(--red)' : p.stock < 5 ? 'var(--warn)' : 'var(--green)';
    var stockText = p.stock === 0 ? 'Sin stock' : p.stock < 5 ? 'Solo ' + p.stock : 'En stock';
    var precioHTML = precioInfo ? '<div class="prod-price">$' + parseFloat(precioInfo.precio).toFixed(2) + '</div>' : '<div class="prod-price" style="font-size:0.78rem;color:var(--gray)">Inicia sesión</div>';
    return '<div class="prod-card" onclick=\\'abrirProductoApp(' + JSON.stringify(p).replace(/'/g,"&#39;") + ')\\'>' +
      '<div class="prod-img">' + (p.imagen_principal ? '<img src="' + p.imagen_principal + '" alt="">' : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>') + '</div>' +
      '<div class="prod-info">' +
        '<div class="prod-brand">' + (p.marca || '&nbsp;') + '</div>' +
        '<div class="prod-name">' + p.nombre_es + '</div>' +
        precioHTML +
        '<div class="prod-stock" style="color:' + stockClass + '">' + stockText + '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// ── Detalle de producto ──
function abrirProductoApp(p) {
  var precioInfo = getPrecioApp(p);
  var modal = document.createElement('div');
  modal.id = 'modal-producto';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
  var puedeComprar = precioInfo && p.stock > 0;
  modal.innerHTML = '<div style="background:#0D1A2A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;width:100%;max-width:480px;margin:auto;position:relative;overflow:hidden">' +
    '<button onclick="document.getElementById(\\'modal-producto\\').remove()" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.5);border:none;color:#fff;font-size:1.5rem;cursor:pointer;width:34px;height:34px;border-radius:50%;z-index:2">×</button>' +
    '<div style="width:100%;aspect-ratio:1.3;background:#06090F;display:flex;align-items:center;justify-content:center;overflow:hidden">' + (p.imagen_principal ? '<img src="' + p.imagen_principal + '" style="width:100%;height:100%;object-fit:contain">' : '<svg viewBox="0 0 24 24" style="width:60px;height:60px;stroke:#5A6B7C;fill:none;stroke-width:1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>') + '</div>' +
    '<div style="padding:20px">' +
      '<div style="font-size:0.7rem;color:var(--gray2);text-transform:uppercase;font-weight:700">' + (p.marca || '') + (p.modelo ? ' · ' + p.modelo : '') + '</div>' +
      '<h2 style="font-size:1.2rem;font-weight:800;color:#F0F4F8;margin:5px 0 10px">' + p.nombre_es + '</h2>' +
      (precioInfo ? '<div style="font-size:1.6rem;font-weight:800;color:var(--bl-l);margin-bottom:8px">$' + parseFloat(precioInfo.precio).toFixed(2) + '</div>' : '<div style="font-size:1rem;color:var(--gray);margin-bottom:8px">Inicia sesión para ver el precio</div>') +
      '<div style="font-size:0.8rem;color:' + (p.stock===0?'var(--red)':p.stock<5?'var(--warn)':'var(--green)') + ';margin-bottom:14px">' + (p.stock===0?'Sin stock':p.stock<5?'Stock bajo (' + p.stock + ')':'En stock (' + p.stock + ')') + '</div>' +
      (p.descripcion_es ? '<div style="font-size:0.86rem;color:var(--gray);line-height:1.6;margin-bottom:18px">' + p.descripcion_es + '</div>' : '') +
      (puedeComprar ? '<button onclick="agregarApp(\\'' + p.id + '\\')" style="width:100%;padding:15px;background:var(--green);color:#06090F;border:none;border-radius:12px;font-size:0.95rem;font-weight:800;cursor:pointer;font-family:inherit">Añadir al carrito</button>' : (p.stock===0 ? '<button disabled style="width:100%;padding:15px;background:rgba(255,255,255,0.06);color:var(--gray);border:none;border-radius:12px;font-weight:700">Sin stock</button>' : '<button disabled style="width:100%;padding:15px;background:rgba(255,255,255,0.06);color:var(--gray);border:none;border-radius:12px;font-weight:700">Inicia sesión</button>')) +
    '</div>' +
  '</div>';
  document.body.appendChild(modal);
}

function agregarApp(id) {
  var p = productosApp.find(function(x){ return x.id === id; });
  if (!p) return;
  var precioInfo = getPrecioApp(p);
  if (!precioInfo) { toast('Inicia sesión'); return; }
  var item = carritoApp.find(function(x){ return x.id === id; });
  if (item) {
    if (item.cantidad >= p.stock) { toast('No hay más stock'); return; }
    item.cantidad++;
  } else {
    carritoApp.push({ id:p.id, sku:p.sku, nombre:p.nombre_es, precio:parseFloat(precioInfo.precio), cantidad:1, stock:p.stock });
  }
  localStorage.setItem('wifnix_carrito', JSON.stringify(carritoApp));
  actualizarCarritoFab();
  var m = document.getElementById('modal-producto'); if (m) m.remove();
  toast('Añadido al carrito');
}

function actualizarCarritoFab() {
  var total = carritoApp.reduce(function(s,x){ return s + x.cantidad; }, 0);
  var cnt = document.getElementById('cart-count');
  if (total > 0) { cnt.textContent = total; cnt.classList.remove('hidden'); }
  else { cnt.classList.add('hidden'); }
}

// ── Carrito ──
function abrirCarrito() {
  var modal = document.createElement('div');
  modal.id = 'modal-carrito';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  var items = carritoApp.length ? carritoApp.map(function(it,idx){
    return '<div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)">' +
      '<div style="flex:1"><div style="font-size:0.88rem;font-weight:600;color:#F0F4F8">' + it.nombre + '</div>' +
      '<div style="font-size:0.8rem;color:var(--bl-l);font-weight:700;margin-top:2px">$' + it.precio.toFixed(2) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<button onclick="cambiarCantApp(' + idx + ',-1)" style="width:30px;height:30px;border-radius:8px;background:var(--card2);color:#fff;border:1px solid var(--line);font-size:1.1rem;cursor:pointer">−</button>' +
        '<span style="min-width:20px;text-align:center;font-weight:700">' + it.cantidad + '</span>' +
        '<button onclick="cambiarCantApp(' + idx + ',1)" style="width:30px;height:30px;border-radius:8px;background:var(--card2);color:#fff;border:1px solid var(--line);font-size:1.1rem;cursor:pointer">+</button>' +
      '</div></div>';
  }).join('') : '<div style="text-align:center;padding:40px 0;color:var(--gray)">Tu carrito está vacío</div>';
  var total = carritoApp.reduce(function(s,x){ return s + x.precio * x.cantidad; }, 0);
  modal.innerHTML = '<div style="background:#0D1A2A;border-top:1px solid rgba(255,255,255,0.1);border-radius:20px 20px 0 0;width:100%;max-width:600px;padding:22px;max-height:80vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2 style="font-size:1.2rem;font-weight:800;color:#F0F4F8">Mi carrito</h2>' +
    '<button onclick="document.getElementById(\\'modal-carrito\\').remove()" style="background:transparent;border:none;color:#8BA0B4;font-size:1.6rem;cursor:pointer">×</button></div>' +
    '<div id="carrito-items">' + items + '</div>' +
    (carritoApp.length ? '<div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0;font-size:1.1rem;font-weight:800;color:#F0F4F8"><span>Total</span><span style="color:var(--green)">$' + total.toFixed(2) + '</span></div>' +
    '<button onclick="irACheckout()" style="width:100%;padding:15px;background:var(--green);color:#06090F;border:none;border-radius:12px;font-size:0.95rem;font-weight:800;cursor:pointer;font-family:inherit">Proceder al pago</button>' : '') +
  '</div>';
  document.body.appendChild(modal);
}

function cambiarCantApp(idx, delta) {
  var it = carritoApp[idx];
  if (!it) return;
  it.cantidad += delta;
  if (it.cantidad <= 0) carritoApp.splice(idx, 1);
  else if (it.cantidad > it.stock) { it.cantidad = it.stock; toast('Máximo stock'); }
  localStorage.setItem('wifnix_carrito', JSON.stringify(carritoApp));
  actualizarCarritoFab();
  document.getElementById('modal-carrito').remove();
  abrirCarrito();
}

function irACheckout() {
  localStorage.setItem('wifnix_carrito', JSON.stringify(carritoApp));
  window.location.href = 'https://wifnix.com/checkout.html';
}

// ---- INIT ----'''

c = c.replace('// ---- INIT ----', js)

# ─────────────────────────────────────────────
# 5. Conectar switchTab para cargar tienda y mostrar/ocultar FAB
# ─────────────────────────────────────────────
old_switch = '''  if (tab === 'servicios') cargarServicios();
  if (tab === 'cuenta') cargarCuenta();'''
new_switch = '''  if (tab === 'servicios') cargarServicios();
  if (tab === 'cuenta') cargarCuenta();
  if (tab === 'tienda') { cargarTienda(); document.getElementById('cart-fab').classList.remove('hidden'); }
  else { document.getElementById('cart-fab').classList.add('hidden'); }'''
c = c.replace(old_switch, new_switch)
print("5. switchTab conectado: OK")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)

print("---")
print("cargarTienda:", c.count('function cargarTienda'))
print("renderProductosApp:", c.count('function renderProductosApp'))
print("abrirProductoApp:", c.count('function abrirProductoApp'))
print("abrirCarrito:", c.count('function abrirCarrito'))
print("irACheckout:", c.count('function irACheckout'))
