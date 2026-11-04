/* Фон: одинаковые лепестки вишни в обеих темах.
   Лёгкий canvas: пауза в фоновой вкладке, ничего не двигается при prefers-reduced-motion. */
(() => {
  const c = document.getElementById('fx');
  if (!c) return;
  const ctx = c.getContext('2d'), root = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const PETALS = ['#ffb7d2', '#ff9cc2', '#ffd3e4', '#ff86b3'];
  let w, h, dpr, petals = [], raf = 0, last = 0, wind = 0;

  const petal = top => ({ x: rnd(-40, w), y: top ? rnd(-h, h) : rnd(-60, -10), s: rnd(5, 10), vy: rnd(.35, .9), vx: rnd(.15, .55),
    rot: rnd(0, 6.28), vr: rnd(-.03, .03), sw: rnd(0, 6.28), col: PETALS[(Math.random() * PETALS.length) | 0] });

  function size() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const area = w * h;
    petals = Array.from({ length: Math.round(Math.min(34, area / 30000)) }, () => petal(true));
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, w, h);
    wind = Math.sin(t * .25) * .35;
    for (const p of petals) {
      p.y += p.vy * dt; p.x += (p.vx + wind + Math.sin(t + p.sw) * .25) * dt; p.rot += p.vr * dt;
      if (p.y > h + 20 || p.x > w + 40) Object.assign(p, petal(false));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = .9; ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .8);                 /* квадратный «пиксельный» лепесток, как в вишнёвой роще */
      ctx.globalAlpha = .5; ctx.fillStyle = '#fff';
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s / 2.5, p.s / 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 16.7, 3) || 1; last = now;
    draw(now / 1000, dt);
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf && !calm) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  size(); draw(0, 0); start();
  addEventListener('resize', () => { size(); if (calm) draw(0, 0); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new MutationObserver(() => { if (calm) draw(0, 0); }).observe(root, { attributes: true, attributeFilter: ['data-sky'] });
})();
