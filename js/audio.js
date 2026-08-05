/* Bitart Visualizer — system audio + optional mic capture */
(function (global) {
  "use strict";

  const FFT_SIZE = 2048;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.analyser = null;
      this.freqData = null;
      this.timeData = null;
      this.systemStream = null;
      this.micStream = null;
      this.systemSource = null;
      this.micSource = null;
      this.merger = null;
      this.systemGain = null;
      this.micGain = null;
      this.micEnabled = false;
      this.live = false;
      this.sensitivity = 1;
      this._onEnded = null;
    }

    async ensureContext() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = FFT_SIZE;
        this.analyser.smoothingTimeConstant = 0.78;
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeData = new Uint8Array(this.analyser.fftSize);
        this.merger = this.ctx.createGain();
        this.merger.gain.value = 1;
        this.merger.connect(this.analyser);
        // Analyser only — no speakers (avoid feedback / double audio)
      }
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      return this.ctx;
    }

    /**
     * Primary: capture tab/window/system audio via getDisplayMedia.
     * User must check "Share audio" in the browser picker.
     */
    async startSystem() {
      await this.ensureContext();
      this.stopSystemOnly();

      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          systemAudio: "include",
          preferCurrentTab: false,
        });
      } catch (err) {
        if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) {
          throw new Error("Capture cancelled. Allow screen share and enable Share audio.");
        }
        throw err;
      }

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(
          "No audio track. In the share dialog, pick a tab/window and enable Share audio. Chrome/Edge work best."
        );
      }

      // We only need audio for analysis; stop video to save resources
      stream.getVideoTracks().forEach((t) => t.stop());

      this.systemStream = new MediaStream(audioTracks);
      this.systemSource = this.ctx.createMediaStreamSource(this.systemStream);
      this.systemGain = this.ctx.createGain();
      this.systemGain.gain.value = 1;
      this.systemSource.connect(this.systemGain);
      this.systemGain.connect(this.merger);

      audioTracks[0].addEventListener("ended", () => {
        this.stopSystemOnly();
        if (!this.micEnabled || !this.micStream) {
          this.live = false;
          if (typeof this._onEnded === "function") this._onEnded();
        }
      });

      this.live = true;
      return true;
    }

    async setMicEnabled(on) {
      this.micEnabled = !!on;
      await this.ensureContext();

      if (on) {
        if (this.micStream) return true;
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } catch (err) {
          this.micEnabled = false;
          throw new Error("Microphone permission denied or unavailable.");
        }
        this.micSource = this.ctx.createMediaStreamSource(this.micStream);
        this.micGain = this.ctx.createGain();
        this.micGain.gain.value = 1.1;
        this.micSource.connect(this.micGain);
        this.micGain.connect(this.merger);
        this.live = true;
        return true;
      }

      this.stopMicOnly();
      if (!this.systemStream) {
        this.live = false;
      }
      return false;
    }

    stopSystemOnly() {
      if (this.systemSource) {
        try { this.systemSource.disconnect(); } catch (_) {}
        this.systemSource = null;
      }
      if (this.systemGain) {
        try { this.systemGain.disconnect(); } catch (_) {}
        this.systemGain = null;
      }
      if (this.systemStream) {
        this.systemStream.getTracks().forEach((t) => t.stop());
        this.systemStream = null;
      }
    }

    stopMicOnly() {
      if (this.micSource) {
        try { this.micSource.disconnect(); } catch (_) {}
        this.micSource = null;
      }
      if (this.micGain) {
        try { this.micGain.disconnect(); } catch (_) {}
        this.micGain = null;
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
      }
    }

    stopAll() {
      this.stopSystemOnly();
      this.stopMicOnly();
      this.micEnabled = false;
      this.live = false;
    }

    setSensitivity(pct) {
      // 20–200 slider → multiplier
      this.sensitivity = Math.max(0.2, Math.min(2.5, (pct || 100) / 100));
    }

    onEnded(fn) {
      this._onEnded = fn;
    }

    sample() {
      if (!this.analyser) {
        return {
          freq: null,
          time: null,
          bass: 0,
          mid: 0,
          treble: 0,
          energy: 0,
          bins: 0,
        };
      }
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getByteTimeDomainData(this.timeData);

      const n = this.freqData.length;
      const s = this.sensitivity;
      let bass = 0, mid = 0, treble = 0, energy = 0;
      const bEnd = Math.floor(n * 0.08);
      const mEnd = Math.floor(n * 0.4);

      for (let i = 0; i < n; i++) {
        const v = (this.freqData[i] / 255) * s;
        energy += v;
        if (i < bEnd) bass += v;
        else if (i < mEnd) mid += v;
        else treble += v;
      }

      bass = Math.min(1, (bass / Math.max(1, bEnd)) * 1.4);
      mid = Math.min(1, (mid / Math.max(1, mEnd - bEnd)) * 1.2);
      treble = Math.min(1, (treble / Math.max(1, n - mEnd)) * 1.2);
      energy = Math.min(1, (energy / n) * 1.5);

      return {
        freq: this.freqData,
        time: this.timeData,
        bass,
        mid,
        treble,
        energy,
        bins: n,
        sensitivity: s,
      };
    }
  }

  global.BitartAudio = AudioEngine;
})(window);
