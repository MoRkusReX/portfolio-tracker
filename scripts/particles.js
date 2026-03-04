// Renders the optional animated particle background used behind the app.
(function () {
  var PT = (window.PT = window.PT || {});

  function parseColor(input, fallback) {
    var value = String(input || '').trim();
    if (!value) return fallback;
    if (value.indexOf('#') === 0) {
      var hex = value.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex.charAt(0) + hex.charAt(0), 16),
          parseInt(hex.charAt(1) + hex.charAt(1), 16),
          parseInt(hex.charAt(2) + hex.charAt(2), 16)
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    var rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
    if (rgbMatch) {
      var parts = rgbMatch[1].split(',').map(function (part) { return Number(part.trim()); });
      if (parts.length >= 3 && isFinite(parts[0]) && isFinite(parts[1]) && isFinite(parts[2])) {
        return [parts[0], parts[1], parts[2]];
      }
    }
    return fallback;
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function ParticleEngine(canvas) {
    this.canvas = canvas;
    this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.running = false;
    this.rafId = 0;
    this.particles = [];
    this.lastTs = 0;
    this.colors = {
      dotA: [44, 182, 255],
      dotB: [20, 241, 178],
      line: [44, 182, 255]
    };
    this.resize = this.resize.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    this.loop = this.loop.bind(this);
  }

  ParticleEngine.prototype.readThemeColors = function () {
    var root = getComputedStyle(document.documentElement);
    this.colors.dotA = parseColor(root.getPropertyValue('--accent'), [44, 182, 255]);
    this.colors.dotB = parseColor(root.getPropertyValue('--accent-2'), [20, 241, 178]);
    this.colors.line = this.colors.dotA;
  };

  ParticleEngine.prototype.resize = function () {
    if (!this.canvas || !this.ctx) return;
    var width = window.innerWidth || document.documentElement.clientWidth || 1200;
    var height = window.innerHeight || document.documentElement.clientHeight || 800;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.reseed();
  };

  ParticleEngine.prototype.reseed = function () {
    if (!this.canvas) return;
    var width = window.innerWidth || 1200;
    var height = window.innerHeight || 800;
    var count = Math.max(28, Math.min(90, Math.round((width * height) / 32000)));
    this.particles = [];
    for (var i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        r: 1 + Math.random() * 1.8,
        tint: Math.random() > 0.5 ? 'a' : 'b'
      });
    }
  };

  ParticleEngine.prototype.clear = function () {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  ParticleEngine.prototype.step = function (dt) {
    var width = window.innerWidth || 1200;
    var height = window.innerHeight || 800;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;
    }
  };

  ParticleEngine.prototype.draw = function () {
    if (!this.ctx) return;
    var ctx = this.ctx;
    var i;
    var j;
    var a;
    var b;
    var dx;
    var dy;
    var dist;

    this.clear();

    for (i = 0; i < this.particles.length; i++) {
      a = this.particles[i];
      for (j = i + 1; j < this.particles.length; j++) {
        b = this.particles[j];
        dx = a.x - b.x;
        dy = a.y - b.y;
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 115) continue;
        ctx.strokeStyle = rgba(this.colors.line, Math.max(0.02, 0.17 - (dist / 115) * 0.15));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (i = 0; i < this.particles.length; i++) {
      a = this.particles[i];
      ctx.fillStyle = rgba(a.tint === 'a' ? this.colors.dotA : this.colors.dotB, 0.9);
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  ParticleEngine.prototype.loop = function (ts) {
    if (!this.running) return;
    if (document.hidden) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }
    if (!this.lastTs) this.lastTs = ts;
    var dt = Math.min(2.2, (ts - this.lastTs) / 16.6667);
    this.lastTs = ts;
    this.step(dt);
    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  };

  ParticleEngine.prototype.start = function () {
    if (!this.canvas || !this.ctx || this.running) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.clear();
      return;
    }
    this.readThemeColors();
    this.resize();
    this.running = true;
    this.lastTs = 0;
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.rafId = requestAnimationFrame(this.loop);
  };

  ParticleEngine.prototype.onVisibility = function () {
    if (!this.running) return;
    if (!document.hidden) {
      this.readThemeColors();
    }
  };

  ParticleEngine.prototype.stop = function () {
    if (!this.running) {
      this.clear();
      return;
    }
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clear();
  };

  ParticleEngine.prototype.setActive = function (active) {
    if (active) this.start();
    else this.stop();
  };

  PT.CryptoParticles = {
    create: function (canvas) {
      return new ParticleEngine(canvas);
    }
  };
})();
