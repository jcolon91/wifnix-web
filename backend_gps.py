p = '/var/www/wifnix/backend/server.js'
c = open(p).read()
log = []

# ═══════════════════════════════════════════════════════
# ENDPOINT 1: La app del técnico reporta su posición
# Insertar después del endpoint /api/tecnico/resumen
# ═══════════════════════════════════════════════════════
ancla_tec = "app.get('/api/tecnico/resumen', tecnicoAuth, async (req, res) => {"

endpoint_reportar = '''// ═══ GPS: el técnico reporta su posición (mientras la app está abierta) ═══
app.post('/api/tecnico/posicion', tecnicoAuth, async (req, res) => {
  try {
    const { lat, lng, precision, velocidad } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'Faltan coordenadas' });
    const tid = req.tecnico.tecnicoId;

    // Traer última posición para detectar movimiento real (>30m)
    const prev = await db.query('SELECT ultima_lat, ultima_lng FROM tecnicos WHERE id=$1', [tid]);
    let seMovio = true;
    if (prev.rows[0] && prev.rows[0].ultima_lat != null && prev.rows[0].ultima_lng != null) {
      const dLat = (parseFloat(lat) - parseFloat(prev.rows[0].ultima_lat)) * 111320;
      const dLng = (parseFloat(lng) - parseFloat(prev.rows[0].ultima_lng)) * 111320 * Math.cos(parseFloat(lat) * Math.PI / 180);
      const dist = Math.sqrt(dLat*dLat + dLng*dLng);
      seMovio = dist > 30; // se considera movimiento si avanzó más de 30 metros
    }

    if (seMovio) {
      await db.query(
        'UPDATE tecnicos SET ultima_lat=$1, ultima_lng=$2, ultima_precision=$3, ultima_velocidad=$4, ultima_posicion_at=NOW(), ultimo_movimiento_at=NOW() WHERE id=$5',
        [lat, lng, precision || null, velocidad || null, tid]
      );
    } else {
      // Misma posición: actualizar solo el "último visto", NO el "último movimiento"
      await db.query(
        'UPDATE tecnicos SET ultima_lat=$1, ultima_lng=$2, ultima_precision=$3, ultima_velocidad=$4, ultima_posicion_at=NOW() WHERE id=$5',
        [lat, lng, precision || null, velocidad || null, tid]
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tecnico/resumen', tecnicoAuth, async (req, res) => {'''

if ancla_tec in c:
    c = c.replace(ancla_tec, endpoint_reportar, 1)
    log.append("1. POST /api/tecnico/posicion: OK")
else:
    log.append("1. NO se encontro ancla /api/tecnico/resumen")

# ═══════════════════════════════════════════════════════
# ENDPOINT 2: El admin lee todos los técnicos con su estado en vivo
# Insertar antes del endpoint /api/admin/inspecciones
# ═══════════════════════════════════════════════════════
ancla_admin = "app.get('/api/admin/inspecciones', authMiddleware, async (req, res) => {"

endpoint_admin = '''// ═══ GPS: el admin ve todos los técnicos en vivo ═══
app.get('/api/admin/tecnicos-gps', authMiddleware, async (req, res) => {
  try {
    if (!['super_admin','admin','admin_soporte','admin_tecnico'].includes(req.user.rol)) return res.status(403).json({ error: 'Sin acceso' });
    const hoy = fechaHoyPR();
    // Técnicos activos con su última posición
    const t = await db.query(`
      SELECT id, numero_empleado, nombre, telefono,
             ultima_lat, ultima_lng, ultima_precision, ultima_velocidad,
             ultima_posicion_at, ultimo_movimiento_at
      FROM tecnicos WHERE activo = true
      ORDER BY numero_empleado
    `);

    const ahora = Date.now();
    const tecnicos = [];
    for (const tec of t.rows) {
      // ¿Tiene una cita en proceso hoy? ¿Cuál es su próxima cita?
      const citas = await db.query(`
        SELECT c.tipo_servicio, c.slot, c.status, c.direccion, c.municipio, c.latitud, c.longitud
        FROM citas_mantenimiento c
        JOIN citas_tecnicos ct ON ct.cita_id = c.id
        WHERE ct.tecnico_id = $1 AND c.fecha = $2 AND c.status NOT IN ('cancelada','completada')
        ORDER BY c.slot
      `, [tec.id, hoy]);

      const enProceso = citas.rows.find(x => x.status === 'en_proceso');
      const proxima = citas.rows[0] || null;

      // Estado de conexión
      let online = false, minSinSenal = null;
      if (tec.ultima_posicion_at) {
        minSinSenal = Math.round((ahora - new Date(tec.ultima_posicion_at).getTime()) / 60000);
        online = minSinSenal < 3; // reportó hace menos de 3 min
      }

      // ¿Lleva mucho tiempo parado? (>15 min sin moverse y NO está en cita)
      let minParado = null, alertaParado = false;
      if (tec.ultimo_movimiento_at) {
        minParado = Math.round((ahora - new Date(tec.ultimo_movimiento_at).getTime()) / 60000);
        if (online && !enProceso && minParado >= 15) alertaParado = true;
      }

      let estado = 'desconectado';
      if (online && enProceso) estado = 'en_cita';
      else if (online && alertaParado) estado = 'parado';
      else if (online) estado = 'en_ruta';

      tecnicos.push({
        id: tec.id,
        numero: tec.numero_empleado,
        nombre: tec.nombre,
        telefono: tec.telefono,
        lat: tec.ultima_lat ? parseFloat(tec.ultima_lat) : null,
        lng: tec.ultima_lng ? parseFloat(tec.ultima_lng) : null,
        precision: tec.ultima_precision,
        velocidad: tec.ultima_velocidad ? parseFloat(tec.ultima_velocidad) : null,
        online, estado,
        min_sin_senal: minSinSenal,
        min_parado: minParado,
        alerta_parado: alertaParado,
        en_cita: enProceso ? { servicio: enProceso.tipo_servicio, direccion: enProceso.direccion, municipio: enProceso.municipio } : null,
        proxima_cita: proxima ? { servicio: proxima.tipo_servicio, slot: proxima.slot, direccion: proxima.direccion, municipio: proxima.municipio } : null,
        total_citas_hoy: citas.rows.length
      });
    }

    res.json({ ok: true, tecnicos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/inspecciones', authMiddleware, async (req, res) => {'''

if ancla_admin in c:
    c = c.replace(ancla_admin, endpoint_admin, 1)
    log.append("2. GET /api/admin/tecnicos-gps: OK")
else:
    log.append("2. NO se encontro ancla /api/admin/inspecciones")

open(p,'w').write(c)
print("\n".join(log))
print("---")
print("posicion endpoint:", c.count("/api/tecnico/posicion"))
print("tecnicos-gps endpoint:", c.count("/api/admin/tecnicos-gps"))
