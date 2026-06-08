with open('/var/www/wifnix/backend/cron-borrar-fotos.js','r') as f:
    c = f.read()

if 'inspeccion_fotos' in c:
    print("El cron ya maneja inspeccion_fotos. Abortando.")
    raise SystemExit

# Insertar el bloque de borrado de fotos de inspección justo antes del console.log final de citas
ancla = """    console.log(new Date().toISOString() + ' — Fotos borradas: ' + borradas);"""

nuevo = """    console.log(new Date().toISOString() + ' — Fotos de citas borradas: ' + borradas);

    // ── Fotos de inspección de vehículo: borrar a los 10 días (conservar el registro de la inspección) ──
    const ins = await db.query("SELECT id, url FROM inspeccion_fotos WHERE creada < NOW() - INTERVAL '10 days'");
    let borradasInsp = 0;
    for (const f of ins.rows) {
      const ruta = '/var/www/wifnix/uploads/inspecciones/' + f.url;
      try { if (fs.existsSync(ruta)) fs.unlinkSync(ruta); } catch(e) {}
      await db.query('DELETE FROM inspeccion_fotos WHERE id=$1', [f.id]);
      borradasInsp++;
    }
    console.log(new Date().toISOString() + ' — Fotos de inspección borradas: ' + borradasInsp);"""

if ancla in c:
    c = c.replace(ancla, nuevo, 1)
    with open('/var/www/wifnix/backend/cron-borrar-fotos.js','w') as f:
        f.write(c)
    print("Cron extendido para borrar fotos de inspección a 10 días: OK")
else:
    print("NO se encontró el console.log ancla. Contenido actual:")
    print(c)
