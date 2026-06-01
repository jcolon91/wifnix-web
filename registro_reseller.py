with open('/var/www/wifnix/app/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Reemplazar el bloque #reg-empresa-wrap con los campos completos
# ─────────────────────────────────────────────
old_wrap = '''      <div id="reg-empresa-wrap" style="display:none">
        <div class="field"><label>Nombre de la empresa *</label><input type="text" id="reg-empresa" placeholder="Mi Empresa LLC"></div>
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);border-radius:9px;padding:11px;margin-bottom:15px;font-size:0.78rem;color:var(--gray)">Las cuentas empresariales y de revendedor pasan por una breve revisión antes de activar los precios especiales.</div>
      </div>'''

new_wrap = '''      <div id="reg-empresa-wrap" style="display:none">
        <div class="field"><label>Nombre de la empresa *</label><input type="text" id="reg-empresa" placeholder="Mi Empresa LLC"></div>
      </div>

      <div id="reg-reseller-wrap" style="display:none">
        <div class="field"><label>Tipo de empresa *</label>
          <select id="reg-tipo-emp" style="width:100%;padding:14px;background:var(--bg2);border:1.5px solid var(--line);border-radius:11px;font-size:1rem;color:var(--white)">
            <option value="" style="background:#0D1A2A">Selecciona...</option>
            <option value="LLC" style="background:#0D1A2A">LLC</option>
            <option value="Corp" style="background:#0D1A2A">Corporation</option>
            <option value="DBA" style="background:#0D1A2A">DBA</option>
            <option value="Individual" style="background:#0D1A2A">Individual</option>
          </select>
        </div>
        <div class="field"><label>Número de registro de comerciante *</label><input type="text" id="reg-num-comerciante" placeholder="Ej. 12345-A"></div>
        <div class="field"><label>EIN (opcional)</label><input type="text" id="reg-ein" placeholder="XX-XXXXXXX"></div>
        <div class="field"><label>Volumen de compra estimado *</label>
          <select id="reg-volumen" style="width:100%;padding:14px;background:var(--bg2);border:1.5px solid var(--line);border-radius:11px;font-size:1rem;color:var(--white)">
            <option value="" style="background:#0D1A2A">Selecciona...</option>
            <option value="Menos de $1,000/mes" style="background:#0D1A2A">Menos de $1,000/mes</option>
            <option value="$1,000 - $5,000/mes" style="background:#0D1A2A">$1,000 - $5,000/mes</option>
            <option value="$5,000 - $15,000/mes" style="background:#0D1A2A">$5,000 - $15,000/mes</option>
            <option value="Más de $15,000/mes" style="background:#0D1A2A">Más de $15,000/mes</option>
          </select>
        </div>
        <div class="field"><label>Experiencia en el rubro *</label><textarea id="reg-experiencia" placeholder="Cuéntanos brevemente tu experiencia..." style="width:100%;min-height:70px;padding:13px;background:var(--bg2);border:1.5px solid var(--line);border-radius:11px;font-size:0.95rem;color:var(--white);resize:vertical;font-family:inherit"></textarea></div>
        <div class="field"><label>Documento de registro de comerciante *</label>
          <input type="file" id="reg-doc-file" accept=".pdf,.jpg,.jpeg,.png" onchange="prevDocApp(this)" style="display:none">
          <button type="button" onclick="document.getElementById('reg-doc-file').click()" style="width:100%;padding:13px;background:rgba(11,143,204,0.12);color:var(--bl-l);border:1px dashed rgba(11,143,204,0.3);border-radius:11px;font-size:0.86rem;font-weight:700;cursor:pointer;font-family:inherit">Subir documento</button>
          <div id="reg-doc-status" style="font-size:0.74rem;color:var(--gray2);margin-top:6px;text-align:center">Ningún archivo seleccionado · PDF, JPG o PNG (máx 5MB)</div>
        </div>
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);border-radius:9px;padding:11px;margin-bottom:15px;font-size:0.78rem;color:var(--gray)">Tu solicitud será revisada en un plazo máximo de 48 horas. Mientras tanto puedes usar la app como usuario regular.</div>
      </div>'''

if old_wrap in c:
    c = c.replace(old_wrap, new_wrap)
    print("1. Campos reseller/tecnico: OK")
else:
    print("1. NO coincidió reg-empresa-wrap")

# ─────────────────────────────────────────────
# 2. Actualizar toggleEmpresaFields para mostrar los campos según el tipo
# ─────────────────────────────────────────────
old_toggle = '''function toggleEmpresaFields() {
  var tipo = document.getElementById('reg-tipo').value;
  var wrap = document.getElementById('reg-empresa-wrap');
  wrap.style.display = (tipo === 'empresa_servicios' || tipo === 'empresa_revendedora') ? 'block' : 'none';
}'''

new_toggle = '''var docRegistroAppB64 = null;
function toggleEmpresaFields() {
  var tipo = document.getElementById('reg-tipo').value;
  var empWrap = document.getElementById('reg-empresa-wrap');
  var resWrap = document.getElementById('reg-reseller-wrap');
  // Nombre de empresa: empresa_servicios y empresa_revendedora
  empWrap.style.display = (tipo === 'empresa_servicios' || tipo === 'empresa_revendedora') ? 'block' : 'none';
  // Campos de validación + documento: revendedor y técnico independiente
  resWrap.style.display = (tipo === 'empresa_revendedora' || tipo === 'tecnico_independiente') ? 'block' : 'none';
}
function prevDocApp(input) {
  var f = input.files[0];
  var status = document.getElementById('reg-doc-status');
  if (!f) { docRegistroAppB64 = null; status.textContent = 'Ningún archivo seleccionado'; return; }
  if (f.size > 5 * 1024 * 1024) { status.innerHTML = '<span style="color:var(--red)">El archivo supera 5MB</span>'; input.value=''; docRegistroAppB64=null; return; }
  var reader = new FileReader();
  reader.onload = function(e){ docRegistroAppB64 = e.target.result; status.innerHTML = '<span style="color:var(--green)">✓ ' + f.name + '</span>'; };
  reader.readAsDataURL(f);
}'''

if old_toggle in c:
    c = c.replace(old_toggle, new_toggle)
    print("2. toggleEmpresaFields + prevDocApp: OK")
else:
    print("2. NO coincidió toggleEmpresaFields")

# ─────────────────────────────────────────────
# 3. Actualizar doRegistro para validar y enviar la 2da llamada (reseller/aplicar)
# ─────────────────────────────────────────────
old_dr = '''  if ((tipo === 'empresa_servicios' || tipo === 'empresa_revendedora') && !empresa) { err.textContent = 'Ingresa el nombre de la empresa'; err.classList.remove('hidden'); return; }

  var btn = document.getElementById('reg-btn');'''

new_dr = '''  if ((tipo === 'empresa_servicios' || tipo === 'empresa_revendedora') && !empresa) { err.textContent = 'Ingresa el nombre de la empresa'; err.classList.remove('hidden'); return; }

  // Validación reseller / técnico independiente
  var necesitaDoc = (tipo === 'empresa_revendedora' || tipo === 'tecnico_independiente');
  var tipoEmp, numCom, ein, volumen, experiencia;
  if (necesitaDoc) {
    tipoEmp = document.getElementById('reg-tipo-emp').value;
    numCom = document.getElementById('reg-num-comerciante').value.trim();
    ein = document.getElementById('reg-ein').value.trim();
    volumen = document.getElementById('reg-volumen').value;
    experiencia = document.getElementById('reg-experiencia').value.trim();
    if (!tipoEmp) { err.textContent = 'Selecciona el tipo de empresa'; err.classList.remove('hidden'); return; }
    if (!numCom) { err.textContent = 'Ingresa el número de registro de comerciante'; err.classList.remove('hidden'); return; }
    if (!volumen) { err.textContent = 'Selecciona el volumen estimado'; err.classList.remove('hidden'); return; }
    if (!experiencia) { err.textContent = 'Cuéntanos tu experiencia'; err.classList.remove('hidden'); return; }
    if (!docRegistroAppB64) { err.textContent = 'Debes subir el documento de registro de comerciante'; err.classList.remove('hidden'); return; }
  }

  var btn = document.getElementById('reg-btn');'''

if old_dr in c:
    c = c.replace(old_dr, new_dr)
    print("3a. Validación reseller en doRegistro: OK")
else:
    print("3a. NO coincidió validación")

# 3b. Insertar la 2da llamada después de guardar sesión (cuando hay token)
old_token = '''    if (d.token) {
      if (d.verificacion_pendiente) {'''

new_token = '''    if (d.token) {
      // Segunda llamada: solicitud reseller/técnico con documento
      if (necesitaDoc) {
        try {
          await fetch(API + '/api/reseller/aplicar', {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + d.token},
            body: JSON.stringify({
              tipo_empresa: tipoEmp,
              registro_comerciante: numCom,
              ein: ein || null,
              experiencia: experiencia,
              volumen_estimado: volumen,
              documento_registro: docRegistroAppB64 || null
            })
          });
        } catch(e) {}
      }
      if (d.verificacion_pendiente || necesitaDoc) {'''

if old_token in c:
    c = c.replace(old_token, new_token)
    print("3b. Segunda llamada reseller/aplicar: OK")
else:
    print("3b. NO coincidió bloque token")

with open('/var/www/wifnix/app/index.html','w') as f:
    f.write(c)
print("---")
print("prevDocApp:", c.count('function prevDocApp'))
print("reseller/aplicar:", c.count('/api/reseller/aplicar'))
print("reg-reseller-wrap:", c.count('reg-reseller-wrap'))
