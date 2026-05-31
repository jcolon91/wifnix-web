with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Reemplazar renderCatsApp por versión jerárquica (GRUPOS)
# ─────────────────────────────────────────────
old_cats = '''var catNombreActual = 'Todos los productos';
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
}'''

new_cats = '''var catNombreActual = 'Todos los productos';
var GRUPOS_APP = {
  'cctv': ['cctv-analogas','cctv-ip','nvr','dvr','control-acceso','cctv-accesorios'],
  'network': ['routers','switches','wifi','cableado'],
  'backup': ['ups','generadores'],
  'hvac': ['splits'],
  'accesorios': []
};
function countCat(slug) { return productosApp.filter(function(p){ return p.categoria_slug === slug; }).length; }
function nombreCat(slug) {
  var cat = categoriasApp.find(function(c){ return (c.slug||c) === slug; });
  return cat ? (cat.nombre_es || cat.nombre || slug) : slug;
}
function renderCatsApp() {
  var cont = document.getElementById('cat-list');
  var html = '<div class="cat-item ' + (catActivaApp==='todos'?'active':'') + '" onclick="setCatApp(\\'todos\\',\\'Todos los productos\\')"><span>Todos los productos</span><span style="font-size:0.74rem;color:var(--gray2)">' + productosApp.length + '</span></div>';

  Object.keys(GRUPOS_APP).forEach(function(parentSlug){
    var parent = categoriasApp.find(function(c){ return (c.slug||c) === parentSlug; });
    if (!parent) return;
    var subs = categoriasApp.filter(function(c){ return GRUPOS_APP[parentSlug].indexOf(c.slug||c) >= 0; });
    var hasSubs = subs.length > 0;
    var pNombre = parent.nombre_es || parent.nombre || parentSlug;
    if (hasSubs) {
      html += '<div class="cat-item" onclick="toggleSubcatsApp(this)" style="font-weight:700;color:var(--white)">' +
        '<span>' + pNombre + '</span>' +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;transition:transform .2s"><path d="M9 18l6-6-6-6"/></svg>' +
        '</div>';
      html += '<div class="subcats-app" style="display:none;padding-left:12px">';
      html += '<div class="cat-item ' + (catActivaApp===parentSlug?'active':'') + '" style="font-size:0.84rem" onclick="event.stopPropagation();setCatApp(\\'' + parentSlug + '\\',\\'' + pNombre.replace(/'/g,"&#39;") + '\\')"><span>Todo ' + pNombre + '</span><span style="font-size:0.72rem;color:var(--gray2)">' + countCat(parentSlug) + '</span></div>';
      subs.forEach(function(s){
        var sSlug = s.slug || s; var sNombre = s.nombre_es || s.nombre || sSlug;
        html += '<div class="cat-item ' + (catActivaApp===sSlug?'active':'') + '" style="font-size:0.84rem" onclick="event.stopPropagation();setCatApp(\\'' + sSlug + '\\',\\'' + sNombre.replace(/'/g,"&#39;") + '\\')"><span>' + sNombre + '</span><span style="font-size:0.72rem;color:var(--gray2)">' + countCat(sSlug) + '</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="cat-item ' + (catActivaApp===parentSlug?'active':'') + '" style="font-weight:700;color:var(--white)" onclick="setCatApp(\\'' + parentSlug + '\\',\\'' + pNombre.replace(/'/g,"&#39;") + '\\')"><span>' + pNombre + '</span><span style="font-size:0.74rem;color:var(--gray2)">' + countCat(parentSlug) + '</span></div>';
    }
  });

  // Huérfanas
  var orphans = categoriasApp.filter(function(c){
    var slug = c.slug || c;
    if (GRUPOS_APP[slug]) return false;
    for (var k in GRUPOS_APP) if (GRUPOS_APP[k].indexOf(slug) >= 0) return false;
    return true;
  });
  if (orphans.length) {
    html += '<div style="font-size:0.7rem;color:var(--gray2);text-transform:uppercase;font-weight:700;padding:14px 15px 6px">Otros</div>';
    orphans.forEach(function(c){
      var slug = c.slug || c; var nombre = c.nombre_es || c.nombre || slug;
      html += '<div class="cat-item ' + (catActivaApp===slug?'active':'') + '" style="font-weight:700;color:var(--white)" onclick="setCatApp(\\'' + slug + '\\',\\'' + nombre.replace(/'/g,"&#39;") + '\\')"><span>' + nombre + '</span><span style="font-size:0.74rem;color:var(--gray2)">' + countCat(slug) + '</span></div>';
    });
  }
  cont.innerHTML = html;
}
function toggleSubcatsApp(el) {
  var subs = el.nextElementSibling;
  var chev = el.querySelector('.chev');
  if (subs && subs.classList.contains('subcats-app')) {
    var open = subs.style.display === 'block';
    subs.style.display = open ? 'none' : 'block';
    if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
  }
}'''

if old_cats in c:
    c = c.replace(old_cats, new_cats)
    print("1. renderCatsApp jerárquico: OK")
else:
    print("1. NO coincidió renderCatsApp")

# ─────────────────────────────────────────────
# 2. Producto abre producto.html (paridad con web) en vez del modal
# ─────────────────────────────────────────────
old_click = '''onclick=\\'abrirProductoApp(' + JSON.stringify(p).replace(/'/g,"&#39;") + ')\\'>'''
new_click = '''onclick=\\'verProductoWeb("' + encodeURIComponent(p.sku) + '")\\'>'''
if old_click in c:
    c = c.replace(old_click, new_click)
    print("2. click producto -> producto.html: OK")
else:
    print("2. NO coincidió onclick producto")

# Añadir la función verProductoWeb
old_fn = 'function actualizarCarritoFab() {'
new_fn = '''function verProductoWeb(sku) {
  window.location.href = 'https://wifnix.com/producto.html?sku=' + sku;
}

function actualizarCarritoFab() {'''
c = c.replace(old_fn, new_fn, 1)

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)

print("---")
print("toggleSubcatsApp:", c.count('function toggleSubcatsApp'))
print("verProductoWeb:", c.count('function verProductoWeb'))
print("GRUPOS_APP:", c.count('var GRUPOS_APP'))
