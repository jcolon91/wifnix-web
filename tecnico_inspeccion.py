with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

if 'id="inspeccion"' in c:
    print("Ya existe la pantalla de inspección. Abortando.")
    raise SystemExit

# ─────────────────────────────────────────────
# 1. Tarjeta de inspección ANTES de "Trabajos del día"
# ─────────────────────────────────────────────
old_jobs = '''    <div class="section-title">Trabajos del día</div>
    <div id="jobs"><div class="loading">Cargando...</div></div>'''
new_jobs = '''    <div class="section-title">Vehículo de la compañía</div>
    <div style="background:var(--card);border:1px solid var(--line);border-radius:15px;padding:14px;margin-bottom:8px;box-shadow:0 1px 3px rgba(15,31,46,0.04)">
      <div style="display:flex;gap:10px">
        <button onclick="abrirInspeccion('salida')" style="flex:1;background:rgba(11,143,204,0.08);color:var(--blue);border:1.5px solid rgba(11,143,204,0.25);border-radius:12px;padding:14px 8px;font-weight:800;font-size:0.84rem;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <span style="font-size:1.5rem">🚗</span>Tomar vehículo
        </button>
        <button onclick="abrirInspeccion('entrega')" style="flex:1;background:rgba(0,179,119,0.08);color:var(--green);border:1.5px solid rgba(0,179,119,0.25);border-radius:12px;padding:14px 8px;font-weight:800;font-size:0.84rem;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <span style="font-size:1.5rem">🏁</span>Entregar vehículo
        </button>
      </div>
      <div style="font-size:0.68rem;color:var(--gray2);text-align:center;margin-top:9px">Inspección con fotos al inicio y fin del día</div>
    </div>

    <div class="section-title">Trabajos del día</div>
    <div id="jobs"><div class="loading">Cargando...</div></div>'''
if old_jobs in c:
    c = c.replace(old_jobs, new_jobs)
    print("1. Tarjeta de inspección: OK")
else:
    print("1. NO coincidió la sección de trabajos")

# ─────────────────────────────────────────────
# 2. Pantalla de inspección (overlay) — insertar después del cierre del #detail
#    Anclamos en el contenedor del detalle: '<div class="wrap" id="det-content"></div>' + cierre
# ─────────────────────────────────────────────
old_det = '''  <div class="wrap" id="det-content"></div>
</div>'''
new_det = '''  <div class="wrap" id="det-content"></div>
</div>

<!-- INSPECCIÓN DE VEHÍCULO -->
<div id="inspeccion" style="position:fixed;inset:0;background:var(--bg);z-index:100;overflow-y:auto;transform:translateX(100%);transition:transform .25s ease">
  <div class="topbar">
    <button class="det-back" onclick="cerrarInspeccion()">‹ Volver</button>
    <div class="tb-title" id="insp-title" style="font-size:0.92rem">Inspección</div>
    <div style="width:60px"></div>
  </div>
  <div class="wrap" id="insp-content"></div>
</div>'''
if old_det in c:
    c = c.replace(old_det, new_det, 1)
    print("2. Pantalla inspección: OK")
else:
    print("2. NO coincidió el cierre del detalle")

# ─────────────────────────────────────────────
# 3. Funciones JS antes de "// ---- INIT ----"
# ─────────────────────────────────────────────
js = '''
// ═══ INSPECCIÓN DE VEHÍCULO (FLOTA) ═══
var FOTOS_INSPECCION = [
  { tipo:'frente',    label:'Frente' },
  { tipo:'atras',     label:'Parte trasera' },
  { tipo:'izquierdo', label:'Lado izquierdo' },
  { tipo:'derecho',   label:'Lado derecho' },
  { tipo:'millaje',   label:'Millaje (odómetro)' },
  { tipo:'interior',  label:'Interior', opcional:true }
];
var inspActual = { tipo:null, id:null, fotos:{}, pos:null };

function abrirInspeccion(tipo) {
  inspActual = { tipo:tipo, id:null, fotos:{}, pos:null };
  document.getElementById('insp-title').textContent = tipo === 'salida' ? '🚗 Tomar vehículo' : '🏁 Entregar vehículo';
  renderInspeccion();
  document.getElementById('inspeccion').style.transform = 'translateX(0)';
  if (history && history.pushState) history.pushState({ vista:'inspeccion' }, '');
  capturarGPSInspeccion();
}
function cerrarInspeccion() {
  document.getElementById('inspeccion').style.transform = 'translateX(100%)';
}

async function capturarGPSInspeccion() {
  var p = await getPosSafe();
  if (p) {
    inspActual.pos = p;
    var el = document.getElementById('insp-gps');
    if (el) el.innerHTML = '📍 Ubicación capturada (±' + p.acc + 'm)';
  } else {
    var el2 = document.getElementById('insp-gps');
    if (el2) el2.innerHTML = '<span style="color:var(--warn)">⚠ Sin ubicación (continúa igual)</span>';
  }
}

function renderInspeccion() {
  var fotosReq = FOTOS_INSPECCION.filter(function(f){ return !f.opcional; });
  var hechas = Object.keys(inspActual.fotos).filter(function(t){
    return FOTOS_INSPECCION.some(function(f){ return f.tipo===t && !f.opcional; });
  }).length;
  var falta = fotosReq.length - hechas;

  var grid = FOTOS_INSPECCION.map(function(s){
    var existe = inspActual.fotos[s.tipo];
    if (existe) {
      return '<div class="photo-slot done"><span class="ph-badge">'+s.label+'</span><span class="ph-check">✓</span><img src="'+existe+'"></div>';
    }
    return '<label class="photo-slot"><span class="ph-badge">'+s.label+'</span>'+(s.opcional?'<span class="ph-opt">opcional</span>':'')+'<span class="photo-add">+</span><span>Tomar foto</span><input type="file" accept="image/*" capture="environment" style="display:none" onchange="fotoInspeccion(this,\\''+s.tipo+'\\')"></label>';
  }).join('');

  var html =
    '<div class="det-card">' +
      '<div class="det-row"><div class="det-ico">📋</div><div><div class="det-k">Tipo de inspección</div><div class="det-v">'+(inspActual.tipo==='salida'?'Tomar vehículo (inicio del día)':'Entregar vehículo (fin del día)')+'</div></div></div>' +
      '<div class="det-row"><div class="det-ico">📍</div><div><div class="det-k">Ubicación</div><div class="det-v" id="insp-gps">Capturando...</div></div></div>' +
    '</div>' +
    '<div class="det-card">' +
      '<div class="det-k" style="margin-bottom:8px">Millaje actual</div>' +
      '<input type="number" id="insp-millaje" inputmode="numeric" placeholder="Ej: 84500" style="width:100%;padding:13px;border:1.5px solid var(--line);border-radius:11px;font-size:1.05rem;color:var(--ink)">' +
    '</div>' +
    '<div class="section-title" style="margin:8px 4px 8px">Fotos del vehículo · <span style="color:var(--blue)" id="insp-prog">'+hechas+'/'+fotosReq.length+'</span></div>' +
    '<div class="photo-grid">'+grid+'</div>' +
    '<button class="flow-btn completar" id="insp-guardar" style="margin-top:16px" onclick="guardarInspeccion()" '+(falta>0?'disabled':'')+'>'+
      (falta>0 ? ('📸 Faltan '+falta+' foto'+(falta>1?'s':'')) : '✓ Guardar inspección')+
    '</button>';

  document.getElementById('insp-content').innerHTML = html;
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
      inspActual.fotos[tipo] = canvas.toDataURL('image/jpeg', 0.7);
      renderInspeccion();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function guardarInspeccion() {
  var btn = document.getElementById('insp-guardar');
  var millaje = document.getElementById('insp-millaje').value;
  btn.disabled = true; btn.textContent = 'Guardando...';

  // 1. Crear la inspección
  var crear = await tapi('/api/tecnico/inspeccion', { method:'POST', body:{
    tipo: inspActual.tipo,
    millaje: millaje ? parseInt(millaje) : null,
    latitud: inspActual.pos ? inspActual.pos.lat : null,
    longitud: inspActual.pos ? inspActual.pos.lng : null,
    precision_gps: inspActual.pos ? inspActual.pos.acc : null
  }});
  if (!crear || !crear.ok) { toast('Error al crear inspección'); btn.disabled=false; btn.textContent='✓ Guardar inspección'; return; }

  inspActual.id = crear.id;

  // 2. Subir cada foto
  var tipos = Object.keys(inspActual.fotos);
  var subidas = 0;
  for (var i=0; i<tipos.length; i++) {
    btn.textContent = 'Subiendo foto '+(i+1)+'/'+tipos.length+'...';
    var r = await tapi('/api/tecnico/inspeccion/'+inspActual.id+'/foto', { method:'POST', body:{ tipo:tipos[i], imagen:inspActual.fotos[tipos[i]] } });
    if (r && r.ok) subidas++;
  }

  toast('¡Inspección guardada! ('+subidas+' fotos)');
  setTimeout(cerrarInspeccion, 800);
}

// ---- INIT ----'''
c = c.replace('// ---- INIT ----', js, 1)
print("3. Funciones inspección: OK")

with open('/var/www/wifnix/tecnicos/index.html','w') as f:
    f.write(c)
print("---")
print("abrirInspeccion:", c.count('function abrirInspeccion'))
print("guardarInspeccion:", c.count('function guardarInspeccion'))
print("fotoInspeccion:", c.count('function fotoInspeccion'))
