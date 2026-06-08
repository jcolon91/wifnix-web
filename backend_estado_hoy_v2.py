with open('/var/www/wifnix/backend/server.js','r') as f:
    c = f.read()

old = """app.get('/api/tecnico/inspeccion/estado-hoy', tecnicoAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT tipo FROM inspecciones_vehiculo
       WHERE tecnico_id=$1 AND creada::date = (NOW() AT TIME ZONE 'America/Puerto_Rico')::date`,
      [req.tecnico.tecnicoId]
    );
    const tipos = r.rows.map(x => x.tipo);
    res.json({ ok: true, salida: tipos.includes('salida'), entrega: tipos.includes('entrega') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});"""

new = """app.get('/api/tecnico/inspeccion/estado-hoy', tecnicoAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT tipo, unidad_numero, placa FROM inspecciones_vehiculo
       WHERE tecnico_id=$1 AND creada::date = (NOW() AT TIME ZONE 'America/Puerto_Rico')::date
       ORDER BY creada ASC`,
      [req.tecnico.tecnicoId]
    );
    const tipos = r.rows.map(x => x.tipo);
    const salidaRow = r.rows.find(x => x.tipo === 'salida');
    res.json({
      ok: true,
      salida: tipos.includes('salida'),
      entrega: tipos.includes('entrega'),
      toma_unidad: salidaRow ? salidaRow.unidad_numero : null,
      toma_placa: salidaRow ? salidaRow.placa : null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});"""

if old in c:
    c = c.replace(old, new)
    with open('/var/www/wifnix/backend/server.js','w') as f:
        f.write(c)
    print("estado-hoy ampliado con toma_unidad/toma_placa: OK")
else:
    print("NO coincidió estado-hoy")
