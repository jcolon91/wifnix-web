#!/usr/bin/env python3
# ============================================================
# WIFNIX — sec_09  (app: escapar el render del perfil)
# p.email y los valores de filaInfo (telefono, direccion fisica/postal)
# se pintan con innerHTML. Son datos propios (self-XSS, riesgo bajo),
# se cierran para el 100%. Reusa esc() ya inyectado por sec_05.
# Idempotente.
# ============================================================
import sys

RUTA = "/var/www/wifnix/app/index.html"

try:
    s = open(RUTA, encoding="utf-8").read()
except FileNotFoundError:
    print("ERROR: no existe", RUTA); sys.exit(1)

if "function esc(" not in s:
    print("ABORT: esc() no existe; corre primero sec_05_app.py."); sys.exit(1)

# (label, marker_ya_aplicado, old, new)
EDITS = [
    ("perfil: email",
     "margin-top:2px\">' + esc(p.email||'')",
     "margin-top:2px\">' + (p.email||'') + '</div>'",
     "margin-top:2px\">' + esc(p.email||'') + '</div>'"),
    ("perfil: filaInfo (telefono / direcciones)",
     "text-align:right\">' + esc(valor)",
     "text-align:right\">' + valor + '</span></div>'",
     "text-align:right\">' + esc(valor) + '</span></div>'"),
]

ok = 0; miss = 0; ya = 0
for label, marker, old, new in EDITS:
    if marker in s:
        print("YA      -> " + label); ya += 1
    elif old in s:
        s = s.replace(old, new, 1)
        print("OK      -> " + label); ok += 1
    else:
        print("NO      -> " + label + " (ancla no encontrada)"); miss += 1

if ok:
    open(RUTA, "w", encoding="utf-8").write(s)
    print("Actualizado:", RUTA)
else:
    print("Sin cambios.")
print("Aplicados:", ok, "| ya estaban:", ya, "| no encontrados:", miss)
print("VALIDA: abre la pestana Cuenta/Perfil en la app (archivo estatico, solo hard-refresh).")
