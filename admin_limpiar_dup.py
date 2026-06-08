with open('/var/www/wifnix/admin/index.html','r') as f:
    c = f.read()

# El bloque de las 3 funciones del mapa. Aparece 2 veces idéntico.
bloque = """var _inspMap = null;
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

count = c.count(bloque)
print("Apariciones del bloque:", count)

if count >= 2:
    # Quitar la primera aparición (dejar la segunda/última)
    idx = c.find(bloque)
    c = c[:idx] + c[idx+len(bloque):]
    # Limpiar posible doble salto de línea que quede
    c = c.replace('\n\n\n\n', '\n\n')
    with open('/var/www/wifnix/admin/index.html','w') as f:
        f.write(c)
    print("Bloque duplicado eliminado. Quedan:", c.count(bloque))
else:
    print("No hay duplicado exacto. Revisar manualmente.")
