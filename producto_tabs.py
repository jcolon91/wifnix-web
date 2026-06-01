with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

start = c.find('function pintarProductoApp(')
end = c.find('function agregarApp(')

if start == -1 or end == -1 or end < start:
    print("ERROR: rango no encontrado")
else:
    nueva = '''function pintarProductoApp(modal, p) {
  var precioInfo = getPrecioApp(p);
  var puedeComprar = precioInfo && p.stock > 0;

  // ── Galería ──
  var imgs = [];
  if (p.imagen_principal) imgs.push(p.imagen_principal);
  if (Array.isArray(p.imagenes)) imgs = imgs.concat(p.imagenes.filter(function(u){ return u && u !== p.imagen_principal; }));
  var galeria;
  if (imgs.length) {
    galeria = '<div style="position:relative;background:#fff">' +
      '<div style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch">' +
      imgs.map(function(u){ return '<div style="flex:0 0 100%;scroll-snap-align:center;aspect-ratio:1;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box"><img src="' + u + '" style="max-width:100%;max-height:100%;object-fit:contain"></div>'; }).join('') +
      '</div>' +
      (imgs.length > 1 ? '<div style="position:absolute;bottom:12px;left:0;right:0;display:flex;justify-content:center;gap:6px">' + imgs.map(function(){ return '<div style="width:7px;height:7px;border-radius:50%;background:rgba(0,0,0,0.25)"></div>'; }).join('') + '</div>' : '') +
    '</div>';
  } else {
    galeria = '<div style="aspect-ratio:1.2;background:var(--bg2);display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:56px;height:56px;stroke:#5A6B7C;fill:none;stroke-width:1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg></div>';
  }

  var stockColor = p.stock===0?'var(--red)':p.stock<5?'var(--warn)':'var(--green)';
  var stockText = p.stock===0?'Sin stock':p.stock<5?'Solo ' + p.stock + ' disponibles':'En stock (' + p.stock + ' disponibles)';

  // ── Contenido de cada tab ──
  function emptyMsg(t){ return '<div style="padding:24px 4px;color:var(--gray2);font-size:0.86rem;text-align:center">' + t + '</div>'; }

  var descTab = p.descripcion_es
    ? '<div style="font-size:0.9rem;color:var(--gray);line-height:1.65">' + p.descripcion_es.split('\\n').filter(function(x){return x.trim();}).map(function(x){return '<p style="margin-bottom:8px">'+x+'</p>';}).join('') + '</div>'
    : emptyMsg('Sin descripción disponible. Contáctanos para más información sobre este producto.');

  var specsTab;
  if (p.specs && typeof p.specs === 'object' && Object.keys(p.specs).length) {
    var rows = Object.keys(p.specs).map(function(k){
      return '<tr style="border-bottom:1px solid var(--line)"><td style="padding:11px 13px;font-weight:700;color:var(--gray);width:42%;background:rgba(11,143,204,0.04);vertical-align:top">' + k + '</td><td style="padding:11px 13px;color:#F0F4F8">' + p.specs[k] + '</td></tr>';
    }).join('');
    specsTab = '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;border:1px solid var(--line);border-radius:10px;overflow:hidden"><tbody>' + rows + '</tbody></table>';
  } else { specsTab = emptyMsg('No hay especificaciones técnicas detalladas para este producto.'); }

  var docsTab;
  if (Array.isArray(p.archivos) && p.archivos.length) {
    docsTab = p.archivos.map(function(f){
      return '<a href="' + f.url + '" target="_blank" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:8px;text-decoration:none">' +
        '<div style="width:38px;height:38px;border-radius:8px;background:rgba(255,85,85,0.12);color:#FF5555;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;flex-shrink:0">PDF</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:0.84rem;font-weight:600;color:#F0F4F8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (f.nombre || 'Documento') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--gray2)">' + (f.tamano || 'Descargar') + '</div></div></a>';
    }).join('');
  } else { docsTab = emptyMsg('No hay documentos disponibles para este producto.'); }

  function compatTab(ids){
    if (!ids || !ids.length) return emptyMsg('No hay productos compatibles registrados.');
    var compats = productosApp.filter(function(x){ return ids.indexOf(x.id) >= 0; });
    if (!compats.length) return emptyMsg('No hay productos compatibles disponibles.');
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + compats.map(function(x){
      var pi = getPrecioApp(x);
      return '<div onclick=\\'document.getElementById("modal-producto").remove();abrirProductoApp("' + x.id + '")\\' style="background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer">' +
        '<div style="aspect-ratio:1;background:#fff;display:flex;align-items:center;justify-content:center;padding:8px">' + (x.imagen_principal?'<img src="'+x.imagen_principal+'" style="max-width:100%;max-height:100%;object-fit:contain">':'') + '</div>' +
        '<div style="padding:9px"><div style="font-size:0.76rem;color:#F0F4F8;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + x.nombre_es + '</div>' +
        (pi?'<div style="font-size:0.86rem;font-weight:800;color:var(--bl-l);margin-top:4px">$'+parseFloat(pi.precio).toFixed(2)+'</div>':'') + '</div></div>';
    }).join('') + '</div>';
  }

  var tabs = [
    { id:'desc', label:'Descripción', html:descTab },
    { id:'specs', label:'Especificaciones', html:specsTab },
    { id:'docs', label:'Documentos', html:docsTab },
    { id:'compat', label:'Compatibles', html:compatTab(p.productos_compatibles) },
    { id:'acc', label:'Accesorios', html:compatTab(p.accesorios_compatibles) }
  ];
  var tabBtns = tabs.map(function(t,i){ return '<button class="ptab-btn ' + (i===0?'active':'') + '" data-ptab="' + t.id + '" onclick="cambiarPTab(\\'' + t.id + '\\',this)">' + t.label + '</button>'; }).join('');
  var tabContents = tabs.map(function(t,i){ return '<div class="ptab-content ' + (i===0?'active':'') + '" id="ptab-' + t.id + '">' + t.html + '</div>'; }).join('');

  var precioBloque = precioInfo
    ? '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px"><div style="font-size:1.8rem;font-weight:800;color:var(--bl-l)">$' + parseFloat(precioInfo.precio).toFixed(2) + '</div>' + (p.precio_anterior?'<div style="font-size:1rem;color:var(--gray2);text-decoration:line-through">$'+parseFloat(p.precio_anterior).toFixed(2)+'</div>':'') + '</div><div style="font-size:0.74rem;color:var(--gray2);margin-bottom:8px">+ IVU 11.5% al pagar</div>'
    : '<div style="font-size:1rem;color:var(--gray);margin-bottom:10px">Precio no disponible</div>';

  if (!document.getElementById('ptab-styles')) {
    var st = document.createElement('style'); st.id='ptab-styles';
    st.textContent = '.ptab-nav{display:flex;gap:6px;overflow-x:auto;border-bottom:1px solid var(--line);margin:22px 0 0;-webkit-overflow-scrolling:touch}.ptab-btn{white-space:nowrap;padding:11px 4px;margin-right:14px;background:none;border:none;border-bottom:2px solid transparent;color:var(--gray);font-size:0.84rem;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0}.ptab-btn.active{color:var(--bl-l);border-bottom-color:var(--bl-l)}.ptab-content{display:none;padding-top:14px}.ptab-content.active{display:block}';
    document.head.appendChild(st);
  }

  modal.innerHTML =
    '<div style="position:sticky;top:0;z-index:5;background:rgba(6,9,15,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:calc(10px + env(safe-area-inset-top)) 14px 10px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)">' +
      '<button onclick="document.getElementById(\\'modal-producto\\').remove()" style="width:38px;height:38px;border-radius:10px;background:var(--card);border:1px solid var(--line);color:#fff;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">‹</button>' +
      '<div style="font-size:0.92rem;font-weight:700;color:#F0F4F8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + p.nombre_es + '</div>' +
    '</div>' +
    galeria +
    '<div style="padding:18px 18px 0;max-width:600px;margin:0 auto">' +
      '<div style="font-size:0.68rem;color:var(--gray2);text-transform:uppercase;font-weight:700;letter-spacing:0.04em">' + (p.marca||'') + (p.modelo?' · '+p.modelo:'') + '</div>' +
      '<h1 style="font-size:1.25rem;font-weight:800;color:#F0F4F8;margin:4px 0 12px;line-height:1.3">' + p.nombre_es + '</h1>' +
      precioBloque +
      '<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:' + stockColor + ';margin-bottom:4px"><span style="width:8px;height:8px;border-radius:50%;background:' + stockColor + ';display:inline-block"></span>' + stockText + '</div>' +
      '<div class="ptab-nav">' + tabBtns + '</div>' +
      tabContents +
      '<div id="ptab-resenas" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--line)"><div style="font-size:0.95rem;font-weight:800;color:#F0F4F8;margin-bottom:10px">Reseñas y opiniones</div><div id="resenas-cont" style="color:var(--gray2);font-size:0.86rem">Cargando reseñas...</div></div>' +
      '<div style="height:100px"></div>' +
    '</div>' +
    '<div style="position:fixed;bottom:0;left:0;right:0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:rgba(6,9,15,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line)"><div style="max-width:600px;margin:0 auto">' +
      (puedeComprar ? '<button onclick="agregarApp(\\'' + p.id + '\\')" style="width:100%;padding:16px;background:var(--green);color:#06090F;border:none;border-radius:13px;font-size:0.98rem;font-weight:800;cursor:pointer;font-family:inherit">Añadir al carrito</button>' : (p.stock===0 ? '<button disabled style="width:100%;padding:16px;background:rgba(255,255,255,0.06);color:var(--gray);border:none;border-radius:13px;font-weight:700;font-family:inherit">Sin stock</button>' : '<button disabled style="width:100%;padding:16px;background:rgba(255,255,255,0.06);color:var(--gray);border:none;border-radius:13px;font-weight:700;font-family:inherit">No disponible</button>')) +
    '</div></div>';

  // Cargar reseñas
  cargarResenasApp(p.id);
}

function cambiarPTab(id, btn) {
  document.querySelectorAll('.ptab-content').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.ptab-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('ptab-' + id).classList.add('active');
  btn.classList.add('active');
}

async function cargarResenasApp(prodId) {
  var cont = document.getElementById('resenas-cont');
  if (!cont) return;
  try {
    var d = await api('/api/resenas/producto/' + prodId);
    var lista = (d && d.resenas) || [];
    if (!Array.isArray(lista) || !lista.length) {
      cont.innerHTML = 'Este producto aún no tiene reseñas.';
      return;
    }
    cont.innerHTML = lista.map(function(r){
      var est=''; for(var i=1;i<=5;i++) est += '<span style="color:'+(i<=r.rating?'#FFC107':'#3a4a5c')+'">★</span>';
      return '<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:700;color:#F0F4F8;font-size:0.84rem">' + (r.nombre || r.usuario_nombre || 'Cliente') + '</span><span style="font-size:0.8rem">' + est + '</span></div>' + (r.comentario?'<div style="font-size:0.82rem;color:var(--gray);line-height:1.5">' + r.comentario + '</div>':'') + '</div>';
    }).join('');
  } catch(e) {
    cont.innerHTML = 'Este producto aún no tiene reseñas.';
  }
}

'''
    c = c[:start] + nueva + c[end:]
    with open('/var/www/wifnix/app/index.html','w') as f:
        f.write(c)
    print("pintarProductoApp con tabs + reseñas: OK")
    print("cambiarPTab:", c.count('function cambiarPTab'))
    print("cargarResenasApp:", c.count('function cargarResenasApp'))
