/* Color: conversiones sRGB ↔ OKLCH, recorte de gama, contraste WCAG 2.x y nombres.
   Lógica pura, sin DOM. Se trabaja en OKLCH porque sus tres ejes son perceptuales:
   moverse en tono no cambia la claridad percibida, que es lo que hace que una
   armonía se vea equilibrada (en HSL un amarillo y un azul "iguales" no lo son). */
(function () {
  "use strict";

  var App = (window.NebulaPalette = window.NebulaPalette || {});

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /* ---------- HEX ↔ sRGB ---------- */

  // Devuelve "#rrggbb" en minúsculas, o null si no es un HEX válido.
  function parseHex(input) {
    if (typeof input !== "string") return null;
    var text = input.trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{3}$/.test(text)) {
      text = text[0] + text[0] + text[1] + text[1] + text[2] + text[2];
    }
    return /^[0-9a-f]{6}$/.test(text) ? "#" + text : null;
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function rgbToHex(rgb) {
    var out = "#";
    for (var i = 0; i < 3; i++) {
      var byte = Math.round(clamp(rgb[i], 0, 1) * 255);
      out += (byte < 16 ? "0" : "") + byte.toString(16);
    }
    return out;
  }

  function toLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function toGamma(c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  /* ---------- OKLab / OKLCH (Björn Ottosson, 2020) ---------- */

  function linearToOklab(r, g, b) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }

  function oklabToLinear(L, a, b) {
    var l = L + 0.3963377774 * a + 0.2158037573 * b;
    var m = L - 0.1055613458 * a - 0.0638541728 * b;
    var s = L - 0.0894841775 * a - 1.291485548 * b;
    l = l * l * l;
    m = m * m * m;
    s = s * s * s;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  function oklchToLinear(l, c, h) {
    var rad = (h * Math.PI) / 180;
    return oklabToLinear(l, c * Math.cos(rad), c * Math.sin(rad));
  }

  function inGamut(rgb) {
    var eps = 0.0001;
    return rgb[0] >= -eps && rgb[0] <= 1 + eps && rgb[1] >= -eps && rgb[1] <= 1 + eps && rgb[2] >= -eps && rgb[2] <= 1 + eps;
  }

  // OKLCH → HEX. Si el color cae fuera de sRGB se reduce el croma (búsqueda
  // binaria) conservando claridad y tono: recortar canales cambiaría el tono.
  function oklchToHex(l, c, h) {
    l = clamp(l, 0, 1);
    c = Math.max(0, c);
    h = ((h % 360) + 360) % 360;

    var rgb = oklchToLinear(l, c, h);
    if (!inGamut(rgb)) {
      var lo = 0;
      var hi = c;
      for (var i = 0; i < 22; i++) {
        var mid = (lo + hi) / 2;
        if (inGamut(oklchToLinear(l, mid, h))) lo = mid;
        else hi = mid;
      }
      rgb = oklchToLinear(l, lo, h);
    }
    return rgbToHex([toGamma(clamp(rgb[0], 0, 1)), toGamma(clamp(rgb[1], 0, 1)), toGamma(clamp(rgb[2], 0, 1))]);
  }

  function hexToOklch(hex) {
    var rgb = hexToRgb(hex);
    var lab = linearToOklab(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));
    var c = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
    var h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
    return { l: lab[0], c: c, h: c < 0.0005 ? 0 : (h + 360) % 360 };
  }

  /* ---------- contraste WCAG 2.x ---------- */

  // Luminancia relativa tal como la define WCAG 2.x (umbral 0,03928).
  function luminance(hex) {
    var rgb = hexToRgb(hex).map(function (c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrast(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  var LEVELS = {
    aaa: "AAA",
    aa: "AA",
    "aa-large": "AA grande",
    fail: "falla",
  };

  function level(ratio) {
    if (ratio >= 7) return "aaa";
    if (ratio >= 4.5) return "aa";
    if (ratio >= 3) return "aa-large";
    return "fail";
  }

  // Se trunca, no se redondea: un 4,499 mostrado como "4,50" parecería AA sin serlo.
  function formatRatio(ratio) {
    return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2).replace(".", ",");
  }

  // Tinta para escribir encima de un color: negro o blanco, el que más contraste dé.
  // Con esos dos extremos el peor caso posible es √21 ≈ 4,58, siempre por encima de AA.
  function ink(hex) {
    return contrast(hex, "#000000") >= contrast(hex, "#ffffff") ? "#000000" : "#ffffff";
  }

  /* ---------- texto ---------- */

  function formatOklch(hex) {
    var lch = hexToOklch(hex);
    return "L" + Math.round(lch.l * 100) + " C" + lch.c.toFixed(2).replace(".", ",") + " H" + Math.round(lch.h) % 360;
  }

  function cssOklch(hex) {
    var lch = hexToOklch(hex);
    return "oklch(" + lch.l.toFixed(3) + " " + lch.c.toFixed(3) + " " + (Math.round(lch.h * 10) / 10) % 360 + ")";
  }

  // Límite superior (en grados OKLCH) de cada familia de tono.
  var HUES = [
    [15, "rosa"],
    [40, "rojo"],
    [75, "naranja"],
    [120, "amarillo"],
    [165, "verde"],
    [215, "turquesa"],
    [285, "azul"],
    [320, "violeta"],
    [350, "magenta"],
    [360, "rosa"],
  ];

  // Nombre descriptivo en español: familia de tono + matiz de claridad o croma.
  function describe(hex) {
    var lch = hexToOklch(hex);
    var l = lch.l;
    var c = lch.c;

    if (c < 0.025) {
      if (l >= 0.93) return "blanco";
      if (l >= 0.7) return "gris claro";
      if (l >= 0.42) return "gris";
      if (l >= 0.2) return "grafito";
      return "negro";
    }

    var family = "rosa";
    for (var i = 0; i < HUES.length; i++) {
      if (lch.h < HUES[i][0]) {
        family = HUES[i][1];
        break;
      }
    }

    // Los cálidos poco saturados tienen nombre propio: nadie dice "naranja pálido".
    if ((family === "naranja" || family === "amarillo") && c < 0.1) {
      if (l >= 0.86) return "crema";
      if (l >= 0.6) return "arena";
      if (l >= 0.38) return "tierra";
      return "café";
    }

    if (l < 0.32) return family + " profundo";
    if (l < 0.46) return family + " oscuro";
    if (c > 0.17) return family + " intenso";
    if (l >= 0.86) return family + " pálido";
    if (l >= 0.74) return family + " claro";
    if (c < 0.06) return family + " apagado";
    return family;
  }

  App.color = {
    clamp: clamp,
    parseHex: parseHex,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    oklchToHex: oklchToHex,
    hexToOklch: hexToOklch,
    luminance: luminance,
    contrast: contrast,
    level: level,
    LEVELS: LEVELS,
    formatRatio: formatRatio,
    ink: ink,
    formatOklch: formatOklch,
    cssOklch: cssOklch,
    describe: describe,
  };
})();
