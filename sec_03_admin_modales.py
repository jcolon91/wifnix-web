#!/usr/bin/env python3
# ============================================================
# WIFNIX — FASE 2  (admin: modal Revisar Reseller)
# El modal de solicitud reseller pinta texto libre del formulario
# PUBLICO (experiencia, notas, empresa, tipo, etc.) con innerHTML.
# Reusa esc()/escRow() ya definidos por sec_02_admin_xss.py.
#
# Idempotente. Requiere que sec_02 ya haya corrido (escRow debe existir).
# ============================================================
import sys

RUTA = "/var/www/wifnix/admin/index.html"

try:
    s = open(RUTA, encoding="utf-8").read()
except FileNotFoundError:
    print("ERROR: no existe", RUTA); sys.exit(1)

if "function escRow(" not in s:
    print("ABORT: escRow() no existe. Corre primero sec_02_admin_xss.py."); sys.exit(1)

OLD = "  currentSolicitud = s;"
NEW = "  currentSolicitud = s;\n  s = escRow(s);"

if "currentSolicitud = s;\n  s = escRow(s);" in s:
    print("YA APLICADO: el modal reseller ya escapa. No se hace nada."); sys.exit(0)

if OLD in s:
    s = s.replace(OLD, NEW, 1)
    open(RUTA, "w", encoding="utf-8").write(s)
    print("OK -> escRow(s) en abrirModalReseller (experiencia/notas/empresa escapadas)")
    print("Actualizado:", RUTA)
    print("VALIDA: abre una solicitud reseller en el admin; debe verse el texto literal.")
else:
    print("NO: no se encontro el ancla 'currentSolicitud = s;'. Nada escrito.")
