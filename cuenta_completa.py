with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Reemplazar el view-cuenta (placeholder) por la estructura completa
# ─────────────────────────────────────────────
old_view = '''    <!-- TAB CUENTA (placeholder, se construye en Fase D) -->
    <div class="view" id="view-cuenta">
      <div class="card" id="cuenta-info"><div class="loading">Cargando...</div></div>
      <button class="btn-primary" style="background:rgba(255,85,85,0.15);color:var(--red);border:1px solid rgba(255,85,85,0.3)" onclick="logout()">Cerrar sesión</button>
    </div>'''

new_view = '''    <!-- TAB CUENTA -->
    <div class="view" id="view-cuenta">
      <div id="cuenta-cont"><div class="loading">Cargando...</div></div>
    </div>'''

if old_view in c:
    c = c.replace(old_view, new_view)
    print("1. view-cuenta: OK")
else:
    print("1. NO coincidió view-cuenta")

# ─────────────────────────────────────────────
# 2. Reemplazar la función cargarCuenta por la versión completa
# ─────────────────────────────────────────────
old_fn = '''async function cargarCuenta() {
  var nombre = (USER && USER.nombre) ? (USER.nombre + ' ' + (USER.apellido||'')) : '';
  document.getElementById('cuenta-info').innerHTML =
    '<div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">' +
      '<div style="width:56px;height:56px;border-radius:50%;background:rgba(11,143,204,0.15);display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:var(--bl-l)">' + (nombre.charAt(0)||'U') + '</div>' +
      '<div><div style="font-weight:800;font-size:1.05rem">' + nombre + '</div>' +
      '<div style="font-size:0.82rem;color:var(--gray)">' + ((USER&&USER.email)||'') + '</div></div>' +
    '</div>';
}'''

new_fn = '''var perfilCompleto = null;
async function cargarCuenta() {
  var cont = document.getElementById('cuenta-cont');
  cont.innerHTML = '<div class="loading">Cargando...</div>';
  try {
    perfilCompleto = await api('/api/auth/me');
    if (perfilCompleto) { USER = perfilCompleto; localStorage.setItem('wifnix_user', JSON.stringify(USER)); }
  } catch(e) { perfilCompleto = USER; }
  var p = perfilCompleto || USER || {};
  var nombre = ((p.nombre||'') + ' ' + (p.apellido||'')).trim() || 'Usuario';
  var inicial = (p.nombre||'U').charAt(0).toUpperCase();
  var rolLabel = { cliente:'Personal', empresa_servicios:'Empresa', empresa_revendedora:'Revendedor', tecnico_independiente:'Técnico' }[p.rol] || 'Cliente';

  var dirFisica = p.direccion_fisica ? (p.direccion_fisica + (p.municipio_fisica?', '+p.municipio_fisica:'') + (p.zip_fisica?' '+p.zip_fisica:'')) : 'No registrada';
  var dirPostal = p.postal_igual_fisica ? 'Igual a la física' : (p.direccion_postal ? (p.direccion_postal + (p.municipio_postal?', '+p.municipio_postal:'') + (p.zip_postal?' '+p.zip_postal:'')) : 'No registrada');

  cont.innerHTML =
    '<div class="card" style="text-align:center">' +
      '<div style="width:72px;height:72px;border-radius:50%;background:rgba(11,143,204,0.15);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:var(--bl-l);margin:0 auto 12px">' + inicial + '</div>' +
      '<div style="font-weight:800;font-size:1.15rem">' + nombre + '</div>' +
      '<div style="font-size:0.84rem;color:var(--gray);margin-top:2px">' + (p.email||'') + '</div>' +
      '<div style="display:inline-block;margin-top:8px;padding:3px 12px;background:rgba(11,143,204,0.12);color:var(--bl-l);border-radius:20px;font-size:0.72rem;font-weight:700">' + rolLabel + '</div>' +
    '</div>' +

    '<div class="section-title">Datos personales</div>' +
    '<div class="card">' +
      filaInfo('Teléfono', p.telefono || 'No registrado') +
      filaInfo('Dirección física', dirFisica) +
      filaInfo('Dirección postal', dirPostal, true) +
      '<button onclick="abrirEditarPerfil()" style="width:100%;margin-top:12px;padding:12px;background:rgba(11,143,204,0.12);color:var(--bl-l);border:1px solid rgba(11,143,204,0.25);border-radius:10px;font-weight:700;font-size:0.86rem;cursor:pointer;font-family:inherit">Editar perfil y direcciones</button>' +
    '</div>' +

    '<div class="section-title">Seguridad</div>' +
    '<div class="card">' +
      '<button onclick="abrirCambiarPassword()" style="width:100%;padding:12px;background:transparent;color:var(--white);border:1px solid var(--line);border-radius:10px;font-weight:600;font-size:0.86rem;cursor:pointer;font-family:inherit;text-align:left">Cambiar contraseña</button>' +
    '</div>' +

    '<div style="margin-top:20px">' +
      '<button class="btn-primary" style="background:rgba(255,255,255,0.06);color:var(--white);border:1px solid var(--line);margin-bottom:10px" onclick="logout()">Cerrar sesión</button>' +
      '<button style="width:100%;padding:13px;background:transparent;color:var(--red);border:1px solid rgba(255,85,85,0.25);border-radius:11px;font-weight:700;font-size:0.86rem;cursor:pointer;font-family:inherit" onclick="abrirEliminarCuenta()">Eliminar mi cuenta</button>' +
    '</div>' +
    '<div style="height:20px"></div>';
}

function filaInfo(label, valor, last) {
  return '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0' + (last?'':';border-bottom:1px solid var(--line)') + '">' +
    '<span style="font-size:0.82rem;color:var(--gray2);flex-shrink:0">' + label + '</span>' +
    '<span style="font-size:0.84rem;color:#F0F4F8;text-align:right">' + valor + '</span></div>';
}

// ── Editar perfil + direcciones ──
function abrirEditarPerfil() {
  var p = perfilCompleto || USER || {};
  var modal = document.createElement('div');
  modal.id = 'modal-editperfil';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
  function inp(id,val,ph){ return '<input id="'+id+'" value="'+(val||'').replace(/"/g,'&quot;')+'" placeholder="'+ph+'" style="width:100%;padding:12px;background:#06090F;border:1px solid rgba(255,255,255,0.1);color:#F0F4F8;border-radius:9px;font-size:0.9rem;font-family:inherit;margin-bottom:10px">'; }
  function lbl(t){ return '<label style="display:block;font-size:0.7rem;font-weight:700;color:#8BA0B4;margin-bottom:5px;text-transform:uppercase">'+t+'</label>'; }
  modal.innerHTML = '<div style="background:#0D1A2A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;width:100%;max-width:480px;margin:auto;position:relative">' +
    '<button onclick="document.getElementById(\\'modal-editperfil\\').remove()" style="position:absolute;top:14px;right:14px;background:transparent;border:none;color:#8BA0B4;font-size:1.6rem;cursor:pointer">×</button>' +
    '<h2 style="font-size:1.15rem;font-weight:800;color:#F0F4F8;margin-bottom:18px">Editar perfil</h2>' +
    '<div style="display:flex;gap:10px"><div style="flex:1">' + lbl('Nombre') + inp('ep-nombre',p.nombre,'Nombre') + '</div>' +
    '<div style="flex:1">' + lbl('Apellido') + inp('ep-apellido',p.apellido,'Apellido') + '</div></div>' +
    lbl('Teléfono') + inp('ep-telefono',p.telefono,'(787) 123-4567') +
    '<div style="font-size:0.78rem;font-weight:800;color:#F0F4F8;margin:14px 0 10px">Dirección física</div>' +
    lbl('Dirección') + inp('ep-dir-fis',p.direccion_fisica,'Calle, número, urbanización') +
    '<div style="display:flex;gap:10px"><div style="flex:2">' + lbl('Municipio') + inp('ep-mun-fis',p.municipio_fisica,'Municipio') + '</div>' +
    '<div style="flex:1">' + lbl('ZIP') + inp('ep-zip-fis',p.zip_fisica,'00000') + '</div></div>' +
    '<label style="display:flex;align-items:center;gap:8px;margin:6px 0 12px;cursor:pointer;font-size:0.84rem;color:#F0F4F8"><input type="checkbox" id="ep-igual" ' + (p.postal_igual_fisica?'checked':'') + ' onchange="togglePostalIgual()" style="width:18px;height:18px"> La dirección postal es la misma</label>' +
    '<div id="ep-postal-wrap" style="' + (p.postal_igual_fisica?'display:none':'') + '">' +
      '<div style="font-size:0.78rem;font-weight:800;color:#F0F4F8;margin:4px 0 10px">Dirección postal</div>' +
      lbl('Dirección') + inp('ep-dir-pos',p.direccion_postal,'Dirección postal / PO Box') +
      '<div style="display:flex;gap:10px"><div style="flex:2">' + lbl('Municipio') + inp('ep-mun-pos',p.municipio_postal,'Municipio') + '</div>' +
      '<div style="flex:1">' + lbl('ZIP') + inp('ep-zip-pos',p.zip_postal,'00000') + '</div></div>' +
    '</div>' +
    '<div id="ep-err" style="font-size:0.8rem;color:#FF5555;margin-bottom:10px;min-height:14px"></div>' +
    '<button id="ep-save" onclick="guardarPerfil()" style="width:100%;padding:14px;background:#29B6F6;color:#06090F;border:none;border-radius:11px;font-weight:800;font-size:0.92rem;cursor:pointer;font-family:inherit">Guardar cambios</button>' +
    '<div style="height:10px"></div>' +
  '</div>';
  document.body.appendChild(modal);
}
function togglePostalIgual() {
  var igual = document.getElementById('ep-igual').checked;
  document.getElementById('ep-postal-wrap').style.display = igual ? 'none' : 'block';
}
async function guardarPerfil() {
  var igual = document.getElementById('ep-igual').checked;
  var body = {
    nombre: document.getElementById('ep-nombre').value.trim(),
    apellido: document.getElementById('ep-apellido').value.trim(),
    telefono: document.getElementById('ep-telefono').value.trim(),
    bio: (perfilCompleto && perfilCompleto.bio) || null,
    empresa_nombre: (perfilCompleto && perfilCompleto.empresa_nombre) || null,
    empresa_tipo: (perfilCompleto && perfilCompleto.empresa_tipo) || null,
    direccion_fisica: document.getElementById('ep-dir-fis').value.trim(),
    municipio_fisica: document.getElementById('ep-mun-fis').value.trim(),
    zip_fisica: document.getElementById('ep-zip-fis').value.trim(),
    postal_igual_fisica: igual,
    direccion_postal: igual ? null : document.getElementById('ep-dir-pos').value.trim(),
    municipio_postal: igual ? null : document.getElementById('ep-mun-pos').value.trim(),
    zip_postal: igual ? null : document.getElementById('ep-zip-pos').value.trim()
  };
  if (!body.nombre) { document.getElementById('ep-err').textContent = 'El nombre es requerido'; return; }
  var btn = document.getElementById('ep-save');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    var r = await api('/api/perfil', { method:'PUT', body: body });
    if (r && r.success) {
      document.getElementById('modal-editperfil').remove();
      toast('Perfil actualizado');
      cargarCuenta();
    } else { document.getElementById('ep-err').textContent = (r && r.error) || 'Error'; btn.disabled=false; btn.textContent='Guardar cambios'; }
  } catch(e) { document.getElementById('ep-err').textContent = e.message; btn.disabled=false; btn.textContent='Guardar cambios'; }
}

// ── Cambiar contraseña ──
function abrirCambiarPassword() {
  var modal = document.createElement('div');
  modal.id = 'modal-cambpass';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = '<div style="background:#0D1A2A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;width:100%;max-width:400px;position:relative">' +
    '<button onclick="document.getElementById(\\'modal-cambpass\\').remove()" style="position:absolute;top:14px;right:14px;background:transparent;border:none;color:#8BA0B4;font-size:1.6rem;cursor:pointer">×</button>' +
    '<h2 style="font-size:1.1rem;font-weight:800;color:#F0F4F8;margin-bottom:16px">Cambiar contraseña</h2>' +
    '<input type="password" id="cp-actual" placeholder="Contraseña actual" style="width:100%;padding:13px;background:#06090F;border:1px solid rgba(255,255,255,0.1);color:#F0F4F8;border-radius:10px;font-size:0.95rem;margin-bottom:10px;font-family:inherit">' +
    '<input type="password" id="cp-nueva" placeholder="Nueva contraseña (mín 8)" style="width:100%;padding:13px;background:#06090F;border:1px solid rgba(255,255,255,0.1);color:#F0F4F8;border-radius:10px;font-size:0.95rem;margin-bottom:10px;font-family:inherit">' +
    '<div id="cp-err" style="font-size:0.8rem;color:#FF5555;margin-bottom:10px;min-height:14px"></div>' +
    '<button id="cp-save" onclick="guardarPassword()" style="width:100%;padding:13px;background:#29B6F6;color:#06090F;border:none;border-radius:11px;font-weight:800;cursor:pointer;font-family:inherit">Actualizar contraseña</button>' +
  '</div>';
  document.body.appendChild(modal);
}
async function guardarPassword() {
  var actual = document.getElementById('cp-actual').value;
  var nueva = document.getElementById('cp-nueva').value;
  var err = document.getElementById('cp-err');
  if (!actual || !nueva) { err.textContent = 'Completa ambos campos'; return; }
  if (nueva.length < 8) { err.textContent = 'La nueva debe tener al menos 8 caracteres'; return; }
  var btn = document.getElementById('cp-save');
  btn.disabled = true; btn.textContent = 'Actualizando...';
  try {
    var r = await api('/api/perfil/password', { method:'PUT', body:{ password_actual: actual, password_nueva: nueva } });
    if (r && (r.success || r.ok)) {
      document.getElementById('modal-cambpass').remove();
      toast('Contraseña actualizada');
    } else { err.textContent = (r && r.error) || 'No se pudo actualizar'; btn.disabled=false; btn.textContent='Actualizar contraseña'; }
  } catch(e) { err.textContent = e.message; btn.disabled=false; btn.textContent='Actualizar contraseña'; }
}

// ── Eliminar cuenta ──
function abrirEliminarCuenta() {
  var modal = document.createElement('div');
  modal.id = 'modal-elimcuenta';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = '<div style="background:#0D1A2A;border:1px solid rgba(255,85,85,0.25);border-radius:16px;padding:24px;width:100%;max-width:420px;position:relative">' +
    '<div style="font-size:2rem;text-align:center;margin-bottom:10px">⚠️</div>' +
    '<h2 style="font-size:1.15rem;font-weight:800;color:#F0F4F8;text-align:center;margin-bottom:8px">Eliminar mi cuenta</h2>' +
    '<p style="font-size:0.84rem;color:#8BA0B4;text-align:center;line-height:1.5;margin-bottom:16px">Esta acción es permanente. Se eliminarán tus datos, órdenes y garantías. No se puede deshacer.</p>' +
    '<label style="display:block;font-size:0.68rem;font-weight:700;text-transform:uppercase;color:#8BA0B4;margin-bottom:6px">Para confirmar escribe: <strong style="color:#FF5555">ELIMINAR MI CUENTA</strong></label>' +
    '<input type="text" id="ec-confirm" placeholder="ELIMINAR MI CUENTA" style="width:100%;padding:12px;background:#06090F;border:1px solid rgba(255,85,85,0.2);color:#F0F4F8;border-radius:10px;font-size:0.9rem;margin-bottom:12px;font-family:inherit">' +
    '<div id="ec-err" style="font-size:0.8rem;color:#FF5555;margin-bottom:10px;min-height:14px"></div>' +
    '<div style="display:flex;gap:10px">' +
      '<button onclick="document.getElementById(\\'modal-elimcuenta\\').remove()" style="flex:1;padding:13px;background:transparent;color:#F0F4F8;border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit">Cancelar</button>' +
      '<button id="ec-btn" onclick="confirmarEliminarCuenta()" style="flex:1;padding:13px;background:#FF5555;color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-family:inherit">Eliminar</button>' +
    '</div>' +
  '</div>';
  document.body.appendChild(modal);
}
async function confirmarEliminarCuenta() {
  var conf = document.getElementById('ec-confirm').value.trim();
  var err = document.getElementById('ec-err');
  if (conf !== 'ELIMINAR MI CUENTA') { err.textContent = 'Debes escribir exactamente: ELIMINAR MI CUENTA'; return; }
  var btn = document.getElementById('ec-btn');
  btn.disabled = true; btn.textContent = 'Eliminando...';
  try {
    var r = await api('/api/auth/mi-cuenta', { method:'DELETE', body:{ confirmacion:'ELIMINAR MI CUENTA' } });
    if (r && (r.success || r.ok)) {
      alert('Tu cuenta ha sido eliminada.');
      logout();
    } else { err.textContent = (r && r.error) || 'Error al eliminar'; btn.disabled=false; btn.textContent='Eliminar'; }
  } catch(e) { err.textContent = e.message; btn.disabled=false; btn.textContent='Eliminar'; }
}'''

if old_fn in c:
    c = c.replace(old_fn, new_fn)
    print("2. cargarCuenta completo: OK")
else:
    print("2. NO coincidió cargarCuenta")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)
print("---")
print("abrirEditarPerfil:", c.count('function abrirEditarPerfil'))
print("guardarPerfil:", c.count('function guardarPerfil'))
print("abrirEliminarCuenta:", c.count('function abrirEliminarCuenta'))
print("guardarPassword:", c.count('function guardarPassword'))
