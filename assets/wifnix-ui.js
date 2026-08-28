/* ══════════════════════════════════════════════════════════════
   WIFNIX — idioma y tema, compartidos por todo el sitio

   El trabajo de verdad ya lo hizo el fragmento en línea del <head>:
   pone data-tema y data-idioma en el <html> ANTES de que se pinte
   nada, así que nadie ve un parpadeo de blanco ni el inglés y el
   español a la vez. Desde ahí manda el CSS.

   Este archivo solo dibuja los dos interruptores y los conecta.
   Si falla, la página se queda en el idioma y el tema guardados y
   sigue perfectamente usable: por eso no hace nada crítico.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var raiz = document.documentElement;
  var LS_TEMA = 'wx-tema';
  var LS_IDIOMA = 'wx-idioma';

  function guardar(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* modo privado */ }
  }

  /* ── TEMA ─────────────────────────────────────────────────── */

  function ponerTema(tema) {
    // La clase hace que la transición solo exista durante el cambio.
    // Si estuviera siempre puesta, cada hover arrastraría medio segundo.
    raiz.classList.add('tema-cambiando');
    raiz.setAttribute('data-tema', tema);
    guardar(LS_TEMA, tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'claro' ? '#F3F1EB' : '#070C16');
    setTimeout(function () { raiz.classList.remove('tema-cambiando'); }, 500);
  }

  /* ── IDIOMA ───────────────────────────────────────────────── */

  function ponerIdioma(idioma) {
    raiz.setAttribute('data-idioma', idioma);
    raiz.lang = idioma;
    guardar(LS_IDIOMA, idioma);
    // Los textos alternos que viven en un atributo (marcadores de
    // posición, títulos, alt) no los alcanza el CSS.
    var n = document.querySelectorAll('[data-es][data-en]');
    for (var i = 0; i < n.length; i++) {
      var el = n[i];
      var valor = el.getAttribute('data-' + idioma);
      if (el.placeholder !== undefined && el.tagName !== 'SELECT') el.placeholder = valor;
      else el.textContent = valor;
    }
    var t = document.querySelector('title[data-es][data-en]');
    if (t) document.title = t.getAttribute('data-' + idioma);
    sincronizarSelects(idioma);
    actualizarBotones();
  }

  // Un <select> cerrado enseña el rótulo de la opción elegida AUNQUE el
  // CSS la esconda con display:none. Así que si la elegida quedó siendo
  // la gemela del otro idioma, el desplegable cerrado miente: en español
  // se leía "Select a town".
  //
  // Las páginas que traían su propio sincronizador solo lo disparaban al
  // CAMBIAR de idioma, no al cargar, y en la primera pintura salía mal.
  // Hacerlo aquí lo arregla en todas a la vez.
  function sincronizarSelects(idioma) {
    var otro = idioma === 'es' ? 'en' : 'es';
    var selects = document.getElementsByTagName('select');
    for (var i = 0; i < selects.length; i++) {
      var s = selects[i];
      var elegida = s.options[s.selectedIndex];
      // Solo se toca si la elegida es una gemela del idioma contrario.
      if (!elegida || !elegida.classList.contains(otro)) continue;
      for (var j = 0; j < s.options.length; j++) {
        if (s.options[j].value === elegida.value &&
            s.options[j].classList.contains(idioma)) {
          // selectedIndex no dispara 'change': no se desencadenan
          // recálculos ni peticiones por esto.
          s.selectedIndex = j;
          break;
        }
      }
    }
  }

  function actualizarBotones() {
    var idioma = raiz.getAttribute('data-idioma') || 'es';
    var b = document.querySelectorAll('.wx-lang button');
    for (var i = 0; i < b.length; i++) {
      b[i].setAttribute('aria-pressed', String(b[i].dataset.idioma === idioma));
    }
  }

  /* ── LOS DOS INTERRUPTORES ────────────────────────────────── */

  var SOL = '<svg class="wx-sol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4"/></svg>';
  var LUNA = '<svg class="wx-luna" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 019.4 3.5a8.6 8.6 0 1011.1 11.1z"/></svg>';

  function dibujar(hueco) {
    var idioma = raiz.getAttribute('data-idioma') || 'es';
    var tema = raiz.getAttribute('data-tema') || 'oscuro';

    var caja = document.createElement('div');
    caja.className = 'wx-switches';

    var lang = document.createElement('div');
    lang.className = 'wx-lang';
    lang.setAttribute('role', 'group');
    lang.setAttribute('aria-label', idioma === 'es' ? 'Idioma' : 'Language');
    ['es', 'en'].forEach(function (cod) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.idioma = cod;
      b.textContent = cod.toUpperCase();
      b.setAttribute('aria-pressed', String(cod === idioma));
      b.addEventListener('click', function () { ponerIdioma(cod); });
      lang.appendChild(b);
    });

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'wx-tema';
    boton.innerHTML = SOL + LUNA;
    boton.setAttribute('aria-label', idioma === 'es' ? 'Cambiar tema' : 'Switch theme');
    boton.addEventListener('click', function () {
      ponerTema(raiz.getAttribute('data-tema') === 'claro' ? 'oscuro' : 'claro');
    });

    caja.appendChild(lang);
    caja.appendChild(boton);
    hueco.replaceWith(caja);
    void tema;
  }

  /* ── PARALAJE ─────────────────────────────────────────────── */

  // La foto se mueve mas despacio que el texto que tiene al lado. Es
  // el unico movimiento de la pagina, y va atado a una fotografia de
  // verdad: eso lo separa del adorno animado de plantilla.
  //
  // Solo se calcula para lo que esta en pantalla, y todo el trabajo
  // ocurre dentro de un requestAnimationFrame para no bloquear el
  // desplazamiento.
  function paralaje() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var fotos = document.querySelectorAll('.hero-foto img, .aut-foto img');
    if (!fotos.length || !('IntersectionObserver' in window)) return;

    var visibles = [];
    var pendiente = false;
    var RECORRIDO = 26;   // pixeles totales de deriva

    var ojo = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        var i = visibles.indexOf(e.target);
        if (e.isIntersecting && i === -1) visibles.push(e.target);
        else if (!e.isIntersecting && i !== -1) visibles.splice(i, 1);
      });
      pintar();
    }, { rootMargin: '120px 0px' });

    for (var k = 0; k < fotos.length; k++) ojo.observe(fotos[k]);

    function pintar() {
      pendiente = false;
      var alto = window.innerHeight;
      visibles.forEach(function (img) {
        var marco = img.parentElement.closest('figure') || img.parentElement;
        var caja = marco.getBoundingClientRect();
        // -1 cuando el marco entra por abajo, +1 cuando sale por arriba.
        var avance = (caja.top + caja.height / 2 - alto / 2) / (alto / 2 + caja.height / 2);
        avance = Math.max(-1, Math.min(1, avance));
        img.style.transform = 'translate3d(0,' + (avance * RECORRIDO).toFixed(2) + 'px,0) scale(1.1)';
      });
    }

    function alDesplazar() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(pintar);
    }

    addEventListener('scroll', alDesplazar, { passive: true });
    addEventListener('resize', alDesplazar, { passive: true });
    pintar();
  }

  function arrancar() {
    var huecos = document.querySelectorAll('[data-wx-switches]');
    for (var i = 0; i < huecos.length; i++) dibujar(huecos[i]);
    ponerIdioma(raiz.getAttribute('data-idioma') || 'es');
    paralaje();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  // Si nunca eligió tema a mano, seguir al sistema cuando cambie.
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
      if (!localStorage.getItem(LS_TEMA)) raiz.setAttribute('data-tema', e.matches ? 'claro' : 'oscuro');
    });
  } catch (e) { /* navegador viejo */ }

  // Las páginas antiguas llaman a setLang() desde el marcado.
  window.setLang = ponerIdioma;
  window.wxTema = ponerTema;
})();
