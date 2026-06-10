#!/usr/bin/env python3
# ============================================================
# WIFNIX — FASE 2 (cierre)  sec_07
# Cubre los ultimos spots que quedaron en los archivos DESPLEGADOS:
#   ADMIN:    - tabla de ordenes (__ordenesCache) -> escRow(o)
#             - detalle de orden (<p> con nombre/email) -> esc()
#   TECNICOS: - popup del mapa (construirMapaRuta) -> escRow(j)
#
# Reusa esc()/escRow() ya inyectados por sec_02 (admin) y sec_06 (tecnicos).
# Idempotente. Toca DOS archivos.
# ============================================================
import sys

ADMIN = "/var/www/wifnix/admin/index.html"
TEC   = "/var/www/wifnix/tecnicos/index.html"

def procesar(ruta, edits, requiere_escrow=True):
    try:
        s = open(ruta, encoding="utf-8").read()
    except FileNotFoundError:
        print("ERROR: no existe", ruta); return
    if requiere_escrow and "function escRow(" not in s:
        print("ABORT (" + ruta + "): escRow() no existe; corre antes el parche base."); return
    original = s
    for label, marker, old, new in edits:
        if marker and marker in s:
            print("YA      -> " + label); continue
        if old in s:
            s = s.replace(old, new, 1)
            print("OK      -> " + label)
        else:
            print("NO      -> " + label + " (ancla no encontrada)")
    if s != original:
        open(ruta, "w", encoding="utf-8").write(s)
        print("   ...actualizado:", ruta)
    else:
        print("   ...sin cambios:", ruta)

# -------- ADMIN --------
admin_edits = [
    ("ordenes: escRow(o) en la lista (__ordenesCache)",
     "__ordenesCache.map(function(o) {\n    o = escRow(o);",
     "__ordenesCache.map(function(o) {",
     "__ordenesCache.map(function(o) {\n    o = escRow(o);"),
    ("ordenes: detalle <p> (nombre/email del cliente)",
     "esc((o.nombre || '') + ' ' + (o.apellido || '')) + ' \u00b7 ' + esc(o.email) + '</p>'",
     "(o.nombre || '') + ' ' + (o.apellido || '') + ' \u00b7 ' + o.email + '</p>'",
     "esc((o.nombre || '') + ' ' + (o.apellido || '')) + ' \u00b7 ' + esc(o.email) + '</p>'"),
]

# -------- TECNICOS --------
tec_edits = [
    ("mapa: escRow(j) en popups (construirMapaRuta)",
     'j = escRow(j); var cliente=((j.cliente_nombre||""',
     'var cliente=((j.cliente_nombre||"")+" "+(j.cliente_apellido||"")).trim();',
     'j = escRow(j); var cliente=((j.cliente_nombre||"")+" "+(j.cliente_apellido||"")).trim();'),
]

print("===== ADMIN =====")
procesar(ADMIN, admin_edits)
print("===== TECNICOS =====")
procesar(TEC, tec_edits)
print("------------------------------------------------------------")
print("VALIDA: hard-refresh del admin (tabla y detalle de ordenes) y de tecnicos (abrir el mapa).")
