/* ============================================================
   UniPlug · The Quarter — 3D kit: primitives + PALETTE + TIME
   Faithful TS/ESM port of quarter3d/kit.js (sibling to the mentor
   Headquarters hqKit.ts). Authored for three.js r128 — exact values
   render as-is, NO color-management changes. Was window.QKit / window.Q.
   Rose-forward, bright, airy MORNING — blush walls, coral roofs,
   mint grass, pale-blue-into-rose dawn sky.
   ============================================================ */
import * as THREE from "three";

export { THREE };
const T = THREE;

/* ---- material option bag (was the loose `o={}` in kit.js) ---- */
export interface MOpts {
  rough?: number;
  metal?: number;
  flat?: boolean;
  emissive?: string;
  emi?: number;
  opacity?: number;
  transparent?: boolean;
  mat?: THREE.Material;
  seg?: number;
  detail?: number;
  rseg?: number;
  tseg?: number;
  t?: number;
  cast?: boolean;
  receive?: boolean;
  edges?: boolean;
  edgeColor?: string;
  edgeOpacity?: number;
  bevel?: boolean;
  // windowRows
  wW?: number;
  wH?: number;
  allLit?: boolean;
  litChance?: number;
}

/* ============================================================
   PALETTE — the Quarter. One rose-forward material palette
   (time state changes only the light & sky, never the materials).
   Defined first so the primitives below resolve Q.PAL at call time.
   ============================================================ */
export interface Pal {
  [k: string]: string | number | boolean;
}

const PAL: Pal = {
  // ground & grass — fresh, saturated mint/sage
  ground: "#E0CDB6",
  groundDk: "#BE9F84",
  lawn: "#85B062",
  lawnDk: "#66914A",
  lawnLt: "#9FC57E",
  // plaza / paths — warm blush travertine (deeper, so it reads on the green)
  court: "#E6CCB4",
  courtDk: "#CFAB93",
  courtInlay: "#C6886F",
  courtRose: "#EF9F8E",
  path: "#DAB799",
  pathDk: "#BE9A7C",
  pathJoint: "#EDDCC8",
  // walls — blush
  wall: "#EFC6B5",
  wall2: "#E0A893",
  wall3: "#F7E0D4",
  trim: "#6E3A2A",
  trimDk: "#4A2418",
  baseDk: "#6E4232",
  // roofs — true coral (the pop)
  roof: "#E0662F",
  roof2: "#B23E1C",
  roof3: "#E8825A",
  roofDk: "#7E2A0E",
  // columns / stone — warm white + blush stone
  column: "#FBEFE8",
  stone: "#DBBBA6",
  stoneDk: "#A87A5A",
  // domes
  dome: "#EFA293",
  domeDk: "#CE7C6E",
  // accents
  accent: "#C4907F",
  rose: "#F4B5AA",
  roseDeep: "#C4907F",
  gold: "#F0B98C",
  goldDk: "#D2925E",
  bronze: "#C58A66",
  flag: "#F4B5AA",
  banner: "#F0926A",
  // glow / glass / water
  glow: "#FFE2B6",
  glass: "#D8EBF3",
  water: "#AAD4E8",
  waterDk: "#84BBD6",
  // Switchboard connection lines
  wire: "#F4B5AA",
  wireGlow: "#FFCBBE",
  wireNode: "#FFFFFF",
  // foliage — richer greens for depth
  foliage: "#7CAE63",
  foliageDk: "#4C8150",
  foliageLt: "#9BCA7E",
  trunk: "#956347",
  // lines / inks
  line: "#B98A72",
  dark: "#5E4038",
  ink: "#3A2A24",
  edgeOpacity: 0.18,
  flatWalls: false,
  roughWall: 0.9,
};

/* ============================================================
   TIME — soft dawn (default) vs bright midday.
   Dawn = rosier, softer, lower warm sun. Midday = sunnier,
   whiter, higher sun, airier. Both kept BRIGHT (this is morning).
   ============================================================ */
export interface TimePal {
  label: string;
  exposure: number;
  sky: [number, string][];
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  ambInt: number;
  sunColor: number;
  sunInt: number;
  sunPos: [number, number, number];
  fillColor: number;
  fillInt: number;
  rimColor: number;
  rimInt: number;
  winEmi: number;
  lampInt: number;
  braE: number;
}

export type TimeName = "dawn" | "midday";

const TIME: Record<TimeName, TimePal> = {
  dawn: {
    label: "Soft dawn",
    exposure: 0.82,
    sky: [
      [0.0, "#9DBCDA"],
      [0.4, "#D9B2BE"],
      [0.7, "#F2B6A0"],
      [1.0, "#F8CFB4"],
    ],
    fog: "#EBC8BC",
    fogNear: 120,
    fogFar: 310,
    hemiSky: 0xbed2e6,
    hemiGround: 0x8fa877,
    hemiInt: 0.34,
    ambInt: 0.12,
    sunColor: 0xffc79a,
    sunInt: 2.5,
    sunPos: [31, 13, 25],
    fillColor: 0xbfd0ec,
    fillInt: 0.18,
    rimColor: 0xf6b6b0,
    rimInt: 0.34,
    winEmi: 0.6,
    lampInt: 0.6,
    braE: 0.7,
  },
  midday: {
    label: "Bright midday",
    exposure: 0.7,
    sky: [
      [0.0, "#6FA2D2"],
      [0.5, "#AEC8DE"],
      [1.0, "#E2D8CC"],
    ],
    fog: "#CAD6DE",
    fogNear: 175,
    fogFar: 430,
    hemiSky: 0xbacee4,
    hemiGround: 0x86996c,
    hemiInt: 0.32,
    ambInt: 0.08,
    sunColor: 0xffeac8,
    sunInt: 1.95,
    sunPos: [15, 26, 20],
    fillColor: 0xb6c8e2,
    fillInt: 0.16,
    rimColor: 0xf6d6be,
    rimInt: 0.18,
    winEmi: 0.22,
    lampInt: 0.26,
    braE: 0.4,
  },
};

/* The live, shared singleton (was window.Q). TIMEPAL is mutated at runtime by
   the scene's applyTime() — keep it mutable. PAL/TIME are imported by props.ts,
   buildings.ts and scene.ts so call-time `Q.PAL` resolution still works. */
export const Q: { PAL: Pal; TIME: Record<TimeName, TimePal>; TIMEPAL: TimePal } = {
  PAL,
  TIME,
  TIMEPAL: TIME.dawn,
};
export { PAL, TIME };

/* -------- shade a hex toward white(+)/black(-) -------- */
export function shade(hex: string, p: number): string {
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

/* -------- material cache -------- */
const _mc = new Map<string, THREE.MeshStandardMaterial>();
export function M(color: string, o: MOpts = {}): THREE.MeshStandardMaterial {
  const key =
    color +
    "|" +
    (o.rough ?? 0.9) +
    "|" +
    (o.metal ?? 0) +
    "|" +
    (o.flat ? 1 : 0) +
    "|" +
    (o.emissive || "0") +
    "|" +
    (o.emi ?? 0) +
    "|" +
    (o.opacity ?? 1) +
    "|" +
    (o.transparent ? 1 : 0);
  const cached = _mc.get(key);
  if (cached) return cached;
  const m = new T.MeshStandardMaterial({
    color: new T.Color(color),
    roughness: o.rough ?? 0.9,
    metalness: o.metal ?? 0.0,
    flatShading: o.flat ?? true,
    emissive: new T.Color(o.emissive || "#000"),
    emissiveIntensity: o.emi ?? 0,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
  });
  _mc.set(key, m);
  return m;
}
export function clearMaterialCache(): void {
  _mc.clear();
}

type Mesh = THREE.Mesh;

export function edges(mesh: Mesh, color: string, opacity = 0.14): Mesh {
  const eg = new T.EdgesGeometry(mesh.geometry, 22);
  const ls = new T.LineSegments(
    eg,
    new T.LineBasicMaterial({ color: new T.Color(color), transparent: true, opacity }),
  );
  ls.userData.edge = true;
  mesh.add(ls);
  return mesh;
}
function fin(mesh: Mesh, o: MOpts): Mesh {
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.receive ?? true;
  if (o.edges) edges(mesh, o.edgeColor || (Q.PAL.line as string), o.edgeOpacity ?? 0.12);
  return mesh;
}

/* -------- primitives (base at y=0, centered x/z) -------- */
export function box(w: number, h: number, d: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
export function cyl(rt: number, rb: number, h: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.CylinderGeometry(rt, rb, h, o.seg ?? 24, 1);
  g.translate(0, h / 2, 0);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
export function cone(r: number, h: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.ConeGeometry(r, h, o.seg ?? 24);
  g.translate(0, h / 2, 0);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
export function sphere(r: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.IcosahedronGeometry(r, o.detail ?? 1);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
export function torus(r: number, tube: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.TorusGeometry(r, tube, o.rseg ?? 10, o.tseg ?? 28);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
/* gable roof: ridge along +z, span w(x), rise h, length d */
export function gable(w: number, h: number, d: number, color: string, o: MOpts = {}): Mesh {
  const s = new T.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
/* hip/pyramid roof: square cone */
export function hip(r: number, h: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.ConeGeometry(r, h, 4);
  g.translate(0, h / 2, 0);
  g.rotateY(Math.PI / 4);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
/* right-triangle wedge prism */
export function wedge(w: number, h: number, d: number, color: string, o: MOpts = {}): Mesh {
  const s = new T.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, 0);
  const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return fin(new T.Mesh(g, o.mat || M(color, o)), o);
}
/* thin pane (windows/doors/signs) */
export function pane(w: number, h: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.BoxGeometry(w, h, o.t ?? 0.12);
  g.translate(0, h / 2, 0);
  const m = new T.Mesh(g, o.mat || M(color, o));
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
/* flat ground ring (hover halo) */
export function ring(ri: number, ro: number, color: string): Mesh {
  const g = new T.RingGeometry(ri, ro, 48);
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(
    g,
    new T.MeshBasicMaterial({
      color: new T.Color(color),
      transparent: true,
      opacity: 0,
      side: T.DoubleSide,
    }),
  );
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
/* rounded slab lying in XZ, extruded up by h */
export function slab(w: number, d: number, h: number, color: string, r = 1.2, o: MOpts = {}): Mesh {
  const s = rrect(w, d, r);
  const g = new T.ExtrudeGeometry(s, {
    depth: h,
    bevelEnabled: o.bevel ?? false,
    bevelThickness: 0.3,
    bevelSize: 0.3,
    bevelSegments: 2,
  });
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, o.mat || M(color, o));
  m.castShadow = o.cast ?? false;
  m.receiveShadow = o.receive ?? true;
  return m;
}
export function rrect(w: number, d: number, r: number): THREE.Shape {
  const s = new T.Shape();
  const x = -w / 2,
    y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/* classical column: shaft + simple capital + base */
export function column(h: number, r: number, color: string, o: MOpts = {}): THREE.Group {
  const g = new T.Group();
  g.add(
    at(
      cyl(r * 0.92, r * 1.05, 0.18, shade(color, -0.05), { seg: o.seg ?? 14, edges: false }),
      0,
      0,
      0,
    ),
  );
  const sh = cyl(r * 0.84, r * 0.92, h - 0.36, color, {
    seg: o.seg ?? 14,
    edges: false,
    flat: false,
    rough: 0.8,
  });
  sh.position.y = 0.18;
  g.add(sh);
  g.add(
    at(cyl(r * 1.06, r * 0.86, 0.18, color, { seg: o.seg ?? 14, edges: false }), 0, h - 0.18, 0),
  );
  g.add(at(box(r * 2.3, 0.12, r * 2.3, shade(color, -0.03), { edges: false }), 0, h, 0));
  return g;
}
export function at<O extends THREE.Object3D>(m: O, x: number, y: number, z: number): O {
  m.position.set(x, y, z);
  return m;
}

/* warm-lit / cool-glass window grid on a wall facing +z */
export function windowRows(
  width: number,
  top: number,
  bottom: number,
  cols: number,
  rows: number,
  o: MOpts = {},
): THREE.Group {
  const grp = new T.Group();
  const wW = o.wW ?? 0.7,
    wH = o.wH ?? 1.0;
  const gx = cols > 1 ? (width - cols * wW) / (cols + 1) : (width - wW) / 2;
  const gy = rows > 1 ? (top - bottom - rows * wH) / (rows + 1) : (top - bottom - wH) / 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const lit = o.allLit || Math.random() > (o.litChance != null ? 1 - o.litChance : 0.45);
      const col = lit ? (Q.PAL.glow as string) : (Q.PAL.glass as string);
      const p = pane(
        wW,
        wH,
        col,
        lit
          ? { emissive: Q.PAL.glow as string, emi: o.emi ?? 0.5 }
          : { emissive: Q.PAL.glass as string, emi: 0.08 },
      );
      p.position.set(-width / 2 + gx + wW / 2 + c * (wW + gx), bottom + gy + r * (wH + gy), 0);
      p.userData.win = true;
      p.userData.lit = lit;
      p.userData.litEmi = o.emi ?? 0.5;
      grp.add(p);
    }
  return grp;
}

export function cloth(w: number, h: number, color: string, o: MOpts = {}): Mesh {
  const g = new T.PlaneGeometry(w, h, 10, 2);
  const m = new T.Mesh(
    g,
    new T.MeshStandardMaterial({
      color: new T.Color(color),
      side: T.DoubleSide,
      roughness: 0.9,
      flatShading: false,
      emissive: new T.Color(o.emissive || "#000"),
      emissiveIntensity: o.emi || 0,
    }),
  );
  m.castShadow = true;
  m.userData.cloth = true;
  m.userData.base = (g.attributes.position.array as Float32Array).slice();
  return m;
}
