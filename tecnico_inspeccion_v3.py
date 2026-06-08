with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

# ═══════════════════════════════════════════════
# 1. Crear getPosSafe (no existía) — insertar antes de capturarGPSInspeccion
# ═══════════════════════════════════════════════
if 'function getPosSafe' not in c:
    ancla1 = "async function capturarGPSInspeccion() {"
    getpos = """function getPosSafe() {
  return new Promise(function(res){
    if (!navigator.geolocation) { res(null); return; }
    navigator.geolocation.getCurrentPosition(
      function(p){ res({ lat:+p.coords.latitude.toFixed(6), lng:+p.coords.longitude.toFixed(6), acc:Math.round(p.coords.accuracy) }); },
      function(){ res(null); },
      { enableHighAccuracy:true, timeout:15000, maximumAge:10000 }
    );
  });
}

async function capturarGPSInspeccion() {"""
    c = c.replace(ancla1, getpos, 1)
    print("1. getPosSafe creada: OK")
else:
    print("1. getPosSafe ya existía")

# ═══════════════════════════════════════════════
# 2. Mejorar capturarGPSInspeccion (reintentar + estado visible)
# ═══════════════════════════════════════════════
old_cap = """async function capturarGPSInspeccion() {
  var p = await getPosSafe();
  if (p) {
    inspActual.pos = p;
    var el = document.getElementById('insp-gps');
    if (el) el.innerHTML = '📍 Ubicación capturada (±' + p.acc + 'm)';
  } else {
    var el2 = document.getElementById('insp-gps');
    if (el2) el2.innerHTML = '<span style="color:var(--warn)">⚠ Sin ubicación (continúa igual)</span>';
  }
}"""
new_cap = """async function capturarGPSInspeccion() {
  var el = document.getElementById('insp-gps');
  if (el) el.innerHTML = 'Capturando ubicación...';
  var p = await getPosSafe();
  if (p) {
    inspActual.pos = p;
    if (el) el.innerHTML = 'Ubicacion capturada (±' + p.acc + 'm) <span onclick="capturarGPSInspeccion()" style="color:var(--blue);cursor:pointer;font-size:0.78rem">· actualizar</span>';
  } else {
    if (el) el.innerHTML = '<span style="color:var(--warn)">Sin ubicacion</span> <span onclick="capturarGPSInspeccion()" style="color:var(--blue);cursor:pointer;font-size:0.82rem">· reintentar</span>';
  }
}"""
if old_cap in c:
    c = c.replace(old_cap, new_cap)
    print("2. capturarGPSInspeccion mejorada: OK")
else:
    print("2. NO coincidió capturarGPSInspeccion")

# ═══════════════════════════════════════════════
# 3. abrirInspeccion: consultar estado del día antes de abrir
# ═══════════════════════════════════════════════
old_abrir = """function abrirInspeccion(tipo) {
  inspActual = { tipo:tipo, id:null, fotos:{}, pos:null };
  document.getElementById('insp-title').textContent = tipo === 'salida' ? '🚗 Tomar vehículo' : '🏁 Entregar vehículo';
  renderInspeccion();
  document.getElementById('inspeccion').style.transform = 'translateX(0)';
  if (history && history.pushState) history.pushState({ vista:'inspeccion' }, '');
  capturarGPSInspeccion();
}"""
new_abrir = """async function abrirInspeccion(tipo) {
  // Verificar estado del día
  var estado = await tapi('/api/tecnico/inspeccion/estado-hoy');
  if (estado && estado.ok) {
    if (tipo === 'entrega' && !estado.salida) { toast('Primero debes hacer la inspeccion de TOMA del vehiculo'); return; }
    if (tipo === 'salida' && estado.salida) { toast('Ya hiciste la toma del vehiculo hoy'); return; }
    if (tipo === 'entrega' && estado.entrega) { toast('Ya hiciste la entrega del vehiculo hoy'); return; }
  }
  inspActual = { tipo:tipo, id:null, fotos:{}, pos:null };
  document.getElementById('insp-title').textContent = tipo === 'salida' ? 'Tomar vehiculo' : 'Entregar vehiculo';
  renderInspeccion();
  document.getElementById('inspeccion').style.transform = 'translateX(0)';
  if (history && history.pushState) history.pushState({ vista:'inspeccion' }, '');
  capturarGPSInspeccion();
}

// Actualiza el estado visual de los botones toma/entrega en la pantalla principal
async function actualizarBotonesInspeccion() {
  var estado = await tapi('/api/tecnico/inspeccion/estado-hoy');
  if (!estado || !estado.ok) return;
  var bs = document.getElementById('btn-insp-salida');
  var be = document.getElementById('btn-insp-entrega');
  if (bs) {
    if (estado.salida) { bs.style.opacity='0.45'; bs.style.pointerEvents='none'; bs.querySelector('.insp-lbl').textContent='Vehiculo tomado ✓'; }
    else { bs.style.opacity='1'; bs.style.pointerEvents='auto'; }
  }
  if (be) {
    if (estado.entrega) { be.style.opacity='0.45'; be.style.pointerEvents='none'; be.querySelector('.insp-lbl').textContent='Vehiculo entregado ✓'; }
    else if (!estado.salida) { be.style.opacity='0.45'; be.style.pointerEvents='none'; }
    else { be.style.opacity='1'; be.style.pointerEvents='auto'; }
  }
}"""
if old_abrir in c:
    c = c.replace(old_abrir, new_abrir)
    print("3. abrirInspeccion con control de estado: OK")
else:
    print("3. NO coincidió abrirInspeccion")

# ═══════════════════════════════════════════════
# 4. Botones de la pantalla principal con IDs + label envuelto en span
# ═══════════════════════════════════════════════
old_btns = """        <button onclick="abrirInspeccion('salida')" style="flex:1;background:rgba(11,143,204,0.08);color:var(--blue);border:1.5px solid rgba(11,143,204,0.25);border-radius:12px;padding:14px 8px;font-weight:800;font-size:0.84rem;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <span style="font-size:1.5rem">🚗</span>Tomar vehículo
        </button>
        <button onclick="abrirInspeccion('entrega')" style="flex:1;background:rgba(0,179,119,0.08);color:var(--green);border:1.5px solid rgba(0,179,119,0.25);border-radius:12px;padding:14px 8px;font-weight:800;font-size:0.84rem;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <span style="font-size:1.5rem">🏁</span>Entregar vehículo
        </button>"""
new_btns = """        <button id="btn-insp-salida" onclick="abrirInspeccion('salida')" style="flex:1;background:rgba(11,143,204,0.08);color:var(--blue);border:1.5px solid rgba(11,143,204,0.25);border-radius:12px;padding:14px 8px;font-weight:800;font-size:0.84rem;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <span class="insp-lbl">Tomar vehiculo</span>
        </button>
        <button id="btn-insp-entrega" onclick="abrirInspeccion('entrega')" style="flex:1;background:rgba(0,179,119,0.08);color:var(--green);border:1.5px solid rgba(0,179,119,0.25);border-radius:12px;padding:14px 8px;font-weight:800;font-size:0.84rem;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;opacity:0.45;pointer-events:none">
          <span class="insp-lbl">Entregar vehiculo</span>
        </button>"""
if old_btns in c:
    c = c.replace(old_btns, new_btns)
    print("4. Botones con IDs: OK")
else:
    print("4. NO coincidió los botones (revisar)")

# ═══════════════════════════════════════════════
# 5. guardarInspeccion: validar TODOS los campos antes de someter
# ═══════════════════════════════════════════════
old_guardar_inicio = """async function guardarInspeccion() {
  var btn = document.getElementById('insp-guardar');
  var millaje = document.getElementById('insp-millaje').value;
  btn.disabled = true; btn.textContent = 'Guardando...';"""
new_guardar_inicio = """async function guardarInspeccion() {
  var btn = document.getElementById('insp-guardar');
  var millaje = document.getElementById('insp-millaje').value;
  var unidad = document.getElementById('insp-unidad') ? document.getElementById('insp-unidad').value.trim() : '';
  var placa = document.getElementById('insp-placa') ? document.getElementById('insp-placa').value.trim() : '';

  // Validar campos obligatorios indicando exactamente cuál falta
  if (!unidad) { toast('Falta: Numero de unidad'); document.getElementById('insp-unidad').focus(); return; }
  if (!placa) { toast('Falta: Tablilla / Placa'); document.getElementById('insp-placa').focus(); return; }
  if (!millaje) { toast('Falta: Millaje actual'); document.getElementById('insp-millaje').focus(); return; }
  // Validar todas las fotos obligatorias
  for (var k=0; k<FOTOS_INSPECCION.length; k++) {
    var f = FOTOS_INSPECCION[k];
    if (!f.opcional && !inspActual.fotos[f.tipo]) { toast('Falta la foto: ' + f.label); return; }
  }

  btn.disabled = true; btn.textContent = 'Guardando...';"""
if old_guardar_inicio in c:
    c = c.replace(old_guardar_inicio, new_guardar_inicio)
    print("5. Validación de campos en guardar: OK")
else:
    print("5. NO coincidió el inicio de guardarInspeccion")

# ═══════════════════════════════════════════════
# 6. Al cerrar inspección, refrescar botones; y al iniciar app también
# ═══════════════════════════════════════════════
old_cerrar = """function cerrarInspeccion() {
  document.getElementById('inspeccion').style.transform = 'translateX(100%)';
}"""
new_cerrar = """function cerrarInspeccion() {
  document.getElementById('inspeccion').style.transform = 'translateX(100%)';
  actualizarBotonesInspeccion();
}"""
if old_cerrar in c:
    c = c.replace(old_cerrar, new_cerrar)
    print("6. cerrarInspeccion refresca botones: OK")
else:
    print("6. NO coincidió cerrarInspeccion")

# Llamar actualizarBotonesInspeccion al iniciar la app (después de cargarTrabajos en iniciarApp)
old_init = """  cargarResumen();
  cargarTrabajos();
}"""
new_init = """  cargarResumen();
  cargarTrabajos();
  actualizarBotonesInspeccion();
}"""
if old_init in c:
    c = c.replace(old_init, new_init, 1)
    print("7. iniciarApp llama actualizarBotones: OK")
else:
    print("7. NO coincidió iniciarApp (no crítico)")

with open('/var/www/wifnix/tecnicos/index.html','w') as f:
    f.write(c)
print("---")
print("getPosSafe:", c.count('function getPosSafe'))
print("actualizarBotonesInspeccion:", c.count('function actualizarBotonesInspeccion'))
print("btn-insp-salida:", c.count('btn-insp-salida'))
