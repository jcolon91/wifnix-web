// ============================================================
// Saca las imágenes base64 de index.html a archivos en assets/.
//
//   node tools/extraer-imagenes.js
//
// El HTML pesaba 343 KB, de los cuales 176 KB eran imágenes
// incrustadas — y el logo estaba DUPLICADO (nav y footer, 60 KB
// cada vez). Como archivos, el navegador los cachea una sola vez
// y el HTML baja a menos de la mitad.
//
// Se corre una sola vez. Si vuelves a meter una imagen en base64,
// córrelo otra vez.
// ============================================================

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ASSETS = path.join(RAIZ, 'assets');
const HTML = path.join(RAIZ, 'index.html');

// El orden es el mismo en que aparecen en el HTML.
const NOMBRES = [
  'logo-wifnix',        // 1 · nav
  'cliente-transdev',   // 2
  'cliente-facciola',   // 3
  'cliente-don-ruiz',   // 4
  'cliente-paseos',     // 5
  'cliente-carrier',    // 6
  'cliente-la-peninsula', // 7
  'cliente-manuel-gas', // 8
  'logo-wifnix',        // 9 · footer (el mismo del nav)
];

fs.mkdirSync(ASSETS, { recursive: true });

let html = fs.readFileSync(HTML, 'utf8');
const re = /data:image\/([a-z+]+);base64,([A-Za-z0-9+/=]+)/g;

const encontrados = [];
let m;
while ((m = re.exec(html))) encontrados.push({ full: m[0], ext: m[1], b64: m[2] });

if (!encontrados.length) {
  console.log('No quedan imágenes en base64. Nada que hacer.');
  process.exit(0);
}
if (encontrados.length !== NOMBRES.length) {
  console.error(`Esperaba ${NOMBRES.length} imágenes y encontré ${encontrados.length}.`);
  console.error('Revisa la lista NOMBRES antes de seguir — no quiero renombrar mal.');
  process.exit(1);
}

const escritos = new Set();
let ahorro = 0;

encontrados.forEach((img, i) => {
  const archivo = `${NOMBRES[i]}.${img.ext === 'svg+xml' ? 'svg' : img.ext}`;
  const destino = path.join(ASSETS, archivo);

  if (!escritos.has(archivo)) {
    fs.writeFileSync(destino, Buffer.from(img.b64, 'base64'));
    escritos.add(archivo);
    console.log(`  assets/${archivo}  ${(Buffer.from(img.b64, 'base64').length / 1024).toFixed(1)} KB`);
  }

  ahorro += img.full.length;
  html = html.replace(img.full, `/assets/${archivo}`);
});

fs.writeFileSync(HTML, html, 'utf8');

console.log(`\nListo. ${escritos.size} archivos, ${encontrados.length} referencias reemplazadas.`);
console.log(`HTML: ${(ahorro / 1024).toFixed(0)} KB menos.`);
