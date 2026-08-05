# Bitart Visualizer

Retro **pixel / 80s** music visualizer for the browser. Capture whatever is playing on your system (or add the mic) and pick a vibe.

**Live:** after GitHub Pages is on — `https://rohsomeness.github.io/bitart-visualizer/`

Sibling to [bitart-ambient](https://github.com/Rohsomeness/bitart-ambient).

## How it listens

| Source | How |
|--------|-----|
| **System / tab audio** (primary) | Press **Listen** → browser share dialog → pick a tab/window/screen and enable **Share audio** |
| **Microphone** (toggle) | Press the mic chip (or `M`) — works alone or mixed with system capture |

No Spotify required. Pure static site (Web Audio + `getDisplayMedia` / `getUserMedia`).

> Chrome or Edge work best for system audio. Firefox often cannot share tab/system audio.

## Modes (12)

Chooser thumbs were generated with **Grok Imagine** (bitart / synthwave set).

| Mode | Vibe |
|------|------|
| Bars | Classic neon EQ bars |
| Rings | Concentric neon spectrum rings |
| Rain | Pixel rain matrix |
| Synthwave | Grid + sunset horizon |
| Scope | Green CRT oscilloscope |
| Stars | Starfield warp |
| Disco | Light-up dance floor |
| Boombox | Cute VU meters + LEDs |
| Matrix | Amber LED waveform board |
| Tunnel | Hex neon arcade tunnel |
| Plasma | Lava-lamp plasma blobs |
| Cassette | Spinning reels + ribbon |

Deep links: `?mode=synthwave` or `#` via the mode id in the URL.

## Controls

- **Space** — start/stop system capture  
- **← →** — prev/next mode  
- **F** — fullscreen  
- **H** — hide/show player  
- **M** — mic toggle  
- **G** — all-modes grid  
- **SENS** slider — analysis sensitivity  

## Local

Open `index.html` over a local server (mic/system capture need a secure context):

```bash
npx serve .
```

Then open the printed URL (usually `http://localhost:3000`).

## GitHub Pages

Repo Settings → Pages → Deploy from branch `main` / root (`/`).

## Stack

- Static HTML / CSS / JS  
- Web Audio `AnalyserNode`  
- Canvas 2D visualizers  
- UI shell styled like Bitart Ambient (thocky player, LCD, scene rail + modal)
