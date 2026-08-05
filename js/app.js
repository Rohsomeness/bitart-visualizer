/* Bitart Visualizer — UI + main loop */
(function () {
  "use strict";

  const modes = window.BitartModes;
  const audio = new window.BitartAudio();
  const canvas = document.getElementById("viz");
  const viz = new window.BitartViz(canvas);

  let modeIndex = 0;
  let raf = 0;
  let lastT = performance.now();
  let dragging = false;
  let dragOffX = 0;
  let dragOffY = 0;

  const $ = (id) => document.getElementById(id);
  const lcdMode = $("lcdMode");
  const lcdStatus = $("lcdStatus");
  const eq = $("eq");
  const brandDot = $("brandDot");
  const btnListen = $("btnListen");
  const listenIcon = $("listenIcon");
  const btnMic = $("btnMic");
  const sensSlider = $("sensSlider");
  const sensVal = $("sensVal");
  const sceneRail = $("sceneRail");
  const sceneModal = $("sceneModal");
  const sceneModalGrid = $("sceneModalGrid");
  const sceneModalCount = $("sceneModalCount");
  const player = $("player");

  function modeFromUrl() {
    const params = new URLSearchParams(location.search);
    const q = params.get("mode") || params.get("scene");
    const hash = location.hash.replace(/^#/, "");
    const id = q || hash || null;
    if (!id) return 0;
    const i = modes.findIndex((m) => m.id === id);
    return i >= 0 ? i : 0;
  }

  function setUrlMode(id) {
    const url = new URL(location.href);
    url.searchParams.set("mode", id);
    history.replaceState(null, "", url.pathname + url.search + url.hash.replace(/#.*/, ""));
  }

  function setMode(index, opts) {
    modeIndex = (index + modes.length) % modes.length;
    const m = modes[modeIndex];
    viz.setMode(m.id);
    lcdMode.textContent = m.name.toUpperCase();
    document.body.dataset.mode = m.id;
    document.querySelectorAll(".scene-btn, .scene-modal-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === m.id);
    });
    const activeBtn = sceneRail.querySelector(`.scene-btn[data-id="${m.id}"]`);
    if (activeBtn && !(opts && opts.skipScroll)) {
      activeBtn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
    if (!(opts && opts.skipUrl)) setUrlMode(m.id);
  }

  function buildRail() {
    sceneRail.innerHTML = "";
    modes.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scene-btn";
      btn.dataset.id = m.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", m.name);
      btn.innerHTML = `<img class="scene-thumb" src="${m.thumb}" alt="" loading="lazy" /><span class="scene-name">${m.name}</span>`;
      btn.addEventListener("click", () => setMode(modes.findIndex((x) => x.id === m.id)));
      sceneRail.appendChild(btn);
    });
  }

  function buildModal() {
    sceneModalGrid.innerHTML = "";
    sceneModalCount.textContent = String(modes.length);
    modes.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scene-modal-item";
      btn.dataset.id = m.id;
      btn.setAttribute("role", "option");
      btn.innerHTML = `<img src="${m.thumb}" alt="" loading="lazy" /><span>${m.name}</span>`;
      btn.addEventListener("click", () => {
        setMode(modes.findIndex((x) => x.id === m.id));
        closeModal();
      });
      sceneModalGrid.appendChild(btn);
    });
  }

  function openModal() {
    sceneModal.hidden = false;
    sceneModal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    sceneModal.hidden = true;
    sceneModal.setAttribute("aria-hidden", "true");
  }

  function setLiveUI(live) {
    document.body.classList.toggle("is-live", live);
    btnListen.classList.toggle("is-playing", live);
    listenIcon.textContent = live ? "■" : "▶";
    brandDot.classList.toggle("live", live);
    eq.classList.toggle("live", live);
    lcdStatus.classList.toggle("playing", live);
    if (live) {
      lcdStatus.textContent = audio.micEnabled && audio.systemStream
        ? "SYS+MIC"
        : audio.micEnabled && !audio.systemStream
          ? "MIC"
          : "LIVE";
    } else {
      lcdStatus.textContent = "READY";
    }
  }

  async function toggleListen() {
    if (audio.live && audio.systemStream) {
      audio.stopAll();
      btnMic.setAttribute("aria-pressed", "false");
      setLiveUI(false);
      return;
    }
    lcdStatus.textContent = "SHARE…";
    try {
      await audio.startSystem();
      setLiveUI(true);
    } catch (err) {
      console.warn(err);
      lcdStatus.textContent = "ERR";
      alert(err.message || String(err));
      setLiveUI(false);
    }
  }

  async function toggleMic() {
    const next = btnMic.getAttribute("aria-pressed") !== "true";
    try {
      await audio.setMicEnabled(next);
      btnMic.setAttribute("aria-pressed", next ? "true" : "false");
      setLiveUI(audio.live);
      if (next && !audio.systemStream) {
        lcdStatus.textContent = "MIC";
      }
    } catch (err) {
      btnMic.setAttribute("aria-pressed", "false");
      alert(err.message || String(err));
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const sample = audio.sample();
    viz.draw(sample, dt);

    // drive LCD eq heights from real audio when live
    if (audio.live && sample.freq) {
      const spans = eq.querySelectorAll("span");
      const step = Math.floor(sample.bins / spans.length);
      spans.forEach((span, i) => {
        const v = sample.freq[i * step] / 255;
        span.style.height = `${Math.max(15, v * 100)}%`;
        span.style.animation = "none";
        span.style.opacity = "0.85";
      });
    }

    raf = requestAnimationFrame(loop);
  }

  function resize() {
    viz.resize();
  }

  /* ----- wire UI ----- */
  btnListen.addEventListener("click", toggleListen);
  btnMic.addEventListener("click", toggleMic);

  $("btnPrev").addEventListener("click", () => setMode(modeIndex - 1));
  $("btnNext").addEventListener("click", () => setMode(modeIndex + 1));
  $("btnScenePrev").addEventListener("click", () => {
    sceneRail.scrollBy({ left: -160, behavior: "smooth" });
  });
  $("btnSceneNext").addEventListener("click", () => {
    sceneRail.scrollBy({ left: 160, behavior: "smooth" });
  });
  $("btnSceneGrid").addEventListener("click", openModal);
  $("btnSceneModalClose").addEventListener("click", closeModal);
  $("sceneModalBackdrop").addEventListener("click", closeModal);

  $("btnHide").addEventListener("click", () => {
    document.body.classList.add("player-collapsed");
  });
  $("btnShow").addEventListener("click", () => {
    document.body.classList.remove("player-collapsed");
  });

  $("btnFs").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {}
  });

  document.addEventListener("fullscreenchange", () => {
    document.body.classList.toggle("fullscreen", !!document.fullscreenElement);
    if (!document.fullscreenElement) {
      player.classList.remove("is-dragging");
      player.style.left = "";
      player.style.top = "";
      player.style.bottom = "";
      player.style.transform = "";
    }
    resize();
  });

  sensSlider.addEventListener("input", () => {
    sensVal.textContent = sensSlider.value;
    audio.setSensitivity(Number(sensSlider.value));
  });
  audio.setSensitivity(Number(sensSlider.value));

  audio.onEnded(() => {
    setLiveUI(false);
    btnMic.setAttribute("aria-pressed", "false");
  });

  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "Space") {
      e.preventDefault();
      toggleListen();
    } else if (e.code === "ArrowLeft") {
      setMode(modeIndex - 1);
    } else if (e.code === "ArrowRight") {
      setMode(modeIndex + 1);
    } else if (e.key === "f" || e.key === "F") {
      $("btnFs").click();
    } else if (e.key === "h" || e.key === "H") {
      document.body.classList.toggle("player-collapsed");
    } else if (e.key === "m" || e.key === "M") {
      toggleMic();
    } else if (e.key === "g" || e.key === "G") {
      if (sceneModal.hidden) openModal();
      else closeModal();
    } else if (e.key === "Escape") {
      closeModal();
    }
  });

  // Drag player in fullscreen
  function onPointerDown(e) {
    if (!document.body.classList.contains("fullscreen")) return;
    if (e.target.closest("button, input, a")) return;
    const header = e.target.closest(".player-header");
    if (!header) return;
    dragging = true;
    player.classList.add("is-dragging");
    const rect = player.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    player.style.left = rect.left + "px";
    player.style.top = rect.top + "px";
    player.style.bottom = "auto";
    player.style.transform = "none";
    player.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const x = clamp(e.clientX - dragOffX, 0, window.innerWidth - player.offsetWidth);
    const y = clamp(e.clientY - dragOffY, 0, window.innerHeight - player.offsetHeight);
    player.style.left = x + "px";
    player.style.top = y + "px";
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    player.classList.remove("is-dragging");
    try { player.releasePointerCapture?.(e.pointerId); } catch (_) {}
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  player.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  window.addEventListener("resize", resize);

  // boot
  buildRail();
  buildModal();
  setMode(modeFromUrl(), { skipUrl: false });
  resize();
  raf = requestAnimationFrame(loop);
})();
