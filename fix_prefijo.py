with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

old = """function prefijoTecnico() {
  var inp = document.getElementById('l-num');
  if (!inp) return;
  // Pre-rellenar al cargar si está vacío
  if (!inp.value) inp.value = 'T-';
  // Mantener el prefijo aunque lo intenten borrar
  inp.addEventListener('input', function() {
    if (!inp.value.startsWith('T-')) {
      // Si quedó solo dígitos o vacío, reponer prefijo conservando los números
      var soloNums = inp.value.replace(/[^0-9]/g, '');
      inp.value = 'T-' + soloNums;
    }
  });"""

new = """function prefijoTecnico() {
  var inp = document.getElementById('l-num');
  if (!inp) return;
  // Pre-rellenar al cargar si está vacío
  if (!inp.value) inp.value = 'T-';
  // Normalizar SIEMPRE a 'T-' + solo dígitos (evita T-T-26002, TT26002, etc.)
  inp.addEventListener('input', function() {
    var soloNums = inp.value.replace(/[^0-9]/g, '');
    inp.value = 'T-' + soloNums;
  });"""

if old in c:
    c = c.replace(old, new)
    with open('/var/www/wifnix/tecnicos/index.html','w') as f:
        f.write(c)
    print("Prefijo T- mejorado (normaliza a T-+dígitos): OK")
else:
    print("NO coincidió el bloque. ¿Cambió?")
