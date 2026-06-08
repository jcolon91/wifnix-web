with open('/var/www/wifnix/backend/server.js','r') as f:
    c = f.read()

old = """app.post('/api/tecnico/inspeccion', tecnicoAuth, async (req, res) => {
  try {
    const { tipo, millaje, latitud, longitud, precision_gps, notas } = req.body;
    if (!tipo || !['salida','entrega'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (salida/entrega)' });
    const r = await db.query(
      `INSERT INTO inspecciones_vehiculo (tecnico_id, tipo, millaje, latitud, longitud, precision_gps, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.tecnico.tecnicoId, tipo, millaje || null, latitud || null, longitud || null, precision_gps || null, notas || null]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { console.error('Inspeccion crear:', e.message); res.status(500).json({ error: e.message }); }
});"""

new = """app.post('/api/tecnico/inspeccion', tecnicoAuth, async (req, res) => {
  try {
    const { tipo, millaje, latitud, longitud, precision_gps, notas, placa, unidad_numero } = req.body;
    if (!tipo || !['salida','entrega'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (salida/entrega)' });

    // Validación cronológica: no permitir 'entrega' sin una 'salida' previa el mismo día
    if (tipo === 'entrega') {
      const salidaHoy = await db.query(
        `SELECT id FROM inspecciones_vehiculo
         WHERE tecnico_id=$1 AND tipo='salida' AND creada::date = (NOW() AT TIME ZONE 'America/Puerto_Rico')::date
         LIMIT 1`,
        [req.tecnico.tecnicoId]
      );
      if (!salidaHoy.rows.length) {
        return res.status(400).json({ error: 'Primero debes hacer la inspección de TOMA del vehículo (mañana) antes de la entrega.' });
      }
    }

    const r = await db.query(
      `INSERT INTO inspecciones_vehiculo (tecnico_id, tipo, millaje, latitud, longitud, precision_gps, notas, placa, unidad_numero)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.tecnico.tecnicoId, tipo, millaje || null, latitud || null, longitud || null, precision_gps || null, notas || null, placa || null, unidad_numero || null]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch(e) { console.error('Inspeccion crear:', e.message); res.status(500).json({ error: e.message }); }
});"""

if old in c:
    c = c.replace(old, new)
    print("Backend crear inspección: placa/unidad + validación cronológica OK")
else:
    print("NO coincidió el endpoint. ¿Cambió?")

# También actualizar el GET admin para devolver placa y unidad
old_admin = """      `SELECT iv.id, iv.tipo, iv.millaje, iv.latitud, iv.longitud, iv.precision_gps, iv.notas, iv.creada,
              t.nombre AS tecnico_nombre, t.numero_empleado,"""
new_admin = """      `SELECT iv.id, iv.tipo, iv.millaje, iv.latitud, iv.longitud, iv.precision_gps, iv.notas, iv.creada, iv.placa, iv.unidad_numero,
              t.nombre AS tecnico_nombre, t.numero_empleado,"""
if old_admin in c:
    c = c.replace(old_admin, new_admin)
    print("Backend admin inspecciones: incluye placa/unidad OK")
else:
    print("NO coincidió el SELECT del admin")

with open('/var/www/wifnix/backend/server.js','w') as f:
    f.write(c)
