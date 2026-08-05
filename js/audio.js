/* Bitart Visualizer — system audio + optional mic capture
 *
 * Why screen share? Browsers have no silent "system audio" API for websites.
 * Tab/window/system audio is only exposed through getDisplayMedia (the same
 * picker as screen sharing), with an optional audio track. Mic is separate
 * (getUserMedia). We never play the captured audio back — analysis only.
 */
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
      /** True while actively feeding the analyser (not paused). */
      this.live = false;
      /** Share is held but visualizer is paused (no re-prompt on resume). */
      this.paused = false;
      this.sensitivity = 1;
      this._onEnded = null;
      this._displayStream = null; // original getDisplayMedia stream (may include video)
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
        // Analyser only — not connected to destination (no feedback / double audio)
      }
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      return this.ctx;
    }

    /** System/tab share still open (track live). */
    hasSystemShare() {
      const t = this.systemStream && this.systemStream.getAudioTracks()[0];
      return !!(t && t.readyState === "live");
    }

    hasMic() {
      const t = this.micStream && this.micStream.getAudioTracks()[0];
      return !!(t && t.readyState === "live");
    }

    /**
     * Start system/tab audio capture, or resume if share is already held.
     * getDisplayMedia is only called when there is no active share.
     */
    async startSystem() {
      await this.ensureContext();

      if (this.hasSystemShare()) {
        this._setSystemMuted(false);
        this.paused = false;
        this.live = true;
        return { reused: true };
      }

      // Full teardown only if a dead/partial stream lingers
      this._teardownSystem(false);

      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // required by the API even when we only want audio
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

      this._displayStream = stream;

      // Prefer to keep video track alive so some browsers keep the share session stable;
      // we never attach video to the DOM. Disable it to save CPU.
      stream.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });

      this.systemStream = new MediaStream([audioTracks[0]]);
      this.systemSource = this.ctx.createMediaStreamSource(this.systemStream);
      this.systemGain = this.ctx.createGain();
      this.systemGain.gain.value = 1;
      this.systemSource.connect(this.systemGain);
      this.systemGain.connect(this.merger);

      const onTrackEnded = () => {
        // Browser "Stop sharing" or track death — full release
        this._teardownSystem(true);
        this._recomputeLive();
        if (typeof this._onEnded === "function") this._onEnded();
      };
      audioTracks[0].addEventListener("ended", onTrackEnded);
      stream.getVideoTracks().forEach((t) => t.addEventListener("ended", onTrackEnded));

      this.paused = false;
      this.live = true;
      return { reused: false };
    }

    /** Pause analysis; keep the share so resume does not re-prompt. */
    pause() {
      this.paused = true;
      this.live = false;
      this._setSystemMuted(true);
      if (this.micGain) this.micGain.gain.value = 0;
    }

    /** Resume after pause without re-requesting permission. */
    resume() {
      if (!this.hasSystemShare() && !this.hasMic()) {
        return false;
      }
      this.paused = false;
      this._setSystemMuted(false);
      if (this.micGain && this.micEnabled) this.micGain.gain.value = 1.1;
      this.live = true;
      return true;
    }

    async setMicEnabled(on) {
      this.micEnabled = !!on;
      await this.ensureContext();

      if (on) {
        if (this.hasMic()) {
          if (this.micGain) this.micGain.gain.value = this.paused ? 0 : 1.1;
          if (!this.paused) this.live = true;
          return true;
        }
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
        this.micGain.gain.value = this.paused ? 0 : 1.1;
        this.micSource.connect(this.micGain);
        this.micGain.connect(this.merger);

        this.micStream.getAudioTracks()[0].addEventListener("ended", () => {
          this.stopMicOnly();
          this.micEnabled = false;
          this._recomputeLive();
          if (typeof this._onEnded === "function") this._onEnded();
        });

        if (!this.paused) this.live = true;
        return true;
      }

      // Turn off mic but do not kill system share
      this.stopMicOnly();
      this._recomputeLive();
      return false;
    }

    _setSystemMuted(muted) {
      if (this.systemGain) {
        this.systemGain.gain.value = muted ? 0 : 1;
      }
      if (this.systemStream) {
        this.systemStream.getAudioTracks().forEach((t) => {
          t.enabled = !muted;
        });
      }
    }

    _teardownSystem(stopTracks) {
      if (this.systemSource) {
        try { this.systemSource.disconnect(); } catch (_) {}
        this.systemSource = null;
      }
      if (this.systemGain) {
        try { this.systemGain.disconnect(); } catch (_) {}
        this.systemGain = null;
      }
      if (stopTracks) {
        if (this.systemStream) {
          this.systemStream.getTracks().forEach((t) => t.stop());
        }
        if (this._displayStream) {
          this._displayStream.getTracks().forEach((t) => t.stop());
        }
      }
      this.systemStream = null;
      this._displayStream = null;
    }

    stopSystemOnly() {
      this._teardownSystem(true);
      this._recomputeLive();
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

    /** Fully release capture (will re-prompt next listen). */
    stopAll() {
      this._teardownSystem(true);
      this.stopMicOnly();
      this.micEnabled = false;
      this.paused = false;
      this.live = false;
    }

    _recomputeLive() {
      const any = this.hasSystemShare() || this.hasMic();
      if (!any) {
        this.live = false;
        this.paused = false;
      } else if (this.paused) {
        this.live = false;
      } else {
        this.live = true;
      }
    }

    setSensitivity(pct) {
      this.sensitivity = Math.max(0.2, Math.min(2.5, (pct || 100) / 100));
    }

    onEnded(fn) {
      this._onEnded = fn;
    }

    sample() {
      const empty = {
        freq: null,
        time: null,
        bass: 0,
        mid: 0,
        treble: 0,
        energy: 0,
        bins: 0,
        sensitivity: this.sensitivity,
      };

      if (!this.analyser || !this.live || this.paused) {
        return empty;
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
