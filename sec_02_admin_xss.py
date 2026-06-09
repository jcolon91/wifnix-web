#!/usr/bin/env python3
# ============================================================
# WIFNIX — PARCHE DE SEGURIDAD 2/2  (admin: XSS almacenado)
# Inyecta esc()/escRow() y escapa TODO dato dinamico que el panel
# pinta con innerHTML (tablas, chat, leads, garantias, ordenes,
# resellers, auditoria, dashboard y el modal de usuario).
#
# Cierra la cadena: input no autenticado -> se guarda -> admin abre
# el panel -> el codigo corria en el navegador del admin -> robo del
# token (que vive en localStorage). Con esto, todo se muestra como TEXTO.
#
# Idempotente: si ya esta aplicado (existe escRow), no hace nada.
# NOTA: los value="" de inputs se escapan tambien; el navegador
# decodifica las entidades al leer .value, asi que guardar/editar
# sigue funcionando igual (round-trip seguro).
# ============================================================
import sys

RUTA = "/var/www/wifnix/admin/index.html"

HELPERS = (
    "function esc(s){return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\n"
    "function escRow(o){if(!o||typeof o!=='object')return o;var r={};for(var k in o){r[k]=(typeof o[k]==='string')?esc(o[k]):o[k];}return r;}\n"
)
HELPER_ANCHOR = "var TOKEN = localStorage.getItem('wifnix_admin_token');"

# (ancla del callback  ->  variable a escapar). Se inserta escRow justo dentro del map.
TABLE_BUILDERS = [
    ("data.map(function(u, idx) {", "u"),          # tabla usuarios
    ("data.map(function(l, idx) {", "l"),          # tabla leads
    ("data.map(function(t, idx) {", "t"),          # tabla tickets
    ("msgs.map(function(m) {", "m"),               # chat del ticket (CRITICO)
    ("allGarantias.map(function(g) {", "g"),       # tabla garantias
    ("data.map(function(s, idx) {", "s"),          # tabla resellers
    ("data.map(function(a) {", "a"),               # auditoria
    ("tks.slice(0,5).map(function(t){", "t"),      # dashboard tickets
    ("lds.slice(0,5).map(function(l){", "l"),      # dashboard leads
    ("var rows = data.map(function(o) {", "o"),    # tabla ordenes
    ("data.map(function(p, idx) {", "p"),          # tabla productos
    ("function abrirModalUsuario(u) {", "u"),      # modal editar usuario (banner + value="")
]

# Envolturas puntuales con esc()
FIELD_WRAPS = [
    # listas <option> de "nuevo ticket" y "nueva garantia" (aparece 2 veces, identicas)
    ("((u.nombre || '') + ' ' + (u.apellido || '')).trim() + ' \u2014 ' + u.email + '</option>'",
     "esc(((u.nombre || '') + ' ' + (u.apellido || '')).trim() + ' \u2014 ' + u.email) + '</option>'",
     True),   # all-occurrences
    # tabla de contabilidad (cliente)
    ("'<td>' + (o.nombre || '') + ' ' + (o.apellido || '') + '</td>' +",
     "'<td>' + esc((o.nombre || '') + ' ' + (o.apellido || '')) + '</td>' +",
     False),
]

try:
    s = open(RUTA, encoding="utf-8").read()
except FileNotFoundError:
    print("ERROR: no existe", RUTA); sys.exit(1)

if "function escRow(" in s:
    print("YA APLICADO: escRow ya existe en el archivo. No se hace nada.")
    sys.exit(0)

ok = 0
miss = 0

# 1) Helpers
if HELPER_ANCHOR in s:
    s = s.replace(HELPER_ANCHOR, HELPERS + HELPER_ANCHOR, 1)
    print("OK      -> helpers esc()/escRow()")
    ok += 1
else:
    print("ABORT   -> no se encontro el ancla de los helpers. Nada escrito.")
    sys.exit(1)

# 2) escRow en cada builder
for anchor, var in TABLE_BUILDERS:
    if anchor in s:
        s = s.replace(anchor, anchor + "\n    " + var + " = escRow(" + var + ");", 1)
        print("OK      -> escRow(" + var + ")  [" + anchor[:34] + "...]")
        ok += 1
    else:
        print("NO      -> ancla no encontrada: " + anchor[:48])
        miss += 1

# 3) Envolturas puntuales
for old, new, all_occ in FIELD_WRAPS:
    if old in s:
        s = s.replace(old, new) if all_occ else s.replace(old, new, 1)
        print("OK      -> wrap esc()  [" + old[:34] + "...]")
        ok += 1
    else:
        print("NO      -> wrap no encontrado: " + old[:48])
        miss += 1

open(RUTA, "w", encoding="utf-8").write(s)
print("------------------------------------------------------------")
print("Archivo actualizado:", RUTA)
print("Aplicados:", ok, "| No encontrados:", miss)
print("VALIDA: refresca el admin (hard refresh), confirma que las tablas")
print("        cargan, y opcional: registra un usuario con nombre <b>x</b>")
print("        -> debe verse el texto literal, no en negrita.")
