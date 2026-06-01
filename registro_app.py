with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Añadir enlace "Crear cuenta" en el login + pantalla de registro
#    El login actual tiene un foot con enlace a wifnix.com. Lo cambiamos.
# ─────────────────────────────────────────────
old_foot = '''    <div class="login-foot">¿No tienes cuenta? <a href="https://wifnix.com" target="_blank">Regístrate en wifnix.com</a></div>'''
new_foot = '''    <div class="login-foot">¿No tienes cuenta? <span style="color:var(--bl-l);cursor:pointer;font-weight:700" onclick="mostrarRegistro()">Créala gratis</span></div>'''
if old_foot in c:
    c = c.replace(old_foot, new_foot)
    print("1. Enlace crear cuenta: OK")
else:
    print("1. NO coincidió foot login")

# ─────────────────────────────────────────────
# 2. Añadir la pantalla de registro (oculta) justo después del cierre del div #login
# ─────────────────────────────────────────────
# Buscamos el cierre del bloque login (el </div> que cierra <div id="login">)
anchor = '''<!-- APP -->'''
registro_html = '''<!-- REGISTRO -->
<div id="registro" class="hidden" style="min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:30px 24px;background:radial-gradient(circle at 50% 0%, rgba(11,143,204,0.12), transparent 60%), var(--bg);overflow-y:auto">
  <div style="width:100%;max-width:420px">
    <button onclick="volverLogin()" style="background:transparent;border:none;color:var(--gray);font-size:0.86rem;cursor:pointer;margin-bottom:14px;display:flex;align-items:center;gap:6px">‹ Volver</button>
    <h1 style="font-size:1.4rem;font-weight:800;color:var(--white);margin-bottom:6px">Crear cuenta</h1>
    <p style="font-size:0.84rem;color:var(--gray);margin-bottom:20px">Únete a Wifnix gratis</p>
    <div class="login-card">
      <div id="reg-err" class="hidden" style="color:#fff;background:rgba(255,85,85,0.15);border:1px solid rgba(255,85,85,0.3);padding:10px 14px;border-radius:9px;font-size:0.84rem;margin-bottom:14px;text-align:center"></div>
      <div id="reg-ok" class="hidden" style="color:#fff;background:rgba(0,229,160,0.12);border:1px solid rgba(0,229,160,0.3);padding:10px 14px;border-radius:9px;font-size:0.84rem;margin-bottom:14px;text-align:center"></div>

      <div class="field"><label>Tipo de cuenta</label>
        <select id="reg-tipo" onchange="toggleEmpresaFields()" style="width:100%;padding:14px;background:var(--bg2);border:1.5px solid var(--line);border-radius:11px;font-size:1rem;color:var(--white)">
          <option value="cliente" style="background:#0D1A2A">Personal</option>
          <option value="empresa_servicios" style="background:#0D1A2A">Empresa / Comercial</option>
          <option value="empresa_revendedora" style="background:#0D1A2A">Revendedor</option>
          <option value="tecnico_independiente" style="background:#0D1A2A">Técnico independiente</option>
        </select>
      </div>

      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1"><label>Nombre *</label><input type="text" id="reg-nombre" placeholder="Juan"></div>
        <div class="field" style="flex:1"><label>Apellido</label><input type="text" id="reg-apellido" placeholder="Pérez"></div>
      </div>

      <div id="reg-empresa-wrap" style="display:none">
        <div class="field"><label>Nombre de la empresa *</label><input type="text" id="reg-empresa" placeholder="Mi Empresa LLC"></div>
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);border-radius:9px;padding:11px;margin-bottom:15px;font-size:0.78rem;color:var(--gray)">Las cuentas empresariales y de revendedor pasan por una breve revisión antes de activar los precios especiales.</div>
      </div>

      <div class="field"><label>Correo electrónico *</label><input type="email" id="reg-email" placeholder="tu@correo.com" autocapitalize="off"></div>
      <div class="field"><label>Teléfono</label><input type="tel" id="reg-tel" placeholder="(787) 123-4567"></div>
      <div class="field"><label>Contraseña *</label><input type="password" id="reg-pass" placeholder="Mínimo 8 caracteres"></div>

      <button class="btn-primary" id="reg-btn" onclick="doRegistro()">Crear cuenta gratis</button>
      <div class="login-foot">¿Ya tienes cuenta? <span style="color:var(--bl-l);cursor:pointer;font-weight:700" onclick="volverLogin()">Inicia sesión</span></div>
    </div>
    <div style="height:30px"></div>
  </div>
</div>

<!-- APP -->'''
c = c.replace(anchor, registro_html, 1)
print("2. Pantalla registro: OK")

# ─────────────────────────────────────────────
# 3. Añadir funciones JS de registro antes de "// ---- INIT ----"
# ─────────────────────────────────────────────
js = '''
// ═══ REGISTRO ═══
function mostrarRegistro() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('registro').classList.remove('hidden');
  window.scrollTo(0,0);
}
function volverLogin() {
  document.getElementById('registro').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  window.scrollTo(0,0);
}
function toggleEmpresaFields() {
  var tipo = document.getElementById('reg-tipo').value;
  var wrap = document.getElementById('reg-empresa-wrap');
  wrap.style.display = (tipo === 'empresa_servicios' || tipo === 'empresa_revendedora') ? 'block' : 'none';
}
async function doRegistro() {
  var tipo = document.getElementById('reg-tipo').value;
  var nombre = document.getElementById('reg-nombre').value.trim();
  var apellido = document.getElementById('reg-apellido').value.trim();
  var empresa = document.getElementById('reg-empresa').value.trim();
  var email = document.getElementById('reg-email').value.trim();
  var tel = document.getElementById('reg-tel').value.trim();
  var pass = document.getElementById('reg-pass').value;
  var err = document.getElementById('reg-err');
  var ok = document.getElementById('reg-ok');
  err.classList.add('hidden'); ok.classList.add('hidden');

  if (!nombre) { err.textContent = 'Ingresa tu nombre'; err.classList.remove('hidden'); return; }
  if (!email) { err.textContent = 'Ingresa tu correo'; err.classList.remove('hidden'); return; }
  if (!pass || pass.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres'; err.classList.remove('hidden'); return; }
  if ((tipo === 'empresa_servicios' || tipo === 'empresa_revendedora') && !empresa) { err.textContent = 'Ingresa el nombre de la empresa'; err.classList.remove('hidden'); return; }

  var btn = document.getElementById('reg-btn');
  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  try {
    var r = await fetch(API + '/api/auth/registro', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        email: email, password: pass, nombre: nombre, apellido: apellido, telefono: tel,
        empresa_nombre: (tipo==='empresa_servicios'||tipo==='empresa_revendedora') ? empresa : null,
        empresa_tipo: (tipo==='empresa_servicios'||tipo==='empresa_revendedora') ? tipo : null,
        rol_solicitado: tipo
      })
    });
    var d = await r.json();
    if (d.token) {
      if (d.verificacion_pendiente) {
        ok.textContent = d.mensaje || 'Cuenta creada. Tu solicitud está en revisión.';
        ok.classList.remove('hidden');
        TOKEN = d.token; USER = d.usuario || d.user;
        localStorage.setItem('wifnix_token', TOKEN);
        localStorage.setItem('wifnix_user', JSON.stringify(USER));
        setTimeout(function(){ document.getElementById('registro').classList.add('hidden'); iniciarApp(); }, 2500);
      } else {
        TOKEN = d.token; USER = d.usuario || d.user;
        localStorage.setItem('wifnix_token', TOKEN);
        localStorage.setItem('wifnix_user', JSON.stringify(USER));
        document.getElementById('registro').classList.add('hidden');
        iniciarApp();
      }
    } else {
      err.textContent = d.error || 'No se pudo crear la cuenta'; err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Crear cuenta gratis';
    }
  } catch(e) {
    err.textContent = 'Error de conexión'; err.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Crear cuenta gratis';
  }
}

// ---- INIT ----'''
c = c.replace('// ---- INIT ----', js)
print("3. Funciones registro: OK")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)
print("---")
print("doRegistro:", c.count('function doRegistro'))
print("mostrarRegistro:", c.count('function mostrarRegistro'))
print("toggleEmpresaFields:", c.count('function toggleEmpresaFields'))
