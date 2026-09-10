/* ==================================================================
   La Ruleta del Ciclo de Cine — UI
================================================================== */
(function () {
  "use strict";

  var CONFIG = window.CC_CONFIG || {};
  var S = window.CCStore;
  var TAU = Math.PI * 2;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function starStr(n) {
    n = Math.round(n || 0);
    var s = ""; for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆"; return s;
  }
  var DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
  function fold(s) {
    return String(s).toLowerCase().normalize("NFD").replace(DIACRITICS, "");
  }
  function stripTitle(t) {
    return t.replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s*[·-]\s*(trilog[ií]a|saga)\s*$/i, "")
      .replace(/\s+\d+(\s*,\s*\d+)*\s*$/, "").trim();
  }

  /* ---------------- estado de UI ---------------- */
  var ui = {
    currentId: null,
    tab: "ficha",
    formAuthor: null,
    formStars: 0,
    search: "",
    wheelKey: "",
    spinning: false,
    modalMode: null,      // "new" | "edit"
    modalRouletteId: null,
    modalPicked: {},      // id -> true
    modalConfirmDelete: false,
  };

  /* ---------------- TMDb ---------------- */
  function fetchMeta(movie) {
    var cached = S.metaFor(movie.id);
    var THIRTY = 30 * 864e5;
    if (cached && (cached.poster || cached.overview) && (Date.now() - (cached.at || 0) < THIRTY)) {
      return Promise.resolve(cached);
    }
    var key = (CONFIG.tmdbApiKey || "").trim();
    if (!key) return Promise.resolve(cached || null);

    var q = movie.tmdbQuery || stripTitle(movie.title);
    var lang = CONFIG.tmdbLanguage || "es-ES";
    // 1) Buscar en inglés (los tmdbQuery están en inglés y matchean mejor).
    var search = "https://api.themoviedb.org/3/search/movie?api_key=" + encodeURIComponent(key) +
      "&include_adult=false&query=" + encodeURIComponent(q) +
      (movie.year ? "&primary_release_year=" + movie.year : "");
    return fetch(search)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var results = (data && data.results) || [];
        // preferí un match con año cercano si lo tenemos
        var hit = results[0];
        if (movie.year) {
          for (var i = 0; i < results.length; i++) {
            var y = parseInt((results[i].release_date || "").slice(0, 4), 10);
            if (y && Math.abs(y - movie.year) <= 1) { hit = results[i]; break; }
          }
        }
        if (!hit) return cached || null;
        // 2) Traer detalle localizado (poster + sinopsis en español).
        return fetch("https://api.themoviedb.org/3/movie/" + hit.id +
          "?api_key=" + encodeURIComponent(key) + "&language=" + encodeURIComponent(lang))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (det) {
            det = det || {};
            var poster = det.poster_path || hit.poster_path;
            var meta = {
              poster: poster ? "https://image.tmdb.org/t/p/w500" + poster : null,
              overview: (det.overview || hit.overview || "").trim(),
              url: "https://www.themoviedb.org/movie/" + hit.id,
            };
            S.saveMeta(movie.id, meta);
            return meta;
          });
      })
      .catch(function () { return cached || null; });
  }

  /* ---------------- barra de ruletas ---------------- */
  function renderRouletteBar() {
    var bar = $("rouletteBar");
    var active = S.activeRouletteId();
    bar.innerHTML = "";
    S.roulettes().forEach(function (r) {
      var count = S.moviesForRoulette(r.id).length;
      var chip = document.createElement("div");
      chip.className = "rchip" + (r.id === active ? " is-active" : "");
      chip.innerHTML =
        '<button class="rchip-main" type="button">' + esc(r.name) +
        ' <span class="rchip-count">' + count + '</span></button>' +
        (r.builtin ? "" : '<button class="rchip-edit" type="button" aria-label="Editar ruleta">✎</button>');
      chip.querySelector(".rchip-main").addEventListener("click", function () {
        if (S.activeRouletteId() !== r.id) { S.setActiveRouletteId(r.id); ui.search = ""; $("search").value = ""; }
      });
      var editBtn = chip.querySelector(".rchip-edit");
      if (editBtn) editBtn.addEventListener("click", function () { openRouletteModal("edit", r.id); });
      bar.appendChild(chip);
    });
    var add = document.createElement("button");
    add.className = "rchip-add";
    add.type = "button";
    add.textContent = "+ Nueva ruleta";
    add.addEventListener("click", function () { openRouletteModal("new"); });
    bar.appendChild(add);
  }

  /* ---------------- cartelera ---------------- */
  function makeFilmRow(m, idx, winnerId) {
    var a = S.avg(m.id);
    var row = document.createElement("div");
    row.className = "film" + (m.id === winnerId ? " is-winner" : "");
    row.innerHTML =
      '<button class="film-open" type="button">' +
        '<span class="n">' + String(idx + 1).padStart(2, "0") + '</span>' +
        '<span class="film-name">' + esc(m.title) + (m.base ? "" : ' <span class="tag-added">agregada</span>') + '</span>' +
        '<span class="film-badges">' +
          (a != null ? '<span class="mini-avg">' + a.toFixed(1) + '</span>' : "") +
          (S.isSeen(m) ? '<span class="seen-dot" title="Ya vista">●</span>' : "") +
        '</span>' +
      '</button>' +
      (m.base ? "" : '<button class="film-remove" type="button" aria-label="Quitar película" title="Quitar de todas las ruletas">✕</button>');
    row.querySelector(".film-open").addEventListener("click", function () { openMovie(m.id, false); });
    var rm = row.querySelector(".film-remove");
    if (rm) rm.addEventListener("click", function () {
      if (rm.dataset.armed) { S.removeAddedMovie(m.id); }
      else { rm.dataset.armed = "1"; rm.textContent = "¿seguro?"; rm.classList.add("armed");
        setTimeout(function () { if (rm) { rm.textContent = "✕"; rm.classList.remove("armed"); delete rm.dataset.armed; } }, 2500); }
    });
    return row;
  }

  function renderCartelera() {
    var rid = S.activeRouletteId();
    var roulette = S.getRoulette(rid);
    var movies = S.moviesForRoulette(rid);
    var winner = S.lastResult(rid);
    var term = fold(ui.search.trim());
    var match = function (m) { return !term || fold(m.title).indexOf(term) !== -1; };

    var unseen = movies.filter(function (m) { return !S.isSeen(m); });
    var seen = movies.filter(S.isSeen);

    $("carteleraTitle").textContent = roulette ? roulette.name : "Cartelera";
    $("carteleraSub").innerHTML = unseen.length + " por ver · " + seen.length +
      " vista" + (seen.length === 1 ? "" : "s") + ". Una vez que la puntuás, sale de la ruleta.";
    $("amfTarget").textContent = roulette ? roulette.name : "esta ruleta";
    $("unseenCount").textContent = "(" + unseen.length + ")";
    $("seenCount").textContent = "(" + seen.length + ")";

    var uList = $("filmListUnseen");
    uList.innerHTML = "";
    var uShown = 0;
    unseen.forEach(function (m, i) {
      if (!match(m)) return;
      uShown++;
      uList.appendChild(makeFilmRow(m, i, winner));
    });
    if (!uShown) {
      var e = document.createElement("p");
      e.className = "reviews-empty"; e.style.padding = "12px";
      e.textContent = !movies.length
        ? "Esta ruleta todavía no tiene películas. Agregá con «+ Agregar película»."
        : (term ? "No hay películas por ver que coincidan."
                : "¡Ya vieron todas las de esta ruleta! Están abajo en «Ya vistas».");
      uList.appendChild(e);
    }

    var sList = $("filmListSeen");
    sList.innerHTML = "";
    var sShown = 0;
    seen.sort(function (x, y) { return (S.avg(y.id) || 0) - (S.avg(x.id) || 0); });
    seen.forEach(function (m, i) {
      if (!match(m)) return;
      sShown++;
      sList.appendChild(makeFilmRow(m, i, winner));
    });
    if (!sShown) {
      var e2 = document.createElement("p");
      e2.className = "reviews-empty"; e2.style.padding = "12px";
      e2.textContent = term ? "Ninguna vista coincide." : "Todavía no puntuaron ninguna.";
      sList.appendChild(e2);
    }

    // si hay búsqueda con resultados entre las vistas, abrí el segmento
    if (term && sShown) setSeenCollapsed(false);
  }

  function setSeenCollapsed(collapsed, persist) {
    var sec = $("seenToggle").parentNode;
    sec.classList.toggle("collapsed", collapsed);
    $("seenToggle").setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (persist) { try { localStorage.setItem("cc.seenCollapsed.v1", collapsed ? "1" : "0"); } catch (e) {} }
  }

  /* ---------------- ficha / resultado ---------------- */
  function openMovie(id, fromSpin) {
    var m = S.movieById(id);
    if (!m) { $("resultCard").hidden = true; return; }
    ui.currentId = id;
    ui.formStars = 0;
    ui.formAuthor = ui.formAuthor || S.deviceAuthor();
    ui.tab = "ficha";

    $("resultCard").hidden = false;
    $("resultKicker").textContent = fromSpin ? "Salió sorteada" : "Ficha";
    $("resultTitle").textContent = m.title;
    setTab("ficha");
    buildReviewForm();
    refreshResultCard();

    $("posterBox").classList.add("is-loading");
    fetchMeta(m).then(function () {
      $("posterBox").classList.remove("is-loading");
      if (ui.currentId === id) refreshResultCard();
    });

    if (fromSpin || !inView($("resultCard"))) {
      $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function refreshResultCard() {
    if ($("resultCard").hidden || !ui.currentId) return;
    var m = S.movieById(ui.currentId);
    if (!m) { $("resultCard").hidden = true; return; }
    var meta = S.metaFor(m.id);

    // meta line
    var bits = [];
    if (m.year) bits.push("<span>" + m.year + "</span>");
    if (!m.base && m.addedBy) bits.push("<span>agregada por " + esc(m.addedBy) + "</span>");
    var a = S.avg(m.id);
    if (a != null) bits.push('<span class="avg">' + starStr(a) + " " + a.toFixed(1) +
      " (" + S.reviewsFor(m.id).length + ")</span>");
    $("resultMeta").innerHTML = bits.join('<span aria-hidden="true">·</span>');

    // poster
    var src = m.poster || (meta && meta.poster) || null;
    var box = $("posterBox");
    if (src) {
      if (!box.querySelector("img") || box.querySelector("img").getAttribute("src") !== src) {
        box.innerHTML = '<img alt="Portada de ' + esc(m.title) + '">';
        var img = box.querySelector("img");
        img.onerror = function () { box.innerHTML = '<div class="poster-fallback">' + esc(m.title) + "</div>"; };
        img.src = src;
      }
    } else {
      box.innerHTML = '<div class="poster-fallback">' + esc(m.title) + "</div>";
    }

    // overview
    var text = m.overview || (meta && meta.overview) || "";
    var ov = $("resultOverview");
    if (text) { ov.textContent = text; ov.classList.remove("is-empty"); }
    else {
      ov.textContent = CONFIG.tmdbApiKey
        ? "Sin sinopsis para esta película. Podés escribir una en movies.js."
        : "Sin sinopsis todavía. Cargá una API key de TMDb (SETUP.md) o escribila a mano en movies.js.";
      ov.classList.add("is-empty");
    }

    // links
    var links = [];
    if (meta && meta.url) links.push('<a href="' + meta.url + '" target="_blank" rel="noopener">Ver en TMDb</a>');
    links.push('<a href="https://www.justwatch.com/ar/buscar?q=' +
      encodeURIComponent(stripTitle(m.title)) + '" target="_blank" rel="noopener">¿Dónde verla? (JustWatch AR)</a>');
    $("resultLinks").innerHTML = links.join("");

    renderReviewsList();
    // refrescamos el "on/off" de las estrellas y el estado del botón sin recrear el form
    syncStarButtons();
    updateSubmitState();
  }

  function setTab(name) {
    ui.tab = name;
    ["ficha", "puntuar"].forEach(function (t) {
      var active = t === name;
      $("tab-" + t).classList.toggle("is-active", active);
      $("tab-" + t).setAttribute("aria-selected", active ? "true" : "false");
      $("panel-" + t).classList.toggle("is-active", active);
      $("panel-" + t).hidden = !active;
    });
  }

  function buildReviewForm() {
    var slicer = $("authorSlicer");
    slicer.innerHTML = "";
    S.REVIEWERS.forEach(function (name, idx) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "radio"); b.textContent = name;
      if (idx === 1) b.classList.add("is-juanma");
      b.setAttribute("aria-checked", ui.formAuthor === name ? "true" : "false");
      b.addEventListener("click", function () {
        ui.formAuthor = name;
        S.setDeviceAuthor(name);
        [].forEach.call(slicer.children, function (c, i) {
          c.setAttribute("aria-checked", S.REVIEWERS[i] === name ? "true" : "false");
        });
        updateSubmitState();
      });
      slicer.appendChild(b);
    });

    var stars = $("starInput");
    stars.innerHTML = "";
    for (var i = 1; i <= 5; i++) {
      (function (val) {
        var b = document.createElement("button");
        b.type = "button"; b.setAttribute("role", "radio");
        b.setAttribute("aria-label", val + (val === 1 ? " estrella" : " estrellas"));
        b.dataset.val = val;
        b.addEventListener("click", function () {
          ui.formStars = (ui.formStars === val) ? 0 : val;
          syncStarButtons(); updateSubmitState();
        });
        stars.appendChild(b);
      })(i);
    }
    $("reviewNote").value = "";
    syncStarButtons();
    updateSubmitState();
  }

  function syncStarButtons() {
    [].forEach.call($("starInput").children, function (b) {
      var v = +b.dataset.val;
      b.textContent = v <= ui.formStars ? "★" : "☆";
      b.classList.toggle("on", v <= ui.formStars);
      b.setAttribute("aria-checked", v === ui.formStars ? "true" : "false");
    });
  }

  function updateSubmitState() {
    var ready = !!ui.formAuthor && ui.formStars >= 1;
    $("reviewSubmit").disabled = !ready;
    if (ui.formFlashUntil && Date.now() < ui.formFlashUntil) return; // no pisar el "¡Guardado!"
    var h = $("reviewHint");
    if (!ui.formAuthor) { h.textContent = "Elegí quién puntúa para poder guardar."; h.classList.remove("ok"); }
    else if (ui.formStars < 1) { h.textContent = "Poné al menos una estrella."; h.classList.remove("ok"); }
    else { h.textContent = "Listo para guardar como " + ui.formAuthor + "."; h.classList.add("ok"); }
  }

  function flashReviewHint(msg) {
    ui.formFlashUntil = Date.now() + 4000;
    $("reviewHint").textContent = msg;
    $("reviewHint").classList.add("ok");
    setTimeout(function () { ui.formFlashUntil = 0; updateSubmitState(); }, 4100);
  }

  function renderReviewsList() {
    var wrap = $("reviewsList");
    var rs = S.reviewsFor(ui.currentId).slice().reverse();
    if (!rs.length) { wrap.innerHTML = '<p class="reviews-empty">Todavía nadie la puntuó. Sé el primero.</p>'; return; }
    wrap.innerHTML = "";
    rs.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "review" + (r.author === S.REVIEWERS[1] ? " by-juanma" : "");
      d.innerHTML =
        '<button class="review-del" type="button" title="Borrar" aria-label="Borrar puntuación">&times;</button>' +
        '<div class="review-top">' +
          '<span class="review-author">' + esc(r.author) + '</span>' +
          '<span class="review-stars">' + starStr(r.stars) + '</span>' +
          '<span class="review-date">' + fmtDate(r.ts) + '</span>' +
        '</div>' +
        (r.note ? '<p class="review-note">' + esc(r.note) + '</p>' : "");
      d.querySelector(".review-del").addEventListener("click", function () {
        S.deleteReview(ui.currentId, r.id);
      });
      wrap.appendChild(d);
    });
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }); }
    catch (e) { return ""; }
  }
  function inView(el) { var r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight * 0.5; }

  /* ---------------- ruleta (canvas) ---------------- */
  var canvas = $("wheel"), ctx = canvas.getContext("2d");
  var SIZE = 900;
  var PAL = ["#161318", "#3d1613", "#211c24", "#4c1a16"];
  var rotation = -Math.PI / 2;
  var wheelMovies = [];

  function setupCanvas() {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWheel(rot) {
    var n = wheelMovies.length;
    var cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2 - 8;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    if (n === 0) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = "#161318"; ctx.fill();
      ctx.strokeStyle = "rgba(232,195,126,.5)"; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore(); return;
    }
    var slice = TAU / n;
    for (var i = 0; i < n; i++) {
      var start = i * slice;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, start, start + slice); ctx.closePath();
      ctx.fillStyle = PAL[i % PAL.length]; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(232,195,126,.22)"; ctx.stroke();
      ctx.save(); ctx.rotate(start + slice / 2);
      ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillStyle = "#efe6d4";
      var fs = Math.max(10, Math.min(22, 380 / n + 8));
      ctx.font = "600 " + fs + "px 'Work Sans', sans-serif";
      var label = wheelMovies[i].title;
      var maxc = n > 40 ? 24 : n > 20 ? 32 : 40;
      if (label.length > maxc) label = label.slice(0, maxc - 1) + "…";
      ctx.fillText(label, r - 18, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(232,195,126,.5)"; ctx.stroke();
    ctx.restore();
  }

  function renderWheel() {
    var rid = S.activeRouletteId();
    var total = S.moviesForRoulette(rid).length;
    var movies = S.moviesForRoulette(rid).filter(function (m) { return !S.isSeen(m); });
    var key = rid + "|" + movies.map(function (m) { return m.id; }).join(",");
    if (key !== ui.wheelKey) {
      var switched = ui.wheelKey && key.split("|")[0] !== ui.wheelKey.split("|")[0];
      ui.wheelKey = key;
      wheelMovies = movies;
      var n = wheelMovies.length;
      rotation = -Math.PI / 2 - (n ? (TAU / n) / 2 : 0);
      drawWheel(rotation);
      if (switched) { delete $("spinStatus").dataset.result; $("spinStatus").textContent = ""; }
    }
    var canSpin = wheelMovies.length >= 2 && !ui.spinning;
    $("spin").disabled = !canSpin;
    if (ui.spinning) return;
    if (total === 0) $("spinStatus").textContent = "Esta ruleta no tiene películas. Agregá con «+ Agregar película».";
    else if (wheelMovies.length === 0) $("spinStatus").textContent = "Ya vieron todas las de esta ruleta 🎉 Están abajo en «Ya vistas».";
    else if (wheelMovies.length === 1) $("spinStatus").innerHTML = "Queda una sola sin ver: <b>" + esc(wheelMovies[0].title) + "</b>.";
    else if (!$("spinStatus").dataset.result) $("spinStatus").textContent = "Tocá «Girar la ruleta» para sortear la película de la noche.";
  }

  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

  function spin() {
    var n = wheelMovies.length;
    if (ui.spinning || n < 2) return;
    ui.spinning = true; $("spin").disabled = true;
    $("spinStatus").textContent = "Girando…"; delete $("spinStatus").dataset.result;

    var slice = TAU / n;
    var idx = Math.floor(Math.random() * n);
    var turns = 5 + Math.floor(Math.random() * 3);
    var target = -Math.PI / 2 - (idx * slice + slice / 2);
    var delta = (((target - (rotation % TAU)) % TAU) - TAU) % TAU;
    var dest = rotation + delta - turns * TAU;
    var start = rotation, total = dest - start, t0 = performance.now(), dur = 4400;

    (function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      rotation = start + total * easeOutQuint(t);
      drawWheel(rotation);
      if (t < 1) { requestAnimationFrame(frame); return; }
      rotation = dest; ui.spinning = false; $("spin").disabled = false;
      var m = wheelMovies[idx];
      $("spinStatus").innerHTML = "Salió <b>" + esc(m.title) + "</b>. Abrí su ficha y puntuála.";
      $("spinStatus").dataset.result = "1";
      S.setLastResult(S.activeRouletteId(), m.id);
      openMovie(m.id, true);
    })(t0);
  }

  /* ---------------- agregar película ---------------- */
  function toggleAddMovie(show) {
    var f = $("addMovieForm");
    f.hidden = !show;
    if (show) { $("amfTitle").value = ""; $("amfYear").value = ""; $("amfTitle").focus(); }
  }
  $("addMovieBtn").addEventListener("click", function () { toggleAddMovie($("addMovieForm").hidden); });
  $("amfCancel").addEventListener("click", function () { toggleAddMovie(false); });
  $("addMovieForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var title = $("amfTitle").value.trim();
    if (!title) { $("amfTitle").focus(); return; }
    var id = S.addMovie({ title: title, year: $("amfYear").value, by: S.deviceAuthor() });
    toggleAddMovie(false);
    if (id) openMovie(id, false);
  });

  /* ---------------- modal de ruletas ---------------- */
  function openRouletteModal(mode, rouletteId) {
    ui.modalMode = mode;
    ui.modalRouletteId = rouletteId || null;
    ui.modalConfirmDelete = false;
    ui.modalPicked = {};
    var r = rouletteId ? S.getRoulette(rouletteId) : null;
    if (r) r.movieIds.forEach(function (mid) { ui.modalPicked[mid] = true; });

    $("rouletteModalTitle").textContent = mode === "edit" ? "Editar ruleta" : "Nueva ruleta";
    $("rouletteName").value = r ? r.name : "";
    $("rouletteSave").textContent = mode === "edit" ? "Guardar cambios" : "Crear ruleta";
    $("rouletteDelete").hidden = mode !== "edit";
    $("rouletteDelete").textContent = "Eliminar";
    $("rouletteDelete").classList.remove("armed");
    $("roulettePickerSearch").value = "";
    renderPicker();
    $("rouletteModal").hidden = false;
    $("rouletteName").focus();
  }
  function closeRouletteModal() { $("rouletteModal").hidden = true; }

  function renderPicker() {
    var term = fold($("roulettePickerSearch").value.trim());
    var wrap = $("roulettePicker");
    wrap.innerHTML = "";
    var count = 0;
    S.allMovies().forEach(function (m) {
      if (ui.modalPicked[m.id]) count++;
      if (term && fold(m.title).indexOf(term) === -1) return;
      var row = document.createElement("label");
      row.className = "picker-row";
      row.innerHTML = '<input type="checkbox"' + (ui.modalPicked[m.id] ? " checked" : "") + ">" +
        '<span>' + esc(m.title) + (m.year ? ' <span class="pk-year">' + m.year + "</span>" : "") + "</span>";
      row.querySelector("input").addEventListener("change", function (e) {
        if (e.target.checked) ui.modalPicked[m.id] = true; else delete ui.modalPicked[m.id];
        $("rouletteCount").textContent = "(" + Object.keys(ui.modalPicked).length + ")";
      });
      wrap.appendChild(row);
    });
    $("rouletteCount").textContent = "(" + Object.keys(ui.modalPicked).length + ")";
  }

  $("roulettePickerSearch").addEventListener("input", renderPicker);
  $("rouletteModalClose").addEventListener("click", closeRouletteModal);
  $("rouletteCancel").addEventListener("click", closeRouletteModal);
  $("rouletteModal").querySelector(".modal-backdrop").addEventListener("click", closeRouletteModal);
  $("rouletteSave").addEventListener("click", function () {
    var name = $("rouletteName").value.trim() || (ui.modalMode === "edit" ? "Ruleta" : "Nueva ruleta");
    var ids = Object.keys(ui.modalPicked);
    if (ui.modalMode === "edit") {
      S.updateRoulette(ui.modalRouletteId, { name: name, movieIds: ids });
    } else {
      var newId = S.createRoulette(name, ids);
      S.setActiveRouletteId(newId);
    }
    closeRouletteModal();
  });
  $("rouletteDelete").addEventListener("click", function () {
    if (!ui.modalConfirmDelete) {
      ui.modalConfirmDelete = true;
      $("rouletteDelete").textContent = "¿Seguro? Eliminar";
      $("rouletteDelete").classList.add("armed");
      return;
    }
    S.deleteRoulette(ui.modalRouletteId);
    closeRouletteModal();
  });

  /* ---------------- export / import ---------------- */
  $("exportBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(S.exportDoc(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ciclo-cine-datos.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        S.importDoc(obj, false);
        flashSync("Datos importados y combinados.");
      } catch (err) { flashSync("No pude leer ese archivo."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  /* ---------------- sync status + banner ---------------- */
  var flashMsg = null, flashUntil = 0;
  function flashSync(msg) { flashMsg = msg; flashUntil = Date.now() + 3000; renderSync(); setTimeout(renderSync, 3200); }

  function renderSync() {
    var el = $("syncStatus");
    if (flashMsg && Date.now() < flashUntil) { el.textContent = flashMsg; el.className = "sync-status ok"; return; }
    var st = S.status;
    if (st.mode === "local") {
      el.innerHTML = '<span class="dot local"></span>Guardado solo en este navegador';
      el.className = "sync-status";
    } else if (st.mode === "syncing") {
      el.innerHTML = '<span class="dot sync"></span>Sincronizando…';
      el.className = "sync-status";
    } else if (st.mode === "error") {
      el.innerHTML = '<span class="dot err"></span>Sin conexión con el servidor · se reintenta';
      el.className = "sync-status err";
    } else {
      el.innerHTML = '<span class="dot ok"></span>Compartido y al día';
      el.className = "sync-status ok";
    }
  }

  function renderBanner() {
    var b = $("configBanner");
    try { if (localStorage.getItem("cc.bannerDismissed.v3")) { b.hidden = true; return; } } catch (e) {}
    var missing = [];
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) missing.push("compartir los datos entre Fran y Juanma");
    if (!CONFIG.tmdbApiKey) missing.push("las portadas y sinopsis automáticas");
    if (!missing.length) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = '<span>Falta configurar ' + missing.join(" y ") +
      '. Está todo explicado en <b>SETUP.md</b>. Mientras tanto la ruleta anda igual.</span>' +
      '<button type="button" id="bannerX" aria-label="Cerrar">&times;</button>';
    $("bannerX").addEventListener("click", function () {
      try { localStorage.setItem("cc.bannerDismissed.v3", "1"); } catch (e) {}
      b.hidden = true;
    });
  }

  /* ---------------- tabs / cerrar ficha ---------------- */
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { setTab(t.dataset.tab); });
  });
  $("resultClose").addEventListener("click", function () {
    $("resultCard").hidden = true; ui.currentId = null;
  });
  $("reviewForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!ui.currentId || !ui.formAuthor || ui.formStars < 1) { updateSubmitState(); return; }
    var wasFirst = S.reviewsFor(ui.currentId).length === 0;
    var who = ui.formAuthor;
    S.addReview(ui.currentId, { author: ui.formAuthor, stars: ui.formStars, note: $("reviewNote").value });
    $("reviewNote").value = ""; ui.formStars = 0;
    syncStarButtons();
    flashReviewHint("¡Guardado! Puntuada por " + who + (wasFirst ? ". Ya sale de la ruleta." : "."));
    updateSubmitState();
    if (wasFirst) { delete $("spinStatus").dataset.result; $("spinStatus").textContent = ""; renderWheel(); }
  });
  $("search").addEventListener("input", function (e) { ui.search = e.target.value; renderCartelera(); });
  $("spin").addEventListener("click", spin);
  $("seenToggle").addEventListener("click", function () {
    setSeenCollapsed(!$("seenToggle").parentNode.classList.contains("collapsed"), true);
  });

  /* ---------------- render maestro ---------------- */
  var lastActive = null;
  function render() {
    renderRouletteBar();
    renderWheel();
    renderCartelera();
    renderSync();
    renderBanner();

    var rid = S.activeRouletteId();
    if (rid !== lastActive) {
      lastActive = rid;
      var lr = S.lastResult(rid);
      if (lr && S.movieById(lr) && S.moviesForRoulette(rid).some(function (m) { return m.id === lr; })) {
        openMovie(lr, false);
      } else {
        $("resultCard").hidden = true; ui.currentId = null;
      }
    } else {
      refreshResultCard();
    }
  }

  /* ---------------- init ---------------- */
  setupCanvas();
  try { setSeenCollapsed(localStorage.getItem("cc.seenCollapsed.v1") === "1"); } catch (e) {}
  S.onChange(render);
  S.init();
  render();
  addEventListener("resize", function () { setupCanvas(); ui.wheelKey = ""; renderWheel(); });
  setInterval(renderSync, 1000);
})();
