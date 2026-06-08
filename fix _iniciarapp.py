with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    c = f.read()

if 'cargarTrabajos();\n  actualizarBotonesInspeccion();' in c:
    print("Ya está la llamada. Abortando.")
    raise SystemExit

old = """  cargarResumen();
  cargarTrabajos();
  actualizarBadgeChat();"""
new = """  cargarResumen();
  cargarTrabajos();
  actualizarBotonesInspeccion();
  actualizarBadgeChat();"""

if old in c:
    c = c.replace(old, new, 1)
    with open('/var/www/wifnix/tecnicos/index.html','w') as f:
        f.write(c)
    print("actualizarBotonesInspeccion añadido a iniciarApp: OK")
else:
    print("NO coincidió. Contenido de iniciarApp:")
    import re
    m = re.search(r"function iniciarApp.*?\n}", c, re.DOTALL)
    if m: print(m.group(0))
