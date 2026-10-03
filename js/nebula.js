/* Nebulosa: pinta la paleta como nubes de gas en SVG.
   Cada color es una capa SVG con tres manchas de degradado radial (velo, cuerpo y
   penacho) que se mezcla con las demás en modo "screen". Las manchas son
   estáticas; lo que deriva, muy despacio, es la capa entera, con animaciones CSS
   que solo tocan `transform`: el navegador la mueve en el compositor sin repintar.
   La textura de polvo es otra capa ESTÁTICA encima (ruido aplicado una vez como
   máscara), así que ningún filtro se recalcula por frame.
   Al cambiar de paleta se apila una escena nueva y se funde con la anterior. */
(function () {
  "use strict";

  var App = (window.NebulaPalette = window.NebulaPalette || {});
  var color = App.color;
  var SVG_NS = "http://www.w3.org/2000/svg";

  var WIDTH = 1000;
  var HEIGHT = 560;
  var FADE_MS = 1100;
  var STARS = 84;
  // Las capas de gas sobresalen un 15 % por cada lado: al derivar nunca asoma su borde.
  var MARGIN = 0.15;
  var BOX = { x: -WIDTH * MARGIN, y: -HEIGHT * MARGIN, w: WIDTH * (1 + 2 * MARGIN), h: HEIGHT * (1 + 2 * MARGIN) };
  // Posición de cada color a lo largo del eje de la nube, del más claro al más
  // oscuro: el claro queda en el centro, como núcleo, y los oscuros en los bordes.
  var SPINE = [0.5, 0.3, 0.7, 0.12, 0.88];
  // Degradado de cada mancha: [posición, opacidad]
  var STOPS = [
    [0, 0.78],
    [0.3, 0.48],
    [0.62, 0.15],
    [1, 0],
  ];

  function node(name, attrs, parent) {
    var el = document.createElementNS(SVG_NS, name);
    for (var key in attrs) el.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function reduced() {
    return window.Pluton && window.Pluton.reducedMotion();
  }

  // Semilla estable: la misma paleta pinta siempre la misma nebulosa.
  function seedOf(colors) {
    var text = colors.join("");
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // "screen" casi no deja ver los colores muy oscuros sobre el fondo: solo para
  // pintar el gas se les sube la claridad, manteniendo tono y carácter.
  function gasTint(hex) {
    var lch = color.hexToOklch(hex);
    if (lch.l >= 0.5) return hex;
    return color.oklchToHex(0.5 + lch.l * 0.08, lch.c * 1.25 + 0.01, lch.h);
  }

  function svgRoot(className, box) {
    return node("svg", {
      class: className,
      viewBox: box ? [box.x, box.y, box.w, box.h].join(" ") : "0 0 " + WIDTH + " " + HEIGHT,
      preserveAspectRatio: "xMidYMid slice",
      "aria-hidden": "true",
      focusable: "false",
    });
  }

  App.createNebula = function (host) {
    var counter = 0;
    var current = null;

    // Devuelve una capa SVG por color.
    function buildGas(colors, rand, axis) {
      var id = "neb" + ++counter;
      var degrees = (axis.angle * 180) / Math.PI;
      var mirror = rand() < 0.5;

      // Del más claro al más oscuro, para repartirlos sobre el eje.
      var order = colors
        .map(function (hex, i) {
          return { i: i, lum: color.luminance(hex) };
        })
        .sort(function (a, b) {
          return b.lum - a.lum;
        });

      return order.map(function (entry, rank) {
        var svg = svgRoot("nebula-cloud", BOX);
        var fill = id + "-" + entry.i;
        var gradient = node("radialGradient", { id: fill }, node("defs", {}, svg));
        var tint = gasTint(colors[entry.i]);
        STOPS.forEach(function (stop) {
          node("stop", { offset: stop[0], "stop-color": tint, "stop-opacity": stop[1] }, gradient);
        });

        function blob(x, y, rx, ry, rotation, opacity) {
          node(
            "ellipse",
            {
              rx: rx.toFixed(1),
              ry: ry.toFixed(1),
              fill: "url(#" + fill + ")",
              opacity: opacity.toFixed(2),
              transform: "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + rotation.toFixed(1) + ")",
            },
            svg
          );
        }

        var t = SPINE[rank] + (rand() - 0.5) * 0.08;
        if (mirror) t = 1 - t;
        var along = (t - 0.5) * 760;
        var px = axis.x + axis.ux * along;
        var py = axis.y + axis.uy * along;
        var size = rank === 0 ? 0.78 : 1; // el núcleo claro, más contenido
        var side = rand() < 0.5 ? -1 : 1;
        var lift = 50 + rand() * 60;
        var slide = (rand() - 0.5) * 120;

        // velo alargado, casi paralelo al eje
        blob(
          px + axis.ux * slide - axis.nx * side * 40,
          py + axis.uy * slide - axis.ny * side * 40,
          (270 + rand() * 120) * size,
          (84 + rand() * 50) * size,
          degrees + (rand() - 0.5) * 44,
          0.6
        );
        // cuerpo
        blob(px + (rand() - 0.5) * 50, py + (rand() - 0.5) * 50, (180 + rand() * 64) * size, (138 + rand() * 54) * size, rand() * 180, 0.92);
        // penacho, desplazado hacia un lado del eje
        blob(
          px + axis.nx * side * lift + axis.ux * slide * 0.6,
          py + axis.ny * side * lift + axis.uy * slide * 0.6,
          (112 + rand() * 58) * size,
          (82 + rand() * 44) * size,
          rand() * 180,
          0.78
        );
        // nudo denso: solo en los dos colores más claros, que hacen de núcleo
        if (rank < 2) blob(px + (rand() - 0.5) * 70, py + (rand() - 0.5) * 50, 78 + rand() * 40, 54 + rand() * 30, degrees + (rand() - 0.5) * 60, 0.9);

        // La capa gira y respira alrededor de su propia nube, no del centro de la escena.
        svg.style.transformOrigin = (((px - BOX.x) / BOX.w) * 100).toFixed(1) + "% " + (((py - BOX.y) / BOX.h) * 100).toFixed(1) + "%";
        svg.style.setProperty("--dx", ((rand() - 0.5) * 9).toFixed(2) + "%");
        svg.style.setProperty("--dy", ((rand() - 0.5) * 9).toFixed(2) + "%");
        svg.style.setProperty("--dr", ((rand() - 0.5) * 14).toFixed(1) + "deg");
        svg.style.setProperty("--ds", (0.94 + rand() * 0.18).toFixed(3));
        svg.style.setProperty("--dur", (24 + rand() * 24).toFixed(1) + "s");
        svg.style.setProperty("--delay", (-rand() * 40).toFixed(1) + "s");
        return svg;
      });
    }

    function buildStars(colors, rand, axis) {
      var svg = svgRoot("nebula-stars");
      var rect = host.getBoundingClientRect();
      // El viewBox se recorta para cubrir la escena: se compensa la escala para
      // que las estrellas midan lo mismo en un móvil que en un monitor ancho.
      var scale = Math.max(rect.width / WIDTH, rect.height / HEIGHT) || 0.65;
      var k = color.clamp(1 / scale, 0.9, 3);
      var lightest = colors.slice().sort(function (a, b) {
        return color.luminance(b) - color.luminance(a);
      })[0];
      var animate = !reduced();

      for (var i = 0; i < STARS; i++) {
        var x;
        var y;
        if (rand() < 0.6) {
          // Polvo concentrado en torno al eje de la nube
          var along = (rand() - 0.5) * 900;
          var off = (rand() + rand() + rand() - 1.5) * 190;
          x = axis.x + axis.ux * along + axis.nx * off;
          y = axis.y + axis.uy * along + axis.ny * off;
        } else {
          x = rand() * WIDTH;
          y = rand() * HEIGHT;
        }
        var big = rand();
        var radius = (0.45 + big * big * 1.05) * k;
        var star = node(
          "circle",
          {
            class: "nebula-star",
            cx: x.toFixed(1),
            cy: y.toFixed(1),
            r: radius.toFixed(2),
            opacity: (0.28 + rand() * 0.62).toFixed(2),
          },
          svg
        );
        if (rand() < 0.22) star.setAttribute("fill", lightest);
        if (animate && rand() < 0.2) {
          star.classList.add("is-twinkling");
          star.style.setProperty("--dur", (2.8 + rand() * 4).toFixed(1) + "s");
          star.style.setProperty("--delay", (-rand() * 6).toFixed(1) + "s");
        }
      }

      // Tres estrellas brillantes con destello de cuatro puntas
      for (var s = 0; s < 3; s++) {
        var sx = 120 + rand() * (WIDTH - 240);
        var sy = 90 + rand() * (HEIGHT - 180);
        var size = (0.8 + rand() * 0.7) * k;
        node(
          "path",
          {
            class: "nebula-spark",
            d: "M0 -7 L1.1 -1.1 L7 0 L1.1 1.1 L0 7 L-1.1 1.1 L-7 0 L-1.1 -1.1 Z",
            transform: "translate(" + sx.toFixed(1) + " " + sy.toFixed(1) + ") scale(" + size.toFixed(2) + ")",
            opacity: (0.7 + rand() * 0.3).toFixed(2),
          },
          svg
        );
      }
      return svg;
    }

    function buildLayer(colors) {
      var rand = window.Pluton.random(seedOf(colors));
      var angle = (rand() - 0.5) * 0.7;
      var axis = {
        angle: angle,
        x: WIDTH / 2 + (rand() - 0.5) * 80,
        y: HEIGHT / 2 + (rand() - 0.5) * 40,
        ux: Math.cos(angle),
        uy: Math.sin(angle),
        nx: -Math.sin(angle),
        ny: Math.cos(angle),
      };

      var layer = document.createElement("div");
      layer.className = "nebula-layer";

      var gas = document.createElement("div");
      gas.className = "nebula-gas";
      buildGas(colors, rand, axis).forEach(function (cloud) {
        gas.appendChild(cloud);
      });
      layer.appendChild(gas);

      // Mismo ruido para todas las paletas, pero desplazado: cada nube tiene su textura.
      var dust = document.createElement("div");
      dust.className = "nebula-dust";
      var position = Math.round(rand() * 100) + "% " + Math.round(rand() * 100) + "%";
      dust.style.setProperty("-webkit-mask-position", position);
      dust.style.setProperty("mask-position", position);
      layer.appendChild(dust);

      layer.appendChild(buildStars(colors, rand, axis));
      return layer;
    }

    function paint(colors, animate) {
      var next = buildLayer(colors);
      var previous = current;
      current = next;

      // Con regeneraciones muy seguidas solo se funden las dos escenas más recientes.
      Array.prototype.slice.call(host.children).forEach(function (child) {
        if (child !== previous) host.removeChild(child);
      });

      host.appendChild(next);
      if (!previous || !animate) {
        if (previous) host.removeChild(previous);
        next.classList.add("is-on");
        return;
      }

      next.getBoundingClientRect(); // fija opacity: 0 antes de arrancar la transición
      next.classList.add("is-on");
      previous.classList.remove("is-on");
      window.setTimeout(function () {
        if (previous.parentNode === host) host.removeChild(previous);
      }, FADE_MS + 100);
    }

    host.classList.toggle("is-drifting", !reduced());
    document.addEventListener("visibilitychange", function () {
      host.classList.toggle("is-paused", document.hidden);
    });

    return { paint: paint };
  };
})();
