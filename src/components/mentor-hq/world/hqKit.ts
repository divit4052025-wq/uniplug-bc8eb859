/* ============================================================
   UniPlug · Headquarters — 3D kit: primitives + THEMES + LIGHT
   Faithful TS port of hq3d/kit.js (r128 → three@0.185).
   Buildings/props read the active palette via P(); the scene
   swaps it with setActiveTheme().
   ============================================================ */
import * as THREE from "three";

export { THREE };

/* ---- theme + time identifiers ---- */
export type ThemeName = "paper" | "stone" | "mix";
export type TimeName = "golden" | "dusk";

/* ---- a material palette (was window.HQ.PAL) ---- */
export interface Pal {
  label: string;
  ground: string;
  groundDk: string;
  lawn: string;
  lawnDk: string;
  court: string;
  courtDk: string;
  courtInlay: string;
  wall: string;
  wall2: string;
  wall3: string;
  trim: string;
  roof: string;
  roof2: string;
  roof3: string;
  column: string;
  stone: string;
  stoneDk: string;
  dome: string;
  domeDk: string;
  accent: string;
  gold: string;
  goldDk: string;
  bronze: string;
  flag: string;
  banner: string;
  glow: string;
  glass: string;
  water: string;
  line: string;
  scaffold: string;
  plank: string;
  foliage: string;
  foliageDk: string;
  trunk: string;
  path: string;
  pathDk: string;
  pathJoint: string;
  dark: string;
  ink: string;
  edgeOpacity: number;
  flatWalls: boolean;
  roughWall: number;
}

/* ---- a time-of-day light table ---- */
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

/* ---- options bag accepted by the primitive helpers ---- */
export interface MOpts {
  rough?: number;
  metal?: number;
  flat?: boolean;
  emissive?: string;
  emi?: number;
  opacity?: number;
  transparent?: boolean;
  cast?: boolean;
  receive?: boolean;
  edges?: boolean;
  edgeColor?: string;
  edgeOpacity?: number;
  mat?: THREE.Material;
  seg?: number;
  detail?: number;
  rseg?: number;
  tseg?: number;
  t?: number;
  bevel?: boolean;
  wW?: number;
  wH?: number;
  allLit?: boolean;
  litChance?: number;
}

/* ============================================================
   THEMES — three material palettes
   ============================================================ */
export const THEMES: Record<ThemeName, Pal> = {
  paper: {
    /* warm papercraft — kin to the student Quarter */ label: "Papercraft",
    ground: "#B6884A",
    groundDk: "#996E36",
    lawn: "#A6B66E",
    lawnDk: "#8D9D58",
    court: "#E6D2A0",
    courtDk: "#CFB47E",
    courtInlay: "#BE9A50",
    wall: "#F6E2BA",
    wall2: "#ECCF94",
    wall3: "#FCF3DE",
    trim: "#7A5230",
    roof: "#DE7440",
    roof2: "#C45A34",
    roof3: "#EA9663",
    column: "#FCF4E6",
    stone: "#ECD9B0",
    stoneDk: "#D4B984",
    dome: "#CE9560",
    domeDk: "#B2774A",
    accent: "#C4907F",
    gold: "#E2A94E",
    goldDk: "#B9842F",
    bronze: "#A9743C",
    flag: "#C4907F",
    banner: "#E18C7D",
    glow: "#FFC979",
    glass: "#BFE0EA",
    water: "#9CCBDB",
    line: "#FFF6EC",
    scaffold: "#B98A52",
    plank: "#8A6A3F",
    foliage: "#7C9A62",
    foliageDk: "#516B42",
    trunk: "#9C7048",
    path: "#A88E5E",
    pathDk: "#866A40",
    pathJoint: "#D8C49A",
    dark: "#3A2C1E",
    ink: "#2E2216",
    edgeOpacity: 0.2,
    flatWalls: true,
    roughWall: 0.96,
  },
  stone: {
    /* sandstone & marble monuments — premium */ label: "Sandstone & Marble",
    ground: "#B6884A",
    groundDk: "#996E36",
    lawn: "#A6B66E",
    lawnDk: "#8D9D58",
    court: "#E2CFA2",
    courtDk: "#C6AC78",
    courtInlay: "#AE8E48",
    wall: "#E2D2AE",
    wall2: "#CCB587",
    wall3: "#EFE6CE",
    trim: "#79572F",
    roof: "#8E9AA8",
    roof2: "#76828E",
    roof3: "#A4AFB8",
    column: "#F6F1E6",
    stone: "#D8C79E",
    stoneDk: "#BFAA7C",
    dome: "#5E9582",
    domeDk: "#477564",
    accent: "#B98A45",
    gold: "#E0AE54",
    goldDk: "#A87C32",
    bronze: "#8A5A2B",
    flag: "#5E8F7C",
    banner: "#6FA08C",
    glow: "#FFCE86",
    glass: "#C2D8E4",
    water: "#A9CBD6",
    line: "#FBF3E2",
    scaffold: "#A98A58",
    plank: "#7E6440",
    foliage: "#7C9A62",
    foliageDk: "#516B42",
    trunk: "#8A6440",
    path: "#9A8E72",
    pathDk: "#766A50",
    pathJoint: "#D6CAAE",
    dark: "#34302A",
    ink: "#26221C",
    edgeOpacity: 0.1,
    flatWalls: false,
    roughWall: 0.84,
  },
  mix: {
    /* papercraft massing, stone tones, marble columns + bronze */ label: "Stone-craft",
    ground: "#A6793E",
    groundDk: "#83612F",
    lawn: "#8FA455",
    lawnDk: "#748848",
    court: "#D4BA80",
    courtDk: "#B0925A",
    courtInlay: "#7E5E30",
    wall: "#E0C488",
    wall2: "#C6A664",
    wall3: "#EEE0BE",
    trim: "#46361F",
    roof: "#9A5C2E",
    roof2: "#7C4820",
    roof3: "#B0703A",
    column: "#EFE3CA",
    stone: "#CBAF7E",
    stoneDk: "#9C7E46",
    dome: "#688A76",
    domeDk: "#4C6A58",
    accent: "#A8763A",
    gold: "#D7A248",
    goldDk: "#9A7028",
    bronze: "#6E4A26",
    flag: "#BE6E4E",
    banner: "#B68A44",
    glow: "#FFC36A",
    glass: "#BBD6E2",
    water: "#9CC4D2",
    line: "#FBF1DC",
    scaffold: "#8A6A38",
    plank: "#54422A",
    path: "#86714C",
    pathDk: "#5E4C32",
    pathJoint: "#C6B286",
    dark: "#2A231C",
    ink: "#221C16",
    foliage: "#6E9050",
    foliageDk: "#3E5A30",
    trunk: "#6A4C2E",
    edgeOpacity: 0.16,
    flatWalls: true,
    roughWall: 0.92,
  },
};

/* ============================================================
   TIME — golden hour vs dusk/blue-hour (lights + sky + mood)
   ============================================================ */
export const TIME: Record<TimeName, TimePal> = {
  golden: {
    label: "Golden hour",
    exposure: 0.78,
    sky: [
      [0.0, "#8FB0CC"],
      [0.32, "#DDB07E"],
      [0.64, "#ECC791"],
      [1.0, "#F3D7A8"],
    ],
    fog: "#D8B884",
    fogNear: 120,
    fogFar: 320,
    hemiSky: 0xb0bece,
    hemiGround: 0x6e5430,
    hemiInt: 0.3,
    ambInt: 0.05,
    sunColor: 0xffc97e,
    sunInt: 2.25,
    sunPos: [33, 19, 15],
    fillColor: 0xbfc9e2,
    fillInt: 0.2,
    rimColor: 0xf6c99c,
    rimInt: 0.3,
    winEmi: 0.5,
    lampInt: 0.5,
    braE: 0.7,
  },
  dusk: {
    label: "Blue hour",
    exposure: 1.02,
    sky: [
      [0.0, "#23284B"],
      [0.4, "#4C4A6E"],
      [0.72, "#9C6E82"],
      [1.0, "#D89A77"],
    ],
    fog: "#4A4768",
    fogNear: 80,
    fogFar: 230,
    hemiSky: 0x40496e,
    hemiGround: 0x2a2436,
    hemiInt: 0.5,
    ambInt: 0.16,
    sunColor: 0xf0a062,
    sunInt: 0.95,
    sunPos: [34, 16, 26],
    fillColor: 0x5a6ca8,
    fillInt: 0.32,
    rimColor: 0xe08cb0,
    rimInt: 0.5,
    winEmi: 1.05,
    lampInt: 1.2,
    braE: 1.45,
  },
};

/* ---- active palette (was the global window.HQ.PAL the scene mutates) ---- */
let activePAL: Pal = THEMES.mix;
export function P(): Pal {
  return activePAL;
}
export function setActiveTheme(name: ThemeName): void {
  activePAL = THEMES[name];
}

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
  const h = (v: number): string => Math.round(v).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

/* -------- material cache -------- */
const _mc = new Map<string, THREE.MeshStandardMaterial>();
export function M(color: string, o: MOpts = {}): THREE.MeshStandardMaterial {
  const key =
    color +
    "|" +
    (o.rough ?? 0.92) +
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
  if (_mc.has(key)) return _mc.get(key)!;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.92,
    metalness: o.metal ?? 0.0,
    flatShading: o.flat ?? true,
    emissive: new THREE.Color(o.emissive || "#000"),
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

export function edges(mesh: THREE.Mesh, color: string, opacity = 0.16): THREE.Mesh {
  const eg = new THREE.EdgesGeometry(mesh.geometry, 22);
  const ls = new THREE.LineSegments(
    eg,
    new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity }),
  );
  ls.userData.edge = true;
  mesh.add(ls);
  return mesh;
}
export function fin(mesh: THREE.Mesh, o: MOpts): THREE.Mesh {
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.receive ?? true;
  if (o.edges) edges(mesh, o.edgeColor || P().line, o.edgeOpacity ?? 0.14);
  return mesh;
}

/* -------- primitives (base at y=0, centered x/z) -------- */
export function box(w: number, h: number, d: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
export function cyl(rt: number, rb: number, h: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 24, 1);
  g.translate(0, h / 2, 0);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
export function cone(r: number, h: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.ConeGeometry(r, h, o.seg ?? 24);
  g.translate(0, h / 2, 0);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
export function sphere(r: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(r, o.detail ?? 1);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
export function torus(r: number, tube: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.TorusGeometry(r, tube, o.rseg ?? 10, o.tseg ?? 28);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
/* gable roof: ridge along +z, span w(x), rise h, length d */
export function gable(w: number, h: number, d: number, color: string, o: MOpts = {}): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
/* hip/pyramid roof: square cone */
export function hip(r: number, h: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.ConeGeometry(r, h, 4);
  g.translate(0, h / 2, 0);
  g.rotateY(Math.PI / 4);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
/* right-triangle wedge prism (scaffold ramps / sawtooth) */
export function wedge(w: number, h: number, d: number, color: string, o: MOpts = {}): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return fin(new THREE.Mesh(g, o.mat || M(color, o)), o);
}
/* thin pane (windows/doors/signs) */
export function pane(w: number, h: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, o.t ?? 0.12);
  g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, o.mat || M(color, o));
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
/* flat ground ring (hover halo) */
export function ring(ri: number, ro: number, color: string): THREE.Mesh {
  const g = new THREE.RingGeometry(ri, ro, 48);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
/* rounded slab lying in XZ, extruded up by h */
export function slab(
  w: number,
  d: number,
  h: number,
  color: string,
  r = 1.2,
  o: MOpts = {},
): THREE.Mesh {
  const s = rrect(w, d, r);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h,
    bevelEnabled: o.bevel ?? false,
    bevelThickness: 0.3,
    bevelSize: 0.3,
    bevelSegments: 2,
  });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, o.mat || M(color, o));
  m.castShadow = o.cast ?? false;
  m.receiveShadow = o.receive ?? true;
  return m;
}
export function rrect(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
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
  const g = new THREE.Group();
  g.add(
    at(
      cyl(r * 0.92, r * 1.05, 0.18, shade(color, -0.06), { seg: o.seg ?? 14, edges: false }),
      0,
      0,
      0,
    ),
  );
  const sh = cyl(r * 0.84, r * 0.92, h - 0.36, color, {
    seg: o.seg ?? 14,
    edges: false,
    flat: false,
    rough: 0.82,
  });
  sh.position.y = 0.18;
  g.add(sh);
  g.add(
    at(cyl(r * 1.06, r * 0.86, 0.18, color, { seg: o.seg ?? 14, edges: false }), 0, h - 0.18, 0),
  );
  g.add(at(box(r * 2.3, 0.12, r * 2.3, shade(color, -0.04), { edges: false }), 0, h, 0));
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
  const grp = new THREE.Group();
  const wW = o.wW ?? 0.7,
    wH = o.wH ?? 1.0;
  const gx = cols > 1 ? (width - cols * wW) / (cols + 1) : (width - wW) / 2;
  const gy = rows > 1 ? (top - bottom - rows * wH) / (rows + 1) : (top - bottom - wH) / 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const lit = o.allLit || Math.random() > (o.litChance != null ? 1 - o.litChance : 0.35);
      const col = lit ? P().glow : P().glass;
      const p = pane(
        wW,
        wH,
        col,
        lit ? { emissive: P().glow, emi: o.emi ?? 0.55 } : { emissive: P().glass, emi: 0.06 },
      );
      p.position.set(-width / 2 + gx + wW / 2 + c * (wW + gx), bottom + gy + r * (wH + gy), 0);
      p.userData.win = true;
      p.userData.lit = lit;
      p.userData.litEmi = o.emi ?? 0.55;
      grp.add(p);
    }
  return grp;
}

export function cloth(w: number, h: number, color: string, o: MOpts = {}): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, 10, 2);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide,
      roughness: 0.9,
      flatShading: false,
      emissive: new THREE.Color(o.emissive || "#000"),
      emissiveIntensity: o.emi || 0,
    }),
  );
  m.castShadow = true;
  m.userData.cloth = true;
  m.userData.base = g.attributes.position.array.slice();
  return m;
}
