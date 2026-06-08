with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

# 1. Añadir un script al final que pre-rellene "T-" y proteja el prefijo
if 'prefijoTecnico' in c:
    print("Ya existe el prefijo. Abortando.")
    raise SystemExit

# Insertamos la lógica justo antes del INIT, reutilizando que el login ya existe
anchor = "// ---- INIT ----"
js = '''// ── Prefijo T- en el login del técnico ──
function prefijoTecnico() {
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
  });
  // Al enfocar, si está solo "T-", dejar el cursor al final
  inp.addEventListener('focus', function() {
    setTimeout(function(){ inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
  });
}
prefijoTecnico();

// ---- INIT ----'''
c = c.replace(anchor, js, 1)

with open('/var/www/wifnix/tecnicos/index.html','w') as f:
    f.write(c)
print("Prefijo T- añadido:", c.count('function prefijoTecnico'))
