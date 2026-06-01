with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Añadir enlace "¿Olvidaste tu contraseña?" en el login (antes del foot)
# ─────────────────────────────────────────────
old_btn = '''    <button class="btn-primary" id="l-btn" onclick="doLogin()">Entrar</button>'''
new_btn = '''    <button class="btn-primary" id="l-btn" onclick="doLogin()">Entrar</button>
    <div style="text-align:center;margin-top:12px"><span style="color:var(--gray);cursor:pointer;font-size:0.82rem" onclick="mostrarRecuperar()">¿Olvidaste tu contraseña?</span></div>'''
if old_btn in c:
    c = c.replace(old_btn, new_btn)
    print("1. Enlace olvidé contraseña: OK")
else:
    print("1. NO coincidió botón login")

# ─────────────────────────────────────────────
# 2. Añadir las pantallas de recuperación antes de <!-- APP -->
# ─────────────────────────────────────────────
anchor = '''<!-- APP -->'''
recuperar_html = '''<!-- RECUPERAR CONTRASEÑA -->
<div id="recuperar" class="hidden" style="min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 24px;background:radial-gradient(circle at 50% 0%, rgba(11,143,204,0.12), transparent 60%), var(--bg)">
  <div style="width:100%;max-width:390px">
    <button onclick="volverLoginDesdeRec()" style="background:transparent;border:none;color:var(--gray);font-size:0.86rem;cursor:pointer;margin-bottom:14px">‹ Volver</button>

    <!-- Paso 1: pedir email -->
    <div id="rec-paso1">
      <h1 style="font-size:1.35rem;font-weight:800;color:var(--white);margin-bottom:6px">Recuperar contraseña</h1>
      <p style="font-size:0.84rem;color:var(--gray);margin-bottom:20px">Te enviaremos un código de 6 dígitos a tu correo.</p>
      <div class="login-card">
        <div id="rec-err1" class="hidden" style="color:#fff;background:rgba(255,85,85,0.15);border:1px solid rgba(255,85,85,0.3);padding:10px 14px;border-radius:9px;font-size:0.84rem;margin-bottom:14px;text-align:center"></div>
        <div class="field"><label>Correo electrónico</label><input type="email" id="rec-email" placeholder="tu@correo.com" autocapitalize="off"></div>
        <button class="btn-primary" id="rec-btn1" onclick="enviarCodigoRec()">Enviar código</button>
      </div>
    </div>

    <!-- Paso 2: código + nueva contraseña -->
    <div id="rec-paso2" class="hidden">
      <h1 style="font-size:1.35rem;font-weight:800;color:var(--white);margin-bottom:6px">Ingresa el código</h1>
      <p style="font-size:0.84rem;color:var(--gray);margin-bottom:20px">Revisa tu correo e ingresa el código de 6 dígitos.</p>
      <div class="login-card">
        <div id="rec-err2" class="hidden" style="color:#fff;background:rgba(255,85,85,0.15);border:1px solid rgba(255,85,85,0.3);padding:10px 14px;border-radius:9px;font-size:0.84rem;margin-bottom:14px;text-align:center"></div>
        <div id="rec-ok2" class="hidden" style="color:#fff;background:rgba(0,229,160,0.12);border:1px solid rgba(0,229,160,0.3);padding:10px 14px;border-radius:9px;font-size:0.84rem;margin-bottom:14px;text-align:center"></div>
        <div class="field"><label>Código de 6 dígitos</label><input type="text" id="rec-codigo" placeholder="000000" inputmode="numeric" maxlength="6" style="letter-spacing:0.3em;text-align:center;font-size:1.2rem"></div>
        <div class="field"><label>Nueva contraseña</label><input type="password" id="rec-pass" placeholder="Mínimo 8 caracteres"></div>
        <button class="btn-primary" id="rec-btn2" onclick="confirmarResetRec()">Cambiar contraseña</button>
        <div style="text-align:center;margin-top:12px"><span style="color:var(--gray);cursor:pointer;font-size:0.8rem" onclick="enviarCodigoRec(true)">Reenviar código</span></div>
      </div>
    </div>
  </div>
</div>

<!-- APP -->'''
c = c.replace(anchor, recuperar_html, 1)
print("2. Pantallas recuperar: OK")

# ─────────────────────────────────────────────
# 3. Funciones JS antes de "// ---- INIT ----"
# ─────────────────────────────────────────────
js = '''
// ═══ RECUPERAR CONTRASEÑA ═══
function mostrarRecuperar() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('recuperar').classList.remove('hidden');
  document.getElementById('rec-paso1').classList.remove('hidden');
  document.getElementById('rec-paso2').classList.add('hidden');
  // Prellenar email si lo escribió en login
  var le = document.getElementById('l-email').value.trim();
  if (le) document.getElementById('rec-email').value = le;
  window.scrollTo(0,0);
}
function volverLoginDesdeRec() {
  document.getElementById('recuperar').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  window.scrollTo(0,0);
}
async function enviarCodigoRec(reenvio) {
  var email = document.getElementById('rec-email').value.trim();
  var err = document.getElementById('rec-err1');
  err.classList.add('hidden');
  if (!email) { err.textContent = 'Ingresa tu correo'; err.classList.remove('hidden'); return; }
  var btn = document.getElementById('rec-btn1');
  if (!reenvio) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    var r = await fetch(API + '/api/auth/recuperar-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: email })
    });
    var d = await r.json();
    if (d.ok) {
      _recEmail = email;
      document.getElementById('rec-paso1').classList.add('hidden');
      document.getElementById('rec-paso2').classList.remove('hidden');
      if (reenvio) { var ok = document.getElementById('rec-ok2'); ok.textContent = 'Código reenviado'; ok.classList.remove('hidden'); setTimeout(function(){ ok.classList.add('hidden'); }, 3000); }
    } else {
      err.textContent = d.error || 'Error'; err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Enviar código';
    }
  } catch(e) {
    err.textContent = 'Error de conexión'; err.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Enviar código';
  }
}
var _recEmail = '';
async function confirmarResetRec() {
  var codigo = document.getElementById('rec-codigo').value.trim();
  var pass = document.getElementById('rec-pass').value;
  var err = document.getElementById('rec-err2');
  var ok = document.getElementById('rec-ok2');
  err.classList.add('hidden'); ok.classList.add('hidden');
  if (!codigo || codigo.length !== 6) { err.textContent = 'Ingresa el código de 6 dígitos'; err.classList.remove('hidden'); return; }
  if (!pass || pass.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres'; err.classList.remove('hidden'); return; }
  var btn = document.getElementById('rec-btn2');
  btn.disabled = true; btn.textContent = 'Cambiando...';
  try {
    var r = await fetch(API + '/api/auth/reset-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: _recEmail, codigo: codigo, nueva_password: pass })
    });
    var d = await r.json();
    if (d.ok) {
      ok.textContent = 'Contraseña actualizada. Ya puedes iniciar sesión.';
      ok.classList.remove('hidden');
      setTimeout(function(){ volverLoginDesdeRec(); document.getElementById('l-email').value = _recEmail; }, 2000);
    } else {
      err.textContent = d.error || 'Código inválido o expirado'; err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Cambiar contraseña';
    }
  } catch(e) {
    err.textContent = 'Error de conexión'; err.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Cambiar contraseña';
  }
}

// ---- INIT ----'''
c = c.replace('// ---- INIT ----', js)
print("3. Funciones recuperar: OK")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)
print("---")
print("mostrarRecuperar:", c.count('function mostrarRecuperar'))
print("enviarCodigoRec:", c.count('function enviarCodigoRec'))
print("confirmarResetRec:", c.count('function confirmarResetRec'))
