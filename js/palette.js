/* Paletas: armonías de 5 colores en OKLCH, bloqueos, exportación y enlace por hash.
   Lógica pura: recibe el generador aleatorio, así que se puede probar con semilla.

   Una paleta se construye con tres decisiones independientes:
     · tono      → lo dicta el esquema de armonía (desplazamientos sobre un tono base)
     · claridad  → una rampa de oscuro a claro, para que siempre haya pares legibles
     · croma     → una "viveza" común a toda la paleta, atenuada en los extremos      */
(function () {
  "use strict";

  var App = (window.NebulaPalette = window.NebulaPalette || {});
  var color = App.color;

  var SIZE = 5;

  // Desplazamiento de tono de cada hueco respecto al tono base, y peso en el sorteo.
  var SCHEMES = {
    analogous: { label: "análogo", offsets: [-46, -23, 0, 23, 46], weight: 3 },
    complementary: { label: "complementario", offsets: [0, 14, 180, -14, 190], weight: 2 },
    triad: { label: "tríada", offsets: [0, 120, 240, 10, 128], weight: 2 },
    split: { label: "complementario dividido", offsets: [0, 150, 210, -14, 160], weight: 2 },
    mono: { label: "monocromático", offsets: [0, 0, 0, 0, 0], weight: 1 },
  };
  var SCHEME_KEYS = Object.keys(SCHEMES);

  var LABELS = { auto: "al azar", curated: "curada", shared: "enlace" };

  var RAMP = [0.25, 0.42, 0.59, 0.75, 0.9];

  // Primera paleta, fija: los tonos de Plutón y su corazón sobre un cielo índigo.
  var CURATED = ["#232a52", "#5b4b8a", "#b5607e", "#c9a27e", "#efe3d3"];

  function label(key) {
    return SCHEMES[key] ? SCHEMES[key].label : LABELS[key] || LABELS.curated;
  }

  function isScheme(key) {
    return Object.prototype.hasOwnProperty.call(SCHEMES, key);
  }

  function pickScheme(rng) {
    var total = 0;
    SCHEME_KEYS.forEach(function (key) {
      total += SCHEMES[key].weight;
    });
    var roll = rng() * total;
    for (var i = 0; i < SCHEME_KEYS.length; i++) {
      roll -= SCHEMES[SCHEME_KEYS[i]].weight;
      if (roll < 0) return SCHEME_KEYS[i];
    }
    return SCHEME_KEYS[0];
  }

  function shuffle(list, rng) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // El croma útil es máximo en claridades medias y cae hacia el negro y el blanco.
  function chromaShape(l) {
    var d = Math.abs(l - 0.56) / 0.44;
    return color.clamp(1.08 - 0.72 * d * d, 0.3, 1.08);
  }

  function attempt(colors, locks, schemeKey, rng) {
    var scheme = SCHEMES[schemeKey];
    var offsets = shuffle(scheme.offsets, rng);
    var spread = schemeKey === "analogous" ? 0.6 + rng() * 0.6 : 1;
    var jitter = schemeKey === "mono" ? 5 : 7;

    // Tono base: si hay bloqueados, el más saturado ancla el esquema y conserva
    // su papel dentro de él; los colores nuevos se reparten a su alrededor.
    var baseHue = rng() * 360;
    var anchorChroma = 0.02; // por debajo de esto el tono de un gris no significa nada
    for (var i = 0; i < SIZE; i++) {
      if (!locks[i]) continue;
      var lch = color.hexToOklch(colors[i]);
      if (lch.c > anchorChroma) {
        anchorChroma = lch.c;
        baseHue = lch.h - offsets[i] * spread;
      }
    }

    // Claridad: cada bloqueado "gasta" el peldaño de la rampa que ya ocupa.
    var ramp = RAMP.map(function (l) {
      return l + (rng() - 0.5) * 0.06;
    });
    for (var k = 0; k < SIZE; k++) {
      if (!locks[k]) continue;
      var lockedL = color.hexToOklch(colors[k]).l;
      var nearest = 0;
      for (var r = 1; r < ramp.length; r++) {
        if (Math.abs(ramp[r] - lockedL) < Math.abs(ramp[nearest] - lockedL)) nearest = r;
      }
      ramp.splice(nearest, 1);
    }
    if (rng() < 0.3) ramp.reverse();

    var vivid = 0.06 + rng() * 0.068;
    var softLight = rng() < 0.45; // el más claro casi neutro: da aire a la paleta

    var out = [];
    var step = 0;
    for (var s = 0; s < SIZE; s++) {
      if (locks[s]) {
        out.push(colors[s]);
        continue;
      }
      var l = ramp[step++];
      var c = vivid * chromaShape(l) * (0.85 + rng() * 0.3);
      if (softLight && l > 0.84) c = 0.018 + rng() * 0.02;
      var h = baseHue + offsets[s] * spread + (rng() - 0.5) * 2 * jitter;
      out.push(color.oklchToHex(l, c, h));
    }
    return out;
  }

  // Genera una paleta nueva conservando los colores bloqueados.
  // Devuelve { colors, scheme } o null si no queda ningún hueco libre.
  function generate(current, options) {
    var opts = options || {};
    var rng = opts.rng || Math.random;
    var colors = current.colors;
    var locks = current.locks;
    if (locks.every(Boolean)) return null;

    var schemeKey = isScheme(opts.scheme) ? opts.scheme : pickScheme(rng);
    var next = colors;

    // Reintenta si algún hueco libre repite su color o si salen dos iguales.
    for (var tries = 0; tries < 8; tries++) {
      next = attempt(colors, locks, schemeKey, rng);
      var ok = true;
      for (var i = 0; i < SIZE && ok; i++) {
        if (!locks[i] && next[i] === colors[i]) ok = false;
        if (next.indexOf(next[i]) !== i) ok = false;
      }
      if (ok) break;
    }
    return { colors: next, scheme: schemeKey };
  }

  /* ---------- exportación ---------- */

  function toCSS(colors) {
    var lines = colors.map(function (hex, i) {
      return "  --nebula-" + (i + 1) + ": " + hex.toUpperCase() + "; /* " + color.describe(hex) + " */";
    });
    return ":root {\n" + lines.join("\n") + "\n}\n";
  }

  function toJSON(colors, schemeKey) {
    var data = {
      name: "nebula-palette",
      scheme: label(schemeKey),
      colors: colors.map(function (hex, i) {
        return {
          id: "nebula-" + (i + 1),
          name: color.describe(hex),
          hex: hex.toUpperCase(),
          oklch: color.cssOklch(hex),
        };
      }),
    };
    return JSON.stringify(data, null, 2) + "\n";
  }

  /* ---------- validación y enlace ---------- */

  function validColors(list) {
    if (!Array.isArray(list) || list.length !== SIZE) return null;
    var out = [];
    for (var i = 0; i < SIZE; i++) {
      var hex = color.parseHex(list[i]);
      if (!hex) return null;
      out.push(hex);
    }
    return out;
  }

  function validLocks(list) {
    var out = [];
    for (var i = 0; i < SIZE; i++) out.push(Array.isArray(list) && list[i] === true);
    return out;
  }

  // "#232a52-5b4b8a-b5607e-c9a27e-efe3d3"
  function toHash(colors) {
    return (
      "#" +
      colors
        .map(function (hex) {
          return hex.slice(1);
        })
        .join("-")
    );
  }

  function fromHash(hash) {
    if (typeof hash !== "string") return null;
    var text = hash.replace(/^#/, "");
    if (!/^[0-9a-f]{6}(-[0-9a-f]{6}){4}$/i.test(text)) return null;
    return validColors(text.split("-"));
  }

  App.palette = {
    SIZE: SIZE,
    SCHEMES: SCHEMES,
    SCHEME_KEYS: SCHEME_KEYS,
    CURATED: CURATED,
    label: label,
    isScheme: isScheme,
    generate: generate,
    toCSS: toCSS,
    toJSON: toJSON,
    validColors: validColors,
    validLocks: validLocks,
    toHash: toHash,
    fromHash: fromHash,
  };
})();
