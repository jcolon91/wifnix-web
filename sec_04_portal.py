#!/usr/bin/env python3
# ============================================================
# WIFNIX — FASE 2  (portal del cliente: portal.html)
# Escapa los render de tablas (tickets, garantias, ordenes).
# Mayormente datos propios del usuario (riesgo bajo / defensa en fondo).
# Inyecta esc()/escRow() e inserta escRow al tope de cada forEach.
# Idempotente.
# ============================================================
import sys

RUTA = "/var/www/wifnix/frontend/portal.html"

HELPERS = (
    "function esc(s){return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\n"
    "function escRow(o){if(!o||typeof o!=='object')return o;var r={};for(var k in o){r[k]=(typeof o[k]==='string')?esc(o[k]):o[k];}return r;}\n"
)
HELPER_ANCHOR = "var token = localStorage.getItem('wifnix_token');"

BUILDERS = [
    ("tks.forEach(function(t) {", "t"),     # tabla tickets
    ("data.forEach(function(g) {", "g"),    # tabla garantias
    ("data.forEach(function(o) {", "o"),    # tabla ordenes
]

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

for anchor, var in BUILDERS:
    if anchor in s:
        s = s.replace(anchor, anchor + "\n    " + var + " = escRow(" + var + ");", 1)
        print("OK      -> escRow(" + var + ")  [" + anchor + "]"); ok += 1
    else:
        print("NO      -> ancla no encontrada: " + anchor); miss += 1

open(RUTA, "w", encoding="utf-8").write(s)
print("Actualizado:", RUTA, "| aplicados:", ok, "| no encontrados:", miss)
print("VALIDA: entra al portal, confirma que tickets/garantias/ordenes cargan bien.")
