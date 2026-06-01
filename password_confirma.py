# password_confirma.py
# Agrega "Confirmar nueva contraseña" al modal de cambiar contraseña del app
# de clientes y valida que ambas contraseñas coincidan antes de enviar.

with open('/var/www/wifnix/app/index.html', 'r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Insertar el campo "Confirmar nueva contraseña" justo después de cp-nueva
# ─────────────────────────────────────────────
old_input = """'<input type="password" id="cp-nueva" placeholder="Nueva contraseña (mín 8)" style="width:100%;padding:13px;background:#06090F;border:1px solid rgba(255,255,255,0.1);color:#F0F4F8;border-radius:10px;font-size:0.95rem;margin-bottom:10px;font-family:inherit">'"""

new_input = """'<input type="password" id="cp-nueva" placeholder="Nueva contraseña (mín 8)" style="width:100%;padding:13px;background:#06090F;border:1px solid rgba(255,255,255,0.1);color:#F0F4F8;border-radius:10px;font-size:0.95rem;margin-bottom:10px;font-family:inherit">' +
    '<input type="password" id="cp-confirma" placeholder="Confirmar nueva contraseña" style="width:100%;padding:13px;background:#06090F;border:1px solid rgba(255,255,255,0.1);color:#F0F4F8;border-radius:10px;font-size:0.95rem;margin-bottom:10px;font-family:inherit">'"""

if old_input in c:
    c = c.replace(old_input, new_input)
    print("1. Campo confirmar contrasena: OK")
else:
    print("1. NO coincidio el input cp-nueva (mandame el modal actual)")

# ─────────────────────────────────────────────
# 2. Validar coincidencia dentro de guardarPassword
# ─────────────────────────────────────────────
old_val = """  var actual = document.getElementById('cp-actual').value;
  var nueva = document.getElementById('cp-nueva').value;
  var err = document.getElementById('cp-err');
  if (!actual || !nueva) { err.textContent = 'Completa ambos campos'; return; }
  if (nueva.length < 8) { err.textContent = 'La nueva debe tener al menos 8 caracteres'; return; }"""

new_val = """  var actual = document.getElementById('cp-actual').value;
  var nueva = document.getElementById('cp-nueva').value;
  var confirma = document.getElementById('cp-confirma').value;
  var err = document.getElementById('cp-err');
  if (!actual || !nueva || !confirma) { err.textContent = 'Completa todos los campos'; return; }
  if (nueva.length < 8) { err.textContent = 'La nueva debe tener al menos 8 caracteres'; return; }
  if (nueva !== confirma) { err.textContent = 'Las contraseñas nuevas no coinciden'; return; }"""

if old_val in c:
    c = c.replace(old_val, new_val)
    print("2. Validacion de coincidencia: OK")
else:
    print("2. NO coincidio guardarPassword (mandame la funcion actual)")

with open('/var/www/wifnix/app/index.html', 'w') as f:
    f.write(c)

print("---")
print("cp-confirma en archivo:", c.count('id="cp-confirma"'))
print("regla no-coinciden:", c.count('no coinciden'))
