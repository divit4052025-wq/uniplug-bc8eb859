/* eslint-disable @typescript-eslint/no-explicit-any -- Imperative three.js: the
   low-poly world builder and its per-frame animation hooks are dynamically
   shaped, so targeted `any` mirrors the engine's runtime structure. */

// UniPlug · Waitlist hero — a fast, cinematic low-poly teaser world.
//
// Ported faithfully from the Claude Design bundle's hero3d.js (a custom element
// reading a global THREE) into an ESM module that imports the app's pinned
// three r128 dependency — so it is the ONLY module that pulls in three.js and
// lands in its own code-split chunk (reached via React.lazy from
// WaitlistHero3D), never in the landing/SSR bundle. NO CDN <script>.
//
// Basic geometries only (no Capsule). Camera is auto-driven (slow orbit + breath
// + pointer parallax); the visitor never steers. Fallbacks: no-WebGL keeps the
// CSS sky the host paints; prefers-reduced-motion renders a single static frame;
// small / coarse screens get a lighter scene.

import * as THREE from "three";

import { HERO_SKY, heroSkyGradientCss, type HeroWorldName } from "./hero-sky";

export type { HeroWorldName };

export interface HeroWorldHandle {
  dispose: () => void;
}

const WORLDS: Record<HeroWorldName, any> = {
  quarter: {
    exposure: 0.86,
    fog: "#EFCFC2",
    fogNear: 46,
    fogFar: 150,
    hemiSky: 0xcfe0f0,
    hemiGround: 0x9bb488,
    hemiInt: 0.42,
    ambInt: 0.15,
    sun: 0xffc79a,
    sunInt: 2.35,
    sunPos: [26, 20, 22],
    fill: 0xcbd8ee,
    fillInt: 0.24,
    rim: 0xf7b6b0,
    rimInt: 0.4,
    pal: {
      ground: "#E0CDB6",
      groundDk: "#C6A98C",
      lawn: "#8CB566",
      lawnLt: "#A6CE80",
      court: "#EAD2BC",
      courtDk: "#D8B49A",
      courtRose: "#EF9F8E",
      wall: "#F0C9B8",
      wall2: "#E3AD98",
      wall3: "#F8E2D6",
      roof: "#E0662F",
      roof2: "#B23E1C",
      roof3: "#E8825A",
      column: "#FBEFE8",
      stone: "#DEBFAA",
      rose: "#F4B5AA",
      roseDeep: "#C4907F",
      glow: "#FFE3B8",
      glass: "#DBEBF3",
      foliage: "#7FB165",
      foliageDk: "#5C934C",
      foliageLt: "#A2CE82",
      trunk: "#9A6A4C",
      trim: "#7A4030",
      water: "#AAD6EA",
    },
    feature: "fountain",
    trees: "round",
    roof: "gable",
  },
  headquarters: {
    exposure: 0.82,
    fog: "#DCBE8C",
    fogNear: 44,
    fogFar: 150,
    hemiSky: 0xc2cede,
    hemiGround: 0x7a5c34,
    hemiInt: 0.36,
    ambInt: 0.13,
    sun: 0xffc97e,
    sunInt: 2.45,
    sunPos: [30, 22, 16],
    fill: 0xc6cfe4,
    fillInt: 0.22,
    rim: 0xf6c99c,
    rimInt: 0.4,
    pal: {
      ground: "#B08A50",
      groundDk: "#946F38",
      lawn: "#93A65A",
      lawnLt: "#A9BB70",
      court: "#DEC48C",
      courtDk: "#C2A469",
      courtRose: "#C88A5E",
      wall: "#E6CC92",
      wall2: "#CFAF74",
      wall3: "#F2E3C0",
      roof: "#A2612F",
      roof2: "#7C4820",
      roof3: "#B4703A",
      column: "#F1E6CC",
      stone: "#CBAF7E",
      rose: "#D7A248",
      roseDeep: "#A8763A",
      glow: "#FFCE86",
      glass: "#C6DAE4",
      foliage: "#75984F",
      foliageDk: "#496A34",
      foliageLt: "#8BAA5E",
      trunk: "#6E4E30",
      trim: "#5A4022",
      water: "#A8CBD6",
    },
    feature: "monument",
    trees: "cypress",
    roof: "hip",
  },
};

function hexShade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (p >= 0) {
    r += (255 - r) * p;
    g += (255 - g) * p;
    b += (255 - b) * p;
  } else {
    r *= 1 + p;
    g *= 1 + p;
    b *= 1 + p;
  }
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

export function initHeroWorld(host: HTMLElement, opts: { world: HeroWorldName }): HeroWorldHandle {
  const T = THREE as any;
  const cfg = WORLDS[opts.world] || WORLDS.quarter;
  const pal = cfg.pal;

  host.style.position = "relative";
  host.style.width = "100%";
  host.style.height = "100%";
  host.style.overflow = "hidden";
  // CSS sky as an always-present backdrop (also the no-WebGL fallback).
  host.style.background = heroSkyGradientCss(opts.world);

  const reduced =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small =
    typeof matchMedia !== "undefined" &&
    (matchMedia("(max-width: 700px)").matches || matchMedia("(pointer: coarse)").matches);

  // ---- shared mutable state ----
  let renderer: any = null;
  let scene: any = null;
  let camera: any = null;
  let raf = 0;
  let t0 = 0;
  let disposed = false;
  let ro: ResizeObserver | null = null;
  let io: IntersectionObserver | null = null;
  let onPointer: ((e: PointerEvent) => void) | null = null;
  let vis = true;

  let tgt: any;
  let baseR = 34;
  let baseAz = 0.5;
  let basePol = 1.06;
  let az = 0.5;
  let parX = 0,
    parY = 0,
    tParX = 0,
    tParY = 0;
  let intro: number | null = null;
  const anim: any = { clouds: [], water: [], people: [], glints: [], birds: [] };

  function skyTexture(stops: any[]): any {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    stops.forEach((s) => grd.addColorStop(s[0], s[1]));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 16, 256);
    const tx = new T.CanvasTexture(c);
    tx.encoding = T.sRGBEncoding;
    return tx;
  }

  function applyCamera(t: number) {
    parX += (tParX - parX) * 0.05;
    parY += (tParY - parY) * 0.05;
    const ease = intro == null ? 0 : intro;
    const introR = 1 + (1 - ease) * 0.28;
    const a = az + parX * 0.16;
    let pol = basePol - 0.06 * Math.sin(t * 0.18) - parY * 0.07;
    pol = Math.max(0.5, Math.min(1.28, pol));
    const R = baseR * introR * (1 - 0.015 * Math.sin(t * 0.12));
    camera.position.set(
      tgt.x + R * Math.sin(pol) * Math.sin(a),
      tgt.y + R * Math.cos(pol) + 0.8 * Math.sin(t * 0.16),
      tgt.z + R * Math.sin(pol) * Math.cos(a),
    );
    camera.lookAt(tgt);
  }

  function loop() {
    if (disposed || reduced) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(),
      t = (now - t0) / 1000;
    if (intro == null) intro = 0;
    if (intro < 1) intro = Math.min(1, intro + 0.012);
    az = baseAz + t * 0.05;
    applyCamera(t);
    for (let i = 0; i < anim.clouds.length; i++) {
      const c = anim.clouds[i];
      c.position.x = c.userData.baseX + Math.sin(t * 0.04 + c.userData.seed) * 6;
    }
    for (let w = 0; w < anim.water.length; w++)
      anim.water[w].scale.y = 1 + Math.sin(t * 3 + w) * 0.22;
    for (let g = 0; g < anim.glints.length; g++)
      anim.glints[g].material.emissiveIntensity = 0.7 + Math.sin(t * 2 + g) * 0.28;
    for (let p = 0; p < anim.people.length; p++) {
      const pe = anim.people[p],
        u = pe.userData;
      pe.position.x = u.c[0] + Math.sin(t * 0.5 + u.seed) * u.rad;
      pe.position.z = u.c[1] + Math.cos(t * 0.4 + u.seed) * u.rad;
      pe.rotation.y = t * 0.4 + u.seed;
      pe.position.y = Math.abs(Math.sin(t * 4 + u.seed)) * 0.06;
    }
    for (let b = 0; b < anim.birds.length; b++) {
      const bd = anim.birds[b],
        bu = bd.userData;
      bd.position.x = bu.baseX + Math.sin(t * 0.2 + bu.seed) * 12;
      bd.position.z = bu.baseZ + Math.cos(t * 0.15 + bu.seed) * 6;
      bd.rotation.y = Math.atan2(Math.cos(t * 0.2 + bu.seed), -Math.sin(t * 0.15 + bu.seed));
      if (bu.wing) bu.wing.rotation.z = Math.sin(t * 8 + bu.seed) * 0.5;
    }
    renderer.render(scene, camera);
  }

  function start() {
    if (raf || reduced || disposed) return;
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function resize() {
    if (!renderer) return;
    const r = host.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    renderer.setSize(r.width, r.height);
    if (reduced) {
      applyCamera(0);
      renderer.render(scene, camera);
    }
  }

  function build(rect: DOMRect) {
    try {
      renderer = new T.WebGLRenderer({
        antialias: !small,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      return; // no WebGL -> CSS sky stays
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.3 : 1.75));
    renderer.setSize(rect.width, rect.height);
    renderer.shadowMap.enabled = !small;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.domElement.style.cssText =
      "display:block;width:100%;height:100%;position:absolute;inset:0;";
    host.appendChild(renderer.domElement);

    scene = new T.Scene();
    scene.background = skyTexture(HERO_SKY[opts.world] as any);
    scene.fog = new T.Fog(new T.Color(cfg.fog), cfg.fogNear, cfg.fogFar);

    camera = new T.PerspectiveCamera(36, rect.width / rect.height, 0.1, 400);
    tgt = new T.Vector3(0, 3.6, 1.5);
    baseR = 34;
    baseAz = cfg.feature === "monument" ? 0.62 : 0.5;
    basePol = 1.06;
    az = baseAz;

    // lights
    scene.add(new T.HemisphereLight(cfg.hemiSky, cfg.hemiGround, cfg.hemiInt));
    scene.add(new T.AmbientLight(0xffffff, cfg.ambInt));
    const sun = new T.DirectionalLight(cfg.sun, cfg.sunInt);
    sun.position.set(cfg.sunPos[0], cfg.sunPos[1], cfg.sunPos[2]);
    sun.castShadow = !small;
    if (!small) {
      sun.shadow.mapSize.set(1536, 1536);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 130;
      const sc = 34;
      Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.6;
    }
    scene.add(sun);
    scene.add(sun.target);
    const fill = new T.DirectionalLight(cfg.fill, cfg.fillInt);
    fill.position.set(-26, 16, -22);
    scene.add(fill);
    const rim = new T.DirectionalLight(cfg.rim, cfg.rimInt);
    rim.position.set(-10, 12, -30);
    scene.add(rim);

    // material cache + primitives
    const mc: any = {};
    function M(color: string, o?: any) {
      o = o || {};
      const key =
        color +
        "|" +
        (o.emi || 0) +
        "|" +
        (o.rough == null ? 0.9 : o.rough) +
        "|" +
        (o.flat ? 1 : 0) +
        "|" +
        (o.metal || 0);
      if (mc[key]) return mc[key];
      const m = new T.MeshStandardMaterial({
        color: new T.Color(color),
        roughness: o.rough == null ? 0.9 : o.rough,
        metalness: o.metal || 0,
        flatShading: o.flat != null ? o.flat : true,
        emissive: new T.Color(o.emi ? o.emiColor || color : "#000"),
        emissiveIntensity: o.emi || 0,
      });
      mc[key] = m;
      return m;
    }
    function mesh(geo: any, color: string, o?: any) {
      const m = new T.Mesh(geo, M(color, o));
      m.castShadow = !(o && o.noCast);
      m.receiveShadow = !(o && o.noRec);
      return m;
    }
    function box(w: number, h: number, d: number, color: string, o?: any) {
      const g = new T.BoxGeometry(w, h, d);
      g.translate(0, h / 2, 0);
      return mesh(g, color, o);
    }
    function cyl(rt: number, rb: number, h: number, color: string, seg?: number, o?: any) {
      const g = new T.CylinderGeometry(rt, rb, h, seg || 20);
      g.translate(0, h / 2, 0);
      return mesh(g, color, o);
    }
    function cone(r: number, h: number, color: string, seg?: number, o?: any) {
      const g = new T.ConeGeometry(r, h, seg || 20);
      g.translate(0, h / 2, 0);
      return mesh(g, color, o);
    }
    function pyr(r: number, h: number, color: string, o?: any) {
      const g = new T.ConeGeometry(r, h, 4);
      g.translate(0, h / 2, 0);
      g.rotateY(Math.PI / 4);
      return mesh(g, color, o);
    }
    function ico(r: number, color: string, d?: number, o?: any) {
      return mesh(new T.IcosahedronGeometry(r, d == null ? 1 : d), color, o);
    }
    function gable(w: number, h: number, d: number, color: string, o?: any) {
      const s = new T.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(0, h);
      s.lineTo(-w / 2, 0);
      const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
      g.translate(0, 0, -d / 2);
      return mesh(g, color, o);
    }
    function disc(r: number, h: number, color: string, o?: any) {
      const g = new T.CylinderGeometry(r, r, h, 54);
      g.translate(0, h / 2, 0);
      return mesh(g, color, o);
    }
    function torus(r: number, tube: number, color: string, o?: any) {
      const g = new T.TorusGeometry(r, tube, 8, 40);
      return mesh(g, color, o);
    }
    function slab(w: number, d: number, h: number, color: string, r?: number) {
      const s = new T.Shape();
      const x = -w / 2,
        y = -d / 2;
      r = r || 1.2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + d - r);
      s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
      s.lineTo(x + r, y + d);
      s.quadraticCurveTo(x, y + d, x, y + d - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      const g = new T.ExtrudeGeometry(s, {
        depth: h,
        bevelEnabled: true,
        bevelThickness: 0.28,
        bevelSize: 0.28,
        bevelSegments: 2,
      });
      g.rotateX(-Math.PI / 2);
      const m = new T.Mesh(g, M(color));
      m.receiveShadow = true;
      return m;
    }

    const root = new T.Group();
    scene.add(root);

    // island
    const isl = new T.Group();
    root.add(isl);
    const b0 = slab(74, 74, 6, pal.groundDk, 8);
    b0.position.y = -6.2;
    isl.add(b0);
    const b1 = slab(70, 70, 2.4, pal.ground, 8);
    b1.position.y = -3.0;
    isl.add(b1);
    const lawn = slab(66, 66, 0.7, pal.lawn, 9);
    lawn.position.y = -0.7;
    isl.add(lawn);
    [
      [-15, -13, 7],
      [15, -9, 6],
      [-11, 17, 6],
      [14, 15, 5],
      [0, -22, 8],
    ].forEach((p) => {
      const pt = disc(p[2], 0.16, pal.lawnLt, { noCast: true });
      pt.position.set(p[0], -0.62, p[1]);
      isl.add(pt);
    });

    // plaza
    const plaza = disc(6.6, 0.18, pal.court, { noCast: true });
    plaza.position.set(0, 0.02, 0);
    isl.add(plaza);
    const pring = disc(7.2, 0.1, pal.courtDk, { noCast: true });
    pring.position.set(0, 0, 0);
    isl.add(pring);
    const prose = torus(6.0, 0.12, pal.courtRose);
    prose.rotation.x = Math.PI / 2;
    prose.position.set(0, 0.22, 0);
    prose.castShadow = false;
    isl.add(prose);
    if (cfg.feature === "monument") {
      for (let i = 0; i < 8; i++) {
        const ray = box(0.22, 0.04, i % 2 ? 4.2 : 2.7, pal.courtRose, { noCast: true });
        ray.position.set(0, 0.2, 0);
        ray.rotation.y = (i / 8) * Math.PI * 2;
        ray.geometry.translate(0, 0, i % 2 ? 2.1 : 1.35);
        isl.add(ray);
      }
    }

    // building factory
    function windows(width: number, h: number, cols: number, rows: number, y0: number) {
      const grp = new T.Group();
      const wW = 0.62,
        wH = 0.9,
        gx = (width - cols * wW) / (cols + 1),
        gy = (h - rows * wH) / (rows + 1);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const lit = Math.random() > 0.42;
          const g = new T.PlaneGeometry(wW, wH);
          const m = new T.Mesh(
            g,
            M(lit ? pal.glow : pal.glass, {
              emi: lit ? 0.65 : 0.12,
              emiColor: lit ? pal.glow : pal.glass,
              noCast: true,
            }),
          );
          m.position.set(
            -width / 2 + gx + wW / 2 + c * (wW + gx),
            y0 + gy + wH / 2 + r * (wH + gy),
            0,
          );
          grp.add(m);
        }
      return grp;
    }
    function building(kind: any) {
      const g = new T.Group();
      const wall = kind.wall || pal.wall,
        roofc = kind.roofc || pal.roof;
      const w = kind.w,
        d = kind.d,
        h = kind.h;
      const body = box(w, h, d, wall, { flat: false, rough: 0.95 });
      g.add(body);
      const pl = box(w + 0.7, 0.5, d + 0.7, pal.stone);
      g.add(pl);
      const win = windows(w * 0.82, h * 0.78, kind.cols || 3, kind.rows || 2, h * 0.12);
      win.position.set(0, 0, d / 2 + 0.02);
      g.add(win);
      if (cfg.roof === "hip" || kind.hip) {
        const rf = pyr(Math.max(w, d) * 0.72, h * 0.5, roofc, { flat: false });
        rf.position.y = h;
        g.add(rf);
      } else {
        const rf2 = gable(w + 0.5, h * 0.42, d + 0.4, roofc, { flat: false });
        rf2.position.y = h;
        g.add(rf2);
      }
      const bec = ico(0.28, pal.glow, 0, { emi: 0.9, emiColor: pal.glow, noCast: true });
      bec.position.set(0, h + (kind.hip || cfg.roof === "hip" ? h * 0.52 : h * 0.44), 0);
      g.add(bec);
      anim.glints.push(bec);
      if (cfg.feature === "monument" && kind.cols !== 1) {
        for (let cxi = -1; cxi <= 1; cxi += 2) {
          const col = cyl(0.28, 0.32, h * 0.9, pal.column, 12, { flat: false });
          col.position.set(cxi * (w / 2 - 0.5), 0, d / 2 + 0.5);
          g.add(col);
        }
      }
      return g;
    }

    const ring: any[] = [];
    const count = small ? 6 : 7;
    const defs =
      cfg.feature === "monument"
        ? [
            { w: 7.2, d: 5.6, h: 6.8, cols: 4, rows: 3, hip: true },
            { w: 5.6, d: 5.0, h: 5.4, cols: 3, rows: 2 },
            { w: 6.0, d: 5.2, h: 6.0, cols: 3, rows: 2, wall: pal.wall3 },
            { w: 5.2, d: 4.8, h: 4.8, cols: 3, rows: 2 },
            { w: 6.4, d: 5.4, h: 5.6, cols: 3, rows: 2, wall: pal.wall2 },
            { w: 5.0, d: 4.6, h: 5.0, cols: 3, rows: 2 },
            { w: 5.6, d: 5.0, h: 5.8, cols: 3, rows: 2, wall: pal.wall3 },
          ]
        : [
            { w: 5.4, d: 4.8, h: 4.6, cols: 3, rows: 2, roofc: pal.roof },
            { w: 4.6, d: 4.2, h: 3.8, cols: 2, rows: 2, roofc: pal.roof2 },
            { w: 5.0, d: 4.4, h: 4.2, cols: 3, rows: 2, roofc: pal.roof3, wall: pal.wall3 },
            { w: 4.2, d: 4.0, h: 3.4, cols: 2, rows: 1, roofc: pal.roof },
            { w: 5.2, d: 4.6, h: 4.8, cols: 3, rows: 2, roofc: pal.roof2, wall: pal.wall2 },
            { w: 4.4, d: 4.0, h: 3.6, cols: 2, rows: 2, roofc: pal.roof3 },
            { w: 4.8, d: 4.4, h: 4.0, cols: 3, rows: 2, roofc: pal.roof },
          ];
    for (let bi = 0; bi < count; bi++) {
      const ang = (bi / count) * Math.PI * 2 + (cfg.feature === "monument" ? Math.PI / 7 : 0.3);
      const rr = 15.5 + (bi % 2 ? 2.4 : 0);
      const bx = Math.cos(ang) * rr,
        bz = Math.sin(ang) * rr;
      const bd = building(defs[bi % defs.length]);
      bd.position.set(bx, 0, bz);
      bd.rotation.y = Math.atan2(-bx, -bz);
      const haloGeo = (() => {
        const g = new T.RingGeometry(4, 5.4, 40);
        g.rotateX(-Math.PI / 2);
        return g;
      })();
      const halo = new T.Mesh(
        haloGeo,
        new T.MeshBasicMaterial({
          color: new T.Color(pal.roseDeep),
          transparent: true,
          opacity: 0.16,
          side: T.DoubleSide,
        }),
      );
      halo.position.set(bx, 0.12, bz);
      isl.add(halo);
      root.add(bd);
      ring.push(bd);
    }

    // central feature
    if (cfg.feature === "fountain") {
      const f = new T.Group();
      f.add(cyl(2.4, 2.6, 0.6, pal.stone, 28, { flat: false }));
      const basin = cyl(2.0, 2.0, 0.4, pal.water, 28, {
        emi: 0.06,
        emiColor: pal.water,
        noCast: true,
      });
      basin.position.y = 0.5;
      f.add(basin);
      f.add(cyl(0.4, 0.5, 1.6, pal.column, 16, { flat: false }));
      const top = cyl(1.0, 0.4, 0.4, pal.stone, 20, { flat: false });
      top.position.y = 1.6;
      f.add(top);
      for (let ji = 0; ji < 6; ji++) {
        const jet = cyl(0.06, 0.1, 1.1, pal.water, 8, {
          emi: 0.2,
          emiColor: "#EAF6FB",
          noCast: true,
        });
        const ja = (ji / 6) * Math.PI * 2;
        jet.position.set(Math.cos(ja) * 0.9, 1.7, Math.sin(ja) * 0.9);
        f.add(jet);
        anim.water.push(jet);
      }
      f.position.set(0, 0, 0);
      root.add(f);
    } else {
      const mon = new T.Group();
      mon.add(box(3.2, 0.5, 3.2, pal.stone));
      mon.add(
        (() => {
          const b = box(2.2, 0.6, 2.2, hexShade(pal.stone, -0.08));
          b.position.y = 0.5;
          return b;
        })(),
      );
      const ob = cyl(0.7, 0.95, 5.2, pal.column, 4, { flat: false });
      ob.position.y = 1.1;
      ob.rotation.y = Math.PI / 4;
      mon.add(ob);
      const cap = pyr(0.8, 1.0, pal.rose, { emi: 0.5, emiColor: pal.glow });
      cap.position.y = 6.3;
      mon.add(cap);
      anim.glints.push(cap);
      mon.position.set(0, 0, 0);
      root.add(mon);
      [
        [-4.4, 2.6],
        [4.4, 2.6],
      ].forEach((p, idx) => {
        const pole = cyl(0.12, 0.14, 6.2, pal.trunk, 8, { flat: false });
        pole.position.set(p[0], 0, p[1]);
        root.add(pole);
        const flag = box(0.12, 2.0, 1.7, idx ? pal.roof3 : pal.roseDeep, {
          flat: false,
          noCast: true,
        });
        flag.position.set(p[0], 5.0, p[1] + 0.85);
        root.add(flag);
      });
    }

    // trees
    const placed: any[] = [];
    function far(x: number, z: number, r: number) {
      if (Math.hypot(x, z) < 8.6 + r) return false;
      for (let k = 0; k < placed.length; k++)
        if (Math.hypot(x - placed[k][0], z - placed[k][1]) < r + placed[k][2] + 0.5) return false;
      for (let m2 = 0; m2 < ring.length; m2++) {
        const b = ring[m2].position;
        if (Math.hypot(x - b.x, z - b.z) < 4.6 + r) return false;
      }
      return Math.abs(x) < 32 && Math.abs(z) < 32;
    }
    function tree(x: number, z: number, s: number) {
      const g = new T.Group();
      g.add(cyl(0.16 * s, 0.22 * s, 1.1 * s, pal.trunk, 8, { flat: false }));
      if (cfg.trees === "cypress") {
        const c1 = cone(0.9 * s, 3.4 * s, pal.foliageDk, 12, { flat: false });
        c1.position.y = 0.9 * s;
        g.add(c1);
        const c2 = cone(0.7 * s, 2.2 * s, pal.foliage, 12, { flat: false });
        c2.position.y = 2.1 * s;
        g.add(c2);
      } else {
        const lo = ico(1.15 * s, pal.foliageDk, 1, { flat: true });
        lo.position.y = 1.5 * s;
        g.add(lo);
        const hi = ico(0.9 * s, pal.foliageLt, 1, { flat: true });
        hi.position.set(0.3 * s, 2.15 * s, 0.1 * s);
        g.add(hi);
      }
      g.position.set(x, 0, z);
      g.rotation.y = Math.random() * 6.28;
      root.add(g);
    }
    const treeCount = small ? 34 : 74;
    const groves = [
      [-24, -18],
      [-9, -24],
      [10, -23],
      [24, -16],
      [27, 3],
      [-28, 3],
      [-25, 17],
      [25, 18],
      [2, -26],
      [-16, -24],
      [17, -23],
    ];
    groves.forEach((gp) => {
      const k = 3 + ((Math.random() * 3) | 0);
      for (let j = 0; j < k; j++) {
        const x = gp[0] + (Math.random() - 0.5) * 8,
          z = gp[1] + (Math.random() - 0.5) * 8,
          r = 1.2;
        if (far(x, z, r)) {
          placed.push([x, z, r]);
          tree(x, z, 0.85 + Math.random() * 0.7);
        }
      }
    });
    let guard = 0;
    while (placed.length < treeCount && guard++ < 500) {
      const ang2 = Math.random() * Math.PI * 2,
        rad = 10 + Math.random() * 21;
      const tx = Math.cos(ang2) * rad,
        tz = Math.sin(ang2) * rad;
      if (far(tx, tz, 1.1)) {
        placed.push([tx, tz, 1.1]);
        tree(tx, tz, 0.8 + Math.random() * 0.7);
      }
    }

    // lamps around the plaza
    for (let li = 0; li < 6; li++) {
      const la = (li / 6) * Math.PI * 2 + 0.4,
        lx = Math.cos(la) * 9.4,
        lz = Math.sin(la) * 9.4;
      const lamp = new T.Group();
      lamp.add(cyl(0.09, 0.12, 3.0, pal.trim, 8, { flat: false }));
      const globe = ico(0.26, pal.glow, 0, { emi: 1.0, emiColor: pal.glow, noCast: true });
      globe.position.y = 3.1;
      lamp.add(globe);
      anim.glints.push(globe);
      lamp.position.set(lx, 0, lz);
      root.add(lamp);
    }

    // little people (no CapsuleGeometry)
    if (!small) {
      const pc =
        cfg.feature === "monument"
          ? ["#F8E8DD", "#C2D9EA", "#F2D098", "#9AD6C6", "#B5A0D4", "#C5D9B0"]
          : [pal.rose, pal.roseDeep, "#B5A0D4", pal.foliageLt, "#F2D098", pal.roof3];
      const spots = [
        [-4, 5],
        [4, 5],
        [-6, 3],
        [6, 3],
        [0, 6.4],
        [-3, -4],
        [3, -5],
        [-8, -2],
      ];
      spots.forEach((sp, i) => {
        const g = new T.Group();
        g.add(cyl(0.2, 0.28, 0.95, pc[i % pc.length], 10, { flat: false }));
        const head = ico(0.26, hexShade(pc[i % pc.length], 0.12), 0, { flat: false });
        head.position.y = 1.12;
        g.add(head);
        g.position.set(sp[0], 0, sp[1]);
        g.rotation.y = Math.random() * 6.28;
        g.userData.c = [sp[0], sp[1]];
        g.userData.seed = Math.random() * 6.28;
        g.userData.rad = 1.3;
        root.add(g);
        anim.people.push(g);
      });
    }

    // clouds
    const cloudCount = small ? 6 : 9;
    for (let ci = 0; ci < cloudCount; ci++) {
      const cl = new T.Group();
      const puffs = 3 + ((Math.random() * 2) | 0);
      for (let pj = 0; pj < puffs; pj++) {
        const pf = ico(1.1 + Math.random() * 0.9, "#FFFBF6", 1, {
          flat: false,
          noCast: true,
          noRec: true,
          rough: 1,
          emi: 0.32,
          emiColor: "#FFF3E6",
        });
        pf.position.set((pj - puffs / 2) * 1.5, Math.random() * 0.5, Math.random() * 0.8);
        pf.scale.y = 0.58;
        cl.add(pf);
      }
      const cx = (Math.random() - 0.5) * 86,
        cy = 30 + Math.random() * 16,
        cz = (Math.random() - 0.5) * 76 - 8;
      cl.position.set(cx, cy, cz);
      cl.userData.baseX = cx;
      cl.userData.seed = Math.random() * 6.28;
      cl.scale.setScalar(0.85 + Math.random() * 0.8);
      root.add(cl);
      anim.clouds.push(cl);
    }

    // birds (quarter only, cheap)
    if (cfg.feature === "fountain" && !small) {
      [
        [-8, 15, -6],
        [10, 17, -10],
        [-2, 19, 3],
      ].forEach((b) => {
        const bird = new T.Group();
        const wg = new T.Group();
        const l = box(0.5, 0.04, 0.14, "#5E4038", { noCast: true, noRec: true });
        l.position.x = -0.28;
        const rr2 = box(0.5, 0.04, 0.14, "#5E4038", { noCast: true, noRec: true });
        rr2.position.x = 0.28;
        wg.add(l);
        wg.add(rr2);
        bird.add(wg);
        bird.position.set(b[0], b[1], b[2]);
        bird.userData.baseX = b[0];
        bird.userData.baseZ = b[2];
        bird.userData.seed = Math.random() * 6.28;
        bird.userData.wing = wg;
        root.add(bird);
        anim.birds.push(bird);
      });
    }

    // first frame
    applyCamera(0);
    renderer.render(scene, camera);

    if (!reduced) {
      onPointer = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        tParX = ((e.clientX - r.left) / r.width - 0.5) * 2;
        tParY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      host.addEventListener("pointermove", onPointer);
      io = new IntersectionObserver(
        (ents) => {
          vis = ents[0].isIntersecting;
          if (vis) start();
          else stop();
        },
        { threshold: 0.02 },
      );
      io.observe(host);
      vis = true;
      start();
    }
  }

  function maybeInit() {
    if (scene || disposed) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    try {
      build(rect);
      // Once built, the ResizeObserver drives resize() rather than init.
      if (ro) {
        ro.disconnect();
        ro = new ResizeObserver(() => resize());
        ro.observe(host);
      }
    } catch (e) {
      // keep the CSS-sky fallback
      if (typeof console !== "undefined") console.warn("hero3d build failed", e);
    }
  }

  // Boot once we have a real size (WebGL check happens inside build()).
  ro = new ResizeObserver(() => maybeInit());
  ro.observe(host);
  maybeInit();

  return {
    dispose() {
      disposed = true;
      stop();
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (onPointer) host.removeEventListener("pointermove", onPointer);
      if (renderer) {
        try {
          if (scene) {
            scene.traverse((o: any) => {
              if (o.geometry) o.geometry.dispose();
              if (o.material) {
                (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => {
                  if (m.dispose) m.dispose();
                });
              }
            });
          }
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        } catch {
          /* non-fatal */
        }
      }
      scene = null;
      renderer = null;
    },
  };
}
