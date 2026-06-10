#!/usr/bin/env python3
# ============================================================
# WIFNIX — sec_08  (backend: rate-limit del chat que faltó)
# El bloque original de sec_01 no calzó porque el server desplegado
# tiene authLimiter con max:30 y no usa app.use('/api/auth'...).
# Aquí anclamos en la línea que SÍ existe: app.use('/api', limiter);
# y añadimos un limitador dedicado para /api/chat (cubre /api/chat/mensaje
# y /api/chat/solicitar-tecnico).
# Idempotente.
# ============================================================
import sys

RUTA = "/var/www/wifnix/backend/server.js"
OLD = "app.use('/api', limiter);"
NEW = ("app.use('/api', limiter);\n"
       "const chatLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados mensajes, intenta mas tarde' } });\n"
       "app.use('/api/chat', chatLimiter);")

try:
    s = open(RUTA, encoding="utf-8").read()
except FileNotFoundError:
    print("ERROR: no existe", RUTA); sys.exit(1)

if "chatLimiter" in s:
    print("YA APLICADO: chatLimiter ya existe. No se hace nada."); sys.exit(0)

if OLD in s:
    s = s.replace(OLD, NEW, 1)
    open(RUTA, "w", encoding="utf-8").write(s)
    print("OK -> chatLimiter agregado (/api/chat, 20 por 15 min)")
    print("Actualizado:", RUTA)
    print("VALIDA:  node --check", RUTA)
    print("LUEGO:   pm2 restart wifnix-api   (este SÍ es backend, requiere restart)")
else:
    print("NO: no se encontro \"app.use('/api', limiter);\". Nada escrito.")
    print("    Pasame: grep -n \"app.use\" " + RUTA)
