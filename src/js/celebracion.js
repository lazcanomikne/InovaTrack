// Celebración reutilizable: sonido "ka-ching" de caja registradora,
// confeti sobre la pantalla y un cartel "¡Excelente!".

let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) audioCtx = new C();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
// iOS exige desbloquear el audio dentro de un gesto: reanudamos el contexto en
// cualquier interacción, así el sonido puede sonar aunque llegue tras un await.
if (typeof window !== 'undefined') {
  const desbloquear = () => ctx();
  ['touchend', 'pointerup', 'click', 'keydown'].forEach((e) =>
    window.addEventListener(e, desbloquear, { passive: true }));
}

// "Ka-ching": un clic mecánico corto + una campanita (varios armónicos).
function kaching() {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  const tono = (freq, start, dur, vol, type = 'triangle') => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t + start);
    g.gain.exponentialRampToValueAtTime(vol, t + start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
    o.start(t + start);
    o.stop(t + start + dur + 0.02);
  };
  tono(2200, 0, 0.04, 0.08, 'square'); // "ka" (clic de la caja)
  tono(1046.5, 0.05, 0.45, 0.30);      // "ching" C6
  tono(1318.5, 0.05, 0.55, 0.26);      //         E6
  tono(1567.9, 0.07, 0.50, 0.20);      //         G6
}

const COLORES = ['#5b5bd6', '#7c6cf0', '#ff9f0a', '#34c759', '#ff453a', '#ffd60a', '#0a84ff', '#ff2d92'];

function inyectarEstilos() {
  if (document.getElementById('celebra-css')) return;
  const s = document.createElement('style');
  s.id = 'celebra-css';
  s.textContent = `
  .celebra-overlay{position:fixed;inset:0;z-index:99999;pointer-events:none;display:flex;align-items:center;justify-content:center}
  .celebra-overlay canvas{position:absolute;inset:0}
  .celebra-banner{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;
    font-size:42px;font-weight:900;color:#fff;letter-spacing:-.02em;
    background:linear-gradient(135deg,#5b5bd6,#7c6cf0);padding:20px 34px;border-radius:24px;
    box-shadow:0 14px 44px rgba(91,91,214,.5);transform:scale(0);
    animation:celebra-pop 4.4s cubic-bezier(.2,.8,.2,1) forwards;text-shadow:0 2px 8px rgba(0,0,0,.15)}
  .celebra-copa{font-size:60px;line-height:1;filter:drop-shadow(0 5px 12px rgba(0,0,0,.25));
    animation:celebra-copa 4.4s ease-in-out}
  @keyframes celebra-copa{0%,100%{transform:rotate(0)}8%{transform:rotate(-12deg)}16%{transform:rotate(12deg)}24%{transform:rotate(-6deg)}32%{transform:rotate(0)}}
  @keyframes celebra-pop{
    0%{transform:scale(0) rotate(-8deg);opacity:0}
    8%{transform:scale(1.18) rotate(3deg);opacity:1}
    16%{transform:scale(1) rotate(0)}
    88%{transform:scale(1);opacity:1}
    100%{transform:scale(.92);opacity:0}}`;
  document.head.appendChild(s);
}

function confeti(mensaje) {
  const cont = document.createElement('div');
  cont.className = 'celebra-overlay';
  const canvas = document.createElement('canvas');
  const banner = document.createElement('div');
  banner.className = 'celebra-banner';
  banner.innerHTML = `<span class="celebra-copa">🏆</span><span>${mensaje}</span>`;
  cont.appendChild(canvas);
  cont.appendChild(banner);
  document.body.appendChild(cont);

  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const parts = [];
  for (let i = 0; i < 150; i++) {
    parts.push({
      x: W / 2 + (Math.random() - 0.5) * 140,
      y: H * 0.38 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -11 - 4,
      g: 0.26 + Math.random() * 0.14,
      size: 6 + Math.random() * 7,
      color: COLORES[(Math.random() * COLORES.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
      delay: Math.random() * 1800, // se lanzan escalonados para durar más
    });
  }

  const dur = 4600;
  let inicio = null;
  function frame(ts) {
    if (!inicio) inicio = ts;
    const prog = ts - inicio;
    g.clearRect(0, 0, W, H);
    for (const c of parts) {
      const local = prog - c.delay;
      if (local < 0) continue; // aún no se lanza
      c.vy += c.g;
      c.x += c.vx;
      c.y += c.vy;
      c.vx *= 0.99;
      c.rot += c.vr;
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      g.globalAlpha = Math.max(0, 1 - local / 2600); // cada pieza se desvanece en su propia vida
      g.fillStyle = c.color;
      if (c.shape === 'rect') g.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      else { g.beginPath(); g.arc(0, 0, c.size / 2, 0, 7); g.fill(); }
      g.restore();
    }
    if (prog < dur && document.body.contains(cont)) requestAnimationFrame(frame);
    else cont.remove();
  }
  requestAnimationFrame(frame);
  setTimeout(() => cont.remove(), dur + 500);
}

export function celebrar(mensaje = '¡Excelente!') {
  inyectarEstilos();
  kaching();
  confeti(mensaje);
}
