# ─── APP TÉCNICO ───
with open('/var/www/wifnix/tecnicos/index.html','r') as f:
    t = f.read()

reemplazos_tecnico = [
    ('<span class="insp-lbl">Tomar vehiculo</span>', '<span class="insp-lbl">Check-in</span>'),
    ('<span class="insp-lbl">Entregar vehiculo</span>', '<span class="insp-lbl">Check-out</span>'),
    ("toast('Primero debes hacer la inspeccion de TOMA del vehiculo'); return;",
     "toast('Primero debes hacer el Check-in del vehiculo'); return;"),
    ("toast('Ya hiciste la toma del vehiculo hoy'); return;",
     "toast('Ya hiciste el Check-in del vehiculo hoy'); return;"),
    ("toast('Ya hiciste la entrega del vehiculo hoy'); return;",
     "toast('Ya hiciste el Check-out del vehiculo hoy'); return;"),
    ("document.getElementById('insp-title').textContent = tipo === 'salida' ? 'Tomar vehiculo' : 'Entregar vehiculo';",
     "document.getElementById('insp-title').textContent = tipo === 'salida' ? 'Check-in del vehiculo' : 'Check-out del vehiculo';"),
    ("bs.querySelector('.insp-lbl').textContent='Vehiculo tomado ✓';",
     "bs.querySelector('.insp-lbl').textContent='Check-in hecho ✓';"),
    ("be.querySelector('.insp-lbl').textContent='Vehiculo entregado ✓';",
     "be.querySelector('.insp-lbl').textContent='Check-out hecho ✓';"),
]

ct = 0
for old, new in reemplazos_tecnico:
    if old in t:
        t = t.replace(old, new)
        ct += 1
    else:
        print("  [tecnico] NO encontrado:", old[:50])

# También cambiar el texto descriptivo del tipo de inspección si existe
t = t.replace("'Tomar vehiculo (inicio del dia)'", "'Check-in (inicio del dia)'")
t = t.replace("'Entregar vehiculo (fin del dia)'", "'Check-out (fin del dia)'")
t = t.replace("inspActual.tipo==='salida'?'Tomar vehiculo (inicio del dia)':'Entregar vehiculo (fin del dia)'",
              "inspActual.tipo==='salida'?'Check-in (inicio del dia)':'Check-out (fin del dia)'")

with open('/var/www/wifnix/tecnicos/index.html','w') as f:
    f.write(t)
print("App técnico: %d textos cambiados" % ct)

# ─── ADMIN ───
with open('/var/www/wifnix/admin/index.html','r') as f:
    a = f.read()

reemplazos_admin = [
    ("(esSalida ? 'Sin inspeccion de toma' : 'Sin inspeccion de entrega (pendiente)')",
     "(esSalida ? 'Sin Check-in' : 'Sin Check-out (pendiente)')"),
    ("var titulo = esSalida ? 'TOMA (manana)' : 'ENTREGA (tarde)';",
     "var titulo = esSalida ? 'CHECK-IN' : 'CHECK-OUT';"),
    ("(iv.tipo==='salida'?'Toma':'Entrega')", "(iv.tipo==='salida'?'Check-in':'Check-out')"),
]

ca = 0
for old, new in reemplazos_admin:
    if old in a:
        a = a.replace(old, new)
        ca += 1
    else:
        print("  [admin] NO encontrado:", old[:50])

with open('/var/www/wifnix/admin/index.html','w') as f:
    f.write(a)
print("Admin: %d textos cambiados" % ca)
