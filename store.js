/* ==================================================================
   Store: estado compartido de la ruleta.

   - Fuente base de películas: window.CC_MOVIES (movies.js), no se toca.
   - Estado editable (reseñas, ruletas, películas agregadas, cache de
     portadas): un único documento JSON.
       · Si hay Supabase configurado  -> se guarda allá y se comparte.
       · Si no, se guarda en localStorage (solo este navegador).
   - Siempre se mantiene un espejo local para andar offline.
================================================================== */
window.CCStore = (function () {
  "use strict";

  var CONFIG = window.CC_CONFIG || {};
  var REVIEWERS = (CONFIG.reviewers && CONFIG.reviewers.length === 2)
    ? CONFIG.reviewers.slice() : ["Fran", "Juanma"];

  var LS_MIRROR = "cc.doc.v4";   // v4: descarta espejos viejos con datos de prueba
  var LS_DEVICE_AUTHOR = "cc.deviceAuthor.v1";
  var LS_ACTIVE_ROULETTE = "cc.activeRoulette.v1";

  var ORIGINAL_ID = "original";

  /* ---------- películas base ---------- */
  var BASE = (window.CC_MOVIES || []).map(function (m, i) {
    return {
      id: m.id || ("peli-" + i),
      title: m.title || "(sin título)",
      year: m.year || null,
      overview: (m.overview || "").trim(),
      poster: m.poster || null,
      tmdbQuery: m.tmdbQuery || null,
      base: true,
      order: i,
    };
  });
  var BASE_IDS = BASE.map(function (m) { return m.id; });

  /* ---------- utilidades ---------- */
  function uid(p) {
    return (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowMs() { return Date.now(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function lsGet(k, fb) {
    try { var r = localStorage.getItem(k); return r == null ? fb : JSON.parse(r); }
    catch (e) { return fb; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function lsSetRaw(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsGetRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---------- documento vacío / normalización ---------- */
  function emptyDoc() {
    return {
      v: 4, updatedAt: 0, updatedBy: null,
      movies: {}, roulettes: [], reviews: {}, meta: {}, lastResult: {},
      deletedReviews: {},   // { reviewId: ts } — lápidas para que un borrado no vuelva al sincronizar
    };
  }

  function normalize(doc) {
    doc = doc && typeof doc === "object" ? doc : {};
    var d = emptyDoc();
    d.updatedAt = doc.updatedAt || 0;
    d.updatedBy = doc.updatedBy || null;
    d.movies = doc.movies && typeof doc.movies === "object" ? doc.movies : {};
    d.reviews = doc.reviews && typeof doc.reviews === "object" ? doc.reviews : {};
    d.meta = doc.meta && typeof doc.meta === "object" ? doc.meta : {};
    d.lastResult = doc.lastResult && typeof doc.lastResult === "object" ? doc.lastResult : {};
    d.deletedReviews = doc.deletedReviews && typeof doc.deletedReviews === "object" ? doc.deletedReviews : {};
    d.roulettes = Array.isArray(doc.roulettes) ? doc.roulettes.filter(Boolean) : [];
    // aplicar lápidas: sacar cualquier reseña borrada
    Object.keys(d.reviews).forEach(function (mid) {
      d.reviews[mid] = (d.reviews[mid] || []).filter(function (rv) { return !(rv && d.deletedReviews[rv.id]); });
      if (!d.reviews[mid].length) delete d.reviews[mid];
    });
    ensureOriginal(d);
    return d;
  }

  // La ruleta "original" siempre existe y siempre contiene todas las
  // películas base (además de las que se le hayan agregado a mano).
  function ensureOriginal(d) {
    var orig = d.roulettes.filter(function (r) { return r.id === ORIGINAL_ID; })[0];
    if (!orig) {
      orig = { id: ORIGINAL_ID, name: "Ciclo original", builtin: true, movieIds: [] };
      d.roulettes.unshift(orig);
    }
    orig.builtin = true;
    orig.name = orig.name || "Ciclo original";
    var have = {};
    (orig.movieIds || []).forEach(function (id) { have[id] = true; });
    BASE_IDS.forEach(function (id) { if (!have[id]) orig.movieIds.push(id); });
    // sacar refs a películas que ya no existen ni en base ni en agregadas
    orig.movieIds = orig.movieIds.filter(function (id) {
      return BASE_IDS.indexOf(id) !== -1 || d.movies[id];
    });
  }

  /* ---------- merge de dos documentos ---------- */
  function mergeDocs(remote, local) {
    if (!remote) return clone(local);
    if (!local) return clone(remote);
    var out = clone(remote.updatedAt >= local.updatedAt ? remote : local);

    // películas agregadas: unión por id
    out.movies = {};
    [remote.movies, local.movies].forEach(function (src) {
      Object.keys(src || {}).forEach(function (id) {
        if (!out.movies[id] || (src[id].addedAt || 0) >= (out.movies[id].addedAt || 0)) {
          out.movies[id] = src[id];
        }
      });
    });

    // cache de portadas/sinopsis: unión, se queda con la más nueva
    out.meta = {};
    [remote.meta, local.meta].forEach(function (src) {
      Object.keys(src || {}).forEach(function (id) {
        if (!out.meta[id] || (src[id].at || 0) >= (out.meta[id].at || 0)) out.meta[id] = src[id];
      });
    });

    // lápidas de borrado: unión (una vez borrada, borrada para todos)
    out.deletedReviews = {};
    [remote.deletedReviews, local.deletedReviews].forEach(function (src) {
      Object.keys(src || {}).forEach(function (id) { out.deletedReviews[id] = src[id]; });
    });

    // reseñas: unión por review.id, descartando las que tengan lápida
    out.reviews = {};
    var allMovieIds = {};
    Object.keys(remote.reviews || {}).forEach(function (k) { allMovieIds[k] = 1; });
    Object.keys(local.reviews || {}).forEach(function (k) { allMovieIds[k] = 1; });
    Object.keys(allMovieIds).forEach(function (mid) {
      var seen = {}, list = [];
      [].concat(remote.reviews[mid] || [], local.reviews[mid] || []).forEach(function (rv) {
        if (!rv || !rv.id) rv.id = uid("rv_");
        if (seen[rv.id] || out.deletedReviews[rv.id]) return;
        seen[rv.id] = 1; list.push(rv);
      });
      list.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      if (list.length) out.reviews[mid] = list;
    });

    // ruletas: el documento más nuevo manda (se editan de a una persona)
    out.roulettes = clone((remote.updatedAt >= local.updatedAt ? remote : local).roulettes || []);

    // último resultado por ruleta: el más nuevo
    out.lastResult = {};
    [remote.lastResult, local.lastResult].forEach(function (src) {
      Object.keys(src || {}).forEach(function (rid) { out.lastResult[rid] = src[rid]; });
    });

    out.updatedAt = Math.max(remote.updatedAt || 0, local.updatedAt || 0);
    return normalize(out);
  }

  /* ---------- Supabase REST ---------- */
  var SB = {
    on: !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey),
    row: "main",
    base: (CONFIG.supabaseUrl || "").replace(/\/+$/, "") + "/rest/v1/roulette_state",
    headers: function (extra) {
      var h = {
        "apikey": CONFIG.supabaseAnonKey,
        "Authorization": "Bearer " + CONFIG.supabaseAnonKey,
        "Content-Type": "application/json",
      };
      if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
      return h;
    },
    pull: function () {
      return fetch(SB.base + "?id=eq." + SB.row + "&select=data", { headers: SB.headers() })
        .then(function (r) { if (!r.ok) throw new Error("pull " + r.status); return r.json(); })
        .then(function (rows) { return rows && rows[0] ? normalize(rows[0].data) : null; });
    },
    push: function (doc) {
      return fetch(SB.base + "?on_conflict=id", {
        method: "POST",
        headers: SB.headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ id: SB.row, data: doc, updated_at: new Date().toISOString() }),
      }).then(function (r) { if (!r.ok) throw new Error("push " + r.status); });
    },
  };

  /* ---------- estado en memoria ---------- */
  var state = normalize(lsGet(LS_MIRROR, emptyDoc()));
  var listeners = [];
  var status = { mode: SB.on ? "syncing" : "local", at: 0, error: null };
  var pushTimer = null;
  var pushing = false;
  var pendingMutators = [];

  function emit() { listeners.forEach(function (cb) { try { cb(); } catch (e) {} }); }
  function setStatus(mode, error) { status.mode = mode; status.error = error || null; if (mode === "synced") status.at = nowMs(); emit(); }

  function saveMirror() { lsSet(LS_MIRROR, state); }

  /* Aplica una mutación: optimista en local + encola persistencia remota. */
  function mutate(fn) {
    fn(state);
    state.updatedAt = nowMs();
    state.updatedBy = deviceAuthor();
    ensureOriginal(state);
    saveMirror();
    emit();
    if (SB.on) { pendingMutators.push(fn); schedulePush(); }
    else setStatus("local");
  }

  function schedulePush() {
    if (!SB.on) { setStatus("local"); return; }
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, 700);
  }

  function flushPush() {
    if (!SB.on || pushing || !pendingMutators.length) return;
    pushing = true;
    setStatus("syncing");
    var batch = pendingMutators.slice();
    pendingMutators = [];
    SB.pull().catch(function () { return null; }).then(function (remote) {
      var doc = remote ? mergeDocs(remote, state) : clone(state);
      batch.forEach(function (fn) { try { fn(doc); } catch (e) {} });
      doc.updatedAt = nowMs();
      doc.updatedBy = deviceAuthor();
      ensureOriginal(doc);
      return SB.push(doc).then(function () {
        state = doc; saveMirror(); emit();
        setStatus("synced");
      });
    }).catch(function (e) {
      // volvió a fallar: reponemos los mutators para reintentar luego
      pendingMutators = batch.concat(pendingMutators);
      setStatus("error", String(e && e.message || e));
    }).then(function () {
      pushing = false;
      if (pendingMutators.length) schedulePush();
    });
  }

  /* Trae lo último del server y lo mergea (para ver cambios del otro). */
  function pull() {
    if (!SB.on || pushing || pendingMutators.length) return Promise.resolve();
    return SB.pull().then(function (remote) {
      if (!remote) return;
      var before = JSON.stringify(state);
      var merged = mergeDocs(remote, state);
      if (JSON.stringify(merged) !== before) {
        state = merged; saveMirror(); emit();
      }
      setStatus("synced");
    }).catch(function (e) {
      setStatus("error", String(e && e.message || e));
    });
  }

  /* ---------- identidad del dispositivo ---------- */
  function deviceAuthor() { return lsGetRaw(LS_DEVICE_AUTHOR) || null; }
  function setDeviceAuthor(name) { if (name) lsSetRaw(LS_DEVICE_AUTHOR, name); emit(); }

  /* ---------- ruleta activa ---------- */
  function activeRouletteId() {
    var id = lsGetRaw(LS_ACTIVE_ROULETTE) || ORIGINAL_ID;
    return getRoulette(id) ? id : ORIGINAL_ID;
  }
  function setActiveRouletteId(id) { lsSetRaw(LS_ACTIVE_ROULETTE, id); emit(); }
  function getRoulette(id) {
    return state.roulettes.filter(function (r) { return r.id === id; })[0] || null;
  }

  /* ---------- lecturas ---------- */
  function allMovies() {
    var added = Object.keys(state.movies).map(function (id) {
      var m = state.movies[id];
      return { id: id, title: m.title, year: m.year || null, overview: (m.overview || ""),
               poster: m.poster || null, tmdbQuery: m.tmdbQuery || null, base: false,
               addedBy: m.addedBy || null, order: 10000 + (m.addedAt || 0) };
    });
    return BASE.concat(added);
  }
  function movieById(id) {
    return allMovies().filter(function (m) { return m.id === id; })[0] || null;
  }
  function moviesForRoulette(id) {
    var r = getRoulette(id);
    if (!r) return [];
    var byId = {};
    allMovies().forEach(function (m) { byId[m.id] = m; });
    return (r.movieIds || []).map(function (mid) { return byId[mid]; }).filter(Boolean);
  }

  function reviewsFor(mid) { return (state.reviews[mid] || []).slice().sort(function (a, b) { return a.ts - b.ts; }); }
  function avg(mid) {
    var rs = state.reviews[mid] || [];
    if (!rs.length) return null;
    return rs.reduce(function (s, r) { return s + (r.stars || 0); }, 0) / rs.length;
  }
  function isSeen(m) { return (state.reviews[m.id] || []).length > 0; }
  function metaFor(mid) { return state.meta[mid] || null; }
  function lastResult(rid) { return state.lastResult[rid] || null; }

  /* ---------- escrituras ---------- */
  function addMovie(data) {
    var title = (data.title || "").trim();
    if (!title) return null;
    var id = uid("m_");
    var rid = data.rouletteId || activeRouletteId();
    mutate(function (d) {
      d.movies[id] = {
        id: id, title: title,
        year: data.year ? parseInt(data.year, 10) || null : null,
        overview: (data.overview || "").trim(),
        tmdbQuery: (data.tmdbQuery || "").trim() || null,
        addedBy: data.by || deviceAuthor() || null,
        addedAt: nowMs(),
      };
      var r = d.roulettes.filter(function (x) { return x.id === rid; })[0];
      if (r && r.movieIds.indexOf(id) === -1) r.movieIds.push(id);
    });
    return id;
  }

  function removeAddedMovie(id) {
    mutate(function (d) {
      delete d.movies[id];
      delete d.reviews[id];
      d.roulettes.forEach(function (r) {
        r.movieIds = r.movieIds.filter(function (x) { return x !== id; });
      });
    });
  }

  function createRoulette(name, movieIds) {
    var id = uid("r_");
    mutate(function (d) {
      d.roulettes.push({ id: id, name: (name || "Nueva ruleta").trim(),
                         movieIds: (movieIds || []).slice() });
    });
    return id;
  }
  function updateRoulette(id, patch) {
    mutate(function (d) {
      var r = d.roulettes.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      if (patch.name != null) r.name = patch.name.trim() || r.name;
      if (patch.movieIds != null) r.movieIds = patch.movieIds.slice();
    });
  }
  function deleteRoulette(id) {
    if (id === ORIGINAL_ID) return;
    mutate(function (d) {
      d.roulettes = d.roulettes.filter(function (x) { return x.id !== id; });
      delete d.lastResult[id];
    });
    if (activeRouletteId() === id) setActiveRouletteId(ORIGINAL_ID);
  }

  function addReview(mid, rv) {
    var review = {
      id: uid("rv_"),
      author: rv.author,
      stars: rv.stars,
      note: (rv.note || "").trim(),
      ts: nowMs(),
    };
    mutate(function (d) {
      (d.reviews[mid] = d.reviews[mid] || []);
      if (!d.reviews[mid].some(function (x) { return x.id === review.id; })) {
        d.reviews[mid].push(review);
      }
    });
    return review;
  }
  function deleteReview(mid, rid) {
    mutate(function (d) {
      d.deletedReviews[rid] = nowMs();   // lápida: no vuelve al sincronizar
      if (!d.reviews[mid]) return;
      d.reviews[mid] = d.reviews[mid].filter(function (x) { return x.id !== rid; });
      if (!d.reviews[mid].length) delete d.reviews[mid];
    });
  }

  function setLastResult(rid, mid) {
    mutate(function (d) { d.lastResult[rid] = mid; });
  }

  function saveMeta(mid, meta) {
    mutate(function (d) { d.meta[mid] = Object.assign({}, meta, { at: nowMs() }); });
  }

  /* ---------- export / import ---------- */
  function exportDoc() { return clone(state); }
  function importDoc(obj, replace) {
    var incoming = normalize(obj);
    mutate(function (d) {
      var merged = replace ? incoming : mergeDocs(d, incoming);
      Object.keys(merged).forEach(function (k) { d[k] = merged[k]; });
    });
  }

  /* ---------- init ---------- */
  function init() {
    if (SB.on) {
      pull().then(function () { setInterval(pull, CONFIG.syncPollMs || 20000); });
    } else {
      setStatus("local");
    }
    ensureOriginal(state); saveMirror(); emit();
  }

  return {
    REVIEWERS: REVIEWERS,
    ORIGINAL_ID: ORIGINAL_ID,
    init: init,
    onChange: function (cb) { listeners.push(cb); },
    status: status,
    forceSync: function () { flushPush(); pull(); },

    deviceAuthor: deviceAuthor,
    setDeviceAuthor: setDeviceAuthor,

    roulettes: function () { return state.roulettes.slice(); },
    getRoulette: getRoulette,
    activeRouletteId: activeRouletteId,
    setActiveRouletteId: setActiveRouletteId,
    createRoulette: createRoulette,
    updateRoulette: updateRoulette,
    deleteRoulette: deleteRoulette,

    allMovies: allMovies,
    movieById: movieById,
    moviesForRoulette: moviesForRoulette,
    addMovie: addMovie,
    removeAddedMovie: removeAddedMovie,

    reviewsFor: reviewsFor,
    avg: avg,
    isSeen: isSeen,
    addReview: addReview,
    deleteReview: deleteReview,

    metaFor: metaFor,
    saveMeta: saveMeta,

    lastResult: lastResult,
    setLastResult: setLastResult,

    exportDoc: exportDoc,
    importDoc: importDoc,
  };
})();
