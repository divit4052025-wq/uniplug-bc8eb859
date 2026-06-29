/* ============================================================
   UniPlug · The Quarter — 3D props (plaza life + ambient world)
   Faithful TS/ESM port of quarter3d/props.js. Was window.QProps.
   Fountain, mint trees, planters, walking students, dawn clouds,
   lamp posts, festoon string-lights (the "connection" motif),
   and the gentle consent-gate ribbon. Authored for three.js r128.
   ============================================================ */
import { THREE, Q, shade, box, cyl, cone, sphere, torus, cloth } from "./kit";

const T = THREE;
const P = () => Q.PAL as Record<string, string>;

/* ---------- foliage: round mint tree ---------- */
export function treeRound(s = 1): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const tr = cyl(0.16 * s, 0.22 * s, 1.1 * s, pal.trunk, { seg: 7, edges: false });
  g.add(tr);
  const tones = [pal.foliage, pal.foliageDk, pal.foliageLt];
  (
    [
      [0, 1.5, 0, 0.95],
      [0.42, 1.2, 0.22, 0.66],
      [-0.36, 1.28, -0.18, 0.6],
      [0.1, 1.92, -0.06, 0.62],
    ] as [number, number, number, number][]
  ).forEach(([x, y, z, r], i) => {
    const b = sphere(r * s, tones[i % tones.length], { detail: 1, flat: true, rough: 0.95 });
    b.position.set(x * s, y * s, z * s);
    b.castShadow = true;
    g.add(b);
  });
  return g;
}
/* ---------- foliage: tall poplar (vertical accent) ---------- */
export function treeTall(s = 1): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(cyl(0.14 * s, 0.2 * s, 0.8 * s, pal.trunk, { seg: 7, edges: false }));
  const tones = [pal.foliageDk, pal.foliage, pal.foliageLt];
  for (let i = 0; i < 3; i++) {
    const c = cone((0.86 - i * 0.18) * s, 1.25 * s, tones[i], {
      seg: 9,
      edges: false,
      rough: 0.95,
    });
    c.position.y = (0.7 + i * 0.82) * s;
    c.castShadow = true;
    g.add(c);
  }
  return g;
}
/* ---------- low bush ---------- */
export function bush(s = 1): THREE.Group {
  const g = new T.Group();
  const pal = P();
  (
    [
      [0, 0, 0, 0.5],
      [0.34, 0, 0.1, 0.36],
      [-0.3, 0, -0.08, 0.34],
    ] as [number, number, number, number][]
  ).forEach(([x, y, z, r]) => {
    const b = sphere(r * s, Math.random() > 0.5 ? pal.foliage : pal.foliageLt, {
      detail: 1,
      flat: true,
    });
    b.position.set(x * s, 0.34 * s + y, z * s);
    b.castShadow = true;
    g.add(b);
  });
  return g;
}
/* ---------- blush flower planter ---------- */
export function planter(w = 1.6): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const bx = box(w, 0.5, 0.8, pal.stoneDk, { edges: true, edgeColor: pal.line, edgeOpacity: 0.16 });
  g.add(bx);
  const soil = box(w - 0.2, 0.1, 0.6, pal.dark, { edges: false });
  soil.position.y = 0.46;
  g.add(soil);
  const cols = [pal.rose, pal.roof, pal.roseDeep, "#FFFFFF"];
  const n = Math.max(3, Math.round(w * 3));
  for (let i = 0; i < n; i++) {
    const fx = -w / 2 + 0.4 + (i / (n - 1)) * (w - 0.8);
    const stem = cyl(0.03, 0.03, 0.34, pal.foliageDk, { seg: 5, edges: false });
    stem.position.set(fx, 0.5, (Math.random() - 0.5) * 0.3);
    g.add(stem);
    const fl = sphere(0.12, cols[i % cols.length], { detail: 0, flat: true });
    fl.position.set(fx, 0.86, stem.position.z);
    fl.castShadow = false;
    g.add(fl);
  }
  return g;
}

/* ---------- walking student (low-poly) ----------
   userData: {legL,legR,armL,armR,head} for the walk cycle. */
export function person(
  color: string,
  opts: { hair?: string; bag?: string; scale?: number } = {},
): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const skin = "#F0C9A8",
    hair = opts.hair || pal.ink;
  const legL = box(0.16, 0.5, 0.18, pal.dark, { edges: false });
  legL.position.set(-0.11, 0, 0);
  g.add(legL);
  const legR = box(0.16, 0.5, 0.18, pal.dark, { edges: false });
  legR.position.set(0.11, 0, 0);
  g.add(legR);
  const torso = box(0.42, 0.6, 0.26, color, { edges: false });
  torso.position.y = 0.5;
  g.add(torso);
  const armL = box(0.12, 0.5, 0.13, shade(color, -0.08), { edges: false });
  armL.position.set(-0.3, 0.92, 0);
  armL.geometry.translate(0, -0.22, 0);
  armL.position.y = 1.0;
  g.add(armL);
  const armR = box(0.12, 0.5, 0.13, shade(color, -0.08), { edges: false });
  armR.position.set(0.3, 0.92, 0);
  armR.geometry.translate(0, -0.22, 0);
  armR.position.y = 1.0;
  g.add(armR);
  const neck = cyl(0.07, 0.07, 0.1, skin, { seg: 6, edges: false });
  neck.position.y = 1.1;
  g.add(neck);
  const head = sphere(0.2, skin, { detail: 1, flat: false, rough: 0.85 });
  head.position.y = 1.34;
  head.scale.set(1, 1.05, 1);
  g.add(head);
  const hairCap = sphere(0.205, hair, { detail: 1, flat: true });
  hairCap.position.y = 1.4;
  hairCap.scale.set(1, 0.7, 1);
  g.add(hairCap);
  if (opts.bag) {
    const bag = box(0.3, 0.36, 0.16, opts.bag, { edges: false });
    bag.position.set(0, 0.56, -0.2);
    g.add(bag);
  }
  g.scale.setScalar(opts.scale || 1);
  g.userData = { person: true, legL, legR, armL, armR, head, phase: Math.random() * Math.PI * 2 };
  return g;
}

/* ---------- soft dawn cloud ---------- */
export function cloud(s = 1): THREE.Group {
  const g = new T.Group();
  const top = "#FFFFFF",
    under = P().wall; // faint rose underside
  (
    [
      [0, 0, 0, 1.0],
      [1.1, -0.1, 0.2, 0.78],
      [-1.0, -0.05, -0.1, 0.7],
      [0.4, 0.3, 0.1, 0.66],
      [-0.5, 0.2, 0.15, 0.5],
    ] as [number, number, number, number][]
  ).forEach(([x, y, z, r]) => {
    const b = sphere(r * s, top, { detail: 1, flat: true, rough: 1 });
    b.material = new T.MeshStandardMaterial({
      color: new T.Color(top),
      roughness: 1,
      flatShading: true,
      emissive: new T.Color(under),
      emissiveIntensity: 0.05,
    });
    b.position.set(x * s, y * s, z * s);
    b.castShadow = false;
    b.receiveShadow = false;
    g.add(b);
  });
  g.userData.cloud = true;
  return g;
}

/* ---------- lamp post (warm lantern) ---------- */
export function lamp(h = 3.4): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(cyl(0.12, 0.16, h, pal.trim, { seg: 8, edges: false }));
  const arm = box(0.7, 0.1, 0.1, pal.trim, { edges: false });
  arm.position.set(0.26, h - 0.1, 0);
  g.add(arm);
  const head = cyl(0.22, 0.16, 0.34, shade(pal.trim, 0.1), { seg: 6, edges: false });
  head.position.set(0.55, h - 0.32, 0);
  g.add(head);
  const bulb = sphere(0.16, pal.glow, { detail: 1, flat: false });
  bulb.material = new T.MeshStandardMaterial({
    color: new T.Color(pal.glow),
    emissive: new T.Color(pal.glow),
    emissiveIntensity: 0.6,
    roughness: 0.5,
  });
  bulb.position.set(0.55, h - 0.42, 0);
  bulb.castShadow = false;
  g.add(bulb);
  g.userData = { lamp: true, bulb };
  return g;
}

/* ---------- festoon string-lights (the "connection" motif) ----------
   a drooping cable between two posts/points with glowing bulbs. */
export function festoonCurve(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  sag: number,
  n: number,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t,
      z = az + (bz - az) * t;
    const y = ay + (by - ay) * t - Math.sin(Math.PI * t) * sag;
    pts.push(new T.Vector3(x, y, z));
  }
  return pts;
}
export function festoon(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  sag = 1.2,
): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const pts = festoonCurve(ax, ay, az, bx, by, bz, sag, 24);
  const line = new T.Line(
    new T.BufferGeometry().setFromPoints(pts),
    new T.LineBasicMaterial({ color: new T.Color(pal.dark), transparent: true, opacity: 0.5 }),
  );
  line.castShadow = false;
  g.add(line);
  const bulbs: THREE.Mesh[] = [];
  for (let i = 2; i < pts.length - 1; i += 3) {
    const b = sphere(0.12, pal.wireGlow, { detail: 0, flat: false });
    b.material = new T.MeshStandardMaterial({
      color: new T.Color(pal.wireGlow),
      emissive: new T.Color(pal.rose),
      emissiveIntensity: 0.7,
      roughness: 0.4,
    });
    b.position.copy(pts[i]);
    b.position.y -= 0.12;
    b.castShadow = false;
    g.add(b);
    bulbs.push(b);
  }
  g.userData = { festoon: true, bulbs };
  return g;
}

/* ---------- fountain (plaza centerpiece, animated) ---------- */
export function fountain(r = 3): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const basin = cyl(r, r + 0.3, 0.6, pal.stone, {
    seg: 36,
    edges: true,
    edgeColor: pal.line,
    edgeOpacity: 0.14,
  });
  g.add(basin);
  const lip = torus(r, 0.16, pal.column, { rseg: 8, tseg: 36 });
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.6;
  g.add(lip);
  const water = cyl(r - 0.25, r - 0.25, 0.42, pal.water, {
    seg: 36,
    edges: false,
    transparent: true,
    opacity: 0.85,
    rough: 0.3,
    emissive: pal.water,
    emi: 0.06,
  });
  water.position.y = 0.16;
  water.receiveShadow = false;
  g.add(water);
  const ped = cyl(0.7, 0.95, 1.5, pal.stone, { seg: 16, edges: false });
  ped.position.y = 0.5;
  g.add(ped);
  const bowl2 = cyl(1.5, 0.7, 0.4, pal.column, { seg: 20, edges: false });
  bowl2.position.y = 2.0;
  g.add(bowl2);
  const water2 = cyl(1.32, 1.32, 0.16, pal.water, {
    seg: 20,
    edges: false,
    transparent: true,
    opacity: 0.85,
    emissive: pal.water,
    emi: 0.06,
  });
  water2.position.y = 2.32;
  g.add(water2);
  // the umark dot — a rose sphere finial
  const finial = sphere(0.36, pal.rose, {
    detail: 1,
    flat: false,
    rough: 0.5,
    emissive: pal.rose,
    emi: 0.18,
  });
  finial.position.y = 2.9;
  g.add(finial);
  // jets
  const jets: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const jet = cone(0.07, 1.0, pal.water, {
      seg: 8,
      edges: false,
      transparent: true,
      opacity: 0.5,
      emissive: pal.water,
      emi: 0.12,
    });
    jet.position.set(Math.cos(a) * 0.5, 2.6, Math.sin(a) * 0.5);
    jet.castShadow = false;
    g.add(jet);
    jets.push(jet);
  }
  g.userData = { fountain: true, water, water2, jets };
  return g;
}

/* ---------- bench ---------- */
export function bench(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const seat = box(1.5, 0.12, 0.5, pal.trunk, { edges: false });
  seat.position.y = 0.5;
  g.add(seat);
  const back = box(1.5, 0.5, 0.12, pal.trunk, { edges: false });
  back.position.set(0, 0.75, -0.2);
  g.add(back);
  [-0.6, 0.6].forEach((x) => {
    const leg = box(0.12, 0.5, 0.46, pal.stoneDk, { edges: false });
    leg.position.set(x, 0, 0);
    g.add(leg);
  });
  return g;
}

/* ---------- wayfinding fingerpost ---------- */
export function signpost(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(cyl(0.1, 0.12, 2.6, pal.trim, { seg: 8, edges: false }));
  const dirs: [number, string][] = [
    [1.0, pal.rose],
    [-1.0, pal.roof],
    [1.0, pal.roseDeep],
  ];
  dirs.forEach(([dir, col], i) => {
    const arm = box(1.1, 0.3, 0.08, col, { edges: false });
    arm.position.set(dir * 0.5, 2.2 - i * 0.42, 0);
    arm.rotation.y = (i - 1) * 0.5;
    g.add(arm);
  });
  const cap = sphere(0.16, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.16 });
  cap.position.y = 2.66;
  g.add(cap);
  return g;
}

/* ---------- gentle consent gate: two posts + soft rose ribbon ----------
   The "not yet open" marker for the consent-pending state. Removable. */
export function ribbonGate(w = 3): THREE.Group {
  const g = new T.Group();
  const pal = P();
  [-w / 2, w / 2].forEach((x) => {
    const post = cyl(0.1, 0.12, 1.2, pal.column, { seg: 8, edges: false });
    post.position.x = x;
    g.add(post);
    const knob = sphere(0.16, pal.rose, { detail: 1, flat: false });
    knob.position.set(x, 1.3, 0);
    g.add(knob);
  });
  const ribbon = cloth(w, 0.34, pal.rose, { emissive: pal.rose, emi: 0.12 });
  ribbon.position.set(0, 1.0, 0);
  ribbon.userData.cloth = true;
  g.add(ribbon);
  g.userData = { gate: true };
  return g;
}

/* ---------- low-poly rock / boulder cluster ---------- */
export function rock(s = 1): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const tones = [pal.stoneDk, "#B8A693", "#A79483", pal.stone];
  const lobes: [number, number, number, number][] = [
    [0, 0, 0, 0.6],
    [0.52, -0.05, 0.22, 0.42],
    [-0.42, -0.04, -0.16, 0.36],
    [0.16, 0.2, -0.12, 0.3],
  ];
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z, r] = lobes[i];
    const b = sphere(r * s, tones[i % tones.length], { detail: 0, flat: true, rough: 1 });
    b.position.set(x * s, (r * 0.55 + y) * s, z * s);
    b.scale.set(1, 0.7, 1);
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
  }
  for (let i = 0; i < 2; i++) {
    const p = sphere((0.12 + Math.random() * 0.1) * s, tones[(i + 1) % tones.length], {
      detail: 0,
      flat: true,
    });
    p.position.set((Math.random() - 0.5) * 1.3 * s, 0.06, (Math.random() - 0.5) * 1.3 * s);
    p.scale.set(1, 0.6, 1);
    p.castShadow = false;
    g.add(p);
  }
  return g;
}

/* ---------- drifting bird (V) ---------- */
export function bird(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const m = new T.LineBasicMaterial({
    color: new T.Color(pal.ink),
    transparent: true,
    opacity: 0.4,
  });
  const pts = [new T.Vector3(-0.5, 0.18, 0), new T.Vector3(0, 0, 0), new T.Vector3(0.5, 0.18, 0)];
  g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), m));
  g.userData.bird = true;
  return g;
}
