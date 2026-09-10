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
  // p = puntaje 0-10; devuelve `n` estrellas (default 10) con medias (HTML)
  function starsHTML(p, n) {
    n = n || 10;
    var per = 10 / n;
    p = Math.max(0, Math.min(10, +p || 0));
    var out = "";
    for (var i = 1; i <= n; i++) {
      var full = p >= i * per;
      var half = !full && p >= i * per - per / 2;
      out += '<span class="rt-star' + (full ? " full" : half ? " half" : "") + '">★</span>';
    }
    return '<span class="rt-stars">' + out + "</span>";
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
  function tmdbImg(path, size) {
    return path ? "https://image.tmdb.org/t/p/" + (size || "w342") + path : null;
  }
  // mejor portada disponible: manual > TMDb baked (posters.js) > cache runtime
  function bestPoster(m, size) {
    if (!m) return null;
    if (m.poster) return m.poster;
    if (m.posterPath) return tmdbImg(m.posterPath, size);
    var meta = S.metaFor(m.id);
    return (meta && meta.poster) || null;
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
    mode: "ruleta",       // "ruleta" | "caja"
    revealId: null,
    modalMode: null,      // "new" | "edit"
    modalRouletteId: null,
    modalPicked: {},      // id -> true
    modalConfirmDelete: false,
  };
  try { ui.mode = localStorage.getItem("cc.mode.v1") === "caja" ? "caja" : "ruleta"; } catch (e) {}

  /* ================= login (soft gate, no es seguridad real) ================= */
  var ACCOUNTS = {
    "fran":     { name: "Fran",     pass: "ciclo123", role: "admin" },
    "juanma":   { name: "Juanma",   pass: "ciclo123", role: "admin" },
    "invitado": { name: "Invitado", pass: "123",      role: "guest" },
  };
  var session = null;
  try { session = JSON.parse(localStorage.getItem("cc.session.v1") || "null"); } catch (e) {}
  function isAdmin() { return !!(session && session.role === "admin"); }
  function currentUser() { return session ? session.name : null; }
  function login(u, p) {
    var acc = ACCOUNTS[String(u || "").trim().toLowerCase()];
    if (!acc || acc.pass !== p) return false;
    session = { name: acc.name, role: acc.role };
    try { localStorage.setItem("cc.session.v1", JSON.stringify(session)); } catch (e) {}
    if (acc.role === "admin") S.setDeviceAuthor(acc.name);
    return true;
  }
  function logout() {
    session = null;
    try { localStorage.removeItem("cc.session.v1"); } catch (e) {}
    openLogin();
    render();
  }
  function openLogin() { $("loginModal").hidden = false; setTimeout(function () { $("loginUser").focus(); }, 50); }
  function closeLogin() { $("loginModal").hidden = true; }

  function renderAuth() {
    var badge = $("userBadge");
    if (session) {
      badge.hidden = false;
      $("userName").textContent = session.name;
    } else {
      badge.hidden = true;
    }
    var adm = isAdmin();
    $("addMovieBtn").hidden = !adm;
    if (!adm) { $("addMovieForm").hidden = true; }
  }

  /* ---------------- TMDb ---------------- */
  function tmdbDetail(id, key, lang) {
    return fetch("https://api.themoviedb.org/3/movie/" + id +
      "?api_key=" + encodeURIComponent(key) + "&language=" + encodeURIComponent(lang))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (det) {
        det = det || {};
        return {
          v: 2,
          poster: det.poster_path ? "https://image.tmdb.org/t/p/w500" + det.poster_path : null,
          overview: (det.overview || "").trim(),
          url: "https://www.themoviedb.org/movie/" + id,
          imdbId: det.imdb_id || null,
          tmdbRating: det.vote_average || null,
          tmdbVotes: det.vote_count || null,
        };
      });
  }
  function fetchMeta(movie) {
    var cached = S.metaFor(movie.id);
    var THIRTY = 30 * 864e5;
    if (cached && cached.v === 2 && (Date.now() - (cached.at || 0) < THIRTY)) {
      return Promise.resolve(cached);
    }
    var key = (CONFIG.tmdbApiKey || "").trim();
    if (!key) return Promise.resolve(cached || null);
    var lang = CONFIG.tmdbLanguage || "es-ES";

    // Con tmdbId (las 86 base) vamos directo al detalle.
    if (movie.tmdbId) {
      return tmdbDetail(movie.tmdbId, key, lang)
        .then(function (meta) { if (meta) S.saveMeta(movie.id, meta); return meta || cached || null; })
        .catch(function () { return cached || null; });
    }

    // Sin id: buscar por título y después detalle.
    var q = movie.tmdbQuery || stripTitle(movie.title);
    var search = "https://api.themoviedb.org/3/search/movie?api_key=" + encodeURIComponent(key) +
      "&include_adult=false&query=" + encodeURIComponent(q) +
      (movie.year ? "&primary_release_year=" + movie.year : "");
    return fetch(search)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var results = (data && data.results) || [];
        var hit = results[0];
        if (movie.year) {
          for (var i = 0; i < results.length; i++) {
            var y = parseInt((results[i].release_date || "").slice(0, 4), 10);
            if (y && Math.abs(y - movie.year) <= 1) { hit = results[i]; break; }
          }
        }
        if (!hit) return cached || null;
        return tmdbDetail(hit.id, key, lang).then(function (meta) {
          if (meta) S.saveMeta(movie.id, meta);
          return meta || cached || null;
        });
      })
      .catch(function () { return cached || null; });
  }

  /* ---------------- ratings externos (IMDb via OMDb) ---------------- */
  var _omdbCache = {};
  function fetchOmdb(imdbId) {
    var key = (CONFIG.omdbApiKey || "").trim();
    if (!imdbId || !key) return Promise.resolve(null);
    if (_omdbCache[imdbId]) return Promise.resolve(_omdbCache[imdbId]);
    return fetch("https://www.omdbapi.com/?apikey=" + encodeURIComponent(key) + "&i=" + encodeURIComponent(imdbId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var out = (d && d.Response === "True")
          ? { imdb: d.imdbRating && d.imdbRating !== "N/A" ? d.imdbRating : null, votes: d.imdbVotes || null,
              rt: (d.Ratings || []).filter(function (x) { return x.Source === "Rotten Tomatoes"; }).map(function (x) { return x.Value; })[0] || null }
          : null;
        _omdbCache[imdbId] = out || {};
        return out;
      })
      .catch(function () { return null; });
  }
  function renderExternalRatings(m) {
    var box = $("externalRatings");
    if (box.dataset.forId === m.id) return;
    box.dataset.forId = m.id;
    box.hidden = true; box.innerHTML = "";
    fetchMeta(m).then(function (meta) {
      if (ui.currentId !== m.id || !meta) return;
      var parts = [];
      var imdbHref = meta.imdbId ? "https://www.imdb.com/title/" + meta.imdbId + "/" : null;
      if (meta.tmdbRating) {
        parts.push('<a class="rt-pill rt-tmdb" href="' + (meta.url || "#") + '" target="_blank" rel="noopener">' +
          'TMDb <b>' + meta.tmdbRating.toFixed(1) + '</b></a>');
      }
      if (imdbHref) {
        var pillInner = 'IMDb';
        parts.push('<a class="rt-pill rt-imdb" href="' + imdbHref + '" target="_blank" rel="noopener" id="rtImdbPill">' +
          pillInner + '</a>');
      }
      if (!parts.length) return;
      box.hidden = false;
      box.innerHTML = parts.join("");
      // puntaje de IMDb (OMDb, si hay key)
      if (meta.imdbId && CONFIG.omdbApiKey) {
        fetchOmdb(meta.imdbId).then(function (o) {
          if (ui.currentId !== m.id || !o) return;
          var pill = $("rtImdbPill");
          if (pill && o.imdb) pill.innerHTML = 'IMDb <b>' + o.imdb + '</b>';
          if (o.rt) box.insertAdjacentHTML("beforeend", '<span class="rt-pill rt-rt">🍅 ' + esc(o.rt) + '</span>');
        });
      }
    });
  }

  /* ---------------- dónde verla (TMDb watch providers, AR) ---------------- */
  var _provCache = {};
  function fetchProviders(tmdbId) {
    if (!tmdbId || !CONFIG.tmdbApiKey) return Promise.resolve(null);
    if (_provCache[tmdbId]) return Promise.resolve(_provCache[tmdbId]);
    return fetch("https://api.themoviedb.org/3/movie/" + tmdbId + "/watch/providers?api_key=" + encodeURIComponent(CONFIG.tmdbApiKey))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var ar = d && d.results && d.results.AR;
        var out = ar
          ? { link: ar.link || null, flatrate: ar.flatrate || [], rent: ar.rent || [], buy: ar.buy || [] }
          : { link: null, flatrate: [], rent: [], buy: [] };
        _provCache[tmdbId] = out;
        return out;
      })
      .catch(function () { return null; });
  }
  function renderProviders(m) {
    var box = $("watchProviders");
    if (box.dataset.forId === m.id) return;   // ya renderizado para esta peli
    box.dataset.forId = m.id;
    box.hidden = true; box.innerHTML = "";
    if (!m.tmdbId) return;
    fetchProviders(m.tmdbId).then(function (p) {
      if (!p || ui.currentId !== m.id) return;
      var uniq = {};
      function logos(items) {
        return items.filter(function (it) {
          if (uniq[it.provider_id]) return false; uniq[it.provider_id] = 1; return !!it.logo_path;
        }).map(function (it) {
          return '<a class="wp-prov" href="' + (p.link || "#") + '" target="_blank" rel="noopener" title="' +
            esc(it.provider_name) + '"><img src="https://image.tmdb.org/t/p/w92' + it.logo_path +
            '" alt="' + esc(it.provider_name) + '" loading="lazy"></a>';
        }).join("");
      }
      var groups = [
        ["Suscripción", p.flatrate],
        ["Alquiler", p.rent],
        ["Compra", p.buy],
      ].map(function (g) {
        var l = logos(g[1]);
        return l ? '<div class="wp-group"><span class="wp-label">' + g[0] + '</span><div class="wp-logos">' + l + "</div></div>" : "";
      }).join("");
      box.hidden = false;
      if (!groups) {
        box.innerHTML = '<div class="wp-title">Dónde verla</div><p class="wp-empty">No figura en ninguna plataforma en Argentina por ahora.' +
          (p.link ? ' <a href="' + p.link + '" target="_blank" rel="noopener">Buscar en JustWatch</a>' : "") + "</p>";
      } else {
        box.innerHTML = '<div class="wp-title">Dónde verla en Argentina</div>' + groups +
          (p.link ? '<a class="wp-jw" href="' + p.link + '" target="_blank" rel="noopener">Detalle y links en JustWatch →</a>' : "");
      }
    });
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
        (r.builtin || !isAdmin() ? "" : '<button class="rchip-edit" type="button" aria-label="Editar ruleta">✎</button>');
      chip.querySelector(".rchip-main").addEventListener("click", function () {
        if (S.activeRouletteId() !== r.id) { S.setActiveRouletteId(r.id); ui.search = ""; $("search").value = ""; }
      });
      var editBtn = chip.querySelector(".rchip-edit");
      if (editBtn) editBtn.addEventListener("click", function () { openRouletteModal("edit", r.id); });
      bar.appendChild(chip);
    });
    if (isAdmin()) {
      var add = document.createElement("button");
      add.className = "rchip-add";
      add.type = "button";
      add.textContent = "+ Nueva ruleta";
      add.addEventListener("click", function () { openRouletteModal("new"); });
      bar.appendChild(add);
    }
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
          (a != null ? '<span class="mini-avg">★ ' + a.toFixed(1) + '</span>' : "") +
          (S.isSeen(m) ? '<span class="seen-dot" title="Ya vista">●</span>' : "") +
        '</span>' +
      '</button>' +
      (m.base || !isAdmin() ? "" : '<button class="film-remove" type="button" aria-label="Quitar película" title="Quitar de todas las ruletas">✕</button>');
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
    $("resultTitle").textContent = m.title;

    // meta line
    var bits = [];
    if (m.year) bits.push("<span>" + m.year + "</span>");
    if (!m.base && m.addedBy) bits.push("<span>agregada por " + esc(m.addedBy) + "</span>");
    if (m.edited) bits.push('<span>editada</span>');
    var a = S.avg(m.id);
    if (a != null) bits.push('<span class="avg">★ <b>' + a.toFixed(1) +
      "</b>/10 (" + S.reviewsFor(m.id).length + ")</span>");
    $("resultMeta").innerHTML = bits.join('<span aria-hidden="true">·</span>');
    $("editMovieBtn").hidden = !isAdmin();

    // poster
    var src = bestPoster(m, "w500");
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

    // ratings externos (IMDb / TMDb / RT) y dónde verla
    renderExternalRatings(m);
    renderProviders(m);
    $("resultLinks").innerHTML = "";

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
    // solo Fran / Juanma pueden puntuar
    if (!isAdmin()) {
      $("reviewForm").hidden = true;
      $("reviewLock").hidden = false;
      return;
    }
    $("reviewForm").hidden = false;
    $("reviewLock").hidden = true;

    ui.formAuthor = currentUser();
    var slicer = $("authorSlicer");
    slicer.innerHTML = '<span class="author-locked">Puntuás como <b>' + esc(currentUser()) + "</b></span>";

    // input: 10 estrellas, escala 0.5-10; el valor sale de la posición
    // del mouse/dedo sobre toda la fila (fácil apuntar la media).
    var stars = $("starInput");
    stars.innerHTML = "";
    for (var i = 1; i <= 10; i++) {
      var s = document.createElement("span");
      s.className = "star-in";
      s.dataset.idx = i;
      s.innerHTML = '<span class="si-bg">★</span><span class="si-fg">★</span>';
      stars.appendChild(s);
    }
    function valFrom(ev) {
      var r = stars.getBoundingClientRect();
      var cx = ev.clientX != null ? ev.clientX
        : (ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0].clientX
        : (ev.touches && ev.touches[0]) ? ev.touches[0].clientX : 0;
      var raw = ((cx - r.left) / r.width) * 10;
      return Math.max(0.5, Math.min(10, Math.ceil(raw * 2) / 2));
    }
    stars.onmousemove = function (ev) { paintStars(valFrom(ev)); };
    stars.onmouseleave = function () { paintStars(ui.formStars); };
    stars.onclick = function (ev) {
      var v = valFrom(ev);
      ui.formStars = (Math.abs((ui.formStars || 0) - v) < 0.01) ? 0 : v;
      paintStars(ui.formStars); updateSubmitState();
    };
    stars.ontouchmove = function (ev) { paintStars(valFrom(ev)); };

    // si ya puntuó esta peli, precargamos su nota + puntaje para editar
    var mine = S.myReview(ui.currentId, currentUser());
    ui.editing = !!mine;
    ui.formStars = mine ? S.reviewPoints(mine) : 0;
    $("reviewNote").value = mine ? (mine.note || "") : "";
    $("reviewSubmit").textContent = mine ? "Actualizar puntuación" : "Guardar puntuación";
    paintStars(ui.formStars);
    updateSubmitState();
  }

  function paintStars(v) {
    v = v || 0;
    [].forEach.call($("starInput").children, function (s) {
      var i = +s.dataset.idx;
      var fg = s.querySelector(".si-fg");
      fg.style.width = v >= i ? "100%" : (v >= i - 0.5 ? "50%" : "0%");
    });
    if ($("starValue")) $("starValue").textContent = v ? (v % 1 ? v.toFixed(1) : v) + " / 10" : "";
  }
  function syncStarButtons() { paintStars(ui.formStars); }

  function updateSubmitState() {
    if (!isAdmin()) return;
    var ready = !!ui.formAuthor && ui.formStars >= 0.5;
    $("reviewSubmit").disabled = !ready;
    if (ui.formFlashUntil && Date.now() < ui.formFlashUntil) return; // no pisar el "¡Guardado!"
    var h = $("reviewHint");
    if (ui.formStars < 0.5) { h.textContent = "Poné un puntaje."; h.classList.remove("ok"); }
    else { h.textContent = ui.editing ? "Listo para actualizar tu puntuación." : "Listo para guardar."; h.classList.add("ok"); }
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
      var pts = S.reviewPoints(r);
      d.innerHTML =
        '<button class="review-del" type="button" title="Borrar" aria-label="Borrar puntuación">&times;</button>' +
        '<div class="review-top">' +
          '<span class="review-author">' + esc(r.author) + '</span>' +
          '<span class="review-stars">' + starsHTML(pts) + ' <b>' + (pts % 1 ? pts.toFixed(1) : pts) + '</b>/10</span>' +
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
    if (ui.mode === "caja") preloadCasePosters();
    if (ui.spinning) return;
    if (total === 0) $("spinStatus").textContent = "Esta ruleta no tiene películas. Agregá con «+ Agregar película».";
    else if (wheelMovies.length === 0) $("spinStatus").textContent = "Ya vieron todas las de esta ruleta 🎉 Están abajo en «Ya vistas».";
    else if (wheelMovies.length === 1) $("spinStatus").innerHTML = "Queda una sola sin ver: <b>" + esc(wheelMovies[0].title) + "</b>.";
    else if (!$("spinStatus").dataset.result) $("spinStatus").textContent =
      "Tocá «Sortear película» para elegir la de la noche.";
    if (ui.mode === "caja") renderCaseIdle();
  }

  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* ================= modo caja (estilo CS2) ================= */

  /* -- sonido: sintetizado por defecto; usa sounds/tick.* y sounds/reveal.*
        si CONFIG.soundPack está activo y los archivos existen -- */
  var muted = false;
  try { muted = localStorage.getItem("cc.muted.v1") === "1"; } catch (e) {}
  var actx = null, _sndTried = false;
  var sndBuf = {};
  function ac() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
      if (actx && CONFIG.soundPack && !_sndTried) { _sndTried = true; loadSound("tick"); loadSound("reveal"); }
    }
    if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  function loadSound(name) {
    var a = actx; if (!a) return;
    ["mp3", "ogg", "wav", "m4a"].reduce(function (pr, ext) {
      return pr.catch(function () {
        return fetch("sounds/" + name + "." + ext).then(function (r) {
          if (!r.ok) throw 0; return r.arrayBuffer();
        }).then(function (ab) { return a.decodeAudioData(ab); }).then(function (b) { sndBuf[name] = b; });
      });
    }, Promise.reject()).catch(function () {});
  }
  function playBuffer(name, vol) {
    var a = actx; if (!a || !sndBuf[name]) return false;
    var s = a.createBufferSource(); s.buffer = sndBuf[name];
    var g = a.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(a.destination); s.start();
    return true;
  }
  function noiseBuffer(a, secs) {
    var buf = a.createBuffer(1, Math.max(1, a.sampleRate * secs), a.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return buf;
  }
  function sTick() {
    if (muted) return;
    var a = ac(); if (!a) return;
    if (playBuffer("tick", 0.5)) return;
    var t = a.currentTime;
    // transiente: click de ruido con bandpass
    var n = a.createBufferSource(); n.buffer = noiseBuffer(a, 0.03);
    var bp = a.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = 2000 + Math.random() * 900; bp.Q.value = 3;
    var ng = a.createGain();
    ng.gain.setValueAtTime(0.55, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    n.connect(bp); bp.connect(ng); ng.connect(a.destination);
    n.start(t); n.stop(t + 0.03);
    // cuerpo: ping cortito
    var o = a.createOscillator(), g = a.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(1500 + Math.random() * 500, t);
    g.gain.setValueAtTime(0.045, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.045);
  }
  function sReveal() {
    if (muted) return;
    var a = ac(); if (!a) return;
    if (playBuffer("reveal", 0.7)) return;
    var t = a.currentTime;
    // whoosh: ruido con lowpass que abre
    var n = a.createBufferSource(); n.buffer = noiseBuffer(a, 0.5);
    var lp = a.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(6500, t + 0.32);
    var ng = a.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.08, t + 0.14);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(lp); lp.connect(ng); ng.connect(a.destination);
    n.start(t); n.stop(t + 0.5);
    // acorde brillante al final del whoosh
    [523.25, 659.25, 783.99].forEach(function (f, k) {
      var o = a.createOscillator(), g = a.createGain();
      var tt = t + 0.26 + k * 0.035;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.13, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.9);
      o.connect(g); g.connect(a.destination);
      o.start(tt); o.stop(tt + 1);
    });
  }
  function renderMute() {
    $("muteBtn").textContent = muted ? "🔇" : "🔊";
    $("muteBtn").classList.toggle("is-muted", muted);
  }

  /* -- "rareza" cosmética por película (determinística) -- */
  var RARITIES = [
    { c: "#4b69cf", w: 50 }, { c: "#8847ff", w: 26 }, { c: "#d32ce6", w: 13 },
    { c: "#eb4b4b", w: 8 }, { c: "#e8c37e", w: 3 },
  ];
  function rarityColor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var total = RARITIES.reduce(function (s, r) { return s + r.w; }, 0);
    var x = h % total, acc = 0;
    for (var j = 0; j < RARITIES.length; j++) { acc += RARITIES[j].w; if (x < acc) return RARITIES[j].c; }
    return RARITIES[0].c;
  }

  /* -- precarga de portadas para la tira -- */
  var _casePreloaded = "";
  function preloadCasePosters() {
    var key = wheelMovies.map(function (m) { return m.id; }).join(",");
    if (key === _casePreloaded || !wheelMovies.length) return;
    _casePreloaded = key;
    wheelMovies.slice(0, 100).forEach(function (m) {
      var u = bestPoster(m, "w185");
      if (u) { var im = new Image(); im.src = u; }
    });
  }

  function makeCaseItem(m) {
    var poster = bestPoster(m, "w185");
    var el = document.createElement("div");
    el.className = "case-item" + (poster ? " has-poster" : "");
    el.style.setProperty("--rar", rarityColor(m.id));
    el.innerHTML = (poster ? '<img alt="" src="' + poster + '">' : "") +
      '<span class="ci-name">' + esc(m.title) + "</span>";
    return el;
  }

  /* -- tira estática (se ve desde que entrás, antes de sortear) -- */
  var _idleKey = "";
  function renderCaseIdle() {
    if (ui.mode !== "caja" || ui.spinning) return;
    var pool = wheelMovies;
    var key = pool.map(function (m) { return m.id; }).join(",");
    var track = $("caseTrack");
    if (key === _idleKey && track.children.length) return;
    _idleKey = key;
    track.style.transition = "none";
    track.innerHTML = "";
    if (!pool.length) { track.style.transform = "translateX(0px)"; return; }
    var vw = $("caseWrap").clientWidth || 940;
    var n = Math.max(16, Math.ceil(vw / 130) + 8);
    var seq = [];
    for (var i = 0; i < n; i++) seq.push(pool[i % pool.length]);
    for (var j = seq.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var tmp = seq[j]; seq[j] = seq[k]; seq[k] = tmp; }
    seq.forEach(function (m) { track.appendChild(makeCaseItem(m)); });
    var itemW = track.children[0].offsetWidth || 240;
    var gap = parseFloat(getComputedStyle(track).gap) || 12;
    var stride = itemW + gap;
    var startIdx = Math.floor(n / 2);
    track.style.transform = "translateX(" + (vw / 2 - (startIdx * stride + itemW / 2)) + "px)";
  }

  /* -- modo activo -- */
  function renderMode() {
    var caja = ui.mode === "caja";
    $("wheelWrap").hidden = caja;
    $("caseWrap").hidden = !caja;
    $("spin").textContent = "Sortear película";
    document.querySelectorAll(".mode-opt").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.mode === ui.mode ? "true" : "false");
    });
    renderMute();
  }

  /* -- animación de la caja -- */
  function openCase() {
    var pool = wheelMovies;
    if (ui.spinning || pool.length < 2) return;
    ac();
    ui.spinning = true; $("spin").disabled = true;
    $("spinStatus").textContent = "Sorteando…"; delete $("spinStatus").dataset.result;

    var winner = pool[Math.floor(Math.random() * pool.length)];
    var WIN_POS = 55, COUNT = WIN_POS + 8;
    var track = $("caseTrack");
    track.style.transition = "none";
    track.style.transform = "translateX(0px)";
    track.innerHTML = "";
    for (var i = 0; i < COUNT; i++) {
      var m = (i === WIN_POS) ? winner : pool[Math.floor(Math.random() * pool.length)];
      track.appendChild(makeCaseItem(m));
    }

    var first = track.children[0];
    var itemW = first ? first.offsetWidth : 240;
    var gap = parseFloat(getComputedStyle(track).gap) || 12;
    var stride = itemW + gap;
    var center = $("caseWrap").clientWidth / 2;
    var jitter = (Math.random() - 0.5) * (itemW * 0.45);
    var destX = -((WIN_POS * stride + itemW / 2) - center - jitter);
    var startX = 0, dur = 8200, t0 = performance.now();
    var lastIdx = -1, lastTick = 0;

    (function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      var x = startX + (destX - startX) * easeOutCubic(t);
      track.style.transform = "translateX(" + x + "px)";
      var idx = Math.round((center - x - itemW / 2) / stride);
      if (idx !== lastIdx && idx >= 0 && idx < COUNT) {
        lastIdx = idx;
        if (now - lastTick > 42) { sTick(); lastTick = now; }
      }
      if (t < 1) { requestAnimationFrame(frame); return; }

      track.style.transform = "translateX(" + destX + "px)";
      var won = track.children[WIN_POS];
      if (won) won.classList.add("is-won");
      ui.spinning = false; $("spin").disabled = false;
      $("spinStatus").innerHTML = "Salió <b>" + esc(winner.title) + "</b>.";
      $("spinStatus").dataset.result = "1";
      S.setLastResult(S.activeRouletteId(), winner.id);
      setTimeout(function () { showReveal(winner); }, 450);
    })(t0);
  }

  /* -- recuadro grande + fondo blurreado -- */
  function showReveal(m) {
    ui.revealId = m.id;
    var meta = S.metaFor(m.id);
    var col = rarityColor(m.id);
    $("caseReveal").querySelector(".case-reveal-card").style.setProperty("--rar", col);
    $("crTitle").textContent = m.title;
    var bits = [];
    if (m.year) bits.push(String(m.year));
    var rou = S.getRoulette(S.activeRouletteId());
    if (rou) bits.push(rou.name);
    $("crMeta").textContent = bits.join(" · ");
    var poster = bestPoster(m, "w500");
    $("crPoster").innerHTML = poster
      ? '<img alt="" src="' + poster + '">'
      : '<div class="cr-fallback">' + esc(m.title) + "</div>";
    document.querySelector(".wrap").classList.add("blurred");
    $("caseReveal").hidden = false;
    sReveal();
    if (!poster && CONFIG.tmdbApiKey) {
      fetchMeta(m).then(function (mm) {
        if (ui.revealId === m.id && mm && mm.poster) {
          $("crPoster").innerHTML = '<img alt="" src="' + mm.poster + '">';
        }
      });
    }
  }
  function hideReveal() {
    $("caseReveal").hidden = true;
    document.querySelector(".wrap").classList.remove("blurred");
  }
  function revealToFicha(tab) {
    var id = ui.revealId;
    hideReveal();
    if (id) { openMovie(id, true); if (tab) setTab(tab); }
  }

  $("muteBtn").addEventListener("click", function () {
    muted = !muted;
    try { localStorage.setItem("cc.muted.v1", muted ? "1" : "0"); } catch (e) {}
    renderMute();
    if (!muted) sTick();
  });
  document.querySelectorAll(".mode-opt").forEach(function (b) {
    b.addEventListener("click", function () {
      if (ui.spinning || ui.mode === b.dataset.mode) return;
      ui.mode = b.dataset.mode;
      try { localStorage.setItem("cc.mode.v1", ui.mode); } catch (e) {}
      renderMode();
      delete $("spinStatus").dataset.result;
      ui.wheelKey = ""; renderWheel();
    });
  });
  $("crClose").addEventListener("click", function () { revealToFicha(); });
  $("crRate").addEventListener("click", function () { revealToFicha("puntuar"); });
  $("caseReveal").querySelector(".case-reveal-backdrop").addEventListener("click", function () { revealToFicha(); });

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

  /* ---------------- editar / quitar película ---------------- */
  var mmId = null, mmConfirmDel = false;
  function tmdbIdFrom(s) {
    s = String(s || "").trim();
    var m = s.match(/movie\/(\d+)/) || s.match(/^(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }
  function openMovieModal(id) {
    if (!isAdmin()) return;
    var m = S.movieById(id);
    if (!m) return;
    mmId = id; mmConfirmDel = false;
    var o = S.overrideFor(id) || {};
    $("movieModalTitle").textContent = "Editar: " + m.title;
    $("mmTitle").value = m.title || "";
    $("mmYear").value = m.year || "";
    $("mmTmdb").value = m.tmdbId || "";
    $("mmPoster").value = o.poster || "";
    $("mmDelete").textContent = "Quitar del ciclo";
    $("mmDelete").classList.remove("armed");
    $("mmReset").hidden = !m.edited;
    $("movieModal").hidden = false;
    $("mmTitle").focus();
  }
  function closeMovieModal() { $("movieModal").hidden = true; mmId = null; }

  $("editMovieBtn").addEventListener("click", function () { if (ui.currentId) openMovieModal(ui.currentId); });
  $("movieModalClose").addEventListener("click", closeMovieModal);
  $("movieModal").querySelector(".modal-backdrop").addEventListener("click", closeMovieModal);
  function forceFichaRefresh() {
    $("watchProviders").dataset.forId = "";
    $("externalRatings").dataset.forId = "";
    $("posterBox").innerHTML = '<div class="poster-fallback"></div>'; // que re-evalúe la portada
    if (ui.currentId) {
      var mm = S.movieById(ui.currentId);
      if (mm) { fetchMeta(mm).then(function () { if (ui.currentId === mm.id) refreshResultCard(); }); }
      refreshResultCard();
    }
  }
  $("mmSave").addEventListener("click", function () {
    if (!mmId) return;
    var fac = S.factoryMovie(mmId) || {};
    var patch = {};
    var t = $("mmTitle").value.trim();
    patch.title = (t && t !== fac.title) ? t : null;
    var y = parseInt($("mmYear").value, 10) || null;
    patch.year = (y !== fac.year) ? y : null;
    var tid = tmdbIdFrom($("mmTmdb").value);
    patch.tmdbId = (tid && tid !== fac.tmdbId) ? tid : null;
    var pu = $("mmPoster").value.trim();
    patch.poster = pu || null;
    S.setOverride(mmId, patch);
    _provCache = {}; _omdbCache = {};
    closeMovieModal();
    forceFichaRefresh();
    render();
  });
  $("mmReset").addEventListener("click", function () {
    if (!mmId) return;
    S.setOverride(mmId, { title: null, year: null, tmdbId: null, poster: null, hidden: null });
    _provCache = {}; _omdbCache = {};
    closeMovieModal();
    forceFichaRefresh();
    render();
  });
  $("mmDelete").addEventListener("click", function () {
    if (!mmId) return;
    if (!mmConfirmDel) {
      mmConfirmDel = true;
      $("mmDelete").textContent = "¿Seguro? Quitar";
      $("mmDelete").classList.add("armed");
      return;
    }
    var id = mmId;
    S.hideMovie(id);
    closeMovieModal();
    if (ui.currentId === id) { $("resultCard").hidden = true; ui.currentId = null; }
    render();
  });

  function renderHiddenSection() {
    var sec = $("hiddenSection");
    var hidden = S.hiddenMovies();
    if (!hidden.length || !isAdmin()) { sec.hidden = true; return; }
    sec.hidden = false;
    $("hiddenCount").textContent = "(" + hidden.length + ")";
    var list = $("filmListHidden");
    list.innerHTML = "";
    hidden.forEach(function (m) {
      var row = document.createElement("div");
      row.className = "film";
      row.innerHTML = '<button class="film-open" type="button"><span class="film-name">' + esc(m.title) +
        "</span></button><button class=\"film-restore\" type=\"button\">restaurar</button>";
      row.querySelector(".film-open").addEventListener("click", function () { openMovie(m.id, false); });
      row.querySelector(".film-restore").addEventListener("click", function () { S.unhideMovie(m.id); });
      list.appendChild(row);
    });
  }
  $("hiddenToggle").addEventListener("click", function () {
    var sec = $("hiddenSection");
    var collapsed = sec.classList.toggle("collapsed");
    $("hiddenToggle").setAttribute("aria-expanded", collapsed ? "false" : "true");
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
    if (!isAdmin() || !ui.currentId || !ui.formAuthor || ui.formStars < 0.5) { updateSubmitState(); return; }
    var mid = ui.currentId;
    var wasFirst = S.reviewsFor(mid).length === 0;
    var wasEditing = !!S.myReview(mid, ui.formAuthor);
    S.addReview(mid, { author: ui.formAuthor, stars: ui.formStars, scale: 10, note: $("reviewNote").value });
    if (ui.currentId === mid) buildReviewForm();   // recarga con el valor recién guardado
    flashReviewHint(wasEditing ? "¡Actualizada!" : "¡Guardado!" + (wasFirst ? " Ya sale de la ruleta." : ""));
    if (wasFirst) { delete $("spinStatus").dataset.result; $("spinStatus").textContent = ""; renderWheel(); }
  });

  /* ---------------- login ---------------- */
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (login($("loginUser").value, $("loginPass").value)) {
      $("loginError").hidden = true;
      $("loginPass").value = "";
      closeLogin();
      render();
      if (ui.currentId) buildReviewForm();
    } else {
      $("loginError").hidden = false;
    }
  });
  $("logoutBtn").addEventListener("click", logout);
  $("reviewLockLogin").addEventListener("click", openLogin);
  $("search").addEventListener("input", function (e) { ui.search = e.target.value; renderCartelera(); });
  $("spin").addEventListener("click", function () {
    if (ui.mode === "caja") openCase(); else spin();
  });
  $("seenToggle").addEventListener("click", function () {
    setSeenCollapsed(!$("seenToggle").parentNode.classList.contains("collapsed"), true);
  });

  /* ---------------- render maestro ---------------- */
  var lastActive = null;
  function render() {
    renderAuth();
    renderRouletteBar();
    renderMode();
    renderWheel();
    renderCartelera();
    renderHiddenSection();
    renderSync();
    renderBanner();

    // La ficha NO se abre sola al entrar ni al cambiar de ruleta:
    // solo aparece al girar la ruleta o al tocar una película.
    var rid = S.activeRouletteId();
    if (rid !== lastActive) {
      lastActive = rid;
      $("resultCard").hidden = true;
      ui.currentId = null;
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
  if (!session) openLogin();
  addEventListener("resize", function () { setupCanvas(); ui.wheelKey = ""; renderWheel(); });
  setInterval(renderSync, 1000);
})();
