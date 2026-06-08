with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

# ─────────────────────────────────────────────
# 1. Array de fotos: renombrar interior a delantero + agregar trasero, todas obligatorias
# ─────────────────────────────────────────────
old_fotos = """var FOTOS_INSPECCION = [
  { tipo:'frente',    label:'Frente' },
  { tipo:'atras',     label:'Parte trasera' },
  { tipo:'izquierdo', label:'Lado izquierdo' },
  { tipo:'derecho',   label:'Lado derecho' },
  { tipo:'millaje',   label:'Millaje (odómetro)' },
  { tipo:'interior',  label:'Interior', opcional:true }
];"""
new_fotos = """var FOTOS_INSPECCION = [
  { tipo:'frente',            label:'Frente' },
  { tipo:'atras',             label:'Parte trasera' },
  { tipo:'izquierdo',         label:'Lado izquierdo' },
  { tipo:'derecho',           label:'Lado derecho' },
  { tipo:'millaje',           label:'Millaje (odómetro)' },
  { tipo:'interior_delantero',label:'Interior delantero' },
  { tipo:'interior_trasero',  label:'Interior trasero' }
];"""
if old_fotos in c:
    c = c.replace(old_fotos, new_fotos)
    print("1. Array de fotos (interior trasero + todas obligatorias): OK")
else:
    print("1. NO coincidió el array de fotos")

# ─────────────────────────────────────────────
# 2. Agregar campos placa + número de unidad ANTES del bloque de millaje
# ─────────────────────────────────────────────
old_millaje = """    '<div class="det-card">' +
      '<div class="det-k" style="margin-bottom:8px">Millaje actual</div>' +
      '<input type="number" id="insp-millaje" inputmode="numeric" placeholder="Ej: 84500" style="width:100%;padding:13px;border:1.5px solid var(--line);border-radius:11px;font-size:1.05rem;color:var(--ink)">' +
    '</div>' +"""
new_millaje = """    '<div class="det-card">' +
      '<div class="det-k" style="margin-bottom:8px">Número de unidad</div>' +
      '<input type="text" id="insp-unidad" placeholder="Ej: Unidad 3" style="width:100%;padding:13px;border:1.5px solid var(--line);border-radius:11px;font-size:1.05rem;color:var(--ink);margin-bottom:14px">' +
      '<div class="det-k" style="margin-bottom:8px">Tablilla / Placa</div>' +
      '<input type="text" id="insp-placa" placeholder="Ej: ABC-123" autocapitalize="characters" style="width:100%;padding:13px;border:1.5px solid var(--line);border-radius:11px;font-size:1.05rem;color:var(--ink);margin-bottom:14px">' +
      '<div class="det-k" style="margin-bottom:8px">Millaje actual</div>' +
      '<input type="number" id="insp-millaje" inputmode="numeric" placeholder="Ej: 84500" style="width:100%;padding:13px;border:1.5px solid var(--line);border-radius:11px;font-size:1.05rem;color:var(--ink)">' +
    '</div>' +"""
if old_millaje in c:
    c = c.replace(old_millaje, new_millaje)
    print("2. Campos placa + unidad: OK")
else:
    print("2. NO coincidió el bloque de millaje")

# ─────────────────────────────────────────────
# 3. Incluir placa + unidad en el body de guardarInspeccion
# ─────────────────────────────────────────────
old_body = """  var crear = await tapi('/api/tecnico/inspeccion', { method:'POST', body:{
    tipo: inspActual.tipo,
    millaje: millaje ? parseInt(millaje) : null,
    latitud: inspActual.pos ? inspActual.pos.lat : null,
    longitud: inspActual.pos ? inspActual.pos.lng : null,
    precision_gps: inspActual.pos ? inspActual.pos.acc : null
  }});"""
new_body = """  var unidad = document.getElementById('insp-unidad') ? document.getElementById('insp-unidad').value.trim() : '';
  var placa = document.getElementById('insp-placa') ? document.getElementById('insp-placa').value.trim() : '';
  var crear = await tapi('/api/tecnico/inspeccion', { method:'POST', body:{
    tipo: inspActual.tipo,
    millaje: millaje ? parseInt(millaje) : null,
    unidad_numero: unidad || null,
    placa: placa || null,
    latitud: inspActual.pos ? inspActual.pos.lat : null,
    longitud: inspActual.pos ? inspActual.pos.lng : null,
    precision_gps: inspActual.pos ? inspActual.pos.acc : null
  }});"""
if old_body in c:
    c = c.replace(old_body, new_body)
    print("3. Body guardar con placa/unidad: OK")
else:
    print("3. NO coincidió el body de guardar")

# ─────────────────────────────────────────────
# 4. Manejar el error de validación cronológica del backend (mostrar mensaje claro)
# ─────────────────────────────────────────────
old_err = """  if (!crear || !crear.ok) { toast('Error al crear inspección'); btn.disabled=false; btn.textContent='✓ Guardar inspección'; return; }"""
new_err = """  if (!crear || !crear.ok) { toast((crear && crear.error) || 'Error al crear inspección'); btn.disabled=false; btn.textContent='✓ Guardar inspección'; return; }"""
if old_err in c:
    c = c.replace(old_err, new_err)
    print("4. Mensaje de error del backend: OK")
else:
    print("4. NO coincidió el manejo de error (no crítico)")

with open('/var/www/wifnix/tecnicos/index.html','w') as f:
    f.write(c)
print("---")
print("interior_trasero:", c.count('interior_trasero'))
print("insp-placa:", c.count('insp-placa'))
print("insp-unidad:", c.count('insp-unidad'))
