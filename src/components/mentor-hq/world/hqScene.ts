/* eslint-disable @typescript-eslint/no-explicit-any -- Imperative three.js
   engine: the animated[] bags and Object3D.userData carry heterogeneous runtime
   shapes (meshes, lights, the beacon {mesh,base,amp} bag, cloth geometry, etc.).
   Narrow static types here would be casts-everywhere noise; scoped to this one
   engine file only — every other module stays strict. */
/* ============================================================
   UniPlug · Headquarters — 3D scene engine (TS port of the
   prototype hq3d/scene.js). Imperative three.js, mounted by a
   client-only React wrapper (Hq3DScene.tsx) behind the SSR-safe
   lazy boundary. Themeable (mix default) · golden|dusk · the
   three verification world-states · hover-peek · click-to-fly.
   ============================================================ */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { P, setActiveTheme, THEMES, TIME, M, shade, slab, cyl, box, ring } from "./hqKit";
import type { ThemeName, TimeName } from "./hqKit";
import { BUILDINGS } from "./hqBuildings";
import * as PR from "./hqProps";

const T = THREE;

export type WorldState = "pending" | "approved" | "rejected";

export interface ZoneInfo {
  stat?: string;
  sub?: string;
}

export interface HqSceneOpts {
  theme?: ThemeName;
  time?: TimeName;
  state?: WorldState;
  /** live per-zone hover-card copy (real data; honest — no fabricated numbers) */
  zoneInfo?: Record<string, ZoneInfo>;
  onEnter?: (zoneId: string) => void;
  onLocked?: (zoneId: string) => void;
}

export interface HqSceneApi {
  zones: typeof ZONES;
  flyTo: (id: string, enter?: boolean) => void;
  flyHome: () => void;
  setTheme: (t: ThemeName) => void;
  setTime: (t: TimeName) => void;
  setState: (s: WorldState) => void;
  setZoneInfo: (info: Record<string, ZoneInfo>) => void;
  setMotion: (on: boolean) => void;
  getTime: () => TimeName;
  getState: () => WorldState;
  dispose: () => void;
}

export interface Zone {
  id: string;
  name: string;
  kind: string;
  pos: [number, number];
  alwaysLit?: boolean;
  blurb: string;
}

// Function mapping per the brief (not the prototype's stale labels). Hover-card
// stat/sub come from live data via opts.zoneInfo — no fabricated numbers here.
const ZONES: Zone[] = [
  {
    id: "watchtower",
    name: "The Watchtower",
    kind: "Home",
    pos: [0, -4],
    alwaysLit: true,
    blurb: "Your whole practice at a glance — today, and what needs you.",
  },
  {
    id: "forum",
    name: "The Forum",
    kind: "Sessions",
    pos: [-19, 5],
    blurb: "Your 1:1s — upcoming and past, join, prep, notes and the docs students share.",
  },
  {
    id: "sundial",
    name: "The Sundial",
    kind: "Availability",
    pos: [19, -3],
    blurb: "Set the hours you're open. UniPlug sets pricing — you set your time.",
  },
  {
    id: "vault",
    name: "The Vault",
    kind: "Earnings",
    pos: [13, -15],
    blurb: "What you've earned, and what's scheduled to come your way.",
  },
  {
    id: "laurels",
    name: "The Laurels",
    kind: "Reputation",
    pos: [0, 21],
    blurb: "How students rate you — your overall standing, in numbers.",
  },
  {
    id: "forge",
    name: "The Forge",
    kind: "Profile",
    pos: [-12, -16],
    alwaysLit: true,
    blurb: "Your profile, specialties, credentials and verification.",
  },
  {
    id: "embassy",
    name: "The Embassy",
    kind: "Support",
    pos: [14, 15],
    blurb: "Support, disputes, and a direct line to report a safety concern.",
  },
];

export function initHqScene(mount: HTMLElement, opts: HqSceneOpts = {}): HqSceneApi {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = () => mount.clientWidth || innerWidth;
  const H = () => mount.clientHeight || innerHeight;

  // Match the prototype's (three r128) colour pipeline. Modern three (r152+)
  // enables ColorManagement by default, which converts every sRGB hex albedo to
  // linear before lighting — that darkens the warm tan/cream/green palette into
  // the muddy olive-brown we were getting. The prototype rendered the palette
  // as-is, which is what makes its golden hour read bright + sunny. Turning CM
  // off (paired with the sRGB output transform below) reproduces that exact look
  // without altering a single palette value or light intensity.
  T.ColorManagement.enabled = false;

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace; // r152+ (was outputEncoding=sRGBEncoding)
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(33, W() / H(), 0.1, 500);
  const HOME_POS = new T.Vector3(27, 20, 43);
  const HOME_TGT = new T.Vector3(0, 6, 3);
  camera.position.copy(HOME_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TGT);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 22;
  controls.maxDistance = 92;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.32;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.16;
  controls.update();

  /* lights — configured by applyTime() */
  const hemi = new T.HemisphereLight(0xffffff, 0xffffff, 0.4);
  scene.add(hemi);
  const amb = new T.AmbientLight(0xffffff, 0.1);
  scene.add(amb);
  const sun = new T.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 170;
  const sc = 58;
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.7;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new T.DirectionalLight(0xffffff, 0.2);
  fill.position.set(-30, 22, -26);
  scene.add(fill);
  const rim = new T.DirectionalLight(0xffffff, 0.3);
  rim.position.set(-12, 16, -36);
  scene.add(rim);

  /* state */
  let theme: ThemeName = opts.theme || "mix";
  let time: TimeName = opts.time || "golden";
  let worldState: WorldState = opts.state || "pending";
  let zoneInfo: Record<string, ZoneInfo> = opts.zoneInfo || {};
  let motion = !reduce;
  let winScale = 1;
  const pathSegs: PathSeg[] = [];
  const COURT = new T.Vector2(0, 6);
  const courtR = 6.2;

  interface PathSeg {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    w: number;
    mx: number;
    mz: number;
    len: number;
    ang: number;
  }

  const segPointDist = (px: number, pz: number, s: PathSeg) => {
    const dx = s.bx - s.ax,
      dz = s.bz - s.az;
    const L2 = dx * dx + dz * dz;
    let t = L2 ? ((px - s.ax) * dx + (pz - s.az) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
  };
  const onRoad = (x: number, z: number, pad: number) =>
    pathSegs.some((s) => segPointDist(x, z, s) < s.w / 2 + pad);

  let island: THREE.Group,
    buildingsGroup: THREE.Group,
    propsGroup: THREE.Group,
    skyGroup: THREE.Group;
  const buildingRoots: THREE.Group[] = [];
  type AnimBag = {
    beacons: any[];
    water: any[];
    cloths: any[];
    clouds: any[];
    people: any[];
    fires: any[];
    smoke: any[];
    flames: any[];
    lampGlobes: any[];
    fireLights: any[];
    lampLights: any[];
    gnomons: any[];
    halos: any[];
  };
  const animated: AnimBag = {
    beacons: [],
    water: [],
    cloths: [],
    clouds: [],
    people: [],
    fires: [],
    smoke: [],
    flames: [],
    lampGlobes: [],
    fireLights: [],
    lampLights: [],
    gnomons: [],
    halos: [],
  };

  /* ---------- sky (golden-hour gradient as scene.background) ---------- */
  function makeSky() {
    const stops = TIME[time].sky;
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 16, 256);
    const tx = new T.CanvasTexture(c);
    tx.colorSpace = T.SRGBColorSpace;
    scene.background = tx;
  }

  /* ---------- island + court + roads ---------- */
  function buildIsland() {
    island = new T.Group();
    scene.add(island);
    const PAL = P();
    const ISL_W = 72,
      ISL_D = 68;
    const s0 = slab(ISL_W + 3, ISL_D + 3, 5, PAL.groundDk, 6, { bevel: true, receive: true });
    s0.position.y = -5.3;
    island.add(s0);
    const s1 = slab(ISL_W + 1, ISL_D + 1, 2.2, PAL.ground, 6, { bevel: true });
    s1.position.y = -2.6;
    island.add(s1);
    const lawn = slab(ISL_W, ISL_D, 0.7, PAL.lawn, 6.5, { bevel: true, receive: true });
    lawn.position.y = -0.7;
    lawn.receiveShadow = true;
    island.add(lawn);

    pathSegs.length = 0;
    const _pos: Record<string, [number, number]> = Object.fromEntries(
      ZONES.map((z) => [z.id, z.pos]),
    );
    const bldR: Record<string, number> = {
      watchtower: 5.2,
      forum: 8.0,
      sundial: 6.2,
      vault: 5.2,
      laurels: 5.6,
      forge: 5.6,
      embassy: 5.0,
    };
    const seg = (
      ax: number,
      az: number,
      bx: number,
      bz: number,
      w: number,
      trimA: number,
      trimB: number,
    ) => {
      const dx = bx - ax,
        dz = bz - az,
        L = Math.hypot(dx, dz);
      if (L < 0.1) return;
      const ux = dx / L,
        uz = dz / L;
      const a = { x: ax + ux * trimA, z: az + uz * trimA },
        b = { x: bx - ux * trimB, z: bz - uz * trimB };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1) return;
      pathSegs.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        w,
        mx: (a.x + b.x) / 2,
        mz: (a.z + b.z) / 2,
        len,
        ang: Math.atan2(b.x - a.x, b.z - a.z),
      });
    };
    ZONES.forEach((z) =>
      seg(COURT.x, COURT.y, z.pos[0], z.pos[1], 3.2, courtR - 0.4, (bldR[z.id] || 5) + 0.4),
    );
    (
      [
        ["laurels", "embassy"],
        ["embassy", "sundial"],
        ["sundial", "vault"],
        ["vault", "forge"],
        ["forge", "forum"],
        ["forum", "laurels"],
      ] as const
    ).forEach(([a, b]) => {
      const A = _pos[a],
        B = _pos[b];
      seg(A[0], A[1], B[0], B[1], 2.6, (bldR[a] || 5) + 1.6, (bldR[b] || 5) + 1.6);
    });

    const stoneTones = [
      PAL.path,
      shade(PAL.path, 0.07),
      shade(PAL.path, -0.07),
      shade(PAL.pathJoint, -0.05),
    ];
    pathSegs.forEach((s, si) => {
      const fx = Math.sin(s.ang),
        fz = Math.cos(s.ang);
      const lx = Math.cos(s.ang),
        lz = -Math.sin(s.ang);
      const wide = s.w > 2.6;
      const slabW = wide ? Math.min(s.w - 0.5, 2.6) : Math.min(s.w - 0.2, 1.65);
      const slabL = wide ? 1.7 : 1.4;
      const gap = 0.5;
      const stepLen = slabL + gap;
      const n = Math.max(2, Math.floor(s.len / stepLen));
      const usable = n * stepLen - gap,
        start = -usable / 2 + slabL / 2;
      for (let i = 0; i < n; i++) {
        const t = start + i * stepLen;
        const off = Math.sin(t * 0.3 + si * 1.7) * 0.3 + (Math.random() - 0.5) * 0.1;
        const w = slabW * (0.92 + Math.random() * 0.12),
          l = slabL * (0.92 + Math.random() * 0.12);
        const st = slab(
          w,
          l,
          0.15,
          stoneTones[(Math.random() * stoneTones.length) | 0],
          Math.min(w, l) * 0.42,
          { bevel: true, receive: true },
        );
        st.position.set(s.mx + fx * t + lx * off, 0.085, s.mz + fz * t + lz * off);
        st.rotation.y = s.ang + (Math.random() - 0.5) * 0.12;
        st.castShadow = true;
        st.receiveShadow = true;
        island.add(st);
      }
    });

    const court = cyl(courtR, courtR, 0.16, PAL.court, { seg: 48, edges: false });
    court.position.set(COURT.x, 0.02, COURT.y);
    court.receiveShadow = true;
    island.add(court);
    const courtRing = cyl(courtR + 0.6, courtR + 0.6, 0.1, PAL.courtDk, { seg: 48, edges: false });
    courtRing.position.set(COURT.x, 0.0, COURT.y);
    courtRing.receiveShadow = true;
    island.add(courtRing);
    const courtInlay = cyl(courtR - 0.7, courtR - 0.7, 0.02, PAL.courtInlay, {
      seg: 48,
      edges: false,
    });
    courtInlay.position.set(COURT.x, 0.19, COURT.y);
    island.add(courtInlay);
    const courtInner = cyl(courtR - 0.95, courtR - 0.95, 0.02, PAL.court, {
      seg: 48,
      edges: false,
    });
    courtInner.position.set(COURT.x, 0.2, COURT.y);
    island.add(courtInner);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ray = box(0.24, 0.04, i % 2 ? 4.4 : 2.9, PAL.courtInlay, { edges: false });
      ray.position.set(COURT.x, 0.21, COURT.y);
      ray.rotation.y = a;
      ray.geometry.translate(0, 0, i % 2 ? 2.2 : 1.45);
      island.add(ray);
    }
    const compassHub = cyl(0.95, 0.95, 0.06, PAL.courtInlay, { seg: 24, edges: false });
    compassHub.position.set(COURT.x, 0.21, COURT.y);
    island.add(compassHub);
    (
      [
        [-7.6, 15, Math.PI / 2, 4],
        [7.6, 15, Math.PI / 2, 4],
      ] as const
    ).forEach(([x, z, ry, len]) => {
      const w = PR.gardenWall(len);
      w.position.set(x, 0, z);
      w.rotation.y = ry;
      island.add(w);
    });
  }

  /* ---------- landmarks ---------- */
  function buildBuildings() {
    buildingsGroup = new T.Group();
    scene.add(buildingsGroup);
    buildingRoots.length = 0;
    const PAL = P();
    ZONES.forEach((z) => {
      const g = (BUILDINGS as Record<string, () => THREE.Group>)[z.id]();
      g.position.set(z.pos[0], 0, z.pos[1]);
      g.userData.zoneId = z.id;
      g.userData.lift = 0;
      g.userData.liftTarget = 0;
      const _bb = new T.Box3().setFromObject(g);
      const _sz = _bb.getSize(new T.Vector3());
      const plinth = slab(_sz.x + 1.7, _sz.z + 1.7, 0.5, PAL.dark, 0.7, { receive: true });
      plinth.position.set(z.pos[0], -0.26, z.pos[1]);
      buildingsGroup.add(plinth);
      const plinth2 = slab(_sz.x + 0.85, _sz.z + 0.85, 0.42, PAL.stoneDk, 0.6, { receive: true });
      plinth2.position.set(z.pos[0], -0.04, z.pos[1]);
      buildingsGroup.add(plinth2);
      const halo = ring(z.id === "watchtower" ? 6 : 4.4, z.id === "watchtower" ? 8 : 6, PAL.gold);
      halo.position.set(z.pos[0], 0.16, z.pos[1]);
      (halo.material as THREE.MeshBasicMaterial).color = new T.Color(PAL.accent);
      island.add(halo);
      g.userData.halo = halo;
      animated.halos.push(halo);
      buildingsGroup.add(g);
      buildingRoots.push(g);
    });
  }

  /* ---------- props ---------- */
  function buildProps() {
    propsGroup = new T.Group();
    scene.add(propsGroup);
    const PAL = P();
    const add = (o: THREE.Object3D, x: number, z: number, ry = 0, s = 1) => {
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      o.scale.setScalar(s);
      propsGroup.add(o);
      return o;
    };
    const placed: { x: number; z: number; r: number }[] = [];
    const regd = (x: number, z: number, r: number) => placed.push({ x, z, r });
    const farP = (x: number, z: number, r: number) =>
      placed.every((p) => Math.hypot(x - p.x, z - p.z) > r + p.r + 0.5);
    const inIsland = (x: number, z: number) => Math.abs(x) < 34 && z > -31 && z < 31;
    const BLD: [number, number, number][] = [
      [0, -4, 5.2],
      [-19, 5, 8.0],
      [19, -3, 6.4],
      [13, -15, 5.2],
      [0, 21, 5.8],
      [-12, -16, 5.6],
      [14, 15, 5.2],
    ];
    const clear = (x: number, z: number, r: number) =>
      inIsland(x, z) &&
      Math.hypot(x - COURT.x, z - COURT.y) > courtR + r + 0.8 &&
      BLD.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + r) &&
      !onRoad(x, z, r + 0.4) &&
      farP(x, z, r);
    const place = (o: THREE.Object3D, x: number, z: number, r: number, ry = 0, s = 1) => {
      add(o, x, z, ry, s);
      regd(x, z, r);
      return o;
    };

    add(PR.founderMonument(), 0, 8, Math.PI);
    regd(0, 8, 2.2);
    (
      [
        [-9, 11],
        [9, 11],
        [-10, 2.5],
        [10, 2.5],
      ] as const
    ).forEach(([x, z]) => {
      const b = PR.brazier(true);
      add(b, x, z);
      regd(x, z, 1.0);
      collectBrazier(b);
    });
    (
      [
        [-7, 13.5, 0],
        [7, 13.5, 0],
        [-11.5, 6, 0.5],
        [11.5, 6, -0.5],
      ] as const
    ).forEach(([x, z, r]) => {
      add(PR.bench(), x, z, r);
      regd(x, z, 1.3);
    });
    (
      [
        [-10.5, 11.5],
        [10.5, 11.5],
        [-7.5, 2.5],
        [7.5, 2.5],
      ] as const
    ).forEach(([x, z]) => {
      add(PR.topiary(0.95), x, z);
      regd(x, z, 1.0);
    });
    add(PR.bannerPole(6.5, PAL.banner), -6, 18);
    regd(-6, 18, 0.8);
    add(PR.bannerPole(6.5, PAL.accent), 6, 18);
    regd(6, 18, 0.8);
    (
      [
        [-4.6, 15.5],
        [4.6, 15.5],
        [-4.6, 19.5],
        [4.6, 19.5],
      ] as const
    ).forEach(([x, z]) => {
      add(PR.cypress(1.15), x, z);
      regd(x, z, 1.0);
    });

    let li = 0;
    pathSegs.forEach((s) => {
      const n = Math.max(1, Math.floor(s.len / 5));
      const px = Math.cos(s.ang),
        pz = -Math.sin(s.ang);
      for (let i = 1; i <= n; i++) {
        const t = -s.len / 2 + s.len * (i / (n + 1));
        const side = (i % 2 ? 1 : -1) * (s.w / 2 + 0.9);
        const lx = s.mx + Math.sin(s.ang) * t + px * side,
          lz = s.mz + Math.cos(s.ang) * t + pz * side;
        if (!inIsland(lx, lz) || !farP(lx, lz, 0.7)) continue;
        const l = PR.lamp(li < 6);
        add(l, lx, lz);
        regd(lx, lz, 0.7);
        collectLamp(l);
        li++;
      }
    });

    const scatterOne = (x: number, z: number) => {
      const r = Math.random();
      let o: THREE.Object3D, rad: number;
      if (r < 0.4) {
        o = PR.cypress(0.8 + Math.random() * 0.7);
        rad = 1.0;
      } else if (r < 0.7) {
        o = PR.treeRound(0.85 + Math.random() * 0.6);
        rad = 1.3;
      } else if (r < 0.9) {
        o = PR.bush(0.9 + Math.random() * 0.7);
        rad = 0.9;
      } else {
        o = PR.rock(0.7 + Math.random() * 0.9);
        rad = 0.9;
      }
      if (clear(x, z, rad)) place(o, x, z, rad, Math.random() * 6.28);
    };
    (
      [
        [-24, -20],
        [-8, -26],
        [10, -25],
        [24, -18],
        [28, 3],
        [-29, 3],
        [-27, 18],
        [26, 20],
        [2, -29],
        [-16, -26],
      ] as const
    ).forEach(([gx, gz]) => {
      const k = 5 + Math.floor(Math.random() * 4);
      for (let j = 0; j < k; j++)
        scatterOne(gx + (Math.random() - 0.5) * 9, gz + (Math.random() - 0.5) * 9);
    });
    for (let i = 0; i < 360; i++)
      scatterOne((Math.random() - 0.5) * 68, (Math.random() - 0.5) * 60 - 2);
    (
      [
        [-26, -2, "s"],
        [26, 2, "o"],
        [-2, -27, "o"],
        [25, -19, "s"],
        [-28, 12, "o"],
      ] as const
    ).forEach(([x, z, t]) => {
      if (clear(x, z, 2))
        place(
          t === "s" ? PR.statue() : PR.obelisk(5 + Math.random() * 1.6),
          x,
          z,
          2,
          Math.random() * 6.28,
        );
    });
    (
      [
        [-34, 24, -20, 1.5],
        [30, 28, -14, 1.2],
        [8, 27, 24, 1.4],
        [-22, 30, 18, 1.1],
        [18, 32, 8, 1.3],
        [-12, 26, -26, 1.0],
        [34, 30, 2, 1.1],
        [-30, 33, 6, 0.95],
        [2, 29, 30, 1.2],
        [22, 26, -28, 1.0],
      ] as const
    ).forEach(([x, y, z, s]) => {
      const c = PR.cloud(s);
      c.position.set(x, y, z);
      c.userData.seed = Math.random() * 6.28;
      c.userData.baseX = x;
      skyGroup.add(c);
      animated.clouds.push(c);
    });
    const mc = ["#F8E8DD", "#C2D9EA", "#F2D098", "#9AD6C6", "#B5A0D4", "#C5D9B0", "#F4B5AA"];
    (
      [
        [-6, 12],
        [6, 12],
        [-9, 6],
        [9, 6],
        [0, 13],
        [-3, 9],
        [4, 16],
        [-14, 0],
        [16, -6],
        [-2, -12],
        [12, 9],
        [-18, 15],
      ] as const
    ).forEach(([x, z], i) => {
      const inCourt = Math.hypot(x - COURT.x, z - COURT.y) < courtR + 2;
      if (!inCourt && !clear(x, z, 1.3)) return;
      const pr = add(PR.person(mc[i % mc.length]), x, z, Math.random() * 6.28);
      pr.userData.center = new T.Vector2(x, z);
      pr.userData.seed = Math.random() * 6.28;
      pr.userData.rad = inCourt ? 1.4 : 0.8;
      pr.userData.folk = true;
      if (!inCourt) regd(x, z, 1.0);
      animated.people.push(pr);
    });
  }
  function collectBrazier(b: THREE.Object3D) {
    b.traverse((o) => {
      if (o.userData.flame) animated.flames.push(o);
      if (o.userData.fireLight) animated.fireLights.push(o);
    });
    animated.fires.push(b);
  }
  function collectLamp(l: THREE.Object3D) {
    l.traverse((o) => {
      if (o.userData.lampGlobe) animated.lampGlobes.push(o);
      if (o.userData.lampLight) animated.lampLights.push(o);
    });
  }

  function harvestBuildings() {
    animated.beacons.length = 0;
    animated.water.length = 0;
    animated.cloths.length = 0;
    animated.gnomons.length = 0;
    animated.smoke.length = 0;
    buildingRoots.forEach((root) =>
      root.traverse((o) => {
        if (o.userData.beacon) animated.beacons.push(o.userData.beacon);
        if (o.userData.water) animated.water.push(o);
        if (o.userData.cloth) animated.cloths.push(o);
        if (o.userData.gnomon) animated.gnomons.push(o);
        if (o.userData.smoke) animated.smoke.push(o);
        if (o.userData.forgeFire) animated.smoke.push(o);
      }),
    );
  }

  /* ---------- time of day ---------- */
  function applyTime() {
    const tp = TIME[time];
    renderer.toneMappingExposure = tp.exposure;
    makeSky();
    scene.fog = new T.Fog(new T.Color(tp.fog), tp.fogNear, tp.fogFar);
    hemi.color.set(tp.hemiSky);
    hemi.groundColor.set(tp.hemiGround);
    hemi.intensity = tp.hemiInt;
    amb.intensity = tp.ambInt;
    sun.color.set(tp.sunColor);
    sun.intensity = tp.sunInt;
    sun.position.set(tp.sunPos[0], tp.sunPos[1], tp.sunPos[2]);
    fill.color.set(tp.fillColor);
    fill.intensity = tp.fillInt;
    rim.color.set(tp.rimColor);
    rim.intensity = tp.rimInt;
    winScale = tp.winEmi;
    animated.fireLights.forEach((l) => (l.intensity = tp.braE));
    animated.lampLights.forEach((l) => (l.intensity = tp.lampInt));
    animated.lampGlobes.forEach(
      (o) => (o.material.emissiveIntensity = time === "dusk" ? 1.3 : 0.7),
    );
    animated.flames.forEach((o) => (o.material.emissiveIntensity = time === "dusk" ? 1.4 : 0.55));
    applyWindowState();
  }
  function applyWindowState() {
    const PAL = P();
    buildingRoots.forEach((g) => {
      const locked = g.userData.locked;
      g.traverse((o) => {
        if (o.userData.win) {
          (o as THREE.Mesh).material =
            o.userData.lit && !locked
              ? M(PAL.glow, { emissive: PAL.glow, emi: o.userData.litEmi * winScale })
              : M(locked ? shade(PAL.glass, -0.3) : PAL.glass, {
                  emissive: PAL.glass,
                  emi: locked ? 0.0 : 0.06,
                });
        }
      });
    });
  }

  /* ---------- world state ---------- */
  let craneObj: THREE.Group | null = null,
    pilesGroup: THREE.Group | null = null,
    rejectGroup: THREE.Group | null = null;
  const DAMAGED: Record<string, number> = {
    forum: 1,
    sundial: 1,
    vault: 1,
    laurels: 1,
    embassy: 1,
  };
  function applyState() {
    buildingRoots.forEach((g) => {
      const z = ZONES.find((z) => z.id === g.userData.zoneId)!;
      const unlocked = worldState === "approved" ? true : !!z.alwaysLit;
      g.userData.locked = !unlocked;
      g.rotation.z = 0;
      if (g.userData.damage) {
        g.remove(g.userData.damage);
        disposeObj(g.userData.damage);
        g.userData.damage = null;
      }
      if (g.userData.scaffold) {
        g.remove(g.userData.scaffold);
        disposeObj(g.userData.scaffold);
        g.userData.scaffold = null;
      }
      const wrecked = worldState === "rejected" && DAMAGED[g.userData.zoneId];
      const scaffolded =
        worldState === "pending" || (worldState === "rejected" && !wrecked && !z.alwaysLit);
      if (scaffolded) {
        const bb = new T.Box3().setFromObject(g);
        const sz = bb.getSize(new T.Vector3());
        const sca = PR.scaffoldFor(Math.min(sz.x, 11), Math.min(sz.z, 11), Math.min(sz.y, 12));
        g.add(sca);
        g.userData.scaffold = sca;
      }
      if (wrecked) {
        const dmg = PR.wreck(g.userData.labelY || 7);
        g.add(dmg);
        g.userData.damage = dmg;
        const tilt: Record<string, number> = {
          forum: 0.05,
          sundial: -0.06,
          vault: 0.07,
          laurels: 0.05,
          embassy: -0.06,
        };
        g.rotation.z = tilt[g.userData.zoneId] || -0.05;
      }
    });
    if (craneObj) {
      propsGroup.remove(craneObj);
      disposeObj(craneObj);
      craneObj = null;
    }
    if (worldState !== "approved") {
      craneObj = PR.crane();
      craneObj.position.set(-27, 0, -3);
      craneObj.rotation.y = 0.5;
      propsGroup.add(craneObj);
    }
    if (pilesGroup) {
      propsGroup.remove(pilesGroup);
      disposeObj(pilesGroup);
      pilesGroup = null;
    }
    if (worldState !== "approved") {
      pilesGroup = new T.Group();
      (
        [
          [-18, 10],
          [12, -8],
          [6, 17],
          [-10, -9],
          [18, 4],
        ] as const
      ).forEach(([x, z]) => {
        const p = PR.materialsPile();
        p.position.set(x, 0, z);
        p.rotation.y = Math.random() * 6.28;
        pilesGroup!.add(p);
      });
      (
        [
          [-25, -1],
          [-23, -5],
        ] as const
      ).forEach(([x, z]) => {
        const w = PR.person("#D8CFC4");
        w.position.set(x, 0, z);
        w.rotation.y = Math.random() * 6.28;
        pilesGroup!.add(w);
      });
      propsGroup.add(pilesGroup);
    }
    if (rejectGroup) {
      propsGroup.remove(rejectGroup);
      disposeObj(rejectGroup);
      rejectGroup = null;
    }
    if (worldState === "rejected") {
      rejectGroup = new T.Group();
      buildingRoots.forEach((g) => {
        const f = PR.redFlag(4.6);
        f.position.set(g.position.x + 1.8, (g.userData.labelY || 6) * 0.4, g.position.z + 2.6);
        rejectGroup!.add(f);
        const rb = PR.rubble();
        rb.position.set(g.position.x - 2.8, 0, g.position.z + 3.2);
        rejectGroup!.add(rb);
      });
      (
        [
          [-8, 9],
          [8, 9],
          [0, 16],
          [-16, -4],
          [16, -2],
          [-4, 13],
        ] as const
      ).forEach(([x, z]) => {
        const f = PR.redFlag(3.4);
        f.position.set(x, 0, z);
        rejectGroup!.add(f);
      });
      propsGroup.add(rejectGroup);
    }
    animated.people.forEach((p) => (p.visible = worldState === "approved"));
    animated.beacons.forEach((b) => (b.approved = worldState === "approved"));
    applyWindowState();
  }

  function disposeObj(o: THREE.Object3D) {
    o.traverse((n: any) => {
      if (n.geometry) n.geometry.dispose();
    });
  }
  function disposeGroup(grp: THREE.Group | undefined) {
    if (!grp) return;
    scene.remove(grp);
    grp.traverse((n: any) => {
      if (n.geometry) n.geometry.dispose();
    });
  }

  function rebuildWorld() {
    setActiveTheme(theme);
    [island, buildingsGroup, propsGroup, skyGroup].forEach(disposeGroup);
    animated.clouds.length = 0;
    animated.people.length = 0;
    animated.fires.length = 0;
    animated.flames.length = 0;
    animated.fireLights.length = 0;
    animated.lampLights.length = 0;
    animated.lampGlobes.length = 0;
    animated.halos.length = 0;
    clearMaterialCacheSafe();
    skyGroup = new T.Group();
    scene.add(skyGroup);
    buildIsland();
    buildBuildings();
    buildProps();
    harvestBuildings();
    applyState();
    applyTime();
  }
  function clearMaterialCacheSafe() {
    try {
      (M as unknown as { _clear?: () => void })._clear?.();
    } catch {
      /* noop */
    }
  }

  /* ---- labels overlay (DOM) ---- */
  const labelLayer = document.createElement("div");
  labelLayer.className = "hq-labels";
  mount.appendChild(labelLayer);
  const tags: Record<string, HTMLDivElement> = {};
  const preview = document.createElement("div");
  preview.className = "hq-preview";
  ZONES.forEach((z) => {
    const el = document.createElement("div");
    el.className = "hq-tag";
    labelLayer.appendChild(el);
    tags[z.id] = el;
  });
  labelLayer.appendChild(preview);

  /* ---- interaction ---- */
  const rayc = new T.Raycaster();
  const pointer = new T.Vector2(-2, -2);
  let hoveredId: string | null = null,
    downPos: { x: number; y: number } | null = null;
  let flying: {
    start: number;
    dur: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTgt: THREE.Vector3;
    toTgt: THREE.Vector3;
  } | null = null;
  let idleT = 0,
    lastPX = 0,
    lastPY = 0;
  function setPointer(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function pick(): string | null {
    rayc.setFromCamera(pointer, camera);
    const hits = rayc.intersectObjects(buildingRoots, true);
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.zoneId) o = o.parent;
    return o ? (o.userData.zoneId as string) : null;
  }
  function zoneEnterable(z: Zone) {
    return worldState === "approved" || !!z.alwaysLit;
  }
  function onMove(e: PointerEvent) {
    setPointer(e);
    idleT = 0;
    controls.autoRotate = false;
    lastPX = e.clientX;
    lastPY = e.clientY;
    const id = pick();
    if (id !== hoveredId) {
      hoveredId = id;
      refreshHover();
    }
    if (hoveredId) posPreview();
  }
  function posPreview() {
    const x = Math.max(150, Math.min(lastPX + 22, W() - 150));
    const y = Math.max(120, Math.min(lastPY + 16, H() - 150));
    preview.style.transform = `translate(${x}px,${y}px) translate(-50%,0)`;
  }
  function refreshHover() {
    buildingRoots.forEach((g) => {
      g.userData.liftTarget = g.userData.zoneId === hoveredId ? 0.7 : 0;
    });
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    const z = ZONES.find((z) => z.id === hoveredId);
    if (z) {
      const can = zoneEnterable(z);
      const info = zoneInfo[z.id] || {};
      const stat = can
        ? (info.stat ?? "")
        : worldState === "rejected" && z.id !== "forge"
          ? "Locked · fix verification"
          : "Locked · under review";
      const sub = can ? (info.sub ?? "") : "Opens once you're approved";
      const statBlock =
        stat || sub ? `<div class="cp-stat"><b>${esc(stat)}</b><span>${esc(sub)}</span></div>` : "";
      preview.innerHTML =
        `<div class="cp-kind">${esc(z.kind)}</div><div class="cp-name">${esc(z.name)}</div>` +
        `<div class="cp-blurb">${esc(z.blurb)}</div>${statBlock}` +
        `<div class="cp-enter ${can ? "" : "locked"}">${can ? "Enter ›" : "Locked"}</div>`;
      preview.classList.add("show");
    } else preview.classList.remove("show");
  }
  function esc(s: string) {
    return String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );
  }
  function onDown(e: PointerEvent) {
    downPos = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: PointerEvent) {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved < 6 && hoveredId && !flying) {
      const z = ZONES.find((z) => z.id === hoveredId)!;
      if (zoneEnterable(z)) flyTo(hoveredId, true);
      else opts.onLocked?.(hoveredId);
    }
  }
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  function easeIO(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function flyTo(id: string, enter?: boolean) {
    const z = ZONES.find((z) => z.id === id);
    if (!z) return;
    const g = buildingRoots.find((b) => b.userData.zoneId === id)!;
    const tgt = new T.Vector3(z.pos[0], (g.userData.labelY || 7) * 0.34, z.pos[1]);
    const out = new T.Vector3(z.pos[0] * 0.2, (g.userData.labelY || 7) * 0.5 + 5, 15);
    const dest = tgt.clone().add(out);
    flying = {
      start: performance.now(),
      dur: enter ? 0.9 : 1.0,
      fromPos: camera.position.clone(),
      toPos: dest,
      fromTgt: controls.target.clone(),
      toTgt: tgt,
    };
    controls.autoRotate = false;
    hoveredId = null;
    refreshHover();
    if (enter && opts.onEnter) setTimeout(() => opts.onEnter!(id), 580);
  }
  function flyHome() {
    flying = {
      start: performance.now(),
      dur: 1.0,
      fromPos: camera.position.clone(),
      toPos: HOME_POS.clone(),
      fromTgt: controls.target.clone(),
      toTgt: HOME_TGT.clone(),
    };
  }

  /* ---- size: ResizeObserver (robust vs the already-laid-out mount) ---- */
  function onResize() {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  }
  const ro = new ResizeObserver(() => onResize());
  ro.observe(mount);
  addEventListener("resize", onResize);

  /* ---- build + loop ---- */
  skyGroup = new T.Group();
  scene.add(skyGroup);
  rebuildWorld();
  flying = {
    start: performance.now(),
    dur: 1.5,
    fromPos: HOME_POS.clone().multiplyScalar(1.3),
    toPos: HOME_POS.clone(),
    fromTgt: HOME_TGT.clone(),
    toTgt: HOME_TGT.clone(),
  };

  const clock = new T.Clock();
  let raf = 0;
  function project(v: THREE.Vector3) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * W(), y: (-p.y * 0.5 + 0.5) * H(), vis: p.z < 1 };
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05),
      tt = clock.elapsedTime;
    if (flying) {
      const k = easeIO(Math.min((performance.now() - flying.start) / (flying.dur * 1000), 1));
      camera.position.lerpVectors(flying.fromPos, flying.toPos, k);
      controls.target.lerpVectors(flying.fromTgt, flying.toTgt, k);
      if (k >= 1) flying = null;
    } else {
      idleT += dt;
      if (idleT > 7 && motion && !hoveredId) controls.autoRotate = true;
    }
    controls.update();

    buildingRoots.forEach((g) => {
      g.userData.lift += (g.userData.liftTarget - g.userData.lift) * Math.min(dt * 10, 1);
      g.position.y = g.userData.lift;
      const halo = g.userData.halo;
      const tgt = g.userData.zoneId === hoveredId ? 0.5 : 0;
      if (halo) {
        halo.material.opacity += (tgt - halo.material.opacity) * Math.min(dt * 8, 1);
        halo.rotation.y += dt * 0.4;
        halo.position.y = 0.16;
      }
    });

    if (motion) {
      animated.beacons.forEach((b) => {
        const base = b.approved ? b.base + 0.4 : 0.3;
        const amp = b.approved ? b.amp : 0.18;
        b.mesh.material.emissiveIntensity = base + Math.sin(tt * 2.2) * amp;
      });
      animated.flames.forEach((o) => {
        o.scale.y = 1 + Math.sin(tt * 9 + o.id) * 0.16;
      });
      animated.cloths.forEach((m) => {
        const pos = m.geometry.attributes.position,
          base = m.userData.base;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          pos.array[i * 3 + 2] = Math.sin(x * 3 + tt * 3.5) * 0.1 * (x + 0.5);
        }
        pos.needsUpdate = true;
      });
      animated.clouds.forEach((c) => {
        c.position.x = c.userData.baseX + Math.sin(tt * 0.05 + c.userData.seed) * 6;
      });
      animated.smoke.forEach((s) => {
        if (s.userData.smoke) {
          s.position.y += dt * 0.4;
          if (s.position.y > 9.6) s.position.y = 7.4;
          s.material.opacity = Math.max(0, (0.5 * (9.6 - s.position.y)) / 2.2);
        } else {
          s.material.emissiveIntensity = 1.0 + Math.sin(tt * 7) * 0.3;
        }
      });
      animated.people.forEach((p) => {
        if (!p.visible) return;
        const c = p.userData.center,
          s = p.userData.seed,
          rd = p.userData.rad || 1.2;
        p.position.x = c.x + Math.sin(tt * 0.4 + s) * rd;
        p.position.z = c.y + Math.cos(tt * 0.3 + s) * rd * 0.85;
        p.rotation.y = tt * 0.3 + s;
      });
    }

    ZONES.forEach((z) => {
      const g = buildingRoots.find((b) => b.userData.zoneId === z.id)!;
      const p = project(new T.Vector3(z.pos[0], (g.userData.labelY || 7) + g.position.y, z.pos[1]));
      const el = tags[z.id];
      if (!p.vis) {
        el.style.opacity = "0";
        return;
      }
      const can = zoneEnterable(z);
      el.innerHTML = `<span class="ct-name">${esc(z.name)}</span>${!can ? '<span class="ct-lock">▮</span>' : ""}`;
      el.className = "hq-tag" + (can ? "" : " locked") + (z.id === hoveredId ? " hot" : "");
      el.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;
      el.style.opacity = String(hoveredId === z.id ? 0 : hoveredId ? 0.3 : can ? 0.92 : 0.6);
    });

    renderer.render(scene, camera);
  }
  frame();

  return {
    zones: ZONES,
    flyTo,
    flyHome,
    setTheme(t) {
      if (t === theme) return;
      theme = t;
      rebuildWorld();
    },
    setTime(t) {
      if (t === time) return;
      time = t;
      applyTime();
    },
    setState(s) {
      if (s === worldState) return;
      worldState = s;
      applyState();
    },
    setZoneInfo(info) {
      zoneInfo = info || {};
      if (hoveredId) refreshHover();
    },
    setMotion(on) {
      motion = on;
      if (!on) controls.autoRotate = false;
    },
    getTime: () => time,
    getState: () => worldState,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      renderer.dispose();
      mount.innerHTML = "";
    },
  };
}

export { ZONES, THEMES };
