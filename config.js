/* ==================================================================
   Configuración de la Ruleta del Ciclo de Cine.
   Se carga antes que todo lo demás. Editá los valores de acá.
   Todo esto es opcional: sin configurar nada, la página funciona
   guardando los datos solo en este navegador.
================================================================== */
window.CC_CONFIG = {

  /* ---------------------------------------------------------------
     1) TMDb  →  portadas y sinopsis automáticas
     ---------------------------------------------------------------
     Sin key: portada tipográfica + la sinopsis cargada a mano.
     Con key: baja portada + sinopsis de cada película y las comparte
     (quedan guardadas para el otro aunque el otro no tenga key).

     Cómo sacarla (gratis, 2 min):
       1. Cuenta en https://www.themoviedb.org/signup
       2. https://www.themoviedb.org/settings/api  →  "API Key (v3 auth)"
       3. Pegá los 32 caracteres acá abajo.
  --------------------------------------------------------------- */
  tmdbApiKey: "e6f5650d24aec45a4cf921902da0424c",
  tmdbLanguage: "es-ES",

  /* ---------------------------------------------------------------
     OMDb  →  puntaje de IMDb (y de Rotten Tomatoes) en la ficha
     ---------------------------------------------------------------
     IMDb no tiene API pública gratis. OMDb es un servicio de terceros
     que expone el rating de IMDb. Sin esto igual aparece el LINK a
     IMDb y el puntaje de TMDb; con esto aparece también el número
     de IMDb.

     Key gratis (1 min): https://www.omdbapi.com/apikey.aspx
     (elegí "FREE", te llega por mail un link para activarla).
  --------------------------------------------------------------- */
  omdbApiKey: "",

  /* ---------------------------------------------------------------
     Login con Google  →  entrar en un click, sin usuario/contraseña
     ---------------------------------------------------------------
     Sin esto: el botón "Continuar con Google" no aparece (queda el
     login de siempre: invitado / Fran / Juanma).
     Con esto: cualquiera con cuenta de Google puede entrar solo, y
     vos les das permisos (puntuar / agregar películas / administrar
     usuarios) desde el panel de "usuarios" una vez que entraron.

     Cómo sacarlo (gratis, ~3 min):
       1. https://console.cloud.google.com/apis/credentials
       2. "Crear credenciales" → "ID de cliente de OAuth"
          → Tipo de aplicación: "Aplicación web"
       3. En "Orígenes de JavaScript autorizados" agregá la URL donde
          vive la página (ej. https://tu-proyecto.vercel.app). Si la
          probás en localhost, agregá también http://localhost:PUERTO.
       4. Copiá el "ID de cliente" (termina en .apps.googleusercontent.com)
          y pegalo acá abajo.
  --------------------------------------------------------------- */
  googleClientId: "",

  /* ---------------------------------------------------------------
     2) Supabase  →  datos compartidos entre Fran y Juanma
     ---------------------------------------------------------------
     Sin esto, cada navegador guarda lo suyo por separado.
     Con esto, el link se abre en cualquier lado y muestra siempre
     lo último que cargó cualquiera de los dos.

     Setup (una vez, ~5 min): ver SETUP.md
       - Creá un proyecto gratis en https://supabase.com
       - Corré el SQL de SETUP.md en el editor de Supabase
       - Pegá acá la URL del proyecto y la "anon public key"
  --------------------------------------------------------------- */
  supabaseUrl: "https://ronznpkqphzvaqcprbbp.supabase.co",
  supabaseAnonKey: "sb_publishable_7Efl1lO2mFKKXgf5r4fQDg_MLd33iLy",  // publishable key (es pública a propósito)

  /* ---------------------------------------------------------------
     3) Quiénes puntúan (el slicer obligatorio de las notas)
  --------------------------------------------------------------- */
  reviewers: ["Fran", "Juanma"],

  /* Cada cuánto revisar si el otro cargó algo nuevo (ms). */
  syncPollMs: 20000,

  /* ---------------------------------------------------------------
     Sonido de la caja
     ---------------------------------------------------------------
     Por defecto el sonido (tick + reveal) está SINTETIZADO en el
     navegador — no usa archivos, no depende de nada.

     Si querés usar archivos de sonido propios, poné esto en true y
     dejá los archivos en la carpeta `sounds/`:
        sounds/tick.mp3     (o .ogg / .wav / .m4a)
        sounds/reveal.mp3
     Si un archivo no está, cae de nuevo al sonido sintetizado.

     No incluyo los sonidos de CS2: son de Valve y no los puedo
     redistribuir. Si tenés los archivos por tu cuenta, van acá.
  --------------------------------------------------------------- */
  soundPack: false,
};
