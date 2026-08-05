/* Bitart Visualizer — retro / 80s / pixel modes */
(function (global) {
  "use strict";

  const MODES = [
    { id: "bars", name: "Bars", thumb: "assets/thumbs/bars.jpg" },
    { id: "rings", name: "Rings", thumb: "assets/thumbs/rings.jpg" },
    { id: "rain", name: "Rain", thumb: "assets/thumbs/rain.jpg" },
    { id: "synthwave", name: "Synthwave", thumb: "assets/thumbs/synthwave.jpg" },
    { id: "scope", name: "Scope", thumb: "assets/thumbs/scope.jpg" },
    { id: "starfield", name: "Stars", thumb: "assets/thumbs/starfield.jpg" },
    { id: "disco", name: "Disco", thumb: "assets/thumbs/disco.jpg" },
    { id: "boombox", name: "Boombox", thumb: "assets/thumbs/boombox.jpg" },
    { id: "matrix", name: "Matrix", thumb: "assets/thumbs/matrix.jpg" },
    { id: "tunnel", name: "Tunnel", thumb: "assets/thumbs/tunnel.jpg" },
    { id: "plasma", name: "Plasma", thumb: "assets/thumbs/plasma.jpg" },
    { id: "cassette", name: "Cassette", thumb: "assets/thumbs/cassette.jpg" },
  ];

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hsl(h, s, l, a) {
    if (a == null) return `hsl(${h % 360} ${s}% ${l}%)`;
    return `hsla(${h % 360} ${s}% ${l}% / ${a})`;
  }

  function binAt(freq, bins, t, sens) {
    if (!freq || !bins) return 0;
    const i = clamp(Math.floor(t * (bins - 1)), 0, bins - 1);
    return clamp((freq[i] / 255) * (sens || 1), 0, 1.5);
  }

  /** Soft-gate levels so silence stays calm. */
  function gate(v, floor, mult) {
    const x = Math.max(0, (v || 0) - floor);
    return clamp(x * (mult || 1.4), 0, 1);
  }

  class VizEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.modeId = "bars";
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.t = 0;
      this.particles = [];
      this.stars = [];
      this.rain = [];
      this.tiles = [];
      this.rings = [];
      this.smoothBars = null;
      this.pulse = 0;
      this.scopeBuf = null;
      this.scopeGain = 1;
      this.tunnelScroll = 0;
      this.tunnelSpin = 0;
      this.roadScroll = 0;
      this.roadFill = null; // smoothed per-lane fill [cols]
      this.smEnergy = 0;
      this.smBass = 0;
      this.smMid = 0;
      this.initModeState();
    }

    initModeState() {
      this.particles = [];
      this.stars = [];
      this.rain = [];
      this.smoothBars = null;
      this.pulse = 0;
      this.scopeBuf = null;
      this.scopeGain = 1;
      this.tunnelScroll = 0;
      this.tunnelSpin = 0;
      this.roadScroll = 0;
      this.roadFill = null;
      this.smEnergy = 0;
      this.smBass = 0;
      this.smMid = 0;
    }

    /** Heavily smoothed, high-floor levels so noisy capture stays calm. */
    smoothLevels(a) {
      const e = gate(a.energy, 0.12, 1.1);
      const b = gate(a.bass, 0.14, 1.1);
      const m = gate(a.mid, 0.12, 1.1);
      // square to push mid-levels down further
      this.smEnergy = lerp(this.smEnergy, e * e, 0.08);
      this.smBass = lerp(this.smBass, b * b, 0.1);
      this.smMid = lerp(this.smMid, m * m, 0.08);
      return { e: this.smEnergy, b: this.smBass, m: this.smMid };
    }

    setMode(id) {
      if (this.modeId === id) return;
      this.modeId = id;
      this.initModeState();
      this.seedForMode(id);
    }

    seedForMode(id) {
      const w = this.w || 800;
      const h = this.h || 450;
      if (id === "starfield") {
        this.stars = [];
        for (let i = 0; i < 180; i++) {
          this.stars.push({
            x: (Math.random() - 0.5) * w,
            y: (Math.random() - 0.5) * h,
            z: Math.random() * w,
            pz: 0,
          });
        }
      }
      if (id === "tunnel") {
        this.stars = [];
        this.tunnelScroll = 0;
        this.tunnelSpin = 0;
        for (let i = 0; i < 60; i++) {
          this.stars.push({
            x: (Math.random() - 0.5) * w,
            y: (Math.random() - 0.5) * h,
            z: Math.random() * w,
            pz: 0,
          });
        }
      }
      if (id === "rain") {
        this.rain = [];
        for (let i = 0; i < 220; i++) {
          this.rain.push({
            x: Math.random() * w,
            y: Math.random() * h,
            speed: 2 + Math.random() * 7,
            len: 12 + Math.random() * 36,
            hue: 260 + Math.random() * 100,
            thick: 1 + Math.random() * 2,
            trail: 0.4 + Math.random() * 0.6,
          });
        }
      }
      if (id === "synthwave") {
        this.roadScroll = 0;
      }
      if (id === "disco") {
        this.tiles = [];
        const cols = 12;
        const rows = 8;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            this.tiles.push({
              x, y,
              hue: (x * 30 + y * 40) % 360,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
      }
      if (id === "plasma" || id === "cassette") {
        this.particles = [];
        for (let i = 0; i < 40; i++) {
          this.particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            r: 8 + Math.random() * 24,
            hue: Math.random() * 360,
          });
        }
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.w = Math.max(1, Math.floor(rect.width));
      this.h = Math.max(1, Math.floor(rect.height));
      this.canvas.width = Math.floor(this.w * dpr);
      this.canvas.height = Math.floor(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seedForMode(this.modeId);
    }

    draw(audio, dt) {
      this.t += dt;
      this.pulse = lerp(this.pulse, audio.energy || 0, 0.15);
      const g = this.ctx;
      const w = this.w;
      const h = this.h;
      if (!w || !h) return;

      const fn = this["draw_" + this.modeId] || this.draw_bars;
      fn.call(this, g, w, h, audio, dt);
    }

    /* ---------- BARS ---------- */
    draw_bars(g, w, h, a) {
      g.fillStyle = "#12081c";
      g.fillRect(0, 0, w, h);

      // soft grid
      g.strokeStyle = "rgba(255, 120, 200, 0.06)";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 24) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }
      for (let y = 0; y < h; y += 24) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }

      const barCount = 48;
      if (!this.smoothBars || this.smoothBars.length !== barCount) {
        this.smoothBars = new Float32Array(barCount);
      }
      const gap = 3;
      const totalGap = gap * (barCount - 1);
      const bw = (w - 40 - totalGap) / barCount;
      const baseY = h - 28;
      const maxH = h * 0.72;

      for (let i = 0; i < barCount; i++) {
        const t = i / (barCount - 1);
        // log-ish mapping into spectrum
        const idx = Math.pow(t, 1.6);
        let v = binAt(a.freq, a.bins, idx, a.sensitivity);
        if (!a.freq) v = 0.08 + 0.04 * Math.sin(this.t * 2 + i * 0.4);
        this.smoothBars[i] = lerp(this.smoothBars[i], v, 0.35);
        const bh = this.smoothBars[i] * maxH;
        const x = 20 + i * (bw + gap);
        const y = baseY - bh;
        const hue = 300 + t * 80 - this.smoothBars[i] * 40;
        const grad = g.createLinearGradient(x, y, x, baseY);
        grad.addColorStop(0, hsl(hue, 90, 70));
        grad.addColorStop(0.5, hsl(hue + 20, 85, 55));
        grad.addColorStop(1, hsl(200, 80, 45));
        g.fillStyle = grad;
        // pixel block segments
        const seg = 6;
        for (let s = 0; s < bh; s += seg + 1) {
          const sh = Math.min(seg, bh - s);
          g.fillRect(x, baseY - s - sh, bw, sh);
        }
        // peak cap
        g.fillStyle = hsl(50, 100, 75);
        g.fillRect(x, y - 2, bw, 2);

        // soft floor reflection
        g.globalAlpha = 0.2;
        g.fillStyle = grad;
        g.fillRect(x, baseY + 4, bw, Math.min(bh * 0.25, 28));
        g.globalAlpha = 1;
      }
    }

    /* ---------- RINGS ---------- */
    draw_rings(g, w, h, a) {
      g.fillStyle = "#050510";
      g.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const rings = 18;
      for (let i = rings; i >= 1; i--) {
        const t = i / rings;
        const v = binAt(a.freq, a.bins, 1 - t, a.sensitivity);
        const idle = 0.05 + 0.03 * Math.sin(this.t * 1.5 + i);
        const amp = (a.freq ? v : idle);
        const r = (Math.min(w, h) * 0.08) + t * Math.min(w, h) * 0.42 + amp * 28;
        const hue = 190 + i * 8 + a.bass * 40;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.strokeStyle = hsl(hue, 90, 60, 0.15 + amp * 0.7);
        g.lineWidth = 2 + amp * 6;
        g.stroke();
      }
      // center glow
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 80 + a.energy * 60);
      glow.addColorStop(0, hsl(320, 100, 70, 0.5 + a.bass * 0.4));
      glow.addColorStop(1, "transparent");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(cx, cy, 100 + a.bass * 40, 0, Math.PI * 2);
      g.fill();
    }

    /* ---------- RAIN ---------- */
    draw_rain(g, w, h, a, dt) {
      // heavier trails for a denser matrix feel
      g.fillStyle = "rgba(6, 2, 14, 0.22)";
      g.fillRect(0, 0, w, h);
      if (!this.rain.length) this.seedForMode("rain");

      const energy = gate(a.energy, 0.04, 1.6);
      const bass = gate(a.bass, 0.05, 1.5);
      const treble = gate(a.treble, 0.04, 1.5);
      const boost = 1.2 + energy * 14 + bass * 8;
      const wind = (a.mid || 0) * 3;

      // vertical spectrum pillars behind the rain
      const cols = 24;
      for (let c = 0; c < cols; c++) {
        const t = c / (cols - 1);
        const v = binAt(a.freq, a.bins, t, a.sensitivity);
        if (v < 0.08) continue;
        const x = (c + 0.5) * (w / cols);
        const bh = v * h * 0.85;
        const grad = g.createLinearGradient(x, h - bh, x, h);
        grad.addColorStop(0, hsl(280 + t * 60, 95, 60, 0.05));
        grad.addColorStop(1, hsl(300 + t * 40, 90, 55, 0.18 + v * 0.35));
        g.fillStyle = grad;
        g.fillRect(x - w / cols * 0.35, h - bh, (w / cols) * 0.7, bh);
      }

      for (const d of this.rain) {
        const colV = binAt(a.freq, a.bins, d.x / w, a.sensitivity);
        const local = 0.35 + colV * 1.8 + energy * 0.5;
        d.y += d.speed * boost * local * (dt * 60);
        d.x += Math.sin(this.t * 2 + d.y * 0.012) * (0.6 + wind) + (Math.random() - 0.5) * treble * 2;

        if (d.y > h + 40) {
          d.y = -30 - Math.random() * 40;
          d.x = Math.random() * w;
          d.hue = 250 + Math.random() * 110;
          d.len = 14 + Math.random() * 40 + energy * 30;
          d.speed = 2.5 + Math.random() * 8 + bass * 4;
          // splash
          if (colV > 0.2 || bass > 0.35) {
            g.fillStyle = hsl(d.hue, 100, 75, 0.35 + colV * 0.45);
            g.beginPath();
            g.arc(d.x, h - 4, 2 + colV * 8 + bass * 6, 0, Math.PI * 2);
            g.fill();
          }
        }

        const v = Math.max(colV, energy * 0.4);
        const len = d.len * (1.2 + v * 2.8 + bass * 1.2);
        const alpha = clamp(0.35 + v * 0.65 + treble * 0.2, 0, 1);
        const lw = d.thick * (1.5 + v * 4 + bass * 2);

        // glow core
        g.strokeStyle = hsl(d.hue, 95, 72, alpha);
        g.lineWidth = lw;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - wind * 0.3, d.y + len);
        g.stroke();

        // bright head
        g.fillStyle = hsl(d.hue + 20, 100, 85, alpha);
        g.fillRect(d.x - lw * 0.4, d.y, lw * 0.8, 3 + v * 4);

        // trailing afterimage
        g.strokeStyle = hsl(d.hue, 80, 55, alpha * d.trail * 0.45);
        g.lineWidth = Math.max(1, lw * 0.45);
        g.beginPath();
        g.moveTo(d.x, d.y - len * 0.35);
        g.lineTo(d.x, d.y);
        g.stroke();
      }

      // bass bloom
      if (bass > 0.25) {
        g.fillStyle = hsl(310, 100, 60, (bass - 0.25) * 0.35);
        g.fillRect(0, 0, w, h);
      }
      // treble sparkle line at bottom
      if (a.freq) {
        g.beginPath();
        for (let i = 0; i < 48; i++) {
          const t = i / 47;
          const v = binAt(a.freq, a.bins, t, a.sensitivity);
          const x = t * w;
          const y = h - 6 - v * 40;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = hsl(190, 100, 70, 0.35 + treble * 0.4);
        g.lineWidth = 2;
        g.stroke();
      }
    }

    /* ---------- SYNTHWAVE — hollow neon cells that FILL with color ---------- */
    draw_synthwave(g, w, h, a, dt) {
      const lv = this.smoothLevels(a);
      const energy = lv.e;
      const bass = lv.b;
      const mid = lv.m;
      const treble = gate(a.treble, 0.1, 1.1);

      // sky
      const sky = g.createLinearGradient(0, 0, 0, h * 0.48);
      sky.addColorStop(0, "#12062a");
      sky.addColorStop(0.55, "#4a1a6a");
      sky.addColorStop(1, "#ff6b9d");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h * 0.48);

      // sun
      const sunY = h * 0.32 - bass * 6;
      const sunR = Math.min(w, h) * 0.12 + mid * 6;
      const sun = g.createRadialGradient(w / 2, sunY, 0, w / 2, sunY, sunR);
      sun.addColorStop(0, "#ffe566");
      sun.addColorStop(0.55, "#ff8c42");
      sun.addColorStop(1, "#ff4d6d");
      g.fillStyle = sun;
      g.beginPath();
      g.arc(w / 2, sunY, sunR, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#4a1a6a";
      for (let i = 0; i < 6; i++) {
        const yy = sunY - sunR * 0.15 + i * (sunR * 0.26);
        g.fillRect(w / 2 - sunR, yy, sunR * 2, 2 + i);
      }

      // mountains
      g.fillStyle = "#221038";
      g.beginPath();
      g.moveTo(0, h * 0.48);
      for (let x = 0; x <= w; x += 16) {
        const n = Math.sin(x * 0.018) * 28 + Math.sin(x * 0.05) * 14;
        g.lineTo(x, h * 0.42 + n - treble * 4);
      }
      g.lineTo(w, h * 0.48);
      g.closePath();
      g.fill();

      const horizon = h * 0.48;
      const groundH = h - horizon;

      g.fillStyle = "#060210";
      g.fillRect(0, horizon, w, groundH);

      this.roadScroll += (0.2 + energy * 2.2 + bass * 1.5) * dt;
      const scroll = this.roadScroll;

      const rows = 12;
      const halfCols = 10; // lanes each side of center
      const totalCols = halfCols * 2;

      // smoothed fill level per lane (0 empty → 1 full color)
      if (!this.roadFill || this.roadFill.length !== totalCols) {
        this.roadFill = new Float32Array(totalCols);
      }
      for (let c = 0; c < totalCols; c++) {
        const tLane = c / (totalCols - 1);
        // boost spectrum so quiet music still paints something
        let spec = binAt(a.freq, a.bins, tLane, 1);
        // ignore sensitivity blow-up; use gentle boost
        spec = Math.pow(clamp(spec, 0, 1), 0.65);
        const centerBoost = 1 - Math.abs(tLane - 0.5) * 0.5;
        const target = clamp(
          spec * 1.1 + energy * 0.55 + bass * 0.45 * centerBoost + mid * 0.2,
          0,
          1
        );
        this.roadFill[c] = lerp(this.roadFill[c], target, 0.18);
      }

      // Draw every cell: dark hole + color fill rising from the near edge
      for (let row = rows - 1; row >= 0; row--) {
        const r0 = (row + (scroll % 1)) / rows;
        const r1 = (row + 1 + (scroll % 1)) / rows;
        const y0 = horizon + Math.pow(clamp(r0, 0, 1.15), 1.55) * groundH;
        const y1 = horizon + Math.pow(clamp(r1, 0, 1.15), 1.55) * groundH;
        if (y1 < horizon - 2) continue;

        const widen0 = 0.05 + clamp(r0, 0, 1) * 0.95;
        const widen1 = 0.05 + clamp(r1, 0, 1) * 0.95;
        // rows nearer camera fill a bit more (liquid pooling toward you)
        const depthBoost = 0.15 + clamp(r0, 0, 1) * 0.35;

        for (let c = 0; c < totalCols; c++) {
          const lane = c - halfCols; // -halfCols .. halfCols-1
          const tLane = c / (totalCols - 1);

          const x0a = w / 2 + (lane / halfCols) * (w * 0.5) * widen0;
          const x0b = w / 2 + ((lane + 1) / halfCols) * (w * 0.5) * widen0;
          const x1a = w / 2 + (lane / halfCols) * (w * 0.5) * widen1;
          const x1b = w / 2 + ((lane + 1) / halfCols) * (w * 0.5) * widen1;

          // 1) empty hole (always)
          g.fillStyle = ((c + row) % 2 === 0) ? "#0c0618" : "#0a0414";
          g.beginPath();
          g.moveTo(x0a, y0);
          g.lineTo(x0b, y0);
          g.lineTo(x1b, y1);
          g.lineTo(x1a, y1);
          g.closePath();
          g.fill();

          // 2) color fill amount for this cell
          let fill = clamp(this.roadFill[c] + depthBoost * energy, 0, 1);
          // row wave: bass floods from horizon outward in bands
          const band = 0.5 + 0.5 * Math.sin(row * 0.7 - this.t * 2 + bass * 4);
          fill = clamp(fill * (0.75 + band * 0.45), 0, 1);

          if (fill > 0.02) {
            // fill from the NEAR edge (y1 / bottom of cell) upward toward horizon
            const fy = y1 + (y0 - y1) * fill; // top of the liquid
            // interpolate x at fill height
            const u = fill; // 0 at bottom, 1 at top of cell
            const xl = x1a + (x0a - x1a) * u;
            const xr = x1b + (x0b - x1b) * u;

            const hue = 280 + tLane * 70 + fill * 25 + mid * 20;
            const light = 35 + fill * 35 + bass * 10;
            g.fillStyle = hsl(hue, 92, light, 0.55 + fill * 0.4);
            g.beginPath();
            g.moveTo(xl, fy);
            g.lineTo(xr, fy);
            g.lineTo(x1b, y1);
            g.lineTo(x1a, y1);
            g.closePath();
            g.fill();

            // bright meniscus on the fill surface
            g.strokeStyle = hsl(hue + 20, 100, 75, 0.4 + fill * 0.5);
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(xl, fy);
            g.lineTo(xr, fy);
            g.stroke();
          }

          // 3) neon cell rim (the "hole" outline)
          g.strokeStyle = hsl(310, 90, 65, 0.35 + fill * 0.4 + energy * 0.2);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x0a, y0);
          g.lineTo(x0b, y0);
          g.lineTo(x1b, y1);
          g.lineTo(x1a, y1);
          g.closePath();
          g.stroke();
        }
      }

      // center dashed line
      g.strokeStyle = hsl(50, 100, 70, 0.35 + energy * 0.4);
      g.lineWidth = 2;
      g.setLineDash([8, 12]);
      g.beginPath();
      g.moveTo(w / 2, horizon + 4);
      g.lineTo(w / 2, h);
      g.stroke();
      g.setLineDash([]);

      // side rails
      g.strokeStyle = hsl(320, 100, 65, 0.25 + bass * 0.5);
      g.lineWidth = 2 + bass * 2;
      g.beginPath();
      g.moveTo(w / 2 - 4, horizon);
      g.lineTo(0, h);
      g.moveTo(w / 2 + 4, horizon);
      g.lineTo(w, h);
      g.stroke();
    }

    /* ---------- SCOPE (mid energy — readable, not thrashing) ---------- */
    draw_scope(g, w, h, a) {
      g.fillStyle = "#0a1408";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(40, 120, 40, 0.22)";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 36) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }
      for (let y = 0; y < h; y += 36) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }
      g.strokeStyle = "rgba(60, 160, 60, 0.3)";
      g.beginPath();
      g.moveTo(0, h / 2); g.lineTo(w, h / 2);
      g.moveTo(w / 2, 0); g.lineTo(w / 2, h);
      g.stroke();

      const points = Math.min(180, Math.max(64, Math.floor(w / 4)));
      if (!this.scopeBuf || this.scopeBuf.length !== points) {
        this.scopeBuf = new Float32Array(points);
      }

      const time = a.time;
      const n = time ? time.length : 0;
      let peak = 0;
      let mean = 0;

      if (n > 0) {
        const step = n / points;
        for (let i = 0; i < points; i++) {
          const start = Math.floor(i * step);
          const end = Math.min(n, Math.floor((i + 1) * step));
          let sum = 0;
          let count = 0;
          for (let j = start; j < end; j++) {
            sum += (time[j] - 128) / 128;
            count++;
          }
          const raw = count ? sum / count : 0;
          // medium low-pass (between thrashy 0.45 and dead 0.12)
          this.scopeBuf[i] = lerp(this.scopeBuf[i], raw, 0.28);
          peak = Math.max(peak, Math.abs(this.scopeBuf[i]));
          mean += this.scopeBuf[i];
        }
        mean /= points;
      } else {
        for (let i = 0; i < points; i++) {
          this.scopeBuf[i] = lerp(this.scopeBuf[i], 0, 0.1);
        }
      }

      // Mild AGC: can lift quiet signal a little, hard-caps loud peaks
      const noiseFloor = 0.05;
      const targetPeak = 0.42; // aim for ~42% of half-height
      let desired = 1;
      if (peak > noiseFloor) {
        desired = clamp(targetPeak / peak, 0.35, 2.2);
      } else {
        desired = 0.25; // tiny residual, not fully flat
      }
      const sens = clamp(a.sensitivity || 1, 0.5, 1.8);
      desired *= 0.7 + sens * 0.3;
      this.scopeGain = lerp(this.scopeGain, desired, 0.14);

      const eGate = gate(a.energy, 0.05, 1.4);
      // vertical scale midway between muted 0.18 and old hot ~0.4 * gain
      const ampScale = this.scopeGain * (0.22 + eGate * 0.2);

      g.beginPath();
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * w;
        let v = (this.scopeBuf[i] - mean) * ampScale;
        const sign = v < 0 ? -1 : 1;
        // light compression
        v = sign * Math.pow(Math.min(1.2, Math.abs(v)), 0.88);
        v = clamp(v, -0.55, 0.55);
        const y = h / 2 + v * (h * 0.5);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }

      const glow = 5 + eGate * 8;
      g.strokeStyle = "#5dff7a";
      g.lineWidth = 2;
      g.shadowColor = "#3dff5a";
      g.shadowBlur = glow;
      g.stroke();
      g.shadowBlur = 0;
      g.globalAlpha = 0.3;
      g.strokeStyle = "#a8ffb8";
      g.lineWidth = 1;
      g.stroke();
      g.globalAlpha = 1;

      if (eGate > 0.12) {
        g.fillStyle = hsl(120, 80, 55, 0.3 + eGate * 0.25);
        g.fillRect(8, h / 2 - eGate * h * 0.12, 4, eGate * h * 0.24);
        g.fillRect(w - 12, h / 2 - eGate * h * 0.12, 4, eGate * h * 0.24);
      }
    }

    /* ---------- STARFIELD ---------- */
    draw_starfield(g, w, h, a, dt) {
      g.fillStyle = "rgba(4, 4, 18, 0.45)";
      g.fillRect(0, 0, w, h);
      if (!this.stars.length) this.seedForMode("starfield");
      const cx = w / 2;
      const cy = h / 2;
      const speed = 2 + (a.energy || 0) * 18 + (a.bass || 0) * 10;
      for (const s of this.stars) {
        s.z -= speed * dt * 60;
        if (s.z <= 1) {
          s.x = (Math.random() - 0.5) * w;
          s.y = (Math.random() - 0.5) * h;
          s.z = w;
          s.pz = s.z;
        }
        const k = 128 / s.z;
        const x = cx + s.x * k;
        const y = cy + s.y * k;
        const pk = 128 / (s.pz || s.z);
        const px = cx + s.x * pk;
        const py = cy + s.y * pk;
        s.pz = s.z;
        const size = (1 - s.z / w) * 3;
        g.strokeStyle = hsl(200 + a.treble * 80, 90, 80, 0.5 + (1 - s.z / w) * 0.5);
        g.lineWidth = size;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(x, y);
        g.stroke();
      }
      // nebula pulse
      const ng = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.4);
      ng.addColorStop(0, hsl(300, 80, 50, 0.08 + a.bass * 0.15));
      ng.addColorStop(1, "transparent");
      g.fillStyle = ng;
      g.fillRect(0, 0, w, h);
    }

    /* ---------- DISCO ---------- */
    draw_disco(g, w, h, a) {
      g.fillStyle = "#0a0612";
      g.fillRect(0, 0, w, h);
      if (!this.tiles.length) this.seedForMode("disco");
      const cols = 12;
      const rows = 8;
      const tw = w / cols;
      const th = h / rows;
      for (const tile of this.tiles) {
        const idx = (tile.x + tile.y * cols) / (cols * rows);
        const v = binAt(a.freq, a.bins, idx, a.sensitivity);
        const pulse = 0.35 + 0.65 * (a.freq ? v : 0.2 + 0.1 * Math.sin(this.t * 3 + tile.phase));
        const light = 25 + pulse * 45 + a.bass * 15;
        g.fillStyle = hsl(tile.hue + this.t * 20, 85, light);
        const pad = 2;
        g.fillRect(tile.x * tw + pad, tile.y * th + pad, tw - pad * 2, th - pad * 2);
        g.fillStyle = hsl(tile.hue, 90, light + 20, 0.35);
        g.fillRect(tile.x * tw + pad, tile.y * th + pad, (tw - pad * 2) * 0.4, (th - pad * 2) * 0.25);
      }
      // mirror ball glints
      for (let i = 0; i < 8; i++) {
        const ang = this.t + i * (Math.PI / 4);
        const rr = 40 + a.mid * 30;
        const x = w / 2 + Math.cos(ang) * rr;
        const y = h * 0.2 + Math.sin(ang * 1.3) * 20;
        g.fillStyle = hsl(50, 100, 80, 0.3 + a.treble * 0.4);
        g.beginPath();
        g.arc(x, y, 3 + a.treble * 4, 0, Math.PI * 2);
        g.fill();
      }
    }

    /* ---------- BOOMBOX VU ---------- */
    draw_boombox(g, w, h, a) {
      // soft room bg
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#2a2238");
      bg.addColorStop(1, "#1a1524");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const bx = w * 0.12;
      const by = h * 0.22;
      const bw = w * 0.76;
      const bh = h * 0.52;
      // body
      g.fillStyle = "#7ec8b0";
      this.roundRect(g, bx, by, bw, bh, 16);
      g.fill();
      g.fillStyle = "#5a9a88";
      this.roundRect(g, bx + 8, by + 8, bw - 16, bh - 16, 12);
      g.fill();

      // speakers
      const spR = Math.min(bw, bh) * 0.18 + a.bass * 6;
      for (const sx of [bx + bw * 0.2, bx + bw * 0.8]) {
        const sy = by + bh * 0.62;
        g.fillStyle = "#f0e6d6";
        g.beginPath();
        g.arc(sx, sy, spR + 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#2a2438";
        g.beginPath();
        g.arc(sx, sy, spR, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#4a4060";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(sx, sy, spR * 0.55, 0, Math.PI * 2);
        g.stroke();
      }

      // VU meters
      const mx = bx + bw * 0.35;
      const my = by + bh * 0.18;
      const mw = bw * 0.3;
      const mh = bh * 0.28;
      g.fillStyle = "#1a1524";
      this.roundRect(g, mx, my, mw, mh, 6);
      g.fill();

      // needles
      const levels = [a.bass || 0.15, a.mid || 0.12];
      for (let i = 0; i < 2; i++) {
        const cx = mx + mw * (0.28 + i * 0.44);
        const cy = my + mh * 0.75;
        const ang = -Math.PI * 0.75 + levels[i] * Math.PI * 0.9;
        g.strokeStyle = i === 0 ? "#5dff7a" : "#ff6bcb";
        g.lineWidth = 3;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(ang) * mh * 0.55, cy + Math.sin(ang) * mh * 0.55);
        g.stroke();
      }

      // LED bars
      const ledN = 10;
      for (let side = 0; side < 2; side++) {
        const lx = side === 0 ? bx + 20 : bx + bw - 20 - ledN * 8;
        for (let i = 0; i < ledN; i++) {
          const t = i / (ledN - 1);
          const thr = t;
          const on = (a.energy || 0.1) > thr * 0.85;
          const hue = t < 0.6 ? 140 : t < 0.85 ? 50 : 0;
          g.fillStyle = on ? hsl(hue, 90, 55) : "#2a2438";
          g.fillRect(lx + i * 8, my + 8, 6, mh - 16);
        }
      }
    }

    /* ---------- MATRIX ---------- */
    draw_matrix(g, w, h, a) {
      g.fillStyle = "#050508";
      g.fillRect(0, 0, w, h);
      const cols = 32;
      const rows = 18;
      const cw = w / cols;
      const ch = h / rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const t = x / (cols - 1);
          // waveform-ish vertical from center
          const wave = binAt(a.freq, a.bins, t, a.sensitivity);
          const center = rows / 2;
          const amp = wave * (rows * 0.45);
          const dist = Math.abs(y - center);
          const on = dist < amp + 0.5 || (!a.freq && dist < 1 + Math.sin(this.t * 2 + x * 0.3));
          if (!on) continue;
          const heat = 1 - dist / Math.max(1, amp);
          const hue = heat > 0.7 ? 10 : heat > 0.4 ? 35 : 45;
          g.fillStyle = hsl(hue, 100, 50 + heat * 20);
          const pad = 2;
          g.fillRect(x * cw + pad, y * ch + pad, cw - pad * 2, ch - pad * 2);
        }
      }
    }

    /* ---------- TUNNEL (mid energy — moving, not a rave) ---------- */
    draw_tunnel(g, w, h, a, dt) {
      g.fillStyle = "rgba(4, 2, 14, 0.5)";
      g.fillRect(0, 0, w, h);
      if (!this.stars.length) this.seedForMode("tunnel");

      const cx = w / 2;
      const cy = h / 2;

      // Lighter smoothing than synthwave's smoothLevels — more responsive
      const eRaw = gate(a.energy, 0.06, 1.35);
      const bRaw = gate(a.bass, 0.07, 1.35);
      const mRaw = gate(a.mid, 0.06, 1.3);
      const tRaw = gate(a.treble, 0.05, 1.25);
      this.smEnergy = lerp(this.smEnergy, eRaw * (0.45 + 0.55 * eRaw), 0.16);
      this.smBass = lerp(this.smBass, bRaw * (0.45 + 0.55 * bRaw), 0.18);
      this.smMid = lerp(this.smMid, mRaw * (0.5 + 0.5 * mRaw), 0.16);
      const energy = this.smEnergy;
      const bass = this.smBass;
      const mid = this.smMid;
      const treble = tRaw;

      // Halfway: muted was ~0.12e, hot was ~0.55e
      const scrollSpeed = 0.03 + energy * 0.32 + bass * 0.22;
      const spinSpeed = mid * 0.28 + treble * 0.12;
      this.tunnelScroll += scrollSpeed * dt;
      this.tunnelSpin += spinSpeed * dt;

      const layers = 12;
      for (let i = 0; i < layers; i++) {
        const base = (i + 1) / (layers + 1);
        let t = (base + this.tunnelScroll * 0.22) % 1;
        if (t < 0.02) t = 0.02;
        const depth = t * t * 0.35 + t * 0.65; // mild ease
        const pulse = 1 + bass * 0.1;
        const r = depth * Math.min(w, h) * 0.66 * pulse;
        if (r < 5) continue;

        let ringV = 0;
        if (a.freq && a.bins) {
          const idx = clamp(Math.floor((1 - t) * (a.bins - 1)), 0, a.bins - 1);
          ringV = Math.pow(a.freq[idx] / 255, 1.15);
        }
        ringV = clamp(ringV, 0, 1);

        const alpha = 0.14 + ringV * 0.45 + energy * 0.28 + bass * 0.15;
        const hue = 275 + i * 10 + mid * 25 + ringV * 25;
        const lw = 1.2 + depth * 2.2 + ringV * 2.2 + bass * 1.2;

        g.beginPath();
        const sides = 6;
        for (let s = 0; s <= sides; s++) {
          const ang = this.tunnelSpin + (s / sides) * Math.PI * 2;
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (s === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = hsl(hue, 92, 58 + ringV * 12, clamp(alpha, 0, 0.88));
        g.lineWidth = lw;
        g.stroke();
      }

      const voidGrad = g.createRadialGradient(cx, cy, 0, cx, cy, 55 + bass * 40);
      voidGrad.addColorStop(0, hsl(300, 75, 48, 0.1 + bass * 0.28));
      voidGrad.addColorStop(0.55, hsl(260, 70, 30, 0.06));
      voidGrad.addColorStop(1, "transparent");
      g.fillStyle = voidGrad;
      g.beginPath();
      g.arc(cx, cy, 90 + bass * 20, 0, Math.PI * 2);
      g.fill();

      // stars — medium speed, half of them
      const speed = (0.35 + energy * 3.5 + bass * 2.2) * dt * 60;
      for (let si = 0; si < this.stars.length; si++) {
        if (si % 2 !== 0) continue;
        const s = this.stars[si];
        if (speed > 0.03) s.z -= speed;
        if (s.z <= 1) {
          s.x = (Math.random() - 0.5) * w;
          s.y = (Math.random() - 0.5) * h;
          s.z = w;
        }
        const k = 95 / s.z;
        const x = cx + s.x * k;
        const y = cy + s.y * k;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const aDot = (0.15 + energy * 0.45) * (1 - s.z / w);
        g.fillStyle = hsl(195 + treble * 35, 88, 70, aDot);
        const sz = 1 + (1 - s.z / w) * 2.2;
        g.fillRect(x, y, sz, sz);
      }
    }

    /* ---------- PLASMA ---------- */
    draw_plasma(g, w, h, a, dt) {
      // low-res plasma into image data would be heavy; use blended blobs
      g.fillStyle = "rgba(10, 4, 18, 0.25)";
      g.fillRect(0, 0, w, h);
      if (!this.particles.length) this.seedForMode("plasma");
      for (const p of this.particles) {
        p.x += p.vx * (1 + a.energy * 3) * dt * 60;
        p.y += p.vy * (1 + a.energy * 3) * dt * 60;
        if (p.x < -50) p.x = w + 50;
        if (p.x > w + 50) p.x = -50;
        if (p.y < -50) p.y = h + 50;
        if (p.y > h + 50) p.y = -50;
        p.hue += dt * 20;
        const r = p.r * (1 + a.bass * 0.8);
        const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grd.addColorStop(0, hsl(p.hue + a.mid * 60, 90, 60, 0.55));
        grd.addColorStop(0.5, hsl(p.hue + 40, 85, 45, 0.25));
        grd.addColorStop(1, "transparent");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "screen";
      g.fillStyle = hsl(320, 80, 50, 0.05 + a.energy * 0.1);
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over";
    }

    /* ---------- CASSETTE ---------- */
    draw_cassette(g, w, h, a, dt) {
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#3a2060");
      bg.addColorStop(1, "#1a1030");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      // floating notes / particles from audio
      if (!this.particles.length) this.seedForMode("cassette");
      for (const p of this.particles) {
        p.x += p.vx + Math.sin(this.t + p.y) * 0.3;
        p.y += p.vy - a.energy * 1.5;
        if (p.y < -20) {
          p.y = h + 20;
          p.x = Math.random() * w;
        }
        g.fillStyle = hsl(p.hue, 80, 70, 0.5 + a.treble * 0.4);
        g.font = `${10 + a.mid * 10}px VT323, monospace`;
        g.fillText("♪", p.x, p.y);
      }

      // cassette body
      const cw = Math.min(w * 0.55, 340);
      const ch = cw * 0.62;
      const cx = (w - cw) / 2;
      const cy = (h - ch) / 2;
      g.fillStyle = "#c9b8a0";
      this.roundRect(g, cx, cy, cw, ch, 10);
      g.fill();
      g.fillStyle = "#2a2438";
      this.roundRect(g, cx + 16, cy + 16, cw - 32, ch - 32, 6);
      g.fill();

      // reels
      const reelY = cy + ch * 0.48;
      const reelR = ch * 0.16 + a.bass * 4;
      const spin = this.t * (2 + a.energy * 8);
      for (const rx of [cx + cw * 0.32, cx + cw * 0.68]) {
        g.fillStyle = "#5a4f72";
        g.beginPath();
        g.arc(rx, reelY, reelR, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#ffd36a";
        g.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const ang = spin + (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(rx, reelY);
          g.lineTo(rx + Math.cos(ang) * reelR * 0.85, reelY + Math.sin(ang) * reelR * 0.85);
          g.stroke();
        }
      }

      // label
      g.fillStyle = "#ff8fab";
      this.roundRect(g, cx + cw * 0.25, cy + 22, cw * 0.5, 22, 4);
      g.fill();
      g.fillStyle = "#2a2438";
      g.font = '10px "Press Start 2P", monospace';
      g.textAlign = "center";
      g.fillText("BITART", w / 2, cy + 38);
      g.textAlign = "left";

      // waveform ribbon
      g.strokeStyle = "#7ec8e3";
      g.lineWidth = 2;
      g.beginPath();
      const n = a.bins || 64;
      for (let i = 0; i < 48; i++) {
        const t = i / 47;
        const v = binAt(a.freq, n, t, a.sensitivity);
        const x = cx + 24 + t * (cw - 48);
        const y = cy + ch - 28 - v * 20;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }

    roundRect(g, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + rr, y);
      g.arcTo(x + w, y, x + w, y + h, rr);
      g.arcTo(x + w, y + h, x, y + h, rr);
      g.arcTo(x, y + h, x, y, rr);
      g.arcTo(x, y, x + w, y, rr);
      g.closePath();
    }
  }

  global.BitartModes = MODES;
  global.BitartViz = VizEngine;
})(window);
