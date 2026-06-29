/* eslint-disable @typescript-eslint/no-explicit-any -- Imperative three.js
   engine ported AS-IS from the prototype: three's `userData` bags and the
   per-frame animation hooks are dynamically shaped, so targeted `any` mirrors
   the proven hqScene.ts approach rather than over-typing the port. */
/* ============================================================
   UniPlug · The Quarter — 3D scene engine.
   Faithful TS/ESM port of quarter3d/scene.js. Was window.QCity.
   Rose-forward dawn/midday student world. Consent world-state
   (pending ↔ granted) gates booking rooms. hover-peek ·
   click-to-fly · drag-orbit · idle auto-rotate · labels.
   Authored for three.js r128 — r128 APIs kept AS-IS
   (sRGBEncoding / ACESFilmicToneMapping / PCFSoftShadowMap).
   ============================================================ */
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  THREE,
  Q,
  shade,
  M,
  clearMaterialCache,
  slab,
  cyl,
  torus,
  ring,
  sphere,
  type TimeName,
} from "./kit";
import * as PR from "./props";
import { BUILDINGS } from "./buildings";

const T = THREE;

export type QuarterState = "pending" | "granted";
export type ZoneOverride = "auto" | "lit" | "locked";

export interface Zone {
  id: string;
  name: string;
  kind: string;
  pos: [number, number];
  always?: boolean;
  book?: boolean;
  blurb: string;
  stat: string;
  sub: string;
}

export interface QuarterSceneOpts {
  time?: TimeName;
  state?: QuarterState;
  onEnter?: (id: string) => void;
  onLocked?: (id: string) => void;
}

export interface QuarterSceneApi {
  zones: Zone[];
  flyTo: (id: string, enter?: boolean) => void;
  flyHome: () => void;
  render: () => void;
  setTime: (t: TimeName) => void;
  setState: (s: QuarterState) => void;
  setOverride: (id: string, mode: ZoneOverride) => void;
  setMotion: (on: boolean) => void;
  getTime: () => TimeName;
  getState: () => QuarterState;
  zoneOpen: (id: string) => boolean;
  setActive: (on: boolean) => void;
  dispose: () => void;
}

export const ZONES: Zone[] = [
  {
    id: "square",
    name: "The Square",
    kind: "Home",
    pos: [0, 24],
    always: true,
    blurb: "Where you land. Your Plugs, your matches, your school list — and what’s next.",
    stat: "Your home base",
    sub: "start here",
  },
  {
    id: "switchboard",
    name: "The Switchboard",
    kind: "Find your Plug",
    pos: [11, -20],
    always: true,
    blurb: "Search and filter mentors who’ve been exactly where you want to go, then book.",
    stat: "Browse mentors",
    sub: "search · filter · book",
  },
  {
    id: "studio",
    name: "The Studio",
    kind: "Your sessions",
    pos: [-24, -5],
    book: true,
    blurb: "Your 1:1 sessions — join, reschedule, review, and read your mentor’s notes.",
    stat: "Sessions & notes",
    sub: "join · reschedule",
  },
  {
    id: "line",
    name: "The Line",
    kind: "Messages",
    pos: [24, -5],
    always: true,
    blurb: "Your direct line to your Plugs — every conversation, in one place.",
    stat: "Messages",
    sub: "chat with your Plugs",
  },
  {
    id: "locker",
    name: "The Locker",
    kind: "Documents",
    pos: [-20, 14],
    always: true,
    blurb: "Your essays, lists and materials — shared with the Plugs you work with.",
    stat: "Your documents",
    sub: "upload · share",
  },
  {
    id: "climb",
    name: "The Climb",
    kind: "Progress",
    pos: [20, 14],
    always: true,
    blurb: "How far you’ve come — your session notes, action points, and what’s done.",
    stat: "Your progress",
    sub: "notes · action points",
  },
  {
    id: "dorm",
    name: "The Dorm",
    kind: "Profile & settings",
    pos: [-13, -20],
    always: true,
    blurb: "Your room — profile, targets, settings, and your parent’s consent.",
    stat: "Profile & settings",
    sub: "consent lives here",
  },
];

export function init(mount: HTMLElement, opts: QuarterSceneOpts = {}): QuarterSceneApi {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = () => mount.clientWidth || innerWidth,
    H = () => mount.clientHeight || innerHeight;

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  // r128 colour pipeline — keep the legacy property (NOT outputColorSpace).
  renderer.outputEncoding = T.sRGBEncoding;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, W() / H(), 0.1, 500);
  const HOME_POS = new T.Vector3(25, 18, 45),
    HOME_TGT = new T.Vector3(0, 5, 4);
  camera.position.copy(HOME_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TGT);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 24;
  controls.maxDistance = 96;
  controls.minPolarAngle = 0.32;
  controls.maxPolarAngle = 1.34;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.16;
  controls.update();

  /* ---- lights ---- */
  const hemi = new T.HemisphereLight(0xffffff, 0xffffff, 0.55);
  scene.add(hemi);
  const amb = new T.AmbientLight(0xffffff, 0.24);
  scene.add(amb);
  const sun = new T.DirectionalLight(0xffffff, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 170;
  const sc = 56;
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.7;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new T.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-30, 22, -26);
  scene.add(fill);
  const rim = new T.DirectionalLight(0xffffff, 0.4);
  rim.position.set(-12, 16, -36);
  scene.add(rim);

  /* ---- state ---- */
  let time: TimeName = opts.time || "dawn";
  let worldState: QuarterState = opts.state || "pending"; // 'pending' | 'granted'
  let motion = !reduce;
  let winScale = 1;
  type Seg = {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    w: number;
    mx: number;
    mz: number;
    len: number;
    ang: number;
  };
  const pathSegs: Seg[] = [];
  const COURT = new T.Vector2(0, 5);
  const courtR = 6.6;
  const segPointDist = (px: number, pz: number, s: Seg) => {
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
  const animated: Record<string, any[]> = {
    beacons: [],
    water: [],
    cloths: [],
    clouds: [],
    people: [],
    lampGlobes: [],
    lampLights: [],
    festoon: [],
    halos: [],
    birds: [],
  };

  // building footprint radii (for plinths, paths, occupancy)
  const BR: Record<string, number> = {
    square: 4.6,
    switchboard: 7.2,
    studio: 5.0,
    line: 3.8,
    locker: 4.2,
    climb: 4.8,
    dorm: 3.8,
  };

  /* ---------- sky ---------- */
  function makeSky() {
    const stops = Q.TIME[time].sky;
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 16, 256);
    const tx = new T.CanvasTexture(c);
    if ((T as any).SRGBColorSpace) (tx as any).colorSpace = (T as any).SRGBColorSpace;
    else (tx as any).encoding = T.sRGBEncoding;
    scene.background = tx;
  }

  /* ---------- island + plaza + paths ---------- */
  function buildIsland() {
    island = new T.Group();
    scene.add(island);
    const P = Q.PAL as Record<string, string>;
    const ISL_W = 70,
      ISL_D = 66;
    const s0 = slab(ISL_W + 3, ISL_D + 3, 5, P.groundDk, 6, { bevel: true, receive: true });
    s0.position.y = -5.3;
    island.add(s0);
    const s1 = slab(ISL_W + 1, ISL_D + 1, 2.2, P.ground, 6, { bevel: true });
    s1.position.y = -2.6;
    island.add(s1);
    const lawn = slab(ISL_W, ISL_D, 0.7, P.lawn, 6.5, { bevel: true, receive: true });
    lawn.position.y = -0.7;
    lawn.receiveShadow = true;
    island.add(lawn);
    // a few lighter grass patches for variation
    (
      [
        [-16, -14, 7],
        [15, -10, 6],
        [-12, 18, 6],
        [14, 16, 5],
        [0, -24, 8],
      ] as [number, number, number][]
    ).forEach(([x, z, r]) => {
      const pt = cyl(r, r, 0.16, P.lawnLt, { seg: 18, edges: false });
      pt.position.set(x, -0.62, z);
      pt.receiveShadow = true;
      island.add(pt);
    });

    // ---- path routes: plaza → each building (stepping stones) ----
    pathSegs.length = 0;
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
      seg(COURT.x, COURT.y, z.pos[0], z.pos[1], 2.8, courtR - 0.4, (BR[z.id] || 5) + 0.6),
    );
    // draw stepping stones
    const stoneTones = [
      P.path,
      shade(P.path, 0.06),
      shade(P.path, -0.06),
      shade(P.pathJoint, -0.04),
    ];
    pathSegs.forEach((s, si) => {
      const fx = Math.sin(s.ang),
        fz = Math.cos(s.ang),
        lx = Math.cos(s.ang),
        lz = -Math.sin(s.ang);
      const slabW = Math.min(s.w - 0.2, 1.7),
        slabL = 1.4,
        gap = 0.5,
        stepLen = slabL + gap;
      const n = Math.max(2, Math.floor(s.len / stepLen));
      const usable = n * stepLen - gap,
        start = -usable / 2 + slabL / 2;
      for (let i = 0; i < n; i++) {
        const t = start + i * stepLen;
        const off = Math.sin(t * 0.3 + si * 1.7) * 0.28 + (Math.random() - 0.5) * 0.08;
        const w = slabW * (0.92 + Math.random() * 0.12),
          l = slabL * (0.92 + Math.random() * 0.12);
        const st = slab(
          w,
          l,
          0.14,
          stoneTones[(Math.random() * stoneTones.length) | 0],
          Math.min(w, l) * 0.42,
          { bevel: true, receive: true },
        );
        st.position.set(s.mx + fx * t + lx * off, 0.08, s.mz + fz * t + lz * off);
        st.rotation.y = s.ang + (Math.random() - 0.5) * 0.12;
        st.castShadow = true;
        st.receiveShadow = true;
        island.add(st);
      }
    });
    // ---- plaza disc (rose-tinted travertine) ----
    const plaza = cyl(courtR, courtR, 0.16, P.court, { seg: 48, edges: false });
    plaza.position.set(COURT.x, 0.02, COURT.y);
    plaza.receiveShadow = true;
    island.add(plaza);
    const rg = cyl(courtR + 0.6, courtR + 0.6, 0.1, P.courtDk, { seg: 48, edges: false });
    rg.position.set(COURT.x, 0.0, COURT.y);
    rg.receiveShadow = true;
    island.add(rg);
    const rose = torus(courtR - 0.5, 0.12, P.courtRose, { rseg: 6, tseg: 48 });
    rose.rotation.x = Math.PI / 2;
    rose.position.set(COURT.x, 0.2, COURT.y);
    island.add(rose);
    const inner = torus(courtR - 1.8, 0.08, P.courtInlay, { rseg: 6, tseg: 48 });
    inner.rotation.x = Math.PI / 2;
    inner.position.set(COURT.x, 0.2, COURT.y);
    island.add(inner);
  }

  /* ---------- buildings (entrances rotated to face the plaza) ---------- */
  function buildBuildings() {
    buildingsGroup = new T.Group();
    scene.add(buildingsGroup);
    buildingRoots.length = 0;
    ZONES.forEach((z) => {
      const g = BUILDINGS[z.id]();
      g.position.set(z.pos[0], 0, z.pos[1]);
      g.rotation.y = Math.atan2(COURT.x - z.pos[0], COURT.y - z.pos[1]); // face plaza centre
      g.userData.zoneId = z.id;
      g.userData.lift = 0;
      g.userData.liftTarget = 0;
      // soft stone plinth under the building
      const bb = new T.Box3().setFromObject(g);
      const sz = bb.getSize(new T.Vector3());
      const plinth = slab(sz.x + 1.4, sz.z + 1.4, 0.42, Q.PAL.courtInlay as string, 0.7, {
        receive: true,
      });
      plinth.position.set(z.pos[0], -0.18, z.pos[1]);
      buildingsGroup.add(plinth);
      const plinth2 = slab(sz.x + 0.7, sz.z + 0.7, 0.34, Q.PAL.stoneDk as string, 0.6, {
        receive: true,
      });
      plinth2.position.set(z.pos[0], -0.02, z.pos[1]);
      buildingsGroup.add(plinth2);
      const halo = ring(BR[z.id] * 0.8, BR[z.id] * 1.1, Q.PAL.rose as string);
      halo.position.set(z.pos[0], 0.14, z.pos[1]);
      (halo.material as THREE.MeshBasicMaterial).color = new T.Color(Q.PAL.roseDeep as string);
      island.add(halo);
      g.userData.halo = halo;
      animated.halos.push(halo);
      buildingsGroup.add(g);
      buildingRoots.push(g);
    });
  }

  /* ---------- props (occupancy-tested) ---------- */
  function buildProps() {
    propsGroup = new T.Group();
    scene.add(propsGroup);
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
      placed.every((p) => Math.hypot(x - p.x, z - p.z) > r + p.r + 0.6);
    const inIsland = (x: number, z: number) => Math.abs(x) < 33 && z > -30 && z < 30;
    const BLD = ZONES.map((z) => [z.pos[0], z.pos[1], BR[z.id]] as [number, number, number]);
    const clear = (x: number, z: number, r: number) =>
      inIsland(x, z) &&
      Math.hypot(x - COURT.x, z - COURT.y) > courtR + r + 0.8 &&
      BLD.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + r + 0.4) &&
      !onRoad(x, z, r + 0.4) &&
      farP(x, z, r);
    const place = (o: THREE.Object3D, x: number, z: number, r: number, ry = 0, s = 1) => {
      add(o, x, z, ry, s);
      regd(x, z, r);
      return o;
    };

    // fountain — plaza centre
    const f = PR.fountain(3);
    add(f, COURT.x, COURT.y);
    regd(COURT.x, COURT.y, 3.4);
    animated.water.push(f);
    // signpost just in front of the plaza
    add(PR.signpost(), 0, COURT.y + 7.6, 0);
    regd(0, COURT.y + 7.6, 1.0);
    // benches + planters ringing the plaza
    const ringR = courtR + 2.2;
    (
      [
        [-1, 0.4],
        [1, 0.4],
        [-0.4, -1],
        [0.4, -1],
      ] as [number, number][]
    ).forEach(([cx, cz]) => {
      const a = Math.atan2(cx, cz);
      const x = COURT.x + Math.sin(a) * ringR,
        z = COURT.y + Math.cos(a) * ringR;
      if (!onRoad(x, z, 1.4) && farP(x, z, 1.4)) {
        add(PR.bench(), x, z, a + Math.PI);
        regd(x, z, 1.3);
      }
    });
    (
      [
        [-7.5, -2],
        [7.5, -2],
        [0, 12.5],
      ] as [number, number][]
    ).forEach(([x, z]) => {
      if (farP(x, z, 1.2) && !onRoad(x, z, 1.0)) {
        add(PR.planter(1.8), x, z, Math.random() * 6.28);
        regd(x, z, 1.2);
      }
    });

    // festoon "connection" string-lights around the plaza (the motif)
    const fp: ({ x: number; z: number } | null)[] = [];
    const FN = 6,
      FR = courtR + 3.2;
    for (let i = 0; i < FN; i++) {
      const a = (i / FN) * Math.PI * 2 + 0.4;
      const x = COURT.x + Math.cos(a) * FR,
        z = COURT.y + Math.sin(a) * FR;
      if (onRoad(x, z, 0.8)) {
        fp.push(null);
        continue;
      }
      const post = cyl(0.1, 0.13, 3.8, Q.PAL.trim as string, { seg: 8, edges: false });
      add(post, x, z);
      regd(x, z, 0.6);
      const knob = sphere(0.16, Q.PAL.rose as string, { detail: 1, flat: false });
      knob.position.set(x, 3.9, z);
      propsGroup.add(knob);
      fp.push({ x, z });
    }
    for (let i = 0; i < FN; i++) {
      const a = fp[i],
        b = fp[(i + 1) % FN];
      if (!a || !b) continue;
      const fe = PR.festoon(a.x, 3.7, a.z, b.x, 3.7, b.z, 1.3);
      propsGroup.add(fe);
      animated.festoon.push(fe);
    }

    // lamps lining the paths
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
        const l = PR.lamp(3.4);
        add(l, lx, lz);
        regd(lx, lz, 0.7);
        collectLamp(l);
      }
    });

    // greenery scatter
    const scatterOne = (x: number, z: number) => {
      const r = Math.random();
      let o: THREE.Group, rad: number;
      if (r < 0.38) {
        o = PR.treeRound(0.85 + Math.random() * 0.8);
        rad = 1.3;
      } else if (r < 0.62) {
        o = PR.treeTall(0.85 + Math.random() * 0.7);
        rad = 1.0;
      } else if (r < 0.78) {
        o = PR.bush(0.9 + Math.random() * 0.8);
        rad = 0.9;
      } else if (r < 0.92) {
        o = PR.rock(0.8 + Math.random() * 1.1);
        rad = 1.0;
      } else {
        o = PR.planter(1.2 + Math.random() * 0.6);
        rad = 1.0;
      }
      if (clear(x, z, rad)) place(o, x, z, rad, Math.random() * 6.28);
    };
    // groves at the back & edges (denser, like a soft park)
    (
      [
        [-25, -18],
        [-9, -25],
        [10, -24],
        [25, -16],
        [28, 4],
        [-29, 4],
        [-26, 17],
        [26, 18],
        [2, -27],
        [-16, -25],
        [17, -24],
      ] as [number, number][]
    ).forEach(([gx, gz]) => {
      const k = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < k; j++)
        scatterOne(gx + (Math.random() - 0.5) * 8, gz + (Math.random() - 0.5) * 8);
    });
    for (let i = 0; i < 240; i++)
      scatterOne((Math.random() - 0.5) * 66, (Math.random() - 0.5) * 58 - 2);
    // dense leafy belt hugging the island edge (fills the dead outer ring)
    for (let a = 0; a < 200; a++) {
      const ang = Math.random() * Math.PI * 2,
        rr = 23 + Math.random() * 9;
      scatterOne(Math.cos(ang) * rr, 2 + Math.sin(ang) * rr);
    }
    // rock clusters dotted around the lawns
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2,
        rr = 11 + Math.random() * 20;
      const cx = Math.cos(ang) * rr,
        cz = 2 + Math.sin(ang) * rr;
      const k = 2 + Math.floor(Math.random() * 3);
      for (let j = 0; j < k; j++) {
        const x = cx + (Math.random() - 0.5) * 3.4,
          z = cz + (Math.random() - 0.5) * 3.4;
        const rk = PR.rock(0.7 + Math.random() * 1.1);
        if (clear(x, z, 1.0)) place(rk, x, z, 1.0, Math.random() * 6.28);
      }
    }
    // a scatter of little pebbles + low bushes right at the rim
    for (let a = 0; a < 70; a++) {
      const ang = Math.random() * Math.PI * 2,
        rr = 29 + Math.random() * 4;
      const x = Math.cos(ang) * rr,
        z = 2 + Math.sin(ang) * rr;
      if (!inIsland(x, z)) continue;
      const o =
        Math.random() < 0.5
          ? PR.rock(0.6 + Math.random() * 0.7)
          : PR.bush(0.8 + Math.random() * 0.6);
      if (clear(x, z, 0.8)) place(o, x, z, 0.8, Math.random() * 6.28);
    }

    // dawn clouds
    (
      [
        [-32, 23, -18, 1.5],
        [28, 26, -12, 1.2],
        [8, 25, 22, 1.4],
        [-22, 28, 16, 1.1],
        [18, 30, 6, 1.3],
        [-12, 24, -24, 1.0],
        [32, 28, 2, 1.1],
        [-28, 31, 6, 0.95],
        [2, 27, 28, 1.2],
      ] as [number, number, number, number][]
    ).forEach(([x, y, z, s]) => {
      const c = PR.cloud(s);
      c.position.set(x, y, z);
      c.userData.seed = Math.random() * 6.28;
      c.userData.baseX = x;
      skyGroup.add(c);
      animated.clouds.push(c);
    });
    // a couple of drifting birds
    (
      [
        [-10, 16, -8],
        [12, 18, -12],
        [-2, 20, 4],
      ] as [number, number, number][]
    ).forEach(([x, y, z]) => {
      const b = PR.bird();
      b.position.set(x, y, z);
      b.userData.seed = Math.random() * 6.28;
      b.userData.baseX = x;
      b.userData.baseZ = z;
      skyGroup.add(b);
      animated.birds.push(b);
    });

    // students walking the Quarter — always present (this is a living student world)
    const mc = [
      Q.PAL.rose as string,
      Q.PAL.glass as string,
      Q.PAL.gold as string,
      Q.PAL.foliageLt as string,
      "#B5A0D4",
      Q.PAL.roseDeep as string,
      Q.PAL.roof3 as string,
    ];
    const bags = [
      Q.PAL.roof as string,
      Q.PAL.roseDeep as string,
      Q.PAL.foliageDk as string,
      Q.PAL.trim as string,
    ];
    const spots: [number, number][] = [
      [-5, 11],
      [5, 11],
      [-8, 5],
      [8, 5],
      [0, 12.5],
      [-3, 8],
      [4, 14],
      [-13, 1],
      [14, -4],
      [-2, -11],
      [11, 8],
      [-15, 12],
      [13, 11],
      [-9, -6],
      [7, -9],
    ];
    spots.forEach(([x, z], i) => {
      const inPlaza = Math.hypot(x - COURT.x, z - COURT.y) < courtR + 2.5;
      if (!inPlaza && !clear(x, z, 1.2)) return;
      const pr = add(
        PR.person(mc[i % mc.length], {
          bag: bags[i % bags.length],
          scale: 0.92 + Math.random() * 0.18,
        }),
        x,
        z,
        Math.random() * 6.28,
      );
      pr.userData.center = new T.Vector2(x, z);
      pr.userData.seed = Math.random() * 6.28;
      pr.userData.rad = inPlaza ? 1.5 : 0.9;
      pr.userData.spd = 0.5 + Math.random() * 0.4;
      if (!inPlaza) regd(x, z, 1.0);
      animated.people.push(pr);
    });
  }
  function collectLamp(l: THREE.Group) {
    if ((l.userData as any).bulb) animated.lampGlobes.push((l.userData as any).bulb);
  }

  function harvestBuildings() {
    animated.beacons.length = 0;
    buildingRoots.forEach((root) =>
      root.traverse((o) => {
        if (o.userData.beacon) animated.beacons.push({ mesh: o, base: o.userData.baseEmi ?? 0.5 });
      }),
    );
  }

  /* ---------- time of day ---------- */
  function applyTime() {
    const tp = Q.TIME[time];
    Q.TIMEPAL = tp;
    renderer.toneMappingExposure = tp.exposure;
    makeSky();
    scene.fog = new T.Fog(new T.Color(tp.fog), tp.fogNear, tp.fogFar);
    hemi.color.set(tp.hemiSky);
    hemi.groundColor.set(tp.hemiGround);
    hemi.intensity = tp.hemiInt;
    amb.intensity = tp.ambInt;
    sun.color.set(tp.sunColor);
    sun.intensity = tp.sunInt;
    sun.position.set(...tp.sunPos);
    fill.color.set(tp.fillColor);
    fill.intensity = tp.fillInt;
    rim.color.set(tp.rimColor);
    rim.intensity = tp.rimInt;
    winScale = tp.winEmi;
    animated.lampGlobes.forEach((o: any) => (o.material.emissiveIntensity = tp.lampInt + 0.1));
    animated.festoon.forEach((fe: any) =>
      fe.userData.bulbs.forEach(
        (b: any) => (b.material.emissiveIntensity = time === "dawn" ? 0.7 : 0.25),
      ),
    );
    applyWindowState();
  }
  function applyWindowState() {
    buildingRoots.forEach((g) => {
      const locked = (g.userData as any).locked;
      g.traverse((o: any) => {
        if (o.userData.win) {
          o.material =
            o.userData.lit && !locked
              ? M(Q.PAL.glow as string, {
                  emissive: Q.PAL.glow as string,
                  emi: o.userData.litEmi * winScale,
                })
              : M(Q.PAL.glass as string, {
                  emissive: Q.PAL.glass as string,
                  emi: locked ? 0.02 : 0.08,
                });
        }
      });
    });
  }

  /* ---------- world state — parental consent (pending ↔ granted) ---------- */
  const overrides: Record<string, "lit" | "locked"> = {};
  function zoneOpenZ(z: Zone): boolean {
    const ov = overrides[z.id];
    if (ov === "lit") return true;
    if (ov === "locked") return false;
    if (z.always) return true;
    if (z.book) return worldState === "granted";
    return true;
  }
  function applyState() {
    buildingRoots.forEach((g) => {
      const z = ZONES.find((x) => x.id === (g.userData as any).zoneId)!;
      const open = zoneOpenZ(z);
      (g.userData as any).locked = !open;
      if ((g.userData as any).gate) {
        g.remove((g.userData as any).gate);
        disposeObj((g.userData as any).gate);
        (g.userData as any).gate = null;
      }
      if (!open) {
        const bb = new T.Box3().setFromObject(g);
        const sz = bb.getSize(new T.Vector3());
        const gate = PR.ribbonGate(Math.min(sz.x * 0.7, 3.4));
        gate.position.set(0, 0, bb.max.z - g.position.z + 0.6); // local +z = entrance (faces plaza)
        (gate.userData as any).gate = true;
        g.add(gate);
        (g.userData as any).gate = gate;
        gate.traverse((o: any) => {
          if (o.userData.cloth) animated.cloths.push(o);
        });
      }
    });
    // activity: a little quieter while waking up (pending), fuller once granted
    animated.people.forEach((p: any, i: number) => {
      p.visible = worldState === "granted" ? true : i % 3 !== 0;
    });
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

  /* ---------- build everything ---------- */
  function rebuildWorld() {
    [island, buildingsGroup, propsGroup, skyGroup].forEach(disposeGroup);
    Object.keys(animated).forEach((k) => (animated[k].length = 0));
    clearMaterialCache();
    skyGroup = new T.Group();
    scene.add(skyGroup);
    buildIsland();
    buildBuildings();
    buildProps();
    harvestBuildings();
    applyState();
    applyTime();
  }

  /* ---- labels overlay ---- */
  const labelLayer = document.createElement("div");
  labelLayer.className = "qz-labels";
  mount.appendChild(labelLayer);
  const tags: Record<string, HTMLDivElement> = {};
  const preview = document.createElement("div");
  preview.className = "qz-preview";
  ZONES.forEach((z) => {
    const el = document.createElement("div");
    el.className = "qz-tag";
    labelLayer.appendChild(el);
    tags[z.id] = el;
  });
  labelLayer.appendChild(preview);

  /* ---- interaction ---- */
  const ray = new T.Raycaster();
  const pointer = new T.Vector2(-2, -2);
  let hoveredId: string | null = null,
    downPos: { x: number; y: number } | null = null,
    flying: any = null,
    active = true,
    idleT = 0,
    lastPX = 0,
    lastPY = 0;
  function setPointer(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function pick(): string | null {
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(buildingRoots, true);
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.zoneId) o = o.parent;
    return o ? (o.userData.zoneId as string) : null;
  }
  function onMove(e: PointerEvent) {
    if (!active) return;
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
    const x = Math.max(160, Math.min(lastPX + 22, W() - 160));
    const y = Math.max(120, Math.min(lastPY + 16, H() - 160));
    preview.style.transform = `translate(${x}px,${y}px) translate(-50%,0)`;
  }
  function refreshHover() {
    buildingRoots.forEach((g) => {
      (g.userData as any).liftTarget = (g.userData as any).zoneId === hoveredId ? 0.7 : 0;
    });
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    const z = ZONES.find((z) => z.id === hoveredId);
    if (z) {
      const open = zoneOpenZ(z);
      const stat = open ? z.stat : "Unlocks with consent";
      const sub = open ? z.sub : "ask your parent to approve";
      preview.innerHTML =
        `<div class="cp-kind">${z.kind}</div><div class="cp-name">${z.name}</div>` +
        `<div class="cp-blurb">${z.blurb}</div><div class="cp-stat"><b>${stat}</b><span>${sub}</span></div>` +
        `<div class="cp-enter ${open ? "" : "locked"}">${open ? "Enter ›" : "Locked"}</div>`;
      preview.classList.add("show");
    } else preview.classList.remove("show");
  }
  function onDown(e: PointerEvent) {
    if (!active) return;
    downPos = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: PointerEvent) {
    if (!active || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved < 6 && hoveredId && !flying) {
      const z = ZONES.find((z) => z.id === hoveredId)!;
      if (zoneOpenZ(z)) flyTo(hoveredId, true);
      else if (opts.onLocked) opts.onLocked(hoveredId);
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
    const g = buildingRoots.find((b) => (b.userData as any).zoneId === id)!;
    const tgt = new T.Vector3(z.pos[0], ((g.userData as any).labelY || 7) * 0.34, z.pos[1]);
    const dir = new T.Vector2(z.pos[0] - COURT.x, z.pos[1] - COURT.y);
    if (dir.length() < 0.1) dir.set(0, 1);
    dir.normalize();
    const out = new T.Vector3(
      z.pos[0] + dir.x * 12,
      ((g.userData as any).labelY || 7) * 0.5 + 5,
      z.pos[1] + dir.y * 12,
    );
    flying = {
      start: performance.now(),
      dur: enter ? 0.9 : 1.0,
      fromPos: camera.position.clone(),
      toPos: out,
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

  function onResize() {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  }
  addEventListener("resize", onResize);
  // Robustness against late layout (the invisible-canvas / 300x150 trap):
  // mirror the HQ's ResizeObserver so a late non-zero parent size is picked up.
  const ro = new ResizeObserver(() => onResize());
  ro.observe(mount);

  /* ---- build + loop ---- */
  skyGroup = new T.Group();
  scene.add(skyGroup);
  rebuildWorld();
  flying = {
    start: performance.now(),
    dur: 1.5,
    fromPos: HOME_POS.clone().multiplyScalar(1.25),
    toPos: HOME_POS.clone(),
    fromTgt: HOME_TGT.clone(),
    toTgt: HOME_TGT.clone(),
  };
  (window as any).__Q_SCENE = scene;
  (window as any).__Q_CAM = camera;

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
      if (idleT > 7 && motion && active && !hoveredId) controls.autoRotate = true;
    }
    controls.update();

    buildingRoots.forEach((g) => {
      const u = g.userData as any;
      u.lift += (u.liftTarget - u.lift) * Math.min(dt * 10, 1);
      g.position.y = u.lift;
      const halo = u.halo;
      const tgt = u.zoneId === hoveredId ? 0.5 : 0;
      if (halo) {
        halo.material.opacity += (tgt - halo.material.opacity) * Math.min(dt * 8, 1);
        halo.rotation.y += dt * 0.4;
      }
    });

    if (motion) {
      animated.beacons.forEach((b: any) => {
        b.mesh.material.emissiveIntensity =
          b.base + Math.sin(tt * 2.0 + b.base * 9) * b.base * 0.18;
      });
      animated.water.forEach((f: any) => {
        if (f.userData.jets)
          f.userData.jets.forEach((j: any, i: number) => {
            j.scale.y = 1 + Math.sin(tt * 3 + i) * 0.18;
          });
      });
      animated.cloths.forEach((m: any) => {
        const pos = m.geometry.attributes.position,
          base = m.userData.base;
        if (!base) return;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          pos.array[i * 3 + 2] = Math.sin(x * 3 + tt * 3.0) * 0.08 * (x + 0.5);
        }
        pos.needsUpdate = true;
      });
      animated.clouds.forEach((c: any) => {
        c.position.x = c.userData.baseX + Math.sin(tt * 0.05 + c.userData.seed) * 6;
      });
      animated.birds.forEach((b: any) => {
        b.position.x = b.userData.baseX + Math.sin(tt * 0.18 + b.userData.seed) * 14;
        b.position.z = b.userData.baseZ + Math.cos(tt * 0.12 + b.userData.seed) * 6;
        b.rotation.y = Math.atan2(
          Math.cos(tt * 0.18 + b.userData.seed),
          -Math.sin(tt * 0.12 + b.userData.seed),
        );
      });
      animated.people.forEach((p: any) => {
        if (!p.visible) return;
        const c = p.userData.center,
          s = p.userData.seed,
          rd = p.userData.rad || 1.2,
          sp = p.userData.spd;
        const nx = c.x + Math.sin(tt * 0.4 * sp + s) * rd,
          nz = c.y + Math.cos(tt * 0.3 * sp + s) * rd * 0.85;
        p.rotation.y = Math.atan2(nx - p.position.x, nz - p.position.z);
        p.position.x = nx;
        p.position.z = nz;
        const sw = Math.sin(tt * 5 * sp + p.userData.seed) * 0.5;
        if (p.userData.legL) {
          p.userData.legL.rotation.x = sw;
          p.userData.legR.rotation.x = -sw;
          p.userData.armL.rotation.x = -sw * 0.8;
          p.userData.armR.rotation.x = sw * 0.8;
        }
      });
    }

    ZONES.forEach((z) => {
      const g = buildingRoots.find((b) => (b.userData as any).zoneId === z.id)!;
      const p = project(
        new T.Vector3(z.pos[0], ((g.userData as any).labelY || 7) + g.position.y, z.pos[1]),
      );
      const el = tags[z.id];
      if (!active || !p.vis) {
        el.style.opacity = "0";
        return;
      }
      const open = zoneOpenZ(z);
      el.innerHTML = `<span class="ct-name">${z.name}</span>${!open ? '<span class="ct-lock">▮</span>' : ""}`;
      el.className = "qz-tag" + (open ? "" : " locked") + (z.id === hoveredId ? " hot" : "");
      el.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;
      el.style.opacity = String(hoveredId === z.id ? 0 : hoveredId ? 0.3 : open ? 0.95 : 0.62);
    });

    renderer.render(scene, camera);
  }
  frame();

  return {
    zones: ZONES,
    flyTo,
    flyHome,
    render() {
      renderer.render(scene, camera);
    },
    setTime(t: TimeName) {
      if (t === time) return;
      time = t;
      applyTime();
      renderer.render(scene, camera);
    },
    setState(s: QuarterState) {
      if (s === worldState) return;
      worldState = s;
      applyState();
      renderer.render(scene, camera);
    },
    setOverride(id: string, mode: ZoneOverride) {
      if (!mode || mode === "auto") delete overrides[id];
      else overrides[id] = mode;
      applyState();
      refreshHover();
      renderer.render(scene, camera);
    },
    setMotion(on: boolean) {
      motion = on;
      if (!on) controls.autoRotate = false;
    },
    getTime: () => time,
    getState: () => worldState,
    zoneOpen: (id: string) => {
      const z = ZONES.find((x) => x.id === id);
      return z ? zoneOpenZ(z) : false;
    },
    setActive(on: boolean) {
      active = on;
      controls.enabled = on;
      labelLayer.style.display = on ? "block" : "none";
      renderer.domElement.style.visibility = on ? "visible" : "hidden";
      if (on) {
        idleT = 0;
        flyHome();
      } else {
        controls.autoRotate = false;
        preview.classList.remove("show");
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.dispose();
      mount.innerHTML = "";
    },
  };
}
