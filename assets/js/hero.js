// One fixed WebGL canvas paints the page behind the content:
//   - drifting contour lines, in each section's light or dark theme
//   - the hero portrait, which rises in on load
//   - a liquid cursor trail that reveals a lime halftone version of the portrait
import * as THREE from 'three';

const root = document.documentElement;
const canvas = document.querySelector('canvas.bg-canvas');
const figure = document.querySelector('[data-portrait]');
const hero = figure?.closest('section');
const sections = [...document.querySelectorAll('main > [data-theme]')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchOnly = matchMedia('(hover: none)').matches;

const MAX_SECTIONS = 12;
const THEMES = { light: 0, dark: 1, lime: 0 };
const PORTRAIT_SRC = '/assets/img/portrait.webp';

// Ashima Arts 3D simplex noise (MIT).
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// The trail is a low-resolution buffer of "ink" that the pointer paints and that slowly fades and drifts.
const TRAIL_FRAGMENT = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2 uFrom;      // pointer last frame, CSS px from the top left
  uniform vec2 uTo;        // pointer this frame
  uniform vec2 uView;      // viewport size, CSS px
  uniform float uRadius;   // brush radius, CSS px
  uniform float uStrength;
  uniform float uDecay;
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}
  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    return length(pa - ba * h);
  }
  void main() {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uView;
    vec2 q = px / 220.0;
    vec2 drift = vec2(snoise(vec3(q, uTime * 0.25)), snoise(vec3(q + 19.1, uTime * 0.25)));
    float prev = texture2D(uPrev, vUv + drift * 0.0016).r;
    prev = max(prev * uDecay - 0.004, 0.0);
    float d = segment(px, uFrom, uTo);
    float brush = smoothstep(uRadius, uRadius * 0.15, d) * uStrength;
    gl_FragColor = vec4(max(prev, brush), 0.0, 0.0, 1.0);
  }
`;

const MAIN_FRAGMENT = /* glsl */ `
  uniform vec2 uRes;                       // drawing buffer, device px
  uniform float uDpr;
  uniform float uTime;
  uniform float uScroll;                   // CSS px
  uniform float uBounds[${MAX_SECTIONS}];  // section tops in the viewport, CSS px
  uniform float uThemes[${MAX_SECTIONS}];  // 0 light, 1 dark
  uniform int uCount;
  uniform vec4 uRect;                      // portrait box: left, top, width, height (CSS px)
  uniform float uClip;                     // bottom of the hero in the viewport; the portrait stops there
  uniform sampler2D uPortrait;
  uniform vec2 uTexel;
  uniform sampler2D uTrail;
  uniform float uIntro;                    // 0 → 1 as the portrait rises in
  uniform float uReveal;                   // trail strength, fades out as the hero scrolls away
  uniform float uCell;                     // halftone cell, CSS px
  varying vec2 vUv;

  const vec3 LIGHT = vec3(0.957, 0.957, 0.929);       // #f4f4ed
  const vec3 LIGHT_FILL = vec3(0.929, 0.933, 0.894);
  const vec3 DARK = vec3(0.157, 0.173, 0.125);        // #282c20
  const vec3 DARK_FILL = vec3(0.180, 0.196, 0.149);
  const vec3 SAGE = vec3(0.867, 0.882, 0.824);        // #dde1d2
  const vec3 LIME = vec3(0.824, 1.0, 0.0);            // #d2ff00

  ${NOISE}

  float terrain(vec2 css) {
    vec2 q = vec2(css.x, css.y + uScroll) / 820.0;
    float t = uTime * 0.02;
    return snoise(vec3(q, t)) * 0.62
         + snoise(vec3(q * 2.3 + 4.1, t * 1.3)) * 0.26
         + snoise(vec3(q * 5.1 + 9.7, t * 1.7)) * 0.08;
  }

  // Coverage of the iso-lines of v, about widthPx device pixels to each side.
  float contour(float v, float widthPx) {
    float w = fwidth(v);
    float d = min(fract(v), 1.0 - fract(v));
    return 1.0 - smoothstep(0.0, w * widthPx, d);
  }

  float themeAt(float y) {
    float th = uThemes[0];
    for (int i = 1; i < ${MAX_SECTIONS}; i++) {
      if (i >= uCount) break;
      if (y >= uBounds[i]) th = uThemes[i];
    }
    return th;
  }

  float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)); }

  vec4 portraitAt(vec2 pr) {
    float inside = step(0.0, pr.x) * step(pr.x, 1.0) * step(0.0, pr.y) * step(pr.y, 1.0);
    return texture2D(uPortrait, clamp(vec2(pr.x, 1.0 - pr.y), 0.0, 1.0)) * inside;
  }

  // Same lookup with an explicit level, for use inside branches where derivatives aren't defined.
  vec4 portraitLod(vec2 pr) {
    float inside = step(0.0, pr.x) * step(pr.x, 1.0) * step(0.0, pr.y) * step(pr.y, 1.0);
    return textureLod(uPortrait, clamp(vec2(pr.x, 1.0 - pr.y), 0.0, 1.0), 0.0) * inside;
  }

  void main() {
    vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;

    // Page: contour lines over soft patches, in the theme of the section under this pixel.
    float h = terrain(css);
    float lines = contour(h * 4.5, 0.7 * uDpr);
    float hw = fwidth(h);
    float fillMask = smoothstep(0.5 - hw, 0.5 + hw, h);
    float th = themeAt(css.y);
    vec3 col = mix(mix(LIGHT, DARK, th), mix(LIGHT_FILL, DARK_FILL, th), fillMask);
    col = mix(col, mix(DARK, SAGE, th), lines * mix(0.15, 0.07, th));

    // Portrait, rising in through a noisy edge with a lime rim.
    vec2 pr = (css - uRect.xy) / uRect.zw;
    vec4 por = portraitAt(pr) * step(css.y, uClip);
    float n1 = snoise(vec3(pr * 4.0, uTime * 0.3));
    float k = uIntro * 1.3 - 0.12 - (1.0 - pr.y) + n1 * 0.08;
    float shown = smoothstep(0.0, 0.012, k);
    float rim = shown * (1.0 - smoothstep(0.012, 0.05, k)) * por.a;
    float pa = por.a * shown;
    col = mix(col, por.rgb, pa);
    col = mix(col, LIME, rim);

    // Cursor trail: a thresholded, noise-warped blob with crisp edges.
    float trail = texture2D(uTrail, vUv).r;
    float e = trail + snoise(vec3(css / 120.0, uTime * 0.4)) * 0.16 - 0.5;
    float ew = fwidth(e);
    // Only the person changes; the page around them stays as it is.
    float mask = smoothstep(-ew, ew, e) * uReveal * pa;

    if (mask > 0.001) {
      // Halftone portrait on a 45° grid that travels with the portrait.
      mat2 rot = mat2(0.7071, 0.7071, -0.7071, 0.7071);
      vec2 local = css - uRect.xy;
      vec2 g = rot * local / uCell;
      vec2 id = floor(g) + 0.5;
      vec2 f = g - id;
      vec2 centre = transpose(rot) * (id * uCell);
      vec4 cs = portraitLod(centre / uRect.zw);
      float r = 0.36 * pow(clamp(luma(cs), 0.0, 1.0), 1.2) * cs.a;
      float dd = length(f);
      float aa = 0.9 / (uCell * uDpr);
      float dots = 1.0 - smoothstep(r - aa, r + aa, dd);

      // Line art: luminance edges plus the silhouette.
      vec2 off = uTexel * 1.6;
      vec4 sR = portraitLod(pr + vec2(off.x, 0.0));
      vec4 sL = portraitLod(pr - vec2(off.x, 0.0));
      vec4 sU = portraitLod(pr - vec2(0.0, off.y));
      vec4 sD = portraitLod(pr + vec2(0.0, off.y));
      float lumEdge = length(vec2(luma(sR) - luma(sL), luma(sD) - luma(sU)));
      float alphaEdge = length(vec2(sR.a - sL.a, sD.a - sU.a));
      float edge = max(smoothstep(0.1, 0.26, lumEdge), smoothstep(0.25, 0.6, alphaEdge));

      col = mix(col, mix(DARK, LIME, max(dots, edge)), mask);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function init() {
  if (!canvas || !figure) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    root.classList.add('no-gl');
    return;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    root.classList.add('no-gl');
    return;
  }

  const floatTargets = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const targetOptions = {
    type: floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  let trailRead = new THREE.WebGLRenderTarget(2, 2, targetOptions);
  let trailWrite = new THREE.WebGLRenderTarget(2, 2, targetOptions);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  const trailMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPrev: { value: null },
      uFrom: { value: new THREE.Vector2(-1e4, -1e4) },
      uTo: { value: new THREE.Vector2(-1e4, -1e4) },
      uView: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 80 },
      uStrength: { value: 0 },
      uDecay: { value: 0.975 },
      uTime: { value: 0 },
    },
  });
  const trailScene = new THREE.Scene();
  trailScene.add(new THREE.Mesh(quad, trailMaterial));

  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;

  const themes = new Float32Array(MAX_SECTIONS);
  sections.slice(0, MAX_SECTIONS).forEach((section, i) => {
    themes[i] = THEMES[section.dataset.theme] ?? 0;
  });
  const bounds = new Float32Array(MAX_SECTIONS);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: MAIN_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uBounds: { value: bounds },
      uThemes: { value: themes },
      uCount: { value: Math.min(sections.length, MAX_SECTIONS) },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uClip: { value: 1e5 },
      uPortrait: { value: blank },
      uTexel: { value: new THREE.Vector2(1 / 1200, 1 / 1200) },
      uTrail: { value: trailRead.texture },
      uIntro: { value: reduceMotion ? 1 : 0 },
      uReveal: { value: 1 },
      uCell: { value: 7 },
    },
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(quad, material));

  // ---------- Sizing ----------

  let width = 0;
  let height = 0;
  const offsets = new Float32Array(MAX_SECTIONS);

  function measureSections() {
    const y = window.scrollY;
    sections.slice(0, MAX_SECTIONS).forEach((section, i) => {
      offsets[i] = section.getBoundingClientRect().top + y;
    });
  }

  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, width * (window.devicePixelRatio || 1) > 3200 ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    material.uniforms.uRes.value.copy(buffer);
    material.uniforms.uDpr.value = dpr;
    trailRead.setSize(Math.max(2, Math.round(width / 4)), Math.max(2, Math.round(height / 4)));
    trailWrite.setSize(Math.max(2, Math.round(width / 4)), Math.max(2, Math.round(height / 4)));
    trailMaterial.uniforms.uView.value.set(width, height);
    measureSections();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });
  new ResizeObserver(measureSections).observe(document.body);
  document.fonts?.ready.then(measureSections);
  resize();

  // ---------- Pointer ----------

  const pointer = { x: -1e4, y: -1e4, active: false, touching: false };
  const brush = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, speed: 0 };
  let userMoved = false;

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    userMoved = true;
  }, { passive: true });
  document.addEventListener('mouseout', (event) => {
    if (!event.relatedTarget) pointer.active = false;
  });
  window.addEventListener('blur', () => { pointer.active = false; });

  const onTouch = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    pointer.x = touch.clientX;
    pointer.y = touch.clientY;
    pointer.active = true;
    pointer.touching = true;
    userMoved = true;
  };
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });
  window.addEventListener('touchend', () => { pointer.active = false; pointer.touching = false; }, { passive: true });

  // ---------- Portrait ----------

  let introStart = -1;
  let sweepStart = -1;
  const loader = new THREE.TextureLoader();
  loader.load(PORTRAIT_SRC, (texture) => {
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    material.uniforms.uPortrait.value = texture;
    material.uniforms.uTexel.value.set(1 / texture.image.width, 1 / texture.image.height);
    introStart = performance.now() + 200;
    sweepStart = introStart + 1500;
    root.classList.add('gl');
  }, undefined, () => {
    root.classList.add('no-gl');
  });

  // ---------- Frame loop ----------

  let last = performance.now();
  let time = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    time += dt;

    const scrollY = window.scrollY;
    const box = figure.getBoundingClientRect();
    material.uniforms.uRect.value.set(box.left, box.top, box.width, box.height);
    material.uniforms.uClip.value = hero ? hero.getBoundingClientRect().bottom : 1e5;
    material.uniforms.uCell.value = Math.min(8, Math.max(4.5, box.width / 140));
    material.uniforms.uScroll.value = scrollY;
    material.uniforms.uTime.value = time;
    for (let i = 0; i < MAX_SECTIONS; i++) bounds[i] = offsets[i] - scrollY;

    if (introStart > 0 && !reduceMotion) {
      material.uniforms.uIntro.value = easeOutCubic(Math.min(1, Math.max(0, (now - introStart) / 1600)));
    }
    const heroFade = 1 - Math.min(1, Math.max(0, scrollY / (height * 0.75)));
    material.uniforms.uReveal.value = heroFade;

    // Where does the brush go this frame: the real pointer, a one-off intro sweep, or a slow wander on touch screens?
    let target = null;
    let radius = 0;
    if (pointer.active) {
      target = [pointer.x, pointer.y];
    } else if (!reduceMotion && heroFade > 0) {
      const sweep = sweepStart > 0 ? (now - sweepStart) / 1700 : -1;
      if (!userMoved && sweep >= 0 && sweep <= 1) {
        const s = easeOutCubic(sweep);
        target = [box.left + box.width * (0.24 + 0.52 * s), box.top + box.height * (0.42 + 0.06 * Math.sin(s * Math.PI * 2))];
        radius = 64;
      } else if (touchOnly && sweep > 1) {
        target = [
          box.left + box.width * (0.5 + 0.17 * Math.sin(time * 0.55)),
          box.top + box.height * (0.42 + 0.12 * Math.sin(time * 0.83 + 1.3)),
        ];
        radius = 52;
      }
    }

    const uniforms = trailMaterial.uniforms;
    if (target) {
      if (brush.x < -1e3) { brush.x = target[0]; brush.y = target[1]; }
      brush.px = brush.x;
      brush.py = brush.y;
      brush.x += (target[0] - brush.x) * Math.min(1, dt * 22);
      brush.y += (target[1] - brush.y) * Math.min(1, dt * 22);
      const moved = Math.hypot(brush.x - brush.px, brush.y - brush.py) / Math.max(dt, 1e-3);
      brush.speed += (moved - brush.speed) * Math.min(1, dt * 8);
      uniforms.uFrom.value.set(brush.px, brush.py);
      uniforms.uTo.value.set(brush.x, brush.y);
      uniforms.uRadius.value = radius || 58 + Math.min(brush.speed * 0.05, 100);
      uniforms.uStrength.value = 1;
    } else {
      brush.x = brush.y = -1e4;
      brush.speed = 0;
      uniforms.uStrength.value = 0;
    }
    uniforms.uDecay.value = Math.pow(0.975, dt * 60);
    uniforms.uTime.value = time;
    uniforms.uPrev.value = trailRead.texture;

    renderer.setRenderTarget(trailWrite);
    renderer.render(trailScene, camera);
    [trailRead, trailWrite] = [trailWrite, trailRead];

    material.uniforms.uTrail.value = trailRead.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  // Draw in GSAP's ticker when it's there, so the canvas paints in the same tick Lenis scrolls the page.
  if (window.gsap) {
    window.gsap.ticker.add(() => frame(performance.now()));
  } else {
    const loop = (now) => {
      frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

init();
