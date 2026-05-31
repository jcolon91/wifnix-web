with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Reemplazar el view-tienda (buscador con barra + boton hamburguesa, sin chips)
# ─────────────────────────────────────────────
old_view = '''    <div class="view" id="view-tienda">
      <div style="position:relative;margin-bottom:14px">
        <input type="text" id="tienda-search" placeholder="Buscar productos..." oninput="renderProductosApp()" style="width:100%;padding:13px 14px 13px 42px;background:var(--card);border:1px solid var(--line);border-radius:12px;color:var(--white);font-size:0.92rem">
        <svg viewBox="0 0 24 24" style="position:absolute;left:14px;top:13px;width:20px;height:20px;stroke:var(--gray2);fill:none;stroke-width:2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </div>
      <div id="tienda-cats" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:6px;-webkit-overflow-scrolling:touch"></div>
      <div id="tienda-count" style="font-size:0.76rem;color:var(--gray2);margin-bottom:12px"></div>
      <div id="tienda-products"><div class="loading">Cargando productos...</div></div>
    </div>'''

new_view = '''    <div class="view" id="view-tienda">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px">
        <button onclick="abrirCategorias()" style="flex-shrink:0;width:46px;height:46px;border-radius:12px;background:var(--card);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer">
          <svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:var(--white);fill:none;stroke-width:2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div style="position:relative;flex:1">
          <input type="text" id="tienda-search" placeholder="Buscar productos..." oninput="renderProductosApp()" style="width:100%;padding:13px 14px 13px 42px;background:var(--card);border:1px solid var(--line);border-radius:12px;color:var(--white);font-size:0.92rem">
          <svg viewBox="0 0 24 24" style="position:absolute;left:14px;top:13px;width:20px;height:20px;stroke:var(--gray2);fill:none;stroke-width:2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </div>
      </div>
      <div id="tienda-cat-actual" style="font-size:1rem;font-weight:800;color:var(--white);margin-bottom:4px">Todos los productos</div>
      <div id="tienda-count" style="font-size:0.76rem;color:var(--gray2);margin-bottom:14px"></div>
      <div id="tienda-products"><div class="loading">Cargando productos...</div></div>
    </div>'''

if old_view in c:
    c = c.replace(old_view, new_view)
    print("1. view-tienda rediseñado: OK")
else:
    print("1. NO coincidió view-tienda")

# ─────────────────────────────────────────────
# 2. Reemplazar CSS de tienda (grid -> lista estilo Amazon + drawer)
# ─────────────────────────────────────────────
old_css = '''  .cat-chip { white-space:nowrap; padding:8px 15px; background:var(--card); border:1px solid var(--line); border-radius:20px; font-size:0.8rem; font-weight:600; color:var(--gray); cursor:pointer; transition:all .15s; flex-shrink:0; }
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
  .prod-stock { font-size:0.66rem; margin-top:3px; }'''

new_css = '''  /* Lista productos estilo Amazon */
  .prod-row { display:flex; gap:13px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; margin-bottom:11px; cursor:pointer; transition:transform .12s; }
  .prod-row:active { transform:scale(0.985); }
  .prod-row .pr-img { flex-shrink:0; width:96px; height:96px; border-radius:10px; background:var(--bg2); display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .prod-row .pr-img img { width:100%; height:100%; object-fit:cover; }
  .prod-row .pr-img svg { width:34px; height:34px; stroke:var(--gray2); fill:none; stroke-width:1.2; }
  .prod-row .pr-info { flex:1; min-width:0; display:flex; flex-direction:column; }
  .prod-brand { font-size:0.62rem; color:var(--gray2); text-transform:uppercase; font-weight:700; letter-spacing:0.03em; }
  .prod-name { font-size:0.88rem; font-weight:600; color:var(--white); margin:2px 0 5px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .prod-price { font-size:1.15rem; font-weight:800; color:var(--bl-l); margin-top:auto; }
  .prod-stock { font-size:0.68rem; margin-top:2px; }
  /* Drawer categorías */
  .cat-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(3px); z-index:200; opacity:0; transition:opacity .25s; }
  .cat-overlay.show { opacity:1; }
  .cat-drawer { position:fixed; top:0; left:0; bottom:0; width:80%; max-width:320px; background:#0D1A2A; border-right:1px solid var(--line); z-index:201; transform:translateX(-100%); transition:transform .28s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column; padding-top:env(safe-area-inset-top); }
  .cat-drawer.show { transform:translateX(0); }
  .cat-drawer-head { padding:20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; }
  .cat-drawer-head h3 { font-size:1.1rem; font-weight:800; color:var(--white); }
  .cat-list { flex:1; overflow-y:auto; padding:10px; }
  .cat-item { display:flex; align-items:center; justify-content:space-between; padding:14px 15px; border-radius:10px; cursor:pointer; font-size:0.92rem; color:var(--gray); font-weight:600; transition:background .12s; }
  .cat-item:active { background:var(--card2); }
  .cat-item.active { background:rgba(11,143,204,0.12); color:var(--bl-l); }'''

if old_css in c:
    c = c.replace(old_css, new_css)
    print("2. CSS tienda (lista + drawer): OK")
else:
    print("2. NO coincidió CSS")

# ─────────────────────────────────────────────
# 3. Añadir el drawer HTML antes del FAB del carrito
# ─────────────────────────────────────────────
old_fab = '''<div class="cart-fab hidden" id="cart-fab" onclick="abrirCarrito()">'''
new_fab = '''<div class="cat-overlay" id="cat-overlay" onclick="cerrarCategorias()" style="display:none"></div>
<div class="cat-drawer" id="cat-drawer">
  <div class="cat-drawer-head">
    <h3>Categorías</h3>
    <button onclick="cerrarCategorias()" style="background:transparent;border:none;color:var(--gray);font-size:1.6rem;cursor:pointer">×</button>
  </div>
  <div class="cat-list" id="cat-list"></div>
</div>
<div class="cart-fab hidden" id="cart-fab" onclick="abrirCarrito()">'''
c = c.replace(old_fab, new_fab)
print("3. Drawer HTML: OK")

# ─────────────────────────────────────────────
# 4. Reemplazar renderCatsApp + setCatApp (ahora pinta el drawer) y renderProductosApp (lista)
# ─────────────────────────────────────────────
old_cats = '''function renderCatsApp() {
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
}'''

new_cats = '''var catNombreActual = 'Todos los productos';
function renderCatsApp() {
  var cont = document.getElementById('cat-list');
  function fila(slug, nombre, count) {
    return '<div class="cat-item ' + (catActivaApp===slug?'active':'') + '" onclick="setCatApp(\\'' + slug + '\\',\\'' + nombre.replace(/'/g,"&#39;") + '\\')">' +
      '<span>' + nombre + '</span>' + (count!=null?'<span style="font-size:0.74rem;color:var(--gray2)">' + count + '</span>':'') + '</div>';
  }
  var total = productosApp.length;
  var html = fila('todos','Todos los productos',total);
  html += categoriasApp.map(function(cat){
    var slug = cat.slug || cat;
    var nombre = cat.nombre_es || cat.nombre || cat;
    var count = productosApp.filter(function(p){ return p.categoria_slug === slug; }).length;
    return fila(slug, nombre, count);
  }).join('');
  cont.innerHTML = html;
}

function abrirCategorias() {
  renderCatsApp();
  var ov = document.getElementById('cat-overlay');
  var dr = document.getElementById('cat-drawer');
  ov.style.display = 'block';
  requestAnimationFrame(function(){ ov.classList.add('show'); dr.classList.add('show'); });
}
function cerrarCategorias() {
  var ov = document.getElementById('cat-overlay');
  var dr = document.getElementById('cat-drawer');
  ov.classList.remove('show'); dr.classList.remove('show');
  setTimeout(function(){ ov.style.display = 'none'; }, 280);
}

function setCatApp(slug, nombre) {
  catActivaApp = slug;
  catNombreActual = nombre || 'Todos los productos';
  document.getElementById('tienda-cat-actual').textContent = catNombreActual;
  renderProductosApp();
  cerrarCategorias();
  window.scrollTo(0,0);
}'''

if old_cats in c:
    c = c.replace(old_cats, new_cats)
    print("4. renderCatsApp + drawer: OK")
else:
    print("4. NO coincidió renderCatsApp")

# ─────────────────────────────────────────────
# 5. Reemplazar el render de productos (grid -> lista)
# ─────────────────────────────────────────────
old_render = '''  cont.innerHTML = '<div class="prod-grid">' + filtrados.map(function(p){
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
  }).join('') + '</div>';'''

new_render = '''  cont.innerHTML = filtrados.map(function(p){
    var precioInfo = getPrecioApp(p);
    var stockClass = p.stock === 0 ? 'var(--red)' : p.stock < 5 ? 'var(--warn)' : 'var(--green)';
    var stockText = p.stock === 0 ? 'Sin stock' : p.stock < 5 ? 'Solo ' + p.stock + ' disp.' : 'En stock';
    var precioHTML = precioInfo ? '<div class="prod-price">$' + parseFloat(precioInfo.precio).toFixed(2) + '</div>' : '<div class="prod-price" style="font-size:0.82rem;color:var(--gray)">Inicia sesión</div>';
    return '<div class="prod-row" onclick=\\'abrirProductoApp(' + JSON.stringify(p).replace(/'/g,"&#39;") + ')\\'>' +
      '<div class="pr-img">' + (p.imagen_principal ? '<img src="' + p.imagen_principal + '" alt="">' : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>') + '</div>' +
      '<div class="pr-info">' +
        '<div class="prod-brand">' + (p.marca || '&nbsp;') + '</div>' +
        '<div class="prod-name">' + p.nombre_es + '</div>' +
        precioHTML +
        '<div class="prod-stock" style="color:' + stockClass + '">' + stockText + '</div>' +
      '</div>' +
    '</div>';
  }).join('');'''

if old_render in c:
    c = c.replace(old_render, new_render)
    print("5. render lista productos: OK")
else:
    print("5. NO coincidió render productos")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)

print("---")
print("abrirCategorias:", c.count('function abrirCategorias'))
print("cerrarCategorias:", c.count('function cerrarCategorias'))
print("setCatApp:", c.count('function setCatApp'))
print("prod-row CSS:", c.count('.prod-row'))
