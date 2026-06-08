with open('/var/www/wifnix/backend/server.js','r') as f:
    c = f.read()

if "/api/tecnico/inspeccion/estado-hoy" in c:
    print("Ya existe estado-hoy. Abortando.")
    raise SystemExit

# Anclar después del endpoint POST crear inspección
ancla = "app.post('/api/tecnico/inspeccion/:id/foto', tecnicoAuth, async (req, res) => {"

nuevo = """// Estado de inspección del día (¿ya hizo toma/entrega hoy?)
app.get('/api/tecnico/inspeccion/estado-hoy', tecnicoAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT tipo FROM inspecciones_vehiculo
       WHERE tecnico_id=$1 AND creada::date = (NOW() AT TIME ZONE 'America/Puerto_Rico')::date`,
      [req.tecnico.tecnicoId]
    );
    const tipos = r.rows.map(x => x.tipo);
    res.json({ ok: true, salida: tipos.includes('salida'), entrega: tipos.includes('entrega') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tecnico/inspeccion/:id/foto', tecnicoAuth, async (req, res) => {"""

c = c.replace(ancla, nuevo, 1)
with open('/var/www/wifnix/backend/server.js','w') as f:
    f.write(c)
print("Endpoint GET /api/tecnico/inspeccion/estado-hoy creado")
