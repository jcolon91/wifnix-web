with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

# ═══════════════════════════════════════════════
# 1. abrirInspeccion: guardar datos de la toma cuando se abre la entrega
# ═══════════════════════════════════════════════
old_abrir = """  inspActual = { tipo:tipo, id:null, fotos:{}, pos:null };
  document.getElementById('insp-title').textContent = tipo === 'salida' ? 'Tomar vehiculo' : 'Entregar vehiculo';
  renderInspeccion();"""
new_abrir = """  inspActual = { tipo:tipo, id:null, fotos:{}, pos:null,
                 tomaUnidad: (estado && estado.toma_unidad) || null,
                 tomaPlaca: (estado && estado.toma_placa) || null };
  document.getElementById('insp-title').textContent = tipo === 'salida' ? 'Tomar vehiculo' : 'Entregar vehiculo';
  renderInspeccion();"""
if old_abrir in c:
    c = c.replace(old_abrir, new_abrir)
    print("1. abrirInspeccion guarda datos de toma: OK")
else:
    print("1. NO coincidió abrirInspeccion")

# ═══════════════════════════════════════════════
# 2. Validación de match en guardarInspeccion (antes de crear)
#    Insertar justo después de validar millaje, antes de validar fotos
# ═══════════════════════════════════════════════
old_val = """  if (!millaje) { toast('Falta: Millaje actual'); document.getElementById('insp-millaje').focus(); return; }
  // Validar todas las fotos obligatorias"""
new_val = """  if (!millaje) { toast('Falta: Millaje actual'); document.getElementById('insp-millaje').focus(); return; }

  // En la ENTREGA: avisar si unidad/tablilla no coinciden con la toma (deja continuar)
  if (inspActual.tipo === 'entrega' && (inspActual.tomaUnidad || inspActual.tomaPlaca)) {
    var difU = inspActual.tomaUnidad && unidad && (unidad.toLowerCase() !== inspActual.tomaUnidad.toLowerCase());
    var difP = inspActual.tomaPlaca && placa && (placa.toLowerCase() !== inspActual.tomaPlaca.toLowerCase());
    if (difU || difP) {
      var msg = 'Los datos NO coinciden con la toma de la manana:\\n';
      if (difU) msg += '\\nUnidad toma: ' + inspActual.tomaUnidad + '  →  ahora: ' + unidad;
      if (difP) msg += '\\nTablilla toma: ' + inspActual.tomaPlaca + '  →  ahora: ' + placa;
      msg += '\\n\\n¿Continuar de todas formas?';
      if (!confirm(msg)) return;
    }
  }

  // Validar todas las fotos obligatorias"""
if old_val in c:
    c = c.replace(old_val, new_val)
    print("2. Validación de match en entrega: OK")
else:
    print("2. NO coincidió el bloque de validación")

# ═══════════════════════════════════════════════
# 3. Detección de foto borrosa en fotoInspeccion
# ═══════════════════════════════════════════════
old_foto = """function fotoInspeccion(input, tipo) {
  var file = input.files[0];
  if (!file) return;
  toast('Procesando foto...');
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxW = 1200;
      var scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      inspActual.fotos[tipo] = canvas.toDataURL('image/jpeg', 0.7);
      renderInspeccion();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}"""

new_foto = """// Mide nitidez con varianza de Laplaciano (mayor = más nítida). Umbral conservador.
function nitidezImagen(canvas) {
  try {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var img = ctx.getImageData(0, 0, w, h).data;
    // Escala de grises
    var gray = new Float32Array(w*h);
    for (var i=0; i<w*h; i++) {
      gray[i] = 0.299*img[i*4] + 0.587*img[i*4+1] + 0.114*img[i*4+2];
    }
    // Laplaciano simple y varianza
    var sum=0, sum2=0, n=0;
    for (var y=1; y<h-1; y++) {
      for (var x=1; x<w-1; x++) {
        var idx = y*w+x;
        var lap = (gray[idx-1] + gray[idx+1] + gray[idx-w] + gray[idx+w]) - 4*gray[idx];
        sum += lap; sum2 += lap*lap; n++;
      }
    }
    var mean = sum/n;
    return (sum2/n) - (mean*mean); // varianza
  } catch(e) { return 999; } // si falla, asumir nítida (no bloquear)
}

function fotoInspeccion(input, tipo) {
  var file = input.files[0];
  if (!file) return;
  toast('Procesando foto...');
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxW = 1200;
      var scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var b64 = canvas.toDataURL('image/jpeg', 0.7);
      var nitidez = nitidezImagen(canvas);

      // Umbral conservador: solo avisa si está MUY borrosa (<60)
      if (nitidez < 60) {
        if (confirm('Esta foto parece BORROSA.\\n\\nToca \"Aceptar\" para tomar otra, o \"Cancelar\" para usarla igual.')) {
          // Tomar otra: re-disparar el input
          input.value = '';
          input.click();
          return;
        }
      }
      inspActual.fotos[tipo] = b64;
      renderInspeccion();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}"""

if old_foto in c:
    c = c.replace(old_foto, new_foto)
    print("3. Detección de foto borrosa: OK")
else:
    print("3. NO coincidió fotoInspeccion")

with open('/var/www/wifnix/tecnicos/index.html','w') as f:
    f.write(c)
print("---")
print("nitidezImagen:", c.count('function nitidezImagen'))
print("tomaUnidad:", c.count('tomaUnidad'))
