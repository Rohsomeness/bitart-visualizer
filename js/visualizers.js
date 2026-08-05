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
      this.initModeState();
    }

    initModeState() {
      this.particles = [];
      this.stars = [];
      this.rain = [];
      this.smoothBars = null;
      this.pulse = 0;
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
      if (id === "starfield" || id === "tunnel") {
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
      if (id === "rain") {
        this.rain = [];
        for (let i = 0; i < 80; i++) {
          this.rain.push({
            x: Math.random() * w,
            y: Math.random() * h,
            speed: 1 + Math.random() * 4,
            len: 6 + Math.random() * 18,
            hue: 280 + Math.random() * 80,
          });
        }
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
      g.fillStyle = "rgba(8, 4, 16, 0.35)";
      g.fillRect(0, 0, w, h);
      if (!this.rain.length) this.seedForMode("rain");
      const boost = 1 + (a.energy || 0) * 6;
      for (const d of this.rain) {
        d.y += d.speed * boost * (dt * 60);
        d.x += Math.sin(this.t + d.y * 0.01) * 0.4;
        if (d.y > h + 20) {
          d.y = -20;
          d.x = Math.random() * w;
          d.hue = 260 + Math.random() * 100;
        }
        const v = binAt(a.freq, a.bins, d.x / w, a.sensitivity);
        g.strokeStyle = hsl(d.hue, 90, 65, 0.4 + v * 0.6);
        g.lineWidth = 2 + v * 3;
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x, d.y + d.len * (1 + v));
        g.stroke();
      }
      // bass flash
      if (a.bass > 0.55) {
        g.fillStyle = hsl(300, 100, 60, (a.bass - 0.55) * 0.25);
        g.fillRect(0, 0, w, h);
      }
    }

    /* ---------- SYNTHWAVE ---------- */
    draw_synthwave(g, w, h, a) {
      // sky
      const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
      sky.addColorStop(0, "#1a0a3a");
      sky.addColorStop(0.5, "#4a1a6a");
      sky.addColorStop(1, "#ff6b9d");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h * 0.55);

      // sun
      const sunY = h * 0.38 - a.bass * 12;
      const sunR = Math.min(w, h) * 0.14 + a.mid * 10;
      const sun = g.createRadialGradient(w / 2, sunY, 0, w / 2, sunY, sunR);
      sun.addColorStop(0, "#ffe566");
      sun.addColorStop(0.5, "#ff8c42");
      sun.addColorStop(1, "#ff4d6d");
      g.fillStyle = sun;
      g.beginPath();
      g.arc(w / 2, sunY, sunR, 0, Math.PI * 2);
      g.fill();
      // sun bars
      g.fillStyle = "#4a1a6a";
      for (let i = 0; i < 6; i++) {
        const yy = sunY - sunR * 0.2 + i * (sunR * 0.28);
        g.fillRect(w / 2 - sunR, yy, sunR * 2, 3 + i);
      }

      // mountains
      g.fillStyle = "#2a1448";
      g.beginPath();
      g.moveTo(0, h * 0.55);
      for (let x = 0; x <= w; x += 20) {
        const n = Math.sin(x * 0.02) * 30 + Math.sin(x * 0.05) * 15;
        g.lineTo(x, h * 0.48 + n - a.treble * 8);
      }
      g.lineTo(w, h * 0.55);
      g.closePath();
      g.fill();

      // ground
      g.fillStyle = "#0d0618";
      g.fillRect(0, h * 0.55, w, h * 0.45);

      // perspective grid
      const horizon = h * 0.55;
      g.strokeStyle = hsl(310, 90, 65, 0.55 + a.energy * 0.35);
      g.lineWidth = 1.5;
      const scroll = (this.t * (40 + a.bass * 80)) % 40;
      for (let i = 0; i < 16; i++) {
        const y = horizon + Math.pow(i / 15, 1.8) * (h - horizon) + scroll * 0.4;
        if (y > h) continue;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      for (let i = -12; i <= 12; i++) {
        g.beginPath();
        g.moveTo(w / 2 + i * 8, horizon);
        g.lineTo(w / 2 + i * w * 0.55, h);
        g.stroke();
      }
    }

    /* ---------- SCOPE ---------- */
    draw_scope(g, w, h, a) {
      g.fillStyle = "#0a1408";
      g.fillRect(0, 0, w, h);
      // grid
      g.strokeStyle = "rgba(40, 120, 40, 0.25)";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }
      for (let y = 0; y < h; y += 32) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }
      // crosshair
      g.strokeStyle = "rgba(60, 160, 60, 0.35)";
      g.beginPath();
      g.moveTo(0, h / 2); g.lineTo(w, h / 2);
      g.moveTo(w / 2, 0); g.lineTo(w / 2, h);
      g.stroke();

      g.beginPath();
      const time = a.time;
      const n = time ? time.length : 0;
      if (n) {
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const v = ((time[i] - 128) / 128) * a.sensitivity;
          const y = h / 2 + v * (h * 0.4);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      } else {
        for (let i = 0; i < 128; i++) {
          const x = (i / 127) * w;
          const y = h / 2 + Math.sin(this.t * 3 + i * 0.2) * 12;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      }
      g.strokeStyle = "#5dff7a";
      g.lineWidth = 2;
      g.shadowColor = "#3dff5a";
      g.shadowBlur = 12;
      g.stroke();
      g.shadowBlur = 0;
      g.globalAlpha = 0.35;
      g.strokeStyle = "#a8ffb8";
      g.lineWidth = 1;
      g.stroke();
      g.globalAlpha = 1;
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

    /* ---------- TUNNEL ---------- */
    draw_tunnel(g, w, h, a, dt) {
      g.fillStyle = "rgba(4, 2, 12, 0.4)";
      g.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const layers = 14;
      const spin = this.t * (0.4 + a.mid * 1.2);
      for (let i = layers; i >= 0; i--) {
        const t = (i / layers + this.t * (0.15 + a.energy * 0.4)) % 1;
        const scale = t * t;
        const r = scale * Math.min(w, h) * 0.7;
        const sides = 6;
        const hue = 280 + i * 12 + a.bass * 40;
        g.beginPath();
        for (let s = 0; s <= sides; s++) {
          const ang = spin + (s / sides) * Math.PI * 2;
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (s === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = hsl(hue, 95, 60, 0.2 + t * 0.7);
        g.lineWidth = 2 + (1 - t) * 4 + a.bass * 3;
        g.stroke();
      }
      // speed lines
      if (!this.stars.length) this.seedForMode("tunnel");
      const speed = 4 + a.energy * 20;
      for (const s of this.stars) {
        s.z -= speed * dt * 60;
        if (s.z <= 1) {
          s.x = (Math.random() - 0.5) * w;
          s.y = (Math.random() - 0.5) * h;
          s.z = w;
        }
        const k = 80 / s.z;
        const x = cx + s.x * k;
        const y = cy + s.y * k;
        g.fillStyle = hsl(190, 90, 70, 0.4);
        g.fillRect(x, y, 2, 2);
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
