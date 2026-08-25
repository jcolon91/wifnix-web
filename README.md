# wifnix.com

Sitio de Wifnix LLC — Puerto Rico. CCTV, redes empresariales, HVAC y
continuidad operacional.

El sitio son páginas HTML autocontenidas: cada una trae su propia
maquetación dentro de un `<style>` y su propia lógica dentro de un
`<script>`. Lo único compartido es el color y los dos interruptores.

---

## Cómo verlo en tu máquina

```bash
node .claude/wifnix-web-server.cjs     # sirve en http://localhost:4190
```

O cualquier servidor estático apuntando a la raíz del repositorio.

El backend es aparte:

```bash
npm install
cp .env.example .env      # y rellenar
node server.js
```

---

## Lo compartido: `assets/`

| Archivo | Qué hace |
|---|---|
| `wifnix.css` | Todo el color, en dos temas. Y el rótulo de sección y los interruptores. |
| `wifnix-ui.js` | Dibuja los interruptores de idioma y tema, y el paralaje de las fotos. |

### El color

`wifnix.css` define fichas nuevas (`--fondo`, `--panel`, `--tinta`,
`--texto`, `--apagado`, `--filo`, `--azul`…) en dos versiones: oscuro
y claro. El claro es **papel cálido `#F3F1EB`**, no blanco de oficina.

Debajo quedan como **alias** los nombres viejos que usa el sitio
(`--black`, `--white`, `--card`, `--gray`, `--blue`…). Se conservan a
propósito: el sitio entero está escrito con ellos y renombrarlos en
veintiún archivos era pedir un accidente. Al ser alias en cascada,
cambian solos al cambiar de tema.

**Regla al añadir CSS:** nunca escribas un color a pelo. Un `#FFF` de
texto desaparece sobre papel, y un fondo oscuro fijo deja una caja
negra en medio del tema claro.

### El tema y el idioma

Los decide un atributo en el `<html>`, puesto por un fragmento **en
línea** que va primero en el `<head>` de cada página:

```html
<script>/* …lee localStorage, pone data-tema y data-idioma… */</script>
<link rel="stylesheet" href="/assets/wifnix.css">
```

Tiene que ir en línea y tiene que ir primero. Si fuera un archivo
aparte se vería el parpadeo de blanco y los dos idiomas a la vez.

El idioma se marca duplicando el elemento:

```html
<p class="es">Texto en español</p>
<p class="en">Text in English</p>
```

**Nunca** con `style="display:none"`. Lo esconde el CSS leyendo
`data-idioma`. Poner el estilo en línea fue el origen de que salieran
los dos idiomas a la vez.

Para texto que vive en un atributo (marcador de posición, título):

```html
<input data-es="Tu correo" data-en="Your email">
```

Y en cada página, un hueco donde van los dos interruptores:

```html
<span data-wx-switches></span>
```

---

## El backend — `server.js`

Node + Express + PostgreSQL. Lo que hay que saber antes de tocarlo:

- **`lib/oauth.js`** — entrar con Google, Apple, Microsoft o Facebook.
  Todo el flujo ocurre en el servidor; el navegador nunca ve un
  secreto. Léelo entero antes de cambiar nada ahí: los comentarios
  explican por qué cada decisión es como es.
- **`/api/resenas`** — proxy de las reseñas de Google, con caché de 12
  horas. Google cobra por consulta y la portada la abre mucha gente.
- **CORS** — la lista de orígenes se escribe uno a uno. Nada de
  `*.wifnix.com`: un comodín deja entrar a cualquier subdominio.

### Antes del primer despliegue con login social

```bash
psql -U postgres -d wifnix -f migracion-oauth.sql
```

Añade la tabla `identidades_oauth` y hace que `password_hash` admita
`NULL` — quien entra con Google no tiene contraseña.

### Registrar las aplicaciones

Cada proveedor necesita su aplicación y la URL de retorno **exacta**:

```
https://api.wifnix.com/api/auth/oauth/<proveedor>/callback
```

| Proveedor | Dónde |
|---|---|
| Google | console.cloud.google.com → Credenciales |
| Microsoft | portal.azure.com → Entra ID → Registros de aplicaciones |
| Facebook | developers.facebook.com → Inicio de sesión con Facebook |
| Apple | developer.apple.com → Certificates, Identifiers & Profiles |

En Apple, `APPLE_CLIENT_ID` es el **Services ID**, no el Bundle ID, y
`APPLE_PRIVATE_KEY` es el contenido del `.p8` con `\n` en vez de
saltos de línea reales.

Los proveedores sin configurar simplemente no enseñan su botón.

---

## Fotografía — `assets/foto-*`

Generadas con IA y **provisionales** hasta que haya fotos propias. El
logotipo bordado es una interpretación fiel, no el vector exacto: para
material impreso hay que componerle el archivo real encima.

Cada una se sirve en WebP con JPEG de respaldo, a 2000px de ancho.

## Logotipos de marcas — pendiente

La franja de marcas de la portada enseña el nombre en la tipografía
del sitio y sondea `assets/marca-<id>.png`. En cuanto el archivo
exista, la imagen entra sola. Faltan: `marca-ubiquiti.png`,
`marca-ens.png`, `marca-cambium.png`, `marca-unv.png`,
`marca-tplink.png`, `marca-titanium.png`.

---

## Antes de dar por buena una página

- `class="es"` y `class="en"` tienen que cuadrar en número.
- Ningún `display:none` en línea sobre un `.es` o un `.en`.
- Cero colores escritos a pelo.
- Contraste mínimo 4.5:1 (3:1 en texto grande) **en los dos temas**.
- Sin desborde horizontal a 375px de ancho.
- Cada `getElementById` del script tiene que encontrar su objetivo.
