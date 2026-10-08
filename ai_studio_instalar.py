#!/usr/bin/env python3
"""
WIFNIX AI STUDIO — conecta lib/ai-studio.js a server.js

Uso en el VPS:
  cd /var/www/wifnix/backend
  python3 ai_studio_instalar.py
  node --check server.js && pm2 restart wifnix-api

Hace tres cambios, y si alguno no encuentra su ancla, aborta sin tocar
nada. Si ya se corrió antes, no hace nada (es idempotente).
Deja copia en server.js.antes-ai-studio
"""
import shutil, sys

RUTA = 'server.js'
src = open(RUTA, encoding='utf-8').read()

if "require('./lib/ai-studio')" in src:
    print('AI Studio ya está instalado en server.js. Nada que hacer.')
    sys.exit(0)

cambios = [
    # 1. Cargar el módulo junto a los otros de lib/
    ("const oauth = require('./lib/oauth');",
     "const oauth = require('./lib/oauth');\n"
     "const { crearStudio } = require('./lib/ai-studio');"),

    # 2. El webhook de Stripe de AI Studio va ANTES de express.json():
    #    Stripe firma el cuerpo crudo y json() lo destruye.
    ("app.use(express.json({ limit: '2mb' }));",
     "// AI Studio: su webhook de Stripe necesita el cuerpo crudo, por eso va antes de express.json()\n"
     "const aiStudio = crearStudio({ db, stripe, anthropic, sendEmail, checkPermiso });\n"
     "aiStudio.montarWebhookStripe(app);\n"
     "\n"
     "app.use(express.json({ limit: '2mb' }));"),

    # 3. Las rutas y el reconciliador, al final
    ("app.listen(PORT, () => {",
     "// ============================================================\n"
     "// AI STUDIO — créditos prepagados + generación (lib/ai-studio.js)\n"
     "// ============================================================\n"
     "aiStudio.montar(app, authMiddleware);\n"
     "aiStudio.iniciarReconciliador();\n"
     "\n"
     "app.listen(PORT, () => {"),
]

for ancla, _ in cambios:
    n = src.count(ancla)
    if n != 1:
        print(f'ABORTADO: el ancla aparece {n} veces (se esperaba 1):\n  {ancla}')
        sys.exit(1)

for ancla, nuevo in cambios:
    src = src.replace(ancla, nuevo, 1)

shutil.copy(RUTA, RUTA + '.antes-ai-studio')
open(RUTA, 'w', encoding='utf-8').write(src)
print('Listo. server.js actualizado (copia en server.js.antes-ai-studio).')
print('Ahora: node --check server.js && pm2 restart wifnix-api')
