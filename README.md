# ✦ SpEc — Æon's little neon city

A calm, aesthetic bio page: a 3D card floating in front of a rainy three.js night city, with background music and a "click to enter" splash.

It's a static site (no build step), ready for GitHub Pages.

## What's in it

- **Click to enter**: a blurred splash over the live city, which lets the music start (browsers block autoplay with sound until you click).
- **three.js night city**: about 1,000 procedurally lit buildings, windows that flicker on and off, a waterfront with traffic, blinking tower lights, a pixel-art crescent moon, twinkling pixel stars, drifting haze and the odd shooting star.
- **Reflective bay**: water with banded, pixel-art-style reflections and rain ripples.
- **Weather**: rain, snow or a clear night, with smooth crossfades. Rain brings occasional soft lightning and distant thunder.
- **Ambience**: rain patter and snowy wind are synthesized live with the Web Audio API, so there are no extra audio files.
- **Music-reactive city**: the window lights and bloom pulse gently with the beat.
- **3D tilt card**: a frosted-glass card with parallax depth layers, a cursor glare and an animated neon border.
- **Discord-style profile**: banner, avatar with a neon ring, idle moon status and pixel skulls, a status bubble, the gothic gradient name, a server tag and a badge row with tooltips.
- **Typed bio**, member-since date, connections and a social icon row. The Discord icon copies your username to the clipboard.
- **Music player**: a spinning vinyl disc, a pixel visualizer, seek, volume and a playlist (prev/next).
- **Dock**: weather, ambience, pixel mode (a low-res retro render) and mute. Keyboard shortcuts: `W` `A` `P` `M` `Space`.
- **Extras**: custom cursor with a pixel-sparkle trail, animated tab title, local clock, film grain, a 404 page, and `prefers-reduced-motion` support.
- **Live Discord presence (optional)**: shows your real status and what you're playing or listening to, via [Lanyard](https://github.com/Phineas/lanyard).
- **Adaptive quality**: drops the render resolution on slower GPUs, and falls back to a flat sky if WebGL isn't available.

## Editing

Almost everything lives in **`assets/js/config.js`**:

| what | where |
| --- | --- |
| name, username, status bubble, bio | `profile` |
| badges (icon + tooltip + color) | `badges` |
| social links (`#` = placeholder, shows "coming soon") | `socials` |
| connection rows | `connections` |
| songs (add more and ⏮ ⏭ will cycle them) | `playlist` |
| default weather / ambience / volume | `sceneDefaults` |
| live Discord status | `profile.discordId` (join the Lanyard server first) |

Icons available for badges and socials are listed in `assets/js/icons.js`.
The avatar and banner are in `assets/img/`, and music goes in `assets/audio/`.

## Run locally

Browsers block ES modules on `file://`, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publish on GitHub Pages

1. Go to the repo's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Pick the branch that has these files, set the folder to `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/spec/`.

## Credits

- [three.js](https://threejs.org): MIT, vendored in `assets/vendor/three`.
- [Simple Icons](https://simpleicons.org): CC0. [Lucide](https://lucide.dev): ISC.
- Fonts: Grenze Gotisch, Pixelify Sans and Outfit, from Google Fonts (OFL).
- Music: "House Song" by Searows. All rights belong to the artist.
