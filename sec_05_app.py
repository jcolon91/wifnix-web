#!/usr/bin/env python3
# ============================================================
# WIFNIX — FASE 2  (app del cliente: app/index.html)
# Escapa el "Proximo servicio" (cita) y la vista de Cuenta.
# Datos propios del usuario (riesgo bajo). Inyecta esc()/escRow().
# Idempotente.
# ============================================================
import sys

RUTA = "/var/www/wifnix/app/index.html"

HELPERS = (
    "function esc(s){return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\n"
    "function escRow(o){if(!o||typeof o!=='object')return o;var r={};for(var k in o){r[k]=(typeof o[k]==='string')?esc(o[k]):o[k];}return r;}\n"
)
HELPER_ANCHOR = "var TOKEN = localStorage.getItem('wifnix_token');"

# (old, new, all_occurrences)
EDITS = [
    # cita del dashboard: escapa todos los campos string de la cita
    ("var c = proximas[0];", "var c = proximas[0];\n      c = escRow(c);", False),
    # vista Cuenta (datos propios)
    ("' + nombre + '</div>'",
     "' + esc(nombre) + '</div>'", False),
    ("(nombre.charAt(0)||'U')", "esc(nombre.charAt(0)||'U')", False),
    ("((USER&&USER.email)||'')", "esc((USER&&USER.email)||'')", False),
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

for old, new, all_occ in EDITS:
    if old in s:
        s = s.replace(old, new) if all_occ else s.replace(old, new, 1)
        print("OK      -> " + old[:46]); ok += 1
    else:
        print("NO      -> no encontrado: " + old[:46]); miss += 1

open(RUTA, "w", encoding="utf-8").write(s)
print("Actualizado:", RUTA, "| aplicados:", ok, "| no encontrados:", miss)
print("VALIDA: abre la app, revisa 'Proximo servicio' y la pestana Cuenta.")
