// ─────────────────────────────────────────────────────────────
//  Neon night city — three.js scene
//  water reflections · procedural windows · rain / snow ·
//  traffic · stars · pixel moon · lightning · shooting stars
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const PALETTE = {
  pink: '#ff4fd8',
  cyan: '#4ff0ff',
  lavender: '#a98bff',
  warm: '#ffb36b',
  white: '#d9c6ff',
};

// deterministic random so the skyline is the same every visit
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// shared GLSL helpers
const GLSL_COMMON = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float fogFactor(float depth, float density) {
    float f = density * depth;
    return 1.0 - exp(-f * f);
  }
`;

export class CityScene {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.audioLevel = 0;
    this.weather = { rain: 0, snow: 0, targetRain: 0, targetSnow: 1 };
    this.flash = 0;
    this.nextLightning = 18 + Math.random() * 20;
    this.nextShootingStar = 5 + Math.random() * 6;
    this.onLightning = null;
    this.pixelMode = false;
    this.qualityScale = 1;
    this.running = false;
    this.frameTimes = [];
    this.adaptDone = false;

    this.camState = {
      mode: 'idle-intro', // idle-intro → flying → idle
      from: new THREE.Vector3(0, 30, 120),
      to: new THREE.Vector3(0, 6.5, 44),
      t: 0,
      duration: 4.2,
      base: new THREE.Vector3(0, 30, 120),
      lookFrom: new THREE.Vector3(0, 26, -60),
      lookTo: new THREE.Vector3(0, 15, -90),
      look: new THREE.Vector3(0, 26, -60),
    };

    this.#initRenderer();
    this.#initScene();
    this.#initPost();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ───────────── setup ─────────────
  #initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(0x07020f, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  }

  #initScene() {
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2400);
    this.camera.position.copy(this.camState.from);

    this.U = {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uPulse: { value: 0 },
      uFogColor: { value: new THREE.Color('#2a0f4d') },
      uFogDensity: { value: 0.0041 },
    };

    this.#buildSky();
    this.#buildStars();
    this.#buildMoon();
    this.#buildHaze();
    this.#buildCity();
    this.#buildTraffic();
    this.#buildWater();
    this.#buildRain();
    this.#buildSnow();
    this.#buildShootingStar();

    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  }

  #initPost() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.62, 0.22, 0.26);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ───────────── sky ─────────────
  #buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#05010c') },
        uMid: { value: new THREE.Color('#140630') },
        uHorizon: { value: new THREE.Color('#2f1157') },
        uGlow: { value: new THREE.Color('#6a1f78') },
        uFlash: this.U.uFlash,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform vec3 uTop, uMid, uHorizon, uGlow;
        uniform float uFlash;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          col = mix(col, uTop, smoothstep(0.18, 0.75, h));
          float toward = 0.55 + 0.45 * max(-d.z, 0.0);
          col += uGlow * exp(-max(h, 0.0) * 11.0) * toward * 0.7;
          col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.06, h));
          // lightning lights the clouds from within
          col += uFlash * vec3(0.55, 0.42, 0.9) * (0.25 + 0.75 * smoothstep(-0.02, 0.35, h)) * 0.3;
          // dither to kill banding
          col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    this.scene.add(sky);
  }

  #buildStars() {
    const rand = mulberry32(7);
    const count = 1000;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // upper hemisphere, denser toward zenith
      const u = rand() * Math.PI * 2;
      const v = Math.pow(rand(), 0.7) * 0.95 + 0.05;
      const r = 1300;
      const cy = v;
      const sy = Math.sqrt(1 - cy * cy);
      pos[i * 3] = Math.cos(u) * sy * r;
      pos[i * 3 + 1] = cy * r;
      pos[i * 3 + 2] = Math.sin(u) * sy * r;
      size[i] = rand() < 0.04 ? 7 + rand() * 3 : 1.4 + rand() * 1.8;
      phase[i] = rand() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.U.uTime, uPR: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uPR;
        attribute float aSize, aPhase;
        varying float vTw;
        varying float vBig;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * (0.6 + fract(aPhase) * 1.6) + aPhase);
          vTw = tw;
          vBig = step(5.0, aSize);
          gl_PointSize = aSize * uPR * (vBig > 0.5 ? (0.7 + 0.3 * tw) : 1.0);
          // fade near horizon (city glow washes them out)
          vTw *= smoothstep(0.02, 0.25, normalize(position).y);
        }`,
      fragmentShader: /* glsl */ `
        varying float vTw;
        varying float vBig;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a;
          if (vBig > 0.5) {
            // pixel "plus" sparkle, like the avatar's stars
            float plus = max(step(abs(c.x), 0.09) * step(abs(c.y), 0.5),
                             step(abs(c.y), 0.09) * step(abs(c.x), 0.5));
            float core = step(length(c), 0.16);
            a = max(plus * 0.85, core);
          } else {
            a = step(max(abs(c.x), abs(c.y)), 0.5);
          }
          vec3 col = mix(vec3(0.85, 0.75, 1.0), vec3(1.0, 0.8, 0.95), vBig);
          gl_FragColor = vec4(col * 1.4, a * vTw);
        }`,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  #buildMoon() {
    // pixel-art crescent drawn on a tiny canvas → NearestFilter for crisp pixels
    const S = 40;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const R = 15, cx = 20, cy = 20, ox = 26.5, oy = 15.5, R2 = 13.5;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const px = x + 0.5, py = y + 0.5;
        const inA = (px - cx) ** 2 + (py - cy) ** 2 <= R * R;
        const inB = (px - ox) ** 2 + (py - oy) ** 2 <= R2 * R2;
        const i = (y * S + x) * 4;
        if (inA && !inB) {
          // shade: brighter toward outer rim
          const d = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2) - R2;
          const t = clamp(d / 6, 0, 1);
          img.data[i] = lerp(255, 236, t);
          img.data[i + 1] = lerp(214, 170, t);
          img.data[i + 2] = lerp(255, 240, t);
          img.data[i + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;

    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1.05, 1.0, 1.08), fog: false, depthWrite: false })
    );
    moon.scale.setScalar(96);
    moon.position.set(330, 470, -1050);
    moon.renderOrder = -5;

    const haloTex = this.#radialTexture('rgba(255,170,240,0.55)', 'rgba(150,80,255,0)');
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        transparent: true,
        opacity: 0.32,
      })
    );
    halo.scale.setScalar(420);
    halo.position.copy(moon.position).add(new THREE.Vector3(0, 0, -5));
    halo.renderOrder = -6;
    this.moon = moon;
    this.moonHalo = halo;
    this.scene.add(halo, moon);
  }

  #radialTexture(inner, outer, size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  #buildHaze() {
    // soft drifting cloud banks for depth
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const rand = mulberry32(42);
    for (let i = 0; i < 70; i++) {
      const x = 60 + rand() * 392, y = 90 + rand() * 80, r = 30 + rand() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.haze = [];
    const tints = ['#7a3fa8', '#5a2a9a', '#9a3f9f', '#4a2a8a'];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: tex,
          color: new THREE.Color(tints[i % tints.length]),
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          fog: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const w = 700 + rand() * 600;
      m.scale.set(w, w * 0.32, 1);
      m.position.set(-600 + rand() * 1200, 120 + rand() * 260, -900 - rand() * 200);
      m.userData.speed = 1.5 + rand() * 2.5;
      m.renderOrder = -4;
      this.haze.push(m);
      this.scene.add(m);
    }
  }

  // ───────────── city ─────────────
  #buildCity() {
    const rand = mulberry32(1337);
    const items = [];
    const add = (x, z, w, d, h) => items.push({ x, z, w, d, h });

    // rows of buildings from the waterfront back to the horizon
    for (let z = -58; z > -460; ) {
      const depthT = clamp((-z - 58) / 400, 0, 1);
      const rowD = lerp(9, 20, depthT);
      for (let x = -340; x < 340; ) {
        const w = lerp(5, 11, rand()) * lerp(1, 1.8, depthT);
        if (rand() > 0.12) {
          const centre = Math.exp(-Math.pow(x / lerp(70, 140, depthT), 2));
          let h = lerp(5, 16, rand()) + depthT * lerp(10, 45, rand());
          h *= 1 + centre * lerp(0.3, 2.2, depthT) * (0.5 + rand());
          if (rand() < 0.07 + depthT * 0.06) h *= 1.6 + rand() * 0.8; // occasional spike
          if (-z < 75) h = Math.min(h, 14 + rand() * 6); // keep the waterfront low
          h = Math.min(h, 175);
          const d = rowD * lerp(0.7, 1.0, rand());
          add(x + w / 2 + (rand() - 0.5) * 2, z - d / 2 + (rand() - 0.5) * 3, w, d, h);
        }
        x += w + lerp(0.6, 3.5, rand());
      }
      z -= rowD + lerp(2, 6, rand());
    }

    const n = items.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const seeds = new Float32Array(n * 4);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.U,
        uPal: {
          value: [PALETTE.pink, PALETTE.cyan, PALETTE.lavender, PALETTE.warm, PALETTE.white].map((h) => new THREE.Color(h)),
        },
        uBase: { value: new THREE.Color('#1b0b31') },
        uBaseTop: { value: new THREE.Color('#2a1150') },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        varying vec3 vLocal;
        varying vec3 vScale;
        varying vec3 vNrm;
        varying vec4 vSeed;
        varying float vDepth;
        varying float vWorldY;
        void main() {
          vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vLocal = position;
          vNrm = normal;
          vSeed = aSeed;
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldY = world.y;
          vec4 mv = viewMatrix * world;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform float uTime, uFlash, uPulse, uFogDensity;
        uniform vec3 uFogColor, uBase, uBaseTop;
        uniform vec3 uPal[5];
        varying vec3 vLocal;
        varying vec3 vScale;
        varying vec3 vNrm;
        varying vec4 vSeed;
        varying float vDepth;
        varying float vWorldY;

        vec3 pal(float r) {
          if (r < 0.34) return uPal[0];
          if (r < 0.62) return uPal[1];
          if (r < 0.84) return uPal[2];
          if (r < 0.95) return uPal[4];
          return uPal[3];
        }

        void main() {
          float h = vLocal.y * vScale.y;           // height on the building (world units)
          vec3 col = mix(uBase, uBaseTop, smoothstep(0.0, 160.0, vWorldY));
          col *= abs(vNrm.x) > 0.5 ? 0.72 : 1.0;    // side faces a touch darker
          float neonFlag = vSeed.z;

          if (abs(vNrm.y) < 0.5) {
            vec2 face = abs(vNrm.x) > 0.5
              ? vec2((vLocal.z + 0.5) * vScale.z, h)
              : vec2((vLocal.x + 0.5) * vScale.x, h);
            float faceId = vNrm.x * 1.7 + vNrm.z * 3.3;
            float style = vSeed.y;
            vec2 cell = style < 0.6 ? vec2(1.45, 2.1) : (style < 0.82 ? vec2(0.9, 2.1) : vec2(2.6, 1.6));
            vec2 g = face / cell;
            vec2 id = floor(g);
            vec2 f = fract(g);
            vec2 aa = fwidth(g) * 1.2;
            vec2 lo = style < 0.6 ? vec2(0.24, 0.28) : (style < 0.82 ? vec2(0.18, 0.08) : vec2(0.06, 0.32));
            vec2 hi = 1.0 - lo;
            vec2 wv = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
            float win = wv.x * wv.y;
            win *= step(1.4, h) * step(h, vScale.y - 1.1);

            float r = hash12(id + vec2(vSeed.x * 91.7, faceId * 13.1));
            float litProb = 0.16 + 0.28 * fract(vSeed.x * 7.13);
            float lit = step(r, litProb);
            // a few windows switch on/off every so often — the city breathing
            float flick = step(0.93, hash12(id * 1.37 + vSeed.x * 17.0));
            float epoch = floor(uTime * 0.07 + r * 31.0);
            lit = mix(lit, step(hash12(id + epoch + vSeed.x), litProb), flick);

            float cr = fract(vSeed.w + step(0.72, hash12(id.yy + vSeed.x * 5.0)) * 0.37);
            vec3 wc = pal(cr);
            float bright = 0.4 + 0.6 * hash12(id + 7.7);
            bright *= 1.0 + uPulse * 0.5;

            // tiny windows far away: fade to average glow instead of shimmering
            float detail = 1.0 - smoothstep(0.35, 0.9, max(aa.x, aa.y));
            float avg = litProb * 0.3;
            float w = mix(avg * step(1.4, h), win * lit, detail);
            col += wc * w * bright * 0.85;

            // neon trim near the roofline
            float trim = step(vScale.y - 0.55, h) * step(h, vScale.y - 0.15);
            col += trim * neonFlag * pal(vSeed.w) * 1.3;
          } else {
            col *= 0.6;
          }

          // faint uplight from the street / water
          col += vec3(0.06, 0.015, 0.08) * exp(-h * 0.25);

          float fog = fogFactor(vDepth, uFogDensity);
          col = mix(col, uFogColor, fog);
          col += uFlash * vec3(0.35, 0.28, 0.6) * 0.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4();
    const tall = [];
    items.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d);
      m4.setPosition(b.x, 0, b.z);
      mesh.setMatrixAt(i, m4);
      seeds[i * 4] = rand();
      seeds[i * 4 + 1] = rand();
      seeds[i * 4 + 2] = rand() < 0.28 ? 1 : 0;
      seeds[i * 4 + 3] = rand();
      if (b.h > 55) tall.push(b);
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    mesh.frustumCulled = false;
    this.city = mesh;
    this.scene.add(mesh);

    // spires + blinking aviation lights on the tallest towers
    tall.sort((a, b) => b.h - a.h);
    const top = tall.slice(0, 40);
    const spireGeo = new THREE.CylinderGeometry(0.15, 0.5, 1, 6);
    spireGeo.translate(0, 0.5, 0);
    const spires = new THREE.InstancedMesh(
      spireGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a0b2e'), fog: true }),
      top.length
    );
    const lightPos = new Float32Array(top.length * 3);
    const lightPhase = new Float32Array(top.length);
    top.forEach((b, i) => {
      const sh = 6 + rand() * 14;
      m4.makeScale(1, sh, 1);
      m4.setPosition(b.x, b.h, b.z);
      spires.setMatrixAt(i, m4);
      lightPos.set([b.x, b.h + sh + 0.4, b.z], i * 3);
      lightPhase[i] = rand() * 6.28;
    });
    spires.frustumCulled = false;
    this.scene.fog = new THREE.FogExp2(this.U.uFogColor.value, this.U.uFogDensity.value);
    this.scene.add(spires);

    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lightPos, 3));
    lg.setAttribute('aPhase', new THREE.BufferAttribute(lightPhase, 1));
    this.beacons = new THREE.Points(
      lg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...this.U, uPR: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uTime, uPR;
          attribute float aPhase;
          varying float vA;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float blink = pow(max(sin(uTime * 1.6 + aPhase), 0.0), 8.0);
            vA = 0.25 + blink;
            gl_PointSize = (6.0 + blink * 6.0) * uPR * (220.0 / -mv.z);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(1.6, 0.25, 0.4) * a * vA, a * vA);
          }`,
      })
    );
    this.beacons.frustumCulled = false;
    this.scene.add(this.beacons);

    // waterfront quay
    const quay = new THREE.Mesh(
      new THREE.BoxGeometry(900, 1.4, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#12071f') })
    );
    quay.position.set(0, 0.7, -52);
    this.scene.add(quay);
  }

  #buildTraffic() {
    // cars along the waterfront + slow air traffic between towers
    const rand = mulberry32(99);
    const lanes = [
      { z: -50.2, y: 1.7, color: [1.6, 1.35, 1.1], speed: 9, n: 90, size: 3.2 },
      { z: -51.4, y: 1.7, color: [1.7, 0.18, 0.32], speed: -7.5, n: 90, size: 3.0 },
      { z: -49.4, y: 1.55, color: [0.4, 1.4, 1.7], speed: 5, n: 18, size: 2.4 },
    ];
    const pos = [], aData = [], col = [];
    for (const L of lanes) {
      for (let i = 0; i < L.n; i++) {
        pos.push(-400 + rand() * 800, L.y, L.z);
        aData.push(L.speed * (0.8 + rand() * 0.4), L.size);
        col.push(...L.color);
      }
    }
    // air traffic
    for (let i = 0; i < 26; i++) {
      pos.push(-400 + rand() * 800, 40 + rand() * 70, -90 - rand() * 230);
      aData.push((rand() < 0.5 ? -1 : 1) * (3 + rand() * 4), 4.5);
      col.push(...(rand() < 0.5 ? [1.6, 0.5, 1.4] : [0.5, 1.4, 1.6]));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aData', new THREE.Float32BufferAttribute(aData, 2));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    this.traffic = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...this.U, uPR: { value: 1 } },
        vertexShader: /* glsl */ `
          ${GLSL_COMMON}
          uniform float uTime, uPR, uFogDensity;
          attribute vec2 aData;
          attribute vec3 aColor;
          varying vec3 vCol;
          void main() {
            vec3 p = position;
            p.x = mod(p.x + uTime * aData.x + 400.0, 800.0) - 400.0;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float fog = fogFactor(-mv.z, uFogDensity);
            vCol = aColor * (1.0 - fog * 0.85);
            gl_PointSize = aData.y * uPR * (120.0 / -mv.z) + 1.0;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vCol;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.05, d);
            gl_FragColor = vec4(vCol * a, a);
          }`,
      })
    );
    this.traffic.frustumCulled = false;
    this.scene.add(this.traffic);
  }

  // ───────────── water ─────────────
  #buildWater() {
    const shader = {
      uniforms: {
        color: { value: new THREE.Color('#14062c') },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uTime: this.U.uTime,
        uRain: { value: 0 },
        uFogColor: this.U.uFogColor,
        uFogDensity: this.U.uFogDensity,
        uFlash: this.U.uFlash,
      },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUv;
        varying vec3 vWorld;
        varying float vDepth;
        void main() {
          vUv = textureMatrix * vec4(position, 1.0);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform float uTime, uRain, uFogDensity, uFlash;
        uniform vec3 uFogColor;
        varying vec4 vUv;
        varying vec3 vWorld;
        varying float vDepth;

        // expanding rain rings on a jittered grid
        vec2 ripples(vec2 p, float t) {
          vec2 acc = vec2(0.0);
          vec2 cell = floor(p);
          for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++) {
            vec2 c = cell + vec2(float(i), float(j));
            float rnd = hash12(c);
            vec2 center = c + vec2(hash12(c + 3.1), hash12(c + 7.7));
            float life = fract(t * (0.7 + rnd * 0.6) + rnd * 13.0);
            vec2 dv = p - center;
            float d = length(dv);
            float ring = sin((d - life * 0.9) * 28.0) * smoothstep(0.9, 0.0, abs(d - life * 0.9) * 6.0);
            acc += normalize(dv + 1e-4) * ring * (1.0 - life);
          }
          return acc;
        }

        void main() {
          vec2 p = vWorld.xz;
          float near = 1.0 - smoothstep(20.0, 90.0, vDepth);
          // banded horizontal shimmer — the pixel-art reflection look
          float band = floor(vWorld.z * 1.4);
          float wob = sin(band * 1.7 + uTime * 1.1) * 0.6 + sin(band * 0.53 - uTime * 0.7) * 0.4;
          vec2 dist = vec2(wob * 0.010, 0.0);
          dist += vec2(sin(p.y * 0.25 + uTime * 0.6), cos(p.x * 0.2 + uTime * 0.5)) * 0.004;
          if (uRain > 0.01) dist += ripples(p * 0.45, uTime) * 0.012 * uRain * near;
          vec4 uv = vUv;
          uv.xy += dist * uv.w;
          vec3 refl = texture2DProj(tDiffuse, uv).rgb;
          // stripes of slightly darker water
          float stripe = 0.85 + 0.15 * step(0.5, fract(vWorld.z * 0.7 + sin(vWorld.x * 0.02 + uTime * 0.2)));
          float fres = mix(0.3, 0.62, smoothstep(5.0, 140.0, vDepth));
          vec3 col = color * 0.5 + refl * vec3(0.92, 0.82, 1.06) * fres * stripe;
          col += uFlash * vec3(0.3, 0.25, 0.55) * 0.12;
          col = mix(col, uFogColor, fogFactor(vDepth, uFogDensity) * 0.9);
          gl_FragColor = vec4(col, 1.0);
        }`,
    };
    const geo = new THREE.PlaneGeometry(1600, 900);
    this.water = new Reflector(geo, {
      color: 0x14062c, // Reflector overwrites the `color` uniform (defaults to grey)
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      shader,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0, -300);
    this.waterUniforms = this.water.material.uniforms;
    this.scene.add(this.water);
  }

  // ───────────── weather ─────────────
  #buildRain() {
    const rand = mulberry32(5);
    const n = this.reducedMotion ? 1800 : 5200;
    const pos = new Float32Array(n * 6);
    const aEnd = new Float32Array(n * 2);
    const aRand = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = (rand() - 0.5) * 180;
      const y = rand() * 90;
      const z = 52 - rand() * 120;
      const r = rand();
      pos.set([x, y, z, x, y, z], i * 6);
      aEnd.set([0, 1], i * 2);
      aRand.set([r, r], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.U.uTime, uAmt: { value: 0 }, uFlash: this.U.uFlash },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aEnd, aRand;
        varying float vA;
        void main() {
          vec3 p = position;
          float H = 90.0;
          float speed = 46.0 + aRand * 26.0;
          float y = mod(p.y - uTime * speed, H);
          vec3 dir = normalize(vec3(-0.16, -1.0, 0.05));
          // slant along the wind as it falls
          p.x += (H - y) * -0.16;
          p.y = y;
          p += dir * aEnd * (1.6 + aRand * 1.8);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = (0.18 + 0.4 * aRand) * smoothstep(0.0, 6.0, y) * smoothstep(H, H - 10.0, y);
          vA *= mix(1.0, 0.25, aEnd);
          vA *= smoothstep(140.0, 30.0, -mv.z) * smoothstep(3.0, 12.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmt, uFlash;
        varying float vA;
        void main() {
          vec3 c = vec3(0.62, 0.55, 0.95) * (1.0 + uFlash * 0.5);
          gl_FragColor = vec4(c * vA * uAmt, vA * uAmt);
        }`,
    });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  #buildSnow() {
    const rand = mulberry32(11);
    const n = this.reducedMotion ? 1500 : 4200;
    const pos = new Float32Array(n * 3);
    const aRand = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([(rand() - 0.5) * 200, rand() * 80, 52 - rand() * 140], i * 3);
      aRand[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));
    this.snowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.U.uTime, uAmt: { value: 0 }, uPR: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uPR;
        attribute float aRand;
        varying float vA;
        void main() {
          vec3 p = position;
          float H = 80.0;
          float y = mod(p.y - uTime * (2.2 + aRand * 2.6), H);
          p.y = y;
          p.x += sin(uTime * (0.3 + aRand * 0.5) + aRand * 40.0) * (1.5 + aRand * 2.0) + (H - y) * 0.06;
          p.z += cos(uTime * (0.25 + aRand * 0.4) + aRand * 23.0) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.35 + aRand * 0.65) * uPR * (240.0 / -mv.z);
          vA = (0.35 + 0.55 * aRand) * smoothstep(0.0, 4.0, y) * smoothstep(H, H - 8.0, y);
          vA *= smoothstep(160.0, 40.0, -mv.z) * smoothstep(4.0, 14.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmt;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.25, d) * vA * uAmt;
          gl_FragColor = vec4(vec3(1.0, 0.92, 1.05) * a, a);
        }`,
    });
    this.snow = new THREE.Points(geo, this.snowMat);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  #buildShootingStar() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          float tail = pow(vUv.x, 2.5);
          float w = 1.0 - abs(vUv.y - 0.5) * 2.0;
          float a = tail * pow(w, 2.0) * uFade;
          gl_FragColor = vec4(vec3(1.5, 1.2, 1.8) * a, a);
        }`,
    });
    this.shootingStar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.shootingStar.visible = false;
    this.shootingStar.frustumCulled = false;
    this.shootingStar.renderOrder = -3;
    this.scene.add(this.shootingStar);
    this.ss = null;
  }

  #spawnShootingStar() {
    const fromX = -500 + Math.random() * 1000;
    const fromY = 420 + Math.random() * 260;
    const ang = Math.PI + 0.35 + Math.random() * 0.35; // heading down-left / down-right
    const dir = new THREE.Vector3(Math.cos(ang) * (Math.random() < 0.5 ? -1 : 1), Math.sin(ang), 0).normalize();
    this.ss = {
      start: new THREE.Vector3(fromX, fromY, -1100),
      dir,
      t: 0,
      dur: 0.9 + Math.random() * 0.6,
      len: 120 + Math.random() * 80,
      dist: 380 + Math.random() * 200,
    };
    this.shootingStar.visible = true;
  }

  // ───────────── public api ─────────────
  setWeather(kind, instant = false) {
    const W = this.weather;
    W.targetRain = kind === 'rain' ? 1 : 0;
    W.targetSnow = kind === 'snow' ? 1 : 0;
    if (instant) {
      W.rain = W.targetRain;
      W.snow = W.targetSnow;
    }
  }

  setPointer(x, y) {
    this.pointer.set(x, y);
  }

  setAudioLevel(v) {
    this.audioLevel = v;
  }

  setPixelMode(on) {
    this.pixelMode = on;
    this.canvas.classList.toggle('pixelated', on);
    this.resize();
  }

  flyIn() {
    const s = this.camState;
    s.from.copy(this.camera.position);
    s.lookFrom.copy(s.look);
    s.t = 0;
    s.mode = 'flying';
    if (this.reducedMotion) s.duration = 0.01;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.pixelMode ? 0.33 : this.basePixelRatio * this.qualityScale;
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 72 : aspect < 1.2 ? 62 : 55;
    this.camera.updateProjectionMatrix();
    const rt = this.water.getRenderTarget();
    const rs = this.pixelMode ? 0.33 : 0.5 * this.qualityScale;
    rt.setSize(Math.max(256, Math.floor(w * pr * rs)), Math.max(256, Math.floor(h * pr * rs)));
    const pointScale = pr;
    this.stars.material.uniforms.uPR.value = pointScale;
    this.beacons.material.uniforms.uPR.value = pointScale;
    this.traffic.material.uniforms.uPR.value = pointScale;
    this.snowMat.uniforms.uPR.value = pointScale;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.#tick();
    };
    loop();
  }

  // ───────────── frame ─────────────
  #tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    const t = this.time;
    this.U.uTime.value = t;

    this.#adaptQuality(dt);

    // weather crossfade
    const W = this.weather;
    W.rain = lerp(W.rain, W.targetRain, 1 - Math.exp(-dt * 1.6));
    W.snow = lerp(W.snow, W.targetSnow, 1 - Math.exp(-dt * 1.6));
    this.rainMat.uniforms.uAmt.value = W.rain;
    this.snowMat.uniforms.uAmt.value = W.snow;
    this.waterUniforms.uRain.value = W.rain;
    this.rain.visible = W.rain > 0.01;
    this.snow.visible = W.snow > 0.01;

    // lightning — only when it's raining, distant and soft
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.nextLightning = 22 + Math.random() * 35;
      if (W.rain > 0.6 && !this.reducedMotion) {
        this.flashSeq = [0, 0.09, 0.22, 0.31].map((o, i) => ({ at: t + o, amp: [0.6, 0.22, 0.8, 0.3][i] }));
        this.onLightning?.();
      }
    }
    let flash = this.flash * Math.exp(-dt * 9);
    if (this.flashSeq) {
      for (const f of this.flashSeq) if (!f.done && t >= f.at) { flash = Math.max(flash, f.amp); f.done = true; }
      if (this.flashSeq.every((f) => f.done)) this.flashSeq = null;
    }
    this.flash = flash;
    this.U.uFlash.value = flash;

    // music → city pulse
    const pulse = this.audioLevel;
    this.U.uPulse.value = lerp(this.U.uPulse.value, pulse, 0.25);
    this.bloom.strength = (0.58 + this.U.uPulse.value * 0.3 + flash * 0.12) * (this.pixelMode ? 0.55 : 1);

    // drifting haze
    for (const m of this.haze) {
      m.position.x += m.userData.speed * dt;
      if (m.position.x > 900) m.position.x = -900;
    }
    this.moonHalo.material.opacity = 0.3 + Math.sin(t * 0.4) * 0.05 + this.U.uPulse.value * 0.1;

    // shooting stars
    this.nextShootingStar -= dt;
    if (this.nextShootingStar <= 0 && !this.ss) {
      this.nextShootingStar = 7 + Math.random() * 14;
      this.#spawnShootingStar();
    }
    if (this.ss) {
      const s = this.ss;
      s.t += dt / s.dur;
      const p = Math.min(s.t, 1);
      const head = s.start.clone().addScaledVector(s.dir, s.dist * easeInOutCubic(p));
      const mesh = this.shootingStar;
      mesh.position.copy(head).addScaledVector(s.dir, -s.len / 2);
      mesh.scale.set(s.len, 3.2, 1);
      mesh.lookAt(this.camera.position);
      mesh.rotateZ(Math.atan2(s.dir.y, s.dir.x));
      mesh.material.uniforms.uFade.value = Math.sin(p * Math.PI);
      if (s.t >= 1) { this.ss = null; mesh.visible = false; }
    }

    this.#updateCamera(dt, t);
    this.composer.render(dt);
  }

  #updateCamera(dt, t) {
    const s = this.camState;
    const cam = this.camera;
    const k = 1 - Math.exp(-dt * 2.5);
    this.pointerSmooth.lerp(this.pointer, k);
    const px = this.reducedMotion ? 0 : this.pointerSmooth.x;
    const py = this.reducedMotion ? 0 : this.pointerSmooth.y;

    if (s.mode === 'idle-intro') {
      // slow drift high above the bay while the enter screen is up
      cam.position.set(Math.sin(t * 0.08) * 14, 30 + Math.sin(t * 0.13) * 2, 120);
      s.look.set(0, 26, -60);
    } else if (s.mode === 'flying') {
      s.t += dt / s.duration;
      const e = easeInOutCubic(clamp(s.t, 0, 1));
      cam.position.lerpVectors(s.from, s.to, e);
      cam.position.y += Math.sin(e * Math.PI) * 6;
      s.look.lerpVectors(s.lookFrom, s.lookTo, e);
      if (s.t >= 1) s.mode = 'idle';
    } else {
      const bob = this.reducedMotion ? 0 : Math.sin(t * 0.35) * 0.35;
      const target = new THREE.Vector3(s.to.x + px * 6, s.to.y + py * 2.4 + bob, s.to.z);
      cam.position.lerp(target, k);
      s.look.set(s.lookTo.x + px * 3, s.lookTo.y + py * 1.5, s.lookTo.z);
    }
    cam.lookAt(s.look);
  }

  #adaptQuality(dt) {
    if (this.adaptDone || this.camState.mode === 'idle-intro') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 38 && this.qualityScale > 0.55) {
      this.qualityScale = this.qualityScale > 0.8 ? 0.7 : 0.5;
      this.resize();
    } else {
      this.adaptDone = true;
    }
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}
