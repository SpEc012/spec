# ✦ SpEc — Æon's little neon city

A calm, aesthetic bio page: a 3D card floating in front of a rainy three.js night city, with background music and a "click to enter" splash.

It's a static site (no build step), ready for GitHub Pages.

## What's in it

- **Click to enter**: a blurred splash over the live city, which lets the music start (browsers block autoplay with sound until you click).
- **Horizontal 3D card**: frosted glass that tilts toward your mouse (or phone tilt), with floating depth layers, a moving glare and an animated neon border. Hit **flip** (or press `F`) and it spins over to an "about" side.
- **Front of the card**:
  - avatar with a glowing ring and an orbiting star
  - your name with twinkling sparkles
  - a typed tagline that cycles through lines
  - location, badges and a row of glowing social icons
  - a Discord widget (click it to copy your username) and a music widget
  - a views counter
- **Back of the card**: your quote, member-since date, local time, what's on repeat, your links and the keyboard shortcuts.
- **three.js night city**: about 1,100 buildings with flickering windows, waterfront traffic, blinking tower lights, a pixel-art moon, pixel stars, drifting haze and the odd shooting star, across a bay with pixel-banded reflections.
- **Weather**: rain, snow or a clear night. Rain brings ripples on the water and soft lightning with distant thunder. The rain and wind sounds are synthesized live, so there are no extra files.
- **Music**: the city lights pulse with the beat. The player has a spinning vinyl, a pixel visualizer and seek. Volume sits top-left.
- **Dock (bottom-right)**: weather, ambience and pixel mode. Keys: `W` `A` `P` `M` `F` `Space`.
- **Extras**: custom cursor with a pixel-sparkle trail, animated tab title, film grain, a 404 page, `prefers-reduced-motion` support and adaptive render quality.

On phones the card stacks vertically, since a sideways card won't fit.

## Editing

Almost everything lives in **`assets/js/config.js`**:

| what | where |
| --- | --- |
| name, username, location, Discord status line | `profile` |
| typed lines under your name | `profile.taglines` |
| back-of-card quote and member-since date | `profile.about`, `profile.memberSince` |
| badges (icon + tooltip + color) | `badges` |
| social icons (`#` = placeholder, shows "coming soon") | `socials` |
| link buttons on the back | `links` |
| songs (add more and ⏮ ⏭ appear) | `playlist` |
| views counter on/off | `views` |
| default weather / ambience / volume | `sceneDefaults` |
| live Discord status | `profile.discordId` (join the Lanyard server first) |

Icons for badges and socials are listed in `assets/js/icons.js`. The avatar is in `assets/img/` and music goes in `assets/audio/`.

The views counter uses [counterapi.dev](https://counterapi.dev), a free counter service. Each browser counts once per day. If the service can't be reached, the counter just stays hidden.

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
