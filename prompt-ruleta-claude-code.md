# Prompt para Claude Code — Ruleta del Ciclo de Cine

Pegá todo este archivo como primer mensaje en Claude Code (en la carpeta donde quieras armar el proyecto).

---

Quiero convertir un prototipo de página web en un proyecto real para seguir iterando en Claude Code.

## Qué es

Es una "ruleta" (rueda tipo casino) para sortear qué película ver en un ciclo de cine que organizo. Tengo una lista de ~86 películas guardada en Google Keep, y armé un primer prototipo como página HTML autocontenida (sin build, JS vanilla + Canvas) con esta idea:

- Estética de cine/marquesina: fondo oscuro tipo sala de cine, acentos dorado y rojo, tipografía Bebas Neue (títulos) + Work Sans (texto), con lucecitas de marquesina animadas.
- Una rueda dibujada en `<canvas>` con una porción por película, puntero fijo arriba, y un botón "Girar la ruleta" que la hace girar con una animación de desaceleración y cae en una película al azar.
- Una "ticket" (tarjeta estilo entrada de cine) arriba de la rueda que muestra el resultado de un sorteo puntual, incluyendo dónde se puede ver esa película en streaming en Argentina (plataformas por suscripción, alquiler/compra, o si se consigue gratis).
- Un listado completo ("cartelera") con las 86 películas abajo, para referencia, resaltando cuál salió sorteada.

Te paso el HTML del prototipo completo como punto de partida (guardalo como `index.html` o usalo de referencia para migrar a componentes):

```html
<title>Ruleta del Ciclo de Cine</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Work+Sans:wght@400;500;600;700&display=swap">
<style>
  :root{
    --bg:#0f0b14;
    --bg-raised:#1b1421;
    --bg-raised-2:#241a2b;
    --gold:#d9b06a;
    --gold-dim:#8a744c;
    --red:#c8362f;
    --red-dim:#7a231f;
    --ivory:#f2ead9;
    --ivory-dim:#b6a897;
    --line:#3a2c3f;
    font-family:"Work Sans",ui-sans-serif,system-ui,sans-serif;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    background:
      radial-gradient(ellipse 120% 80% at 50% -10%, #2a1c30 0%, var(--bg) 55%),
      var(--bg);
    color:var(--ivory);
    padding:32px 16px 56px;
    min-height:100vh;
  }
  .wrap{
    max-width:880px;
    margin:0 auto;
    display:flex;
    flex-direction:column;
    gap:28px;
  }

  /* ---------- Marquee header ---------- */
  header{ text-align:center; }
  .eyebrow{
    font-size:12px;
    letter-spacing:.22em;
    text-transform:uppercase;
    color:var(--gold);
    font-weight:600;
  }
  h1{
    font-family:"Bebas Neue",ui-sans-serif,sans-serif;
    font-size:clamp(40px,9vw,64px);
    line-height:1;
    letter-spacing:.03em;
    margin:6px 0 4px;
    text-wrap:balance;
    background:linear-gradient(180deg,#fff6df 0%,var(--gold) 55%,#a9843f 100%);
    -webkit-background-clip:text;
    background-clip:text;
    color:transparent;
    text-shadow:0 2px 24px rgba(217,176,106,.25);
  }
  .sub{
    color:var(--ivory-dim);
    font-size:15px;
    max-width:46ch;
    margin:0 auto;
  }
  .bulbs{
    display:flex;
    justify-content:center;
    gap:8px;
    margin-top:14px;
  }
  .bulb{
    width:6px;height:6px;border-radius:50%;
    background:var(--gold);
    box-shadow:0 0 6px 1px rgba(217,176,106,.7);
    animation:flicker 2.6s ease-in-out infinite;
  }
  .bulb:nth-child(odd){animation-delay:.6s;}
  .bulb:nth-child(3n){animation-delay:1.2s;}
  @keyframes flicker{
    0%,100%{opacity:1;}
    50%{opacity:.35;}
  }

  /* ---------- Ticket: today's official draw ---------- */
  .ticket{
    background:linear-gradient(155deg,var(--bg-raised-2),var(--bg-raised));
    border:1px solid var(--line);
    border-radius:16px;
    padding:22px 24px;
    position:relative;
    overflow:hidden;
  }
  .ticket::before{
    content:"";
    position:absolute; inset:0;
    background:
      repeating-linear-gradient(90deg, transparent 0 14px, rgba(217,176,106,.05) 14px 15px);
    pointer-events:none;
  }
  .ticket-row{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:20px;
    flex-wrap:wrap;
  }
  .ticket-label{
    font-size:11px;
    letter-spacing:.18em;
    text-transform:uppercase;
    color:var(--gold);
    font-weight:600;
    margin-bottom:6px;
  }
  .ticket-title{
    font-family:"Bebas Neue",sans-serif;
    font-size:clamp(30px,6vw,40px);
    letter-spacing:.02em;
    line-height:1.02;
  }
  .stamp{
    flex:0 0 auto;
    border:2px solid var(--red);
    color:var(--red);
    font-family:"Bebas Neue",sans-serif;
    font-size:13px;
    letter-spacing:.14em;
    padding:6px 10px;
    border-radius:6px;
    transform:rotate(6deg);
    white-space:nowrap;
  }
  .stream-list{
    margin-top:16px;
    display:flex;
    flex-wrap:wrap;
    gap:10px;
  }
  .chip{
    display:flex;
    align-items:center;
    gap:8px;
    background:var(--bg);
    border:1px solid var(--line);
    border-radius:999px;
    padding:7px 14px 7px 10px;
    font-size:13.5px;
  }
  .chip .dot{
    width:9px;height:9px;border-radius:50%;
  }
  .chip.buy .dot{background:var(--gold);}
  .chip.free .dot{background:#7fb27a;}
  .chip.no .dot{background:var(--ivory-dim);}
  .chip b{font-weight:600;}
  .ticket-note{
    margin-top:14px;
    font-size:13px;
    color:var(--ivory-dim);
    border-top:1px dashed var(--line);
    padding-top:12px;
  }

  /* ---------- Wheel section ---------- */
  .wheel-section{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:18px;
  }
  .wheel-frame{
    position:relative;
    width:min(420px, 84vw);
    aspect-ratio:1/1;
  }
  .pointer{
    position:absolute;
    top:-14px;
    left:50%;
    transform:translateX(-50%);
    width:0; height:0;
    border-left:14px solid transparent;
    border-right:14px solid transparent;
    border-top:22px solid var(--gold);
    filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));
    z-index:3;
  }
  canvas#wheel{
    width:100%;
    height:100%;
    border-radius:50%;
    box-shadow:
      0 0 0 6px var(--bg-raised),
      0 0 0 8px var(--gold-dim),
      0 20px 46px -12px rgba(0,0,0,.65);
    background:var(--bg-raised);
  }
  .hub{
    position:absolute;
    top:50%; left:50%;
    width:15%; aspect-ratio:1/1;
    transform:translate(-50%,-50%);
    background:radial-gradient(circle at 35% 30%, #fff2cf, var(--gold) 60%, var(--gold-dim) 100%);
    border-radius:50%;
    box-shadow:0 2px 10px rgba(0,0,0,.5);
    z-index:2;
  }
  button#spin{
    font-family:"Bebas Neue",sans-serif;
    font-size:20px;
    letter-spacing:.1em;
    color:#2a1608;
    background:linear-gradient(180deg,#f0cd85,var(--gold) 60%,#b98d47);
    border:none;
    border-radius:999px;
    padding:13px 38px;
    cursor:pointer;
    box-shadow:0 8px 18px -6px rgba(217,176,106,.55), inset 0 1px 0 rgba(255,255,255,.5);
    transition:transform .15s ease, box-shadow .15s ease;
  }
  button#spin:hover{ transform:translateY(-1px); }
  button#spin:active{ transform:translateY(1px); box-shadow:0 4px 10px -4px rgba(217,176,106,.5); }
  button#spin:disabled{ opacity:.55; cursor:default; transform:none; }
  button#spin:focus-visible{ outline:2px solid var(--ivory); outline-offset:3px; }

  #spinResult{
    min-height:1.4em;
    text-align:center;
    font-size:15px;
    color:var(--ivory-dim);
  }
  #spinResult b{
    color:var(--ivory);
    font-weight:600;
  }
  #spinResult .hint{
    display:block;
    margin-top:4px;
    font-size:12.5px;
    color:var(--gold-dim);
  }

  /* ---------- Cartelera (full list) ---------- */
  .cartelera{
    background:var(--bg-raised);
    border:1px solid var(--line);
    border-radius:16px;
    padding:18px 20px 6px;
  }
  .cartelera h2{
    font-family:"Bebas Neue",sans-serif;
    font-size:22px;
    letter-spacing:.05em;
    margin:0 0 4px;
    color:var(--gold);
  }
  .cartelera p{
    margin:0 0 14px;
    font-size:13px;
    color:var(--ivory-dim);
  }
  .film-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(190px,1fr));
    gap:0;
    max-height:340px;
    overflow-y:auto;
    padding-bottom:14px;
  }
  .film-grid::-webkit-scrollbar{ width:8px; }
  .film-grid::-webkit-scrollbar-thumb{ background:var(--line); border-radius:4px; }
  .film{
    font-size:13.5px;
    padding:6px 10px 6px 0;
    color:var(--ivory-dim);
    border-bottom:1px solid var(--line);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .film.winner{
    color:var(--gold);
    font-weight:600;
  }
  .film span.n{
    color:var(--gold-dim);
    font-variant-numeric:tabular-nums;
    margin-right:8px;
    font-size:11.5px;
  }

  footer{
    text-align:center;
    font-size:12px;
    color:var(--gold-dim);
    letter-spacing:.04em;
  }

  @media (prefers-reduced-motion: reduce){
    .bulb{ animation:none; }
  }
</style>

<div class="wrap">

  <header>
    <div class="eyebrow">Fjbarrientoss carpteam0 · Ciclo de cine</div>
    <h1>La Ruleta del Ciclo</h1>
    <p class="sub">86 películas de tu lista de Keep, una ruleta y el sorteo oficial de hoy.</p>
    <div class="bulbs">
      <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
      <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
      <span class="bulb"></span>
    </div>
  </header>

  <section class="ticket">
    <div class="ticket-row">
      <div>
        <div class="ticket-label">Sorteo oficial de hoy</div>
        <div class="ticket-title">Apocalypto</div>
      </div>
      <div class="stamp">Salió sorteada</div>
    </div>

    <div class="stream-list">
      <div class="chip no"><span class="dot"></span> Sin suscripción en AR <b>(Netflix / Prime / Disney+ / HBO — no)</b></div>
      <div class="chip buy"><span class="dot"></span> Alquiler / compra en <b>Claro Video</b></div>
      <div class="chip buy"><span class="dot"></span> Alquiler en <b>Google Play Películas</b></div>
      <div class="chip free"><span class="dot"></span> Se la encuentra <b>gratis en YouTube</b> (no oficial)</div>
    </div>

    <div class="ticket-note">
      No está en ninguna plataforma por suscripción en Argentina ahora mismo. Se consigue alquilada o comprada en Claro Video y Google Play, y circula gratis en YouTube (probablemente no oficial, revisá la calidad antes de confiar en ella).
    </div>
  </section>

  <section class="wheel-section">
    <div class="wheel-frame">
      <div class="pointer"></div>
      <canvas id="wheel" width="800" height="800"></canvas>
      <div class="hub"></div>
    </div>
    <button id="spin">Girar la ruleta</button>
    <div id="spinResult">Tocá "Girar la ruleta" para otro sorteo cualquier noche.
      <span class="hint">El sorteo de hoy (arriba) ya salió: Apocalypto.</span>
    </div>
  </section>

  <section class="cartelera">
    <h2>Cartelera completa</h2>
    <p>Las 86 películas que entraron en la ruleta.</p>
    <div class="film-grid" id="filmGrid"></div>
  </section>

  <footer>Datos de streaming: JustWatch y El Destape · Argentina, septiembre 2026</footer>
</div>

<script>
(function(){
  const movies = [
    "Colony (peli zombis coreanos)","Suicide Club (2001)","El polaquito","Madame Tutli Putli",
    "La Naranja Mecánica","El padrino 1,2,3","Reservoir Dogs","Pluribus","El Camino","El irlandés",
    "Amelie","Obsession","Apostle","Dark water","Caveat","I am not a serial killer","Butterfly kisses",
    "Loner","El padre","Incendies","Lost in translation","La piel que habito","The handmaiden",
    "The Witch","Matrix","Martyrs","The green mile","Sueño de libertad","Batman de Nolan",
    "La lista de Schindler","Señor de los anillos","El bueno el malo y el feo","Casino",
    "Lo que el viento se llevó","La forma del agua","Interestelar","Seven","El mago de Oz",
    "El silencio de los inocentes","Historia de un matrimonio","Memento","Rescatando al soldado Ryan",
    "Ciudad de Dios","Sicario","La la land","Los miserables","Metropolis","Poltergeist","El pianista",
    "Curas zombis en azul","Parasite","El laberinto del fauno","La ventana indiscreta","Alien saga",
    "Old boy","Joker","Sinister","Quien quiere ser millonario","Atrápame si puedes","Climax",
    "Insidious","La llamada","El grito","Pesadilla en la calle Elm","Viernes 13","Halloween",
    "Chainsaw Massacre","Scream","Diamantes de sangre","Apocalypto","High School Musical 1,2,3",
    "The taste of tea","Dune","Project hail mary","Odisea","2001: Space Odyssey","Marty Supreme",
    "Backrooms","Truman Show","El lobo de Wall Street","Funny games","Chronicle","Pontypool","Akira",
    "Los 8 más odiados","Killer Clowns"
  ];

  const WINNER = "Apocalypto";
  const N = movies.length;
  const TAU = Math.PI * 2;
  const slice = TAU / N;

  const palette = ["#c8362f","#1b1421","#7a231f","#241a2b"];

  const canvas = document.getElementById("wheel");
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const cx = size/2, cy = size/2, r = size/2 - 6;

  function drawWheel(rotation){
    ctx.clearRect(0,0,size,size);
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(rotation);

    for(let i=0;i<N;i++){
      const start = i*slice;
      const end = start+slice;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,r,start,end);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();

      ctx.save();
      ctx.rotate(start + slice/2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f2ead9";
      ctx.font = "13px 'Work Sans', sans-serif";
      let label = movies[i];
      if(label.length > 24) label = label.slice(0,22) + "…";
      ctx.fillText(label, r - 14, 0);
      ctx.restore();
    }

    // rim ticks
    ctx.strokeStyle = "rgba(217,176,106,.35)";
    ctx.lineWidth = 1;
    for(let i=0;i<N;i++){
      const a = i*slice;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*(r-2), Math.sin(a)*(r-2));
      ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      ctx.stroke();
    }

    ctx.restore();
  }

  let currentRotation = -Math.PI/2; // start with slice 0 under pointer
  drawWheel(currentRotation);

  const spinBtn = document.getElementById("spin");
  const resultEl = document.getElementById("spinResult");
  let spinning = false;

  function angleForIndex(idx){
    // pointer is fixed at top (-90deg). We want slice idx's center under the pointer.
    const center = idx*slice + slice/2;
    return -Math.PI/2 - center;
  }

  spinBtn.addEventListener("click", function(){
    if(spinning) return;
    spinning = true;
    spinBtn.disabled = true;
    resultEl.innerHTML = "Girando…";

    const targetIdx = Math.floor(Math.random()*N);
    const extraTurns = 5 + Math.floor(Math.random()*3);
    const targetAngle = angleForIndex(targetIdx) - extraTurns*TAU;

    const startAngle = currentRotation;
    const totalDelta = targetAngle - startAngle;

    const duration = 4200;
    const t0 = performance.now();

    function easeOutQuint(t){ return 1 - Math.pow(1-t,5); }

    function frame(now){
      const t = Math.min(1, (now - t0)/duration);
      const eased = easeOutQuint(t);
      const angle = startAngle + totalDelta*eased;
      drawWheel(angle);
      if(t < 1){
        requestAnimationFrame(frame);
      } else {
        currentRotation = angle;
        spinning = false;
        spinBtn.disabled = false;
        const winnerName = movies[targetIdx];
        resultEl.innerHTML = 'Salió: <b>' + winnerName + '</b>' +
          '<span class="hint">' +
          (winnerName === WINNER
            ? 'Coincide con el sorteo oficial de hoy — mirá el ticket de arriba.'
            : 'Pedile a Claude que revise si está en alguna plataforma de streaming.') +
          '</span>';
      }
    }
    requestAnimationFrame(frame);
  });

  // Cartelera list
  const grid = document.getElementById("filmGrid");
  movies.forEach(function(title, i){
    const div = document.createElement("div");
    div.className = "film" + (title === WINNER ? " winner" : "");
    div.innerHTML = '<span class="n">' + String(i+1).padStart(2,"0") + '</span>' + title;
    grid.appendChild(div);
  });
})();
</script>
```

## Lo que quiero mantener sí o sí

- La idea de la ruleta como página web (no una app nativa).
- La estética "cine/marquesina" oscura, con dorado y rojo, Bebas Neue + Work Sans.
- Que la rueda gire de forma visual (canvas o svg, lo que prefieras) y caiga en una película al azar con un puntero fijo.
- El listado completo de películas visible en algún lado.

## Lo que quiero que armes ahora

1. Un proyecto real (mi stack habitual es **React + Vite**, pero si para algo tan chico preferís mantenerlo como HTML/JS plano sin build, decime por qué y lo evaluamos — no hace falta forzar React si no aporta).
2. Sacar la lista de películas del código a un archivo de datos separado (JSON o similar) para poder editarla fácil a futuro (agregar, sacar, marcar como "vista").
3. Dejarlo listo para deployar en Vercel. Normalmente yo empaqueto y subo por drag-and-drop en vercel.com/drop, pero si te parece mejor dejarlo conectado a un repo de git, decime los pasos.
4. No hace falta automatizar la búsqueda de streaming todavía — eso lo resuelvo yo a mano por ahora. Enfoquémonos en dejar la mecánica de la ruleta y el proyecto bien armados.

Antes de ponerte a programar, si tenés dudas sobre alcance (por ejemplo si React/Vite vale la pena para esto, o cómo estructurar los datos) preguntame.

---
