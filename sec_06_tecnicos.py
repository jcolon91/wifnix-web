#!/usr/bin/env python3
# ============================================================
# WIFNIX — FASE 2  (app tecnicos: tecnicos/index.html)
# IMPORTANTE: este es el frontend con mas riesgo real, porque el
# tecnico VE datos que escribe OTRO (el cliente): nombre, telefono,
# direccion y sobre todo notas_cliente (texto libre). Eso es XSS
# almacenado cruzado (cliente -> navegador del tecnico).
#
# Inyecta esc()/escRow(), escapa la lista de trabajos, el detalle
# completo (renderDetalle) y los chips de unidades. Idempotente.
# ============================================================
import sys

RUTA = "/var/www/wifnix/tecnicos/index.html"

HELPERS = (
    "function esc(s){return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\n"
    "function escRow(o){if(!o||typeof o!=='object')return o;var r={};for(var k in o){r[k]=(typeof o[k]==='string')?esc(o[k]):o[k];}return r;}\n"
)
HELPER_ANCHOR = "var TOKEN = storeGet('wifnix_tecnico_token');"

# escRow al tope de cada constructor
ESCROW = [
    ("d.map(function(j){", "j", "\n    "),       # lista de trabajos
    ("var j = jobActual;", "j", "\n  "),          # renderDetalle (detalle completo)
    ("msgs.map(function(m){", "m", "\n    "),     # chat interno del trabajo
]

# envoltura de los chips de unidades (aparece 2 veces: lista y detalle)
UNIT_OLD = "'<span class=\"unit-chip\">'+u.cantidad+' '+u.tipo_unidad+'</span>'"
UNIT_NEW = "'<span class=\"unit-chip\">'+esc(u.cantidad+' '+u.tipo_unidad)+'</span>'"

try:
    s = open(RUTA, encoding="utf-8").read()
except FileNotFoundError:
    print("ERROR: no existe", RUTA); sys.exit(1)

if "function escRow(" in s:
    print("YA APLICADO: escRow ya existe. No se hace nada."); sys.exit(0)

ok = 0; miss = 0
if HELPER_ANCHOR in s:
    s = s.replace(HELPER_ANCHOR, HELPERS + HELPER_ANCHOR, 1)
    print("OK      -> helpers esc()/escRow()"); ok += 1
else:
    print("ABORT   -> no se encontro el ancla de helpers. Nada escrito."); sys.exit(1)

for anchor, var, indent in ESCROW:
    if anchor in s:
        s = s.replace(anchor, anchor + indent + var + " = escRow(" + var + ");", 1)
        print("OK      -> escRow(" + var + ")  [" + anchor + "]"); ok += 1
    else:
        print("NO      -> ancla no encontrada: " + anchor); miss += 1

if UNIT_OLD in s:
    s = s.replace(UNIT_OLD, UNIT_NEW)   # all occurrences (lista + detalle)
    print("OK      -> wrap esc() en chips de unidades (x todas)"); ok += 1
else:
    print("NO      -> chips de unidades no encontrados"); miss += 1

open(RUTA, "w", encoding="utf-8").write(s)
print("Actualizado:", RUTA, "| aplicados:", ok, "| no encontrados:", miss)
print("VALIDA: abre un trabajo en la app de tecnicos; nombre/notas del cliente")
print("        deben verse como texto literal. Confirma que tel/Navegar siguen ok.")
