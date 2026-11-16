(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hudScore = document.getElementById("score");
  const hudLevel = document.getElementById("level");
  const hudLivesPct = document.getElementById("lives-pct");
  const hudLivesBar = document.getElementById("lives-bar-fill");
  const overlay = document.getElementById("overlay");
  const overlayMsg = document.getElementById("overlay-msg");
  const overlaySub = document.getElementById("overlay-sub");
  const overlaySub2 = document.getElementById("overlay-sub2");
  const startBtn = document.getElementById("start-btn");
  const leftBtn = document.getElementById("left-btn");
  const rightBtn = document.getElementById("right-btn");
  const fireBtn = document.getElementById("fire-btn");

  let W = 0, H = 0, DPR = 1;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));

  // ---------- Game state ----------
  const MAX_LIVES = 3;
  const state = {
    running: false,
    score: 0,
    level: 1,
    lives: 3,
    keys: { left: false, right: false, fire: false },
    lastShot: 0,
  };

  const player = {
    w: 44, h: 26,
    x: 0, y: 0,
    speed: 320, // px/sec
  };

  let bullets = [];      // player bullets
  let enemyBullets = [];
  let enemies = [];
  let particles = [];
  let enemyDir = 1;
  let enemySpeed = 40;    // px/sec baseline horizontal
  let enemyDropTimer = 0;
  let lastTime = 0;
  let shootCooldown = 320; // ms
  let enemyShootTimer = 0;
  let stars = [];

  function initStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.6 + 0.3,
        s: Math.random() * 0.3 + 0.05,
      });
    }
  }

  function resetPlayer() {
    player.x = W / 2 - player.w / 2;
    player.y = H - player.h - 70;
  }

  function buildWave(level) {
    enemies = [];
    const cols = Math.min(6 + Math.floor(level / 2), 9);
    const rows = Math.min(4 + Math.floor(level / 3), 6);
    const spacingX = Math.min(52, (W - 40) / cols);
    const spacingY = 40;
    const startX = (W - (cols - 1) * spacingX) / 2 - 14;
    const startY = 60;
    const types = ["sq", "tri", "dia"];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        enemies.push({
          x: startX + c * spacingX,
          y: startY + r * spacingY,
          w: 28, h: 22,
          alive: true,
          type: types[r % types.length],
          points: (rows - r) * 10,
        });
      }
    }
    enemyDir = 1;
    enemySpeed = 40 + level * 6;
    enemyShootTimer = 0;
  }

  function startGame() {
    state.running = true;
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    bullets = [];
    enemyBullets = [];
    particles = [];
    updateHud();
    resetPlayer();
    buildWave(state.level);
    overlay.classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function nextLevel() {
    state.level++;
    state.lives = MAX_LIVES;
    updateHud();
    bullets = [];
    enemyBullets = [];
    resetPlayer();
    buildWave(state.level);
  }

  function updateHud() {
    hudScore.textContent = state.score;
    hudLevel.textContent = state.level;
    const pct = Math.max(0, Math.round((state.lives / MAX_LIVES) * 100));
    hudLivesPct.textContent = pct + "%";
    hudLivesBar.style.width = pct + "%";
    hudLivesBar.style.backgroundColor = pct > 60 ? "#ff3bd4" : pct > 30 ? "#ffd439" : "#ff3b3b";
  }

  function gameOver(won) {
    state.running = false;
    overlayMsg.classList.remove("hidden");
    overlayMsg.textContent = won ? "ALLE WELLEN BESIEGT!" : "GAME OVER";
    overlaySub.textContent = "Punktzahl: " + state.score;
    overlaySub2.textContent = won ? "Großartig gespielt, Kommandant!" : "Versuch es noch einmal.";
    startBtn.textContent = "NOCHMAL";
    overlay.classList.remove("hidden");
  }

  // ---------- Input ----------
  function bindHold(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); el.classList.add("active"); onDown(); };
    const up = (e) => { e.preventDefault(); el.classList.remove("active"); onUp(); };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up, { passive: false });
    el.addEventListener("mousedown", down);
    el.addEventListener("mouseup", up);
    el.addEventListener("mouseleave", up);
  }

  bindHold(leftBtn, () => state.keys.left = true, () => state.keys.left = false);
  bindHold(rightBtn, () => state.keys.right = true, () => state.keys.right = false);
  bindHold(fireBtn, () => state.keys.fire = true, () => state.keys.fire = false);

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") state.keys.left = true;
    if (e.key === "ArrowRight" || e.key === "d") state.keys.right = true;
    if (e.key === " " || e.key === "ArrowUp") state.keys.fire = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") state.keys.left = false;
    if (e.key === "ArrowRight" || e.key === "d") state.keys.right = false;
    if (e.key === " " || e.key === "ArrowUp") state.keys.fire = false;
  });

  startBtn.addEventListener("click", startGame);
  startBtn.addEventListener("touchend", (e) => { e.preventDefault(); startGame(); }, { passive: false });

  // ---------- Update / draw ----------
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.5) * 220,
        life: 0.4 + Math.random() * 0.3,
        color,
      });
    }
  }

  function update(dt) {
    // player movement
    if (state.keys.left) player.x -= player.speed * dt;
    if (state.keys.right) player.x += player.speed * dt;
    player.x = Math.max(6, Math.min(W - player.w - 6, player.x));

    // shooting
    const now = performance.now();
    if (state.keys.fire && now - state.lastShot > shootCooldown) {
      state.lastShot = now;
      bullets.push({ x: player.x + player.w / 2 - 2, y: player.y - 10, w: 4, h: 14, vy: -520 });
    }

    // bullets
    bullets.forEach(b => b.y += b.vy * dt);
    bullets = bullets.filter(b => b.y + b.h > 0);

    enemyBullets.forEach(b => b.y += b.vy * dt);
    enemyBullets = enemyBullets.filter(b => b.y < H);

    // enemy movement (classic side-to-side + drop)
    let minX = Infinity, maxX = -Infinity, aliveCount = 0;
    enemies.forEach(en => {
      if (!en.alive) return;
      aliveCount++;
      minX = Math.min(minX, en.x);
      maxX = Math.max(maxX, en.x + en.w);
    });

    if (aliveCount === 0) {
      nextLevel();
      return;
    }

    let dropNow = false;
    if (maxX + enemyDir * enemySpeed * dt > W - 10 && enemyDir > 0) dropNow = true;
    if (minX + enemyDir * enemySpeed * dt < 10 && enemyDir < 0) dropNow = true;

    if (dropNow) {
      enemyDir *= -1;
      enemies.forEach(en => { if (en.alive) en.y += 16; });
    } else {
      enemies.forEach(en => { if (en.alive) en.x += enemyDir * enemySpeed * dt; });
    }

    // enemy reaching player line -> lose a life / game over
    enemies.forEach(en => {
      if (en.alive && en.y + en.h >= player.y) {
        state.lives = 0;
      }
    });

    // enemy shooting
    enemyShootTimer -= dt;
    if (enemyShootTimer <= 0) {
      enemyShootTimer = Math.max(0.35, 1.1 - state.level * 0.07);
      const alive = enemies.filter(e => e.alive);
      if (alive.length) {
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        enemyBullets.push({
          x: shooter.x + shooter.w / 2 - 2,
          y: shooter.y + shooter.h,
          w: 4, h: 12,
          vy: 220 + state.level * 10,
        });
      }
    }

    // collisions: player bullets vs enemies
    bullets.forEach(b => {
      enemies.forEach(en => {
        if (!en.alive) return;
        if (b.x < en.x + en.w && b.x + b.w > en.x && b.y < en.y + en.h && b.y + b.h > en.y) {
          en.alive = false;
          b.y = -9999;
          state.score += en.points;
          spawnParticles(en.x + en.w / 2, en.y + en.h / 2, "#39ff88", 14);
          updateHud();
        }
      });
    });
    bullets = bullets.filter(b => b.y > -999);

    // collisions: enemy bullets vs player
    enemyBullets.forEach(b => {
      if (b.x < player.x + player.w && b.x + b.w > player.x && b.y < player.y + player.h && b.y + b.h > player.y) {
        b.y = H + 999;
        state.lives--;
        updateHud();
        spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "#ff3bd4", 18);
      }
    });
    enemyBullets = enemyBullets.filter(b => b.y < H + 500);

    // particles
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);

    if (state.lives <= 0) {
      gameOver(false);
    }
  }

  function drawStars(dt) {
    ctx.save();
    stars.forEach(s => {
      s.y += s.s * dt;
      if (s.y > 1) s.y = 0;
      const px = s.x * W, py = s.y * H;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#39ff88";
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = "#39ff88";
    ctx.shadowColor = "#39ff88";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(player.w / 2, 0);
    ctx.lineTo(player.w, player.h);
    ctx.lineTo(0, player.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(en) {
    ctx.save();
    ctx.translate(en.x, en.y);
    ctx.shadowBlur = 8;
    if (en.type === "sq") {
      ctx.fillStyle = "#ff3bd4";
      ctx.shadowColor = "#ff3bd4";
      ctx.fillRect(2, 2, en.w - 4, en.h - 4);
    } else if (en.type === "tri") {
      ctx.fillStyle = "#39d4ff";
      ctx.shadowColor = "#39d4ff";
      ctx.beginPath();
      ctx.moveTo(en.w / 2, 0);
      ctx.lineTo(en.w, en.h);
      ctx.lineTo(0, en.h);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#ffd439";
      ctx.shadowColor = "#ffd439";
      ctx.beginPath();
      ctx.moveTo(en.w / 2, 0);
      ctx.lineTo(en.w, en.h / 2);
      ctx.lineTo(en.w / 2, en.h);
      ctx.lineTo(0, en.h / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    drawStars(dt);

    drawPlayer();

    enemies.forEach(en => { if (en.alive) drawEnemy(en); });

    ctx.fillStyle = "#39ff88";
    ctx.shadowColor = "#39ff88";
    ctx.shadowBlur = 8;
    bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));

    ctx.fillStyle = "#ff3bd4";
    ctx.shadowColor = "#ff3bd4";
    enemyBullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));

    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 0;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function loop(ts) {
    if (!state.running) return;
    const dt = Math.min(0.033, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    if (state.running) {
      draw(dt);
      requestAnimationFrame(loop);
    } else {
      draw(dt);
    }
  }

  // init
  resize();
  initStars();
  resetPlayer();

  // register service worker for installability (ignore failures, e.g. file://)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
