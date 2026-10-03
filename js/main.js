/* Estudio: estado de la paleta, muestras, contraste, exportación, teclado y persistencia. */
(function () {
  "use strict";

  var App = window.NebulaPalette;
  var color = App.color;
  var palette = App.palette;

  var STORE_KEY = "nebula-palette:v1";
  var HISTORY_MAX = 20;
  var SIZE = palette.SIZE;
  var FILES = { css: "nebula-palette.css", json: "nebula-palette.json" };

  var els = {
    status: document.getElementById("status"),
    nebula: document.getElementById("nebula"),
    applied: document.getElementById("applied"),
    lockCount: document.getElementById("lockcount"),
    swatches: document.getElementById("swatches"),
    scheme: document.getElementById("scheme"),
    regen: document.getElementById("regen"),
    undo: document.getElementById("undo"),
    openExport: document.getElementById("open-export"),
    passes: document.getElementById("passes"),
    matrix: document.getElementById("matrix"),
    pairs: document.getElementById("pairs"),
    bestSample: document.getElementById("best-sample"),
    bestLabel: document.getElementById("best-label"),
    dialog: document.getElementById("export"),
    closeExport: document.getElementById("export-close"),
    tabs: Array.prototype.slice.call(document.querySelectorAll(".tab")),
    codePanel: document.getElementById("code-panel"),
    code: document.getElementById("code"),
    exportMsg: document.getElementById("export-msg"),
    copyCode: document.getElementById("copy-code"),
    download: document.getElementById("download"),
  };

  var state = {
    colors: palette.CURATED.slice(),
    locks: palette.validLocks(null),
    scheme: "auto", // lo que pide el usuario en el selector
    applied: "curated", // el esquema con el que se generó la paleta visible
    history: [],
  };

  var exportFormat = "css";
  var nebula = App.createNebula(els.nebula);

  /* ---------- persistencia ---------- */

  function validApplied(key) {
    return palette.isScheme(key) || key === "shared" ? key : "curated";
  }

  function validSnapshot(item) {
    var colors = item && palette.validColors(item.colors);
    if (!colors) return null;
    return { colors: colors, locks: palette.validLocks(item.locks), applied: validApplied(item.applied) };
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      var data = raw ? JSON.parse(raw) : null;
      var current = validSnapshot(data);
      if (!current) return null;
      current.scheme = data.scheme === "auto" || palette.isScheme(data.scheme) ? data.scheme : "auto";
      current.history = (Array.isArray(data.history) ? data.history : []).map(validSnapshot).filter(Boolean).slice(-HISTORY_MAX);
      return current;
    } catch (err) {
      return null;
    }
  }

  function save() {
    try {
      window.localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          colors: state.colors,
          locks: state.locks,
          scheme: state.scheme,
          applied: state.applied,
          history: state.history,
        })
      );
    } catch (err) {
      /* almacenamiento no disponible: el generador sigue funcionando */
    }
  }

  // La paleta viaja en el hash para poder compartirla con solo copiar la URL.
  function writeHash() {
    try {
      window.history.replaceState(null, "", palette.toHash(state.colors));
    } catch (err) {
      /* algunos navegadores no dejan tocar el historial bajo file:// */
    }
  }

  /* ---------- utilidades de vista ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setConsole(target, label, text, isError) {
    target.textContent = label + ": ";
    target.appendChild(el("b", "", text));
    target.classList.toggle("is-error", Boolean(isError));
  }

  function setStatus(text, isError) {
    setConsole(els.status, isError ? "aviso" : "status", text, isError);
  }

  // Copia con plan B: la API moderna puede no existir o rechazar (permisos, foco),
  // y entonces se recurre a un textarea temporal. Nunca deja errores en la consola.
  function copyText(text) {
    function legacy() {
      var holder = els.dialog.open ? els.dialog : document.body; // fuera del diálogo modal todo está inerte
      var previous = document.activeElement;
      var area = el("textarea", "sr-only");
      area.value = text;
      area.setAttribute("readonly", "");
      area.setAttribute("aria-hidden", "true");
      holder.appendChild(area);
      var ok = false;
      try {
        area.select();
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      holder.removeChild(area);
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
      return ok;
    }

    if (window.navigator.clipboard && typeof window.navigator.clipboard.writeText === "function") {
      return window.navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacy();
        }
      );
    }
    return Promise.resolve(legacy());
  }

  /* ---------- muestras ---------- */

  var LOCK_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path class="lock-open" d="M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2" />' +
    '<path class="lock-closed" d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />' +
    '<rect class="lock-body" x="5.5" y="11" width="13" height="9" rx="2" />' +
    "</svg>";

  var swatches = [];

  function buildSwatches() {
    for (var i = 0; i < SIZE; i++) {
      var item = el("li", "swatch");
      item.style.setProperty("--i", i);

      var main = el("button", "swatch-main");
      main.type = "button";
      main.dataset.copy = i;
      var hexLine = el("span", "swatch-hex mono");
      var hex = el("span", "swatch-code");
      var toast = el("span", "swatch-toast", "copiado");
      toast.setAttribute("aria-hidden", "true");
      hexLine.appendChild(hex);
      hexLine.appendChild(toast);
      var value = el("span", "swatch-val mono");
      var name = el("span", "swatch-name");
      main.appendChild(el("span", "swatch-index mono", String(i + 1)));
      main.appendChild(hexLine);
      main.appendChild(value);
      main.appendChild(name);

      var lock = el("button", "swatch-lock");
      lock.type = "button";
      lock.dataset.lock = i;
      lock.setAttribute("aria-label", "Bloquear el color " + (i + 1));
      lock.innerHTML = LOCK_ICON;

      item.appendChild(main);
      item.appendChild(lock);
      els.swatches.appendChild(item);
      swatches.push({ item: item, main: main, hex: hex, value: value, name: name, lock: lock, timer: 0 });
    }
  }

  function renderSwatches() {
    state.colors.forEach(function (hex, i) {
      var view = swatches[i];
      var upper = hex.toUpperCase();
      var name = color.describe(hex);
      view.item.style.setProperty("--c", hex);
      view.item.style.setProperty("--ink", color.ink(hex));
      view.item.dataset.hex = upper;
      view.item.classList.toggle("is-locked", state.locks[i]);
      view.hex.textContent = upper;
      view.value.textContent = color.formatOklch(hex);
      view.name.textContent = name;
      view.main.setAttribute("aria-label", "Color " + (i + 1) + ": " + upper + ", " + name + ". Copiar HEX");
      view.lock.setAttribute("aria-pressed", String(state.locks[i]));
    });

    var locked = state.locks.filter(Boolean).length;
    els.lockCount.textContent = locked + "/" + SIZE;
    els.applied.textContent = palette.label(state.applied);
    els.undo.disabled = state.history.length === 0;
    els.nebula.setAttribute("aria-label", "Nebulosa pintada con los cinco colores de la paleta: " + state.colors.map(color.describe).join(", "));
  }

  /* ---------- contraste ---------- */

  var cells = {}; // "texto-fondo" → celda de la matriz
  var rows = {}; // "a-b" con a < b → fila de la lista

  function sampleEl(parent) {
    var sample = el("span", "cx-sample", "Aa");
    sample.setAttribute("aria-hidden", "true");
    parent.appendChild(sample);
    return sample;
  }

  // host lleva data-pair / data-ratio / data-level; la muestra puede vivir en otro contenedor.
  function pairView(host, sampleParent) {
    return {
      host: host,
      sample: sampleEl(sampleParent || host),
      ratio: el("span", "cx-ratio mono"),
      level: el("span", "cx-level mono"),
    };
  }

  function chip(index) {
    var holder = el("span", "cx-chip mono");
    holder.appendChild(el("i", "cx-dot"));
    holder.appendChild(document.createTextNode(String(index + 1)));
    return holder;
  }

  function buildContrast() {
    var head = el("thead");
    var headRow = el("tr");
    var corner = el("td", "matrix-corner mono");
    corner.setAttribute("aria-hidden", "true");
    corner.textContent = "Aa";
    headRow.appendChild(corner);
    for (var j = 0; j < SIZE; j++) {
      var th = el("th");
      th.scope = "col";
      th.dataset.color = j;
      th.appendChild(el("span", "sr-only", "Fondo "));
      th.appendChild(chip(j));
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    els.matrix.appendChild(head);

    var body = el("tbody");
    for (var i = 0; i < SIZE; i++) {
      var tr = el("tr");
      var rowHead = el("th");
      rowHead.scope = "row";
      rowHead.dataset.color = i;
      rowHead.appendChild(el("span", "sr-only", "Texto "));
      rowHead.appendChild(chip(i));
      tr.appendChild(rowHead);
      for (var k = 0; k < SIZE; k++) {
        var td = el("td", "cx");
        if (i === k) {
          td.classList.add("cx--self");
          td.setAttribute("aria-hidden", "true");
          td.textContent = "·";
        } else {
          td.dataset.pair = i + 1 + "-" + (k + 1);
          var view = pairView(td);
          td.appendChild(view.ratio);
          td.appendChild(view.level);
          cells[i + "-" + k] = view;
        }
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    els.matrix.appendChild(body);

    // Lista compacta para pantallas estrechas: un renglón por par, en los dos sentidos.
    for (var a = 0; a < SIZE; a++) {
      for (var b = a + 1; b < SIZE; b++) {
        var li = el("li", "pair");
        li.dataset.pair = a + 1 + "-" + (b + 1);
        var samples = el("span", "pair-samples");
        var first = pairView(li, samples);
        var second = sampleEl(samples);
        li.appendChild(samples);
        li.appendChild(el("span", "pair-ids mono", a + 1 + " · " + (b + 1)));
        li.appendChild(el("span", "sr-only", "Colores " + (a + 1) + " y " + (b + 1) + ": "));
        li.appendChild(first.ratio);
        li.appendChild(first.level);
        first.reverse = second;
        rows[a + "-" + b] = first;
        els.pairs.appendChild(li);
      }
    }
  }

  function fillPair(view, fg, bg, ratio) {
    var key = color.level(ratio);
    view.sample.style.color = fg;
    view.sample.style.backgroundColor = bg;
    view.ratio.textContent = color.formatRatio(ratio);
    view.level.textContent = color.LEVELS[key];
    view.level.dataset.level = key;
    view.host.dataset.ratio = ratio.toFixed(4);
    view.host.dataset.level = key;
  }

  function renderContrast() {
    var passes = 0;
    var best = null;

    Array.prototype.forEach.call(els.matrix.querySelectorAll("[data-color]"), function (th) {
      th.querySelector(".cx-dot").style.backgroundColor = state.colors[Number(th.dataset.color)];
    });

    for (var a = 0; a < SIZE; a++) {
      for (var b = a + 1; b < SIZE; b++) {
        var ca = state.colors[a];
        var cb = state.colors[b];
        var ratio = color.contrast(ca, cb);
        if (ratio >= 4.5) passes++;
        if (!best || ratio > best.ratio) best = { a: a, b: b, ratio: ratio };

        fillPair(cells[a + "-" + b], ca, cb, ratio);
        fillPair(cells[b + "-" + a], cb, ca, ratio);
        var row = rows[a + "-" + b];
        fillPair(row, ca, cb, ratio);
        row.reverse.style.color = cb;
        row.reverse.style.backgroundColor = ca;
      }
    }

    els.passes.textContent = passes + "/10";

    // La muestra grande usa el par más legible: el claro como texto, el oscuro como fondo.
    var light = color.luminance(state.colors[best.a]) >= color.luminance(state.colors[best.b]) ? best.a : best.b;
    var dark = light === best.a ? best.b : best.a;
    els.bestSample.style.color = state.colors[light];
    els.bestSample.style.backgroundColor = state.colors[dark];
    els.bestLabel.textContent = light + 1 + " sobre " + (dark + 1) + " · " + color.formatRatio(best.ratio) + " · " + color.LEVELS[color.level(best.ratio)];
  }

  /* ---------- exportación ---------- */

  function exportText() {
    return exportFormat === "css" ? palette.toCSS(state.colors) : palette.toJSON(state.colors, state.applied);
  }

  function renderExport() {
    els.code.textContent = exportText();
    els.tabs.forEach(function (tab) {
      var selected = tab.dataset.format === exportFormat;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) els.codePanel.setAttribute("aria-labelledby", tab.id);
    });
  }

  function setFormat(format) {
    exportFormat = format;
    renderExport();
    els.codePanel.scrollTop = 0;
    setConsole(els.exportMsg, "archivo", FILES[format]);
  }

  function openExport() {
    if (els.dialog.open) return;
    setFormat(exportFormat);
    els.dialog.showModal();
    // El foco entra por la pestaña activa, no por el botón de cerrar.
    els.tabs.forEach(function (tab) {
      if (tab.dataset.format === exportFormat) tab.focus();
    });
  }

  function selectCode() {
    var range = document.createRange();
    range.selectNodeContents(els.code);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function copyCode() {
    copyText(exportText()).then(function (ok) {
      if (ok) {
        setConsole(els.exportMsg, "copiado", exportFormat.toUpperCase() + " en el portapapeles");
      } else {
        selectCode();
        setConsole(els.exportMsg, "aviso", "copia manual: texto seleccionado", true);
      }
    });
  }

  function downloadCode() {
    var name = FILES[exportFormat];
    try {
      var type = exportFormat === "css" ? "text/css" : "application/json";
      var url = URL.createObjectURL(new Blob([exportText()], { type: type + ";charset=utf-8" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = name;
      els.dialog.appendChild(link);
      link.click();
      els.dialog.removeChild(link);
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      setConsole(els.exportMsg, "descargado", name);
    } catch (err) {
      setConsole(els.exportMsg, "aviso", "no se pudo descargar", true);
    }
  }

  /* ---------- acciones ---------- */

  function render() {
    renderSwatches();
    renderContrast();
    if (els.dialog.open) renderExport();
  }

  function snapshot() {
    return { colors: state.colors.slice(), locks: state.locks.slice(), applied: state.applied };
  }

  // Aplica una paleta nueva y guarda la anterior para poder deshacer.
  function commit(next) {
    state.history.push(snapshot());
    if (state.history.length > HISTORY_MAX) state.history.shift();
    state.colors = next.colors;
    state.locks = next.locks || state.locks;
    state.applied = next.applied;
    refresh();
  }

  function refresh() {
    render();
    nebula.paint(state.colors, true);
    save();
    writeHash();
  }

  function regenerate() {
    var next = palette.generate(state, { scheme: state.scheme });
    if (!next) {
      setStatus("todo bloqueado · libera un color", true);
      return;
    }
    commit({ colors: next.colors, applied: next.scheme });
    var locked = state.locks.filter(Boolean).length;
    setStatus("nueva paleta · " + palette.label(next.scheme) + (locked ? " · " + locked + (locked === 1 ? " bloqueado" : " bloqueados") : ""));
  }

  function undo() {
    var previous = state.history.pop();
    if (!previous) {
      setStatus("no hay paletas anteriores", true);
      return;
    }
    state.colors = previous.colors;
    state.locks = previous.locks;
    state.applied = previous.applied;
    refresh();
    setStatus("paleta anterior restaurada");
  }

  function toggleLock(index) {
    state.locks[index] = !state.locks[index];
    renderSwatches();
    save();
    setStatus("color " + (index + 1) + (state.locks[index] ? " bloqueado" : " liberado"));
  }

  function copyHex(index) {
    var view = swatches[index];
    var hex = state.colors[index].toUpperCase();
    copyText(hex).then(function (ok) {
      if (!ok) {
        setStatus("no se pudo copiar " + hex, true);
        return;
      }
      setStatus(hex + " copiado");
      view.item.classList.add("is-copied");
      window.clearTimeout(view.timer);
      view.timer = window.setTimeout(function () {
        view.item.classList.remove("is-copied");
      }, 1300);
    });
  }

  /* ---------- eventos ---------- */

  // Clic de ratón o dedo (detail > 0): se suelta el foco para que la barra
  // espaciadora siga regenerando y no repita el botón recién pulsado.
  function release(event, target) {
    if (event.detail > 0) target.blur();
  }

  els.swatches.addEventListener("click", function (event) {
    var lock = event.target.closest("[data-lock]");
    var main = event.target.closest("[data-copy]");
    if (lock) {
      release(event, lock);
      toggleLock(Number(lock.dataset.lock));
    } else if (main) {
      release(event, main);
      copyHex(Number(main.dataset.copy));
    }
  });

  els.regen.addEventListener("click", function (event) {
    release(event, els.regen);
    regenerate();
  });

  els.undo.addEventListener("click", function (event) {
    release(event, els.undo);
    undo();
  });

  els.openExport.addEventListener("click", function (event) {
    release(event, els.openExport);
    openExport();
  });

  els.scheme.addEventListener("change", function () {
    state.scheme = els.scheme.value;
    if (!els.scheme.matches(":focus-visible")) els.scheme.blur();
    save();
    regenerate();
  });

  els.tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      setFormat(tab.dataset.format);
    });
    // Pestañas con foco itinerante: las flechas cambian de pestaña.
    tab.addEventListener("keydown", function (event) {
      var step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      var next = els.tabs[(index + step + els.tabs.length) % els.tabs.length];
      setFormat(next.dataset.format);
      next.focus();
    });
  });

  els.copyCode.addEventListener("click", copyCode);
  els.download.addEventListener("click", downloadCode);
  els.closeExport.addEventListener("click", function () {
    els.dialog.close();
  });
  // Clic en el telón (fuera de la tarjeta) cierra el diálogo.
  els.dialog.addEventListener("click", function (event) {
    if (event.target === els.dialog) els.dialog.close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (els.dialog.open) return;

    var target = event.target instanceof Element ? event.target : null;
    var keyboardFocus = Boolean(target && target.matches(":focus-visible"));
    // El selector necesita sus teclas (espacio lo abre, las letras buscan opción).
    if (target && target.closest("select, input, textarea") && keyboardFocus) return;

    var key = event.key;
    if (key === " " || key === "Spacebar") {
      // Si alguien navega con Tab, espacio activa el control enfocado, no regenera.
      if (target && target.closest("button, a") && keyboardFocus) return;
      event.preventDefault(); // sin scroll de página
      if (!event.repeat) regenerate();
    } else if (key >= "1" && key <= String(SIZE)) {
      event.preventDefault();
      toggleLock(Number(key) - 1);
    } else if (key === "z" || key === "Z") {
      event.preventDefault();
      undo();
    } else if (key === "e" || key === "E") {
      event.preventDefault();
      openExport();
    }
  });

  window.addEventListener("hashchange", function () {
    var colors = palette.fromHash(window.location.hash);
    if (!colors || colors.join() === state.colors.join()) return;
    commit({ colors: colors, locks: palette.validLocks(null), applied: "shared" });
    setStatus("paleta cargada desde el enlace");
  });

  /* ---------- arranque ---------- */

  var stored = load();
  var shared = palette.fromHash(window.location.hash);
  var message = "paleta curada · corazón de Plutón";

  if (stored) {
    state.colors = stored.colors;
    state.locks = stored.locks;
    state.scheme = stored.scheme;
    state.applied = stored.applied;
    state.history = stored.history;
    message = "paleta restaurada";
  }
  // Un enlace compartido manda sobre lo guardado (que queda en el historial).
  if (shared && shared.join() !== state.colors.join()) {
    if (stored) state.history.push(snapshot());
    state.colors = shared;
    state.locks = palette.validLocks(null);
    state.applied = "shared";
    message = "paleta cargada desde el enlace";
  }

  els.scheme.value = state.scheme;
  buildSwatches();
  buildContrast();
  render();
  nebula.paint(state.colors, false);
  setStatus(message);
})();
