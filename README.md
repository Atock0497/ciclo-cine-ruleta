# La Ruleta del Ciclo de Cine

Página web para el ciclo de cine de Fran y Juanma:

- Ruleta que sortea qué película ver.
- Al salir una, aparece su **portada + sinopsis** y una solapa para **puntuarla
  y dejar una nota** (firmada obligatoriamente por Fran o Juanma).
- Se pueden **agregar películas** desde la página.
- Se pueden armar **ruletas propias** aparte (ej. "solo terror") sin tocar el
  ciclo original.
- Con Supabase configurado, todo se **comparte**: el link se abre en cualquier
  navegador y muestra lo último que cargó cualquiera.

Sin build ni dependencias. Son archivos estáticos.

## Puesta a punto

La página funciona apenas la abrís. Para compartir datos entre dispositivos y
tener portadas automáticas: **ver [SETUP.md](SETUP.md)** (dos pasos gratis).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página. |
| `styles.css` | Diseño. |
| `config.js` | **Configuración**: keys de Supabase y TMDb, nombres del slicer. |
| `movies.js` | **Lista base** de películas (las 86 del ciclo original). |
| `store.js` | Estado compartido: sincronización, merge, guardado. |
| `app.js` | Interfaz. |
| `SETUP.md` | Cómo configurar Supabase + TMDb. |

## Editar la lista base

`movies.js`, cada película es un objeto:

```js
{ id: "el-padrino", title: "El Padrino (1, 2 y 3)", year: 1972,
  overview: "La saga de Coppola…", tmdbQuery: "The Godfather" }
```

- `id`: único y **estable** (no lo cambies si ya tiene puntuaciones).
- `overview` y `tmdbQuery` son opcionales.

Las películas agregadas desde la página **no** van acá: van al estado
compartido (Supabase o localStorage). `movies.js` es solo la semilla del ciclo
original.

## Dónde se guardan los datos

- **Sin Supabase:** en el `localStorage` de cada navegador, por separado.
- **Con Supabase:** en una tabla (`roulette_state`, una fila con un JSON), y se
  sincroniza. Cada ~20 s la página revisa si el otro cargó algo.
- Siempre queda un espejo local, así anda sin internet y no se pierde nada.
- Pie de página: **Exportar / Importar datos** (backup en `.json`).

## Probar en local

Doble clic a `index.html` alcanza. Para una prueba más fiel:

```powershell
python -m http.server 8765
# http://localhost:8765
```

## Deploy en Vercel (drag & drop)

1. <https://vercel.com/drop>
2. Arrastrá **la carpeta completa** (la que tiene `index.html`).
3. Te da la URL. Ese es el link para compartir.

Cada cambio de archivos: volvés a arrastrar la carpeta. Si un cambio de CSS/JS
no se ve, subí el `?v=` de los `<link>`/`<script>` en `index.html`.

### Alternativa: repo de Git

1. Instalar Git, `git init`, `git add .`, `git commit`.
2. Subir a GitHub.
3. Vercel → **Add New… → Project → Import**. Framework: **Other**. Build: vacío.
   Output: `.`.
4. Cada `git push` redeploya.

## Ideas para después

- Sacar del sorteo las ya vistas (checkbox "no repetir").
- Marcar "la quiero ver" / "paso".
- Que la nota admita más de dos personas (ya está en `config.js: reviewers`,
  pero el diseño del slicer asume dos).
