// Эффекты лаунчера: звук кнопок и падающие домино на фоне.
(() => {
  // Управление эффектами (переключается из настроек)
  const fxControl = { sounds: true, dominoes: true };
  window.fxControl = fxControl;

  // ---------- Звук (WebAudio, без файлов) ----------
  let actx = null;
  let noiseBuf = null;
  const audio = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

  function noise() {
    const a = audio();
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 0.1, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  // Мягкий щелчок: короткий приглушённый импульс шума + лёгкая округлая «подушка».
  function softClick() {
    if (!fxControl.sounds) return;
    try {
      const a = audio();
      const t = a.currentTime;

      const src = noise();
      const hp = a.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      const bp = a.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 1.2;
      const g1 = a.createGain();
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.linearRampToValueAtTime(0.12, t + 0.004);
      g1.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
      src.connect(hp).connect(bp).connect(g1).connect(a.destination);
      src.start(t);
      src.stop(t + 0.06);

      const osc = a.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      const g2 = a.createGain();
      g2.gain.setValueAtTime(0.05, t);
      g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
      osc.connect(g2).connect(a.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch { /* звук не критичен */ }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('button')) softClick();
  }, true);

  // ---------- Падающие домино ----------
  const canvas = document.getElementById('fx');
  if (!canvas) return;
  const g = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const COUNT = 14;
  const tiles = [];

  function spawn(above) {
    const w = 24 + Math.random() * 22;
    return {
      w, h: w * 2,
      x: Math.random() * W,
      y: above ? -w * 2 - Math.random() * H * 0.6 : Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15,
      vy: 0.12 + Math.random() * 0.35,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.006,
      p1: 1 + Math.floor(Math.random() * 6),
      p2: 1 + Math.floor(Math.random() * 6)
    };
  }
  for (let i = 0; i < COUNT; i++) tiles.push(spawn(false));

  const mouse = { x: -1e4, y: -1e4, dx: 0, dy: 0 };
  window.addEventListener('mousemove', e => {
    mouse.dx = e.clientX - mouse.x;
    mouse.dy = e.clientY - mouse.y;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // Расположение точек на половинке костяшки (сетка -1..1)
  const PIPS = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  };

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawHalf(cy, w, n) {
    const s = w * 0.2;
    const r = w * 0.075;
    for (const [px, py] of PIPS[n] || []) {
      g.beginPath();
      g.arc(px * s, cy + py * s, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawTile(t) {
    g.save();
    g.translate(t.x, t.y);
    g.rotate(t.a);
    g.globalAlpha = 0.9;
    roundRect(-t.w / 2, -t.h / 2, t.w, t.h, t.w * 0.16);
    g.fillStyle = '#eceadf';
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 10;
    g.shadowOffsetY = 4;
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = 'rgba(40,40,40,.7)';
    g.beginPath();
    g.moveTo(-t.w / 2 + t.w * 0.14, 0);
    g.lineTo(t.w / 2 - t.w * 0.14, 0);
    g.stroke();
    g.fillStyle = '#23262e';
    drawHalf(-t.h / 4, t.w, t.p1);
    drawHalf(t.h / 4, t.w, t.p2);
    g.restore();
  }

  function step() {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];

      // смахивание курсором: передаём скорость мыши + расталкивание
      const dist = Math.hypot(t.x - mouse.x, t.y - mouse.y);
      const R = 95;
      if (dist < R) {
        const k = 1 - dist / R;
        t.vx += mouse.dx * 0.14 * k + ((t.x - mouse.x) / Math.max(dist, 1)) * 0.7 * k;
        t.vy += mouse.dy * 0.14 * k + ((t.y - mouse.y) / Math.max(dist, 1)) * 0.7 * k;
        t.va += (mouse.dx * 0.0006 + (Math.random() - 0.5) * 0.02) * k;
      }

      t.vy += 0.007;                   // гравитация (мягкая)
      t.vx *= 0.99;
      t.va *= 0.995;
      if (t.vy > 2.6) t.vy = 2.6;      // потолок скорости падения
      t.x += t.vx;
      t.y += t.vy;
      t.a += t.va;

      if (t.y > H + t.h || t.x < -160 || t.x > W + 160) tiles[i] = spawn(true);
      else drawTile(t);
    }
    mouse.dx = 0;
    mouse.dy = 0;
    rafId = requestAnimationFrame(step);
  }

  let rafId = null;
  function startDominoes() {
    canvas.style.display = '';
    if (!rafId) rafId = requestAnimationFrame(step);
  }
  function stopDominoes() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    g.clearRect(0, 0, W, H);
    canvas.style.display = 'none';
  }

  fxControl.setSounds = v => { fxControl.sounds = !!v; };
  fxControl.setDominoes = v => {
    fxControl.dominoes = !!v;
    if (v) startDominoes(); else stopDominoes();
  };

  startDominoes();
})();
