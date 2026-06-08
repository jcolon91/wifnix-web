with open('/var/www/wifnix/backend/server.js','r') as f:
    c = f.read()

if "/api/tecnico/inspeccion'" in c:
    print("Ya existen los endpoints de inspección. Abortando.")
else:
    # Anclar después del endpoint GET /api/citas/:id/fotos (que ya localizamos)
    ancla = """// Ver fotos de una cita (para técnico y para cliente vía portal)
app.get('/api/citas/:id/fotos', authTecnicoOUsuario, async (req, res) => {
  try {
    const r = await db.query("SELECT id, tipo, archivo, creado_en FROM citas_fotos WHERE cita_id=$1 ORDER BY tipo, creado_en", [req.params.id]);
    res.json(r.rows.map(f => ({ ...f, url: 'https://api.wifnix.com/uploads/citas/' + f.archivo })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});"""

    nuevo = ancla + """

// ═══════════════════════════════════════════
// INSPECCIÓN DE VEHÍCULO (FLOTA WIFNIX)
// 2 por día: 'salida' (tomar) y 'entrega' (devolver). Fotos se borran a 10 días vía cron.
// ═══════════════════════════════════════════

// Crear inspección (devuelve id para luego subir fotos)
app.post('/api/tecnico/inspeccion', tecnicoAuth, async (req, res) => {
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
});

// Subir foto de inspección
app.post('/api/tecnico/inspeccion/:id/foto', tecnicoAuth, async (req, res) => {
  try {
    const { tipo, imagen } = req.body; // tipo: 'frente'|'atras'|'izquierdo'|'derecho'|'millaje'|...
    if (!imagen || !tipo) return res.status(400).json({ error: 'Faltan datos' });

    // Validar que la inspección pertenece a este técnico
    const chk = await db.query('SELECT id FROM inspecciones_vehiculo WHERE id=$1 AND tecnico_id=$2', [req.params.id, req.tecnico.tecnicoId]);
    if (!chk.rows.length) return res.status(404).json({ error: 'Inspección no encontrada' });

    const dir = '/var/www/wifnix/uploads/inspecciones';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const matches = imagen.match(/^data:image\\/([\\w.+-]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Formato de imagen inválido' });
    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext.length > 5) ext = 'jpg';
    const data = Buffer.from(matches[2], 'base64');

    const nombre = 'insp_' + req.params.id + '_' + tipo + '_' + Date.now() + '.' + ext;
    fs.writeFileSync(dir + '/' + nombre, data);

    await db.query(
      'INSERT INTO inspeccion_fotos (inspeccion_id, tipo, url) VALUES ($1,$2,$3)',
      [req.params.id, tipo, nombre]
    );
    res.json({ ok: true, archivo: nombre });
  } catch(e) { console.error('Inspeccion foto:', e.message); res.status(500).json({ error: e.message }); }
});

// ADMIN: listar inspecciones (con fotos que aún no expiran)
app.get('/api/admin/inspecciones', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const { rows } = await db.query(
      `SELECT iv.id, iv.tipo, iv.millaje, iv.latitud, iv.longitud, iv.precision_gps, iv.notas, iv.creada,
              t.nombre AS tecnico_nombre, t.numero_empleado,
              COALESCE(json_agg(json_build_object('tipo', f.tipo, 'url', 'https://api.wifnix.com/uploads/inspecciones/' || f.url) ORDER BY f.id)
                       FILTER (WHERE f.id IS NOT NULL), '[]') AS fotos
       FROM inspecciones_vehiculo iv
       JOIN tecnicos t ON t.id = iv.tecnico_id
       LEFT JOIN inspeccion_fotos f ON f.inspeccion_id = iv.id
       GROUP BY iv.id, t.nombre, t.numero_empleado
       ORDER BY iv.creada DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch(e) { console.error('Admin inspecciones:', e.message); res.status(500).json({ error: e.message }); }
});"""

    c = c.replace(ancla, nuevo, 1)
    with open('/var/www/wifnix/backend/server.js','w') as f:
        f.write(c)
    print("Endpoints de inspección creados:")
    print(" - POST /api/tecnico/inspeccion")
    print(" - POST /api/tecnico/inspeccion/:id/foto")
    print(" - GET  /api/admin/inspecciones")
