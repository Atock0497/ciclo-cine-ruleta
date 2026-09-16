# Setup — dejar la ruleta 100% funcional

La página anda sin configurar nada (guarda todo en el navegador). Estos dos
pasos son para: **(1)** que los datos se compartan entre Fran y Juanma en
cualquier dispositivo, y **(2)** que aparezcan portadas y sinopsis solas.

Los dos son gratis. Todo se pega en `config.js`.

---

## 1) Supabase — datos compartidos  ✅ YA CONFIGURADO

Ya está puesto en `config.js` (proyecto `ronznpkqphzvaqcprbbp`, tabla creada y
probada). Esta sección queda como referencia por si alguna vez hay que rehacerlo.

Sin esto, cada navegador guarda lo suyo. Con esto, el link muestra siempre lo
último que cargó cualquiera de los dos.

1. Entrá a <https://supabase.com> → **Start your project** (se puede entrar con GitHub).
2. **New project**. Ponele un nombre (ej. `ciclo-cine`), una contraseña de base
   de datos (guardala aunque no la vas a usar acá), y la región más cercana.
   Esperá ~2 min a que termine de crearse.
3. En el menú de la izquierda: **SQL Editor** → **New query**. Pegá esto y dale **Run**:

   ```sql
   create table if not exists roulette_state (
     id text primary key,
     data jsonb not null default '{}'::jsonb,
     updated_at timestamptz not null default now()
   );

   alter table roulette_state enable row level security;

   create policy "lectura anon"  on roulette_state for select using (true);
   create policy "insert anon"   on roulette_state for insert with check (true);
   create policy "update anon"   on roulette_state for update using (true) with check (true);

   insert into roulette_state (id, data) values ('main', '{}'::jsonb)
   on conflict (id) do nothing;
   ```

4. Menú izquierdo: **Project Settings** (el engranaje) → **API**. Copiá:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **Project API keys → `anon` `public`** (una clave larga)

5. Pegalas en `config.js`:

   ```js
   supabaseUrl: "https://abcdefgh.supabase.co",
   supabaseAnonKey: "eyJhbGci...",   // la anon public
   ```

6. Volvé a subir la carpeta a Vercel (drag & drop). Listo: desde ahí, cualquiera
   que abra el link ve y edita lo mismo.

**Sobre seguridad:** la `anon key` es pública a propósito (va en el código del
sitio). Cualquiera que tenga el link de Vercel podría, técnicamente, leer o
escribir las puntuaciones. Para un ciclo de cine entre dos está bien. Si algún
día molesta, se le puede poner una capa extra.

**Nota:** los proyectos gratis de Supabase se "pausan" si no se usan por ~1
semana. Si eso pasa, entrás al panel y le das **Restore** (un botón). Mientras
tanto la página sigue andando con lo último que tenía guardado local.

---

## 2) TMDb — portadas y sinopsis  ✅ YA CONFIGURADO

La key ya está en `config.js` y probada (bajan portadas y sinopsis en español).
Referencia por si hay que rehacerla:

1. Cuenta gratis en <https://www.themoviedb.org/signup>
2. <https://www.themoviedb.org/settings/api> → **Request an API Key** → tipo
   **Developer** / uso personal. Completá lo que pide (podés poner cualquier
   cosa razonable en URL: `http://localhost`).
3. Copiá la **API Key (v3 auth)** — 32 caracteres.
4. Pegala en `config.js`:

   ```js
   tmdbApiKey: "0123456789abcdef0123456789abcdef",
   ```

Con Supabase configurado, alcanza con que **uno solo** de los dos tenga la key:
las portadas que baja quedan guardadas y el otro las ve igual.

---

## 3) Login con Google + permisos por usuario  (opcional)

Sin esto, el login sigue siendo el de siempre: invitado / Fran / Juanma con
contraseña. Con esto se agrega un botón **"Continuar con Google"**: cualquiera
entra en un click con su cuenta, sin pedirte usuario ni clave.

1. Andá a <https://console.cloud.google.com/apis/credentials> (con cualquier
   cuenta de Google; si nunca usaste Google Cloud te va a pedir crear un
   proyecto primero, cualquier nombre sirve).
2. **Crear credenciales** → **ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: agregá la URL donde vive la
     página (ej. `https://tu-proyecto.vercel.app`, sin `/` al final). Si la
     probás en tu PC, agregá también `http://localhost:PUERTO`.
   - No hace falta cargar "URI de redireccionamiento": este login usa el
     flujo de un solo click (Google Identity Services), no redirige a
     ningún lado.
3. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) y
   pegalo en `config.js`:

   ```js
   googleClientId: "123456789-abc...apps.googleusercontent.com",
   ```

4. Volvé a subir la carpeta. Listo: aparece el botón de Google en el login.

**Cómo funcionan los permisos:** la primera persona que entre alguna vez con
Google queda automáticamente con todos los permisos (para que no quede nadie
sin poder administrar). Todo el que entre después arranca **solo con
"jugar"** (mirar la cartelera y girar la ruleta), hasta que alguien con el
permiso "Administrar usuarios" le habilite lo demás desde el botón
**"usuarios"** que aparece al lado de "salir" una vez que entraste. Ahí se
puede tildar, por persona: **puntuar**, **agregar películas** y
**administrar usuarios** — y también quitarle el acceso a alguien.

Fran y Juanma (las cuentas con contraseña de siempre) no se tocan: siguen
teniendo todos los permisos como hasta ahora, sean o no las que entren con
Google.

**Sobre seguridad:** al igual que el resto del login de esta página (ver más
abajo), esto es un gate de comodidad, no una barrera real: los permisos se
guardan en el mismo documento compartido de Supabase y no hay ningún
servidor que verifique la identidad de Google — alguien con conocimientos
técnicos podría, en teoría, saltárselo. Para un ciclo de cine entre amigos
está bien.

---

## Backup

En el pie de la página hay **Exportar datos** (te baja un `.json` con todo) e
**Importar datos** (lo vuelve a cargar y combina). Útil antes de tocar algo o
para no depender de ningún servicio.
