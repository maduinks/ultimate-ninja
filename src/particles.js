(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const COLORS = ['rgba(153,51,255,', 'rgba(255,51,102,', 'rgba(0,255,204,', 'rgba(0,153,255,'];
  const MAX = 55;
  const parts = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function mkPart(randomY) {
    return {
      x: Math.random() * canvas.width,
      y: randomY ? Math.random() * canvas.height : canvas.height + 8,
      r: Math.random() * 1.8 + 0.4,
      vy: Math.random() * 0.35 + 0.08,
      vx: (Math.random() - 0.5) * 0.25,
      alpha: 0,
      maxA: Math.random() * 0.32 + 0.06,
      col: COLORS[Math.floor(Math.random() * COLORS.length)],
      age: 0,
      life: Math.random() * 280 + 180
    };
  }

  for (let i = 0; i < MAX; i++) parts.push(mkPart(true));

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.age++; p.y -= p.vy; p.x += p.vx;
      const t = p.age / p.life;
      p.alpha = t < 0.2 ? (t / 0.2) * p.maxA : t > 0.8 ? ((1 - t) / 0.2) * p.maxA : p.maxA;
      if (p.age >= p.life || p.y < -10) { parts[i] = mkPart(false); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.col + p.alpha.toFixed(2) + ')';
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(tick);
})();
