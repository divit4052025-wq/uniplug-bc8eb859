/* ============================================================
   UniPlug · Headquarters — 3D props (court dressing + construction)
   Faithful TS port of hq3d/props.js. Reads the active palette via P().
   ============================================================ */
import * as THREE from "three";
import { P, at, box, cyl, cone, sphere, slab, pane, cloth, shade } from "./hqKit";

/* tall Mediterranean cypress — classical campus signature */
export function cypress(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.13 * scale, 0.17 * scale, 0.5 * scale, P().trunk, { seg: 6, edges: false }));
  const tiers = [
    [0.64, 0.45, 0],
    [0.52, 1.5, 1],
    [0.38, 2.5, 0],
    [0.22, 3.4, 1],
  ];
  tiers.forEach(([r, y, d]) => {
    const cn = cone(r * scale, 1.55 * scale, d ? P().foliageDk : P().foliage, {
      seg: 7,
      edges: false,
    });
    cn.position.y = y * scale;
    cn.rotation.y = Math.random();
    g.add(cn);
  });
  return g;
}
/* leafy round tree — clustered canopy for grove variety */
export function treeRound(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.16 * scale, 0.22 * scale, 0.95 * scale, P().trunk, { seg: 6, edges: false }));
  const puffs = [
    [0, 1.25, 0, 1.0, 0],
    [0.5, 1.7, 0.2, 0.72, 1],
    [-0.45, 1.55, -0.25, 0.66, 0],
    [0.12, 2.05, -0.1, 0.6, 1],
  ];
  puffs.forEach(([x, y, z, r, d]) => {
    const s = sphere(r * scale, d ? shade(P().foliageDk, 0.06) : P().foliage, {
      detail: 1,
      edges: false,
      rough: 1,
    });
    s.position.set(x * scale, y * scale, z * scale);
    g.add(s);
  });
  return g;
}
/* low shrub clump */
export function bush(scale = 1): THREE.Group {
  const g = new THREE.Group();
  [
    [0, 0, 0, 0.5],
    [0.4, 0, 0.1, 0.38],
    [-0.32, 0, -0.12, 0.34],
  ].forEach(([x, y, z, r]) => {
    const s = sphere(r * scale, P().foliageDk, { detail: 1, edges: false, rough: 1 });
    s.scale.y = 0.8;
    s.position.set(x * scale, 0.3 * scale, z * scale);
    g.add(s);
  });
  return g;
}
/* manicured round topiary in a stone planter */
export function topiary(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(
    cyl(0.42 * scale, 0.52 * scale, 0.55 * scale, P().stoneDk, {
      seg: 10,
      edges: true,
      edgeOpacity: 0.12,
    }),
  );
  g.add(
    at(
      cyl(0.18 * scale, 0.2 * scale, 0.45 * scale, P().trunk, { seg: 6, edges: false }),
      0,
      0.55 * scale,
      0,
    ),
  );
  const ball = sphere(0.6 * scale, P().foliage, { detail: 1, edges: false, rough: 1 });
  ball.position.y = 1.2 * scale;
  g.add(ball);
  return g;
}
/* low garden wall segment (court structure) */
export function gardenWall(len = 4): THREE.Group {
  const g = new THREE.Group();
  g.add(box(len, 0.7, 0.4, P().stone, { edges: true, edgeOpacity: 0.12 }));
  g.add(at(box(len + 0.2, 0.16, 0.56, P().stoneDk, { edges: false }), 0, 0.7, 0));
  return g;
}
/* fire brazier on a tripod */
export function brazier(withLight = true): THREE.Group {
  const g = new THREE.Group();
  [0, 2.09, 4.18].forEach((a) => {
    const leg = cyl(0.05, 0.06, 1.2, P().bronze, { seg: 5, edges: false });
    leg.position.set(Math.sin(a) * 0.28, 0, Math.cos(a) * 0.28);
    leg.rotation.x = Math.sin(a) * 0.12;
    leg.rotation.z = Math.cos(a) * 0.12;
    g.add(leg);
  });
  g.add(
    at(
      cyl(0.42, 0.3, 0.34, P().bronze, { seg: 12, edges: false, metal: 0.3, rough: 0.6 }),
      0,
      1.1,
      0,
    ),
  );
  const embers = sphere(0.3, P().glow, { detail: 1, edges: false, emissive: P().glow, emi: 0.6 });
  embers.scale.y = 0.5;
  embers.position.y = 1.3;
  embers.castShadow = false;
  g.add(embers);
  const flame = cone(0.22, 0.6, "#FFB24D", {
    seg: 8,
    edges: false,
    emissive: "#FF9A3D",
    emi: 1.1,
    transparent: true,
    opacity: 0.85,
  });
  flame.position.y = 1.4;
  flame.castShadow = false;
  flame.userData.flame = true;
  g.add(flame);
  if (withLight) {
    const pl = new THREE.PointLight(0xffb257, 0.8, 11, 2);
    pl.position.set(0, 1.5, 0);
    pl.userData.fireLight = true;
    g.add(pl);
  }
  g.userData.brazier = true;
  return g;
}
/* hanging vertical banner on a tall pole */
export function bannerPole(h = 5, color?: string): THREE.Group {
  const g = new THREE.Group();
  color = color || P().banner;
  g.add(cyl(0.07, 0.08, h, P().bronze, { seg: 8, edges: false, metal: 0.2, rough: 0.6 }));
  g.add(
    at(sphere(0.13, P().gold, { detail: 1, edges: false, emissive: P().gold, emi: 0.4 }), 0, h, 0),
  );
  const arm = box(0.06, 0.06, 0.9, P().bronze, { edges: false });
  arm.position.set(0, h - 0.4, 0.45);
  g.add(arm);
  const ban = cloth(0.9, h * 0.5, color, { emissive: color, emi: 0.12 });
  ban.rotation.y = Math.PI / 2;
  ban.position.set(0, h - 0.4 - h * 0.25, 0.9);
  g.add(ban);
  const crest = pane(0.5, 0.5, P().gold, { emissive: P().gold, emi: 0.3 });
  crest.rotation.y = Math.PI / 2;
  crest.position.set(0, h - 0.9, 0.91);
  g.add(crest);
  return g;
}
/* Founder monument — a cast-bronze statue of the Founder on a tall plinth */
export function founderMonument(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  // stepped plinth (dark stone → light)
  g.add(cyl(1.6, 1.8, 0.4, pal.dark, { seg: 24, edges: false }));
  g.add(
    at(cyl(1.3, 1.5, 0.5, pal.stoneDk, { seg: 24, edges: true, edgeOpacity: 0.12 }), 0, 0.4, 0),
  );
  g.add(at(cyl(1.0, 1.15, 1.4, pal.stone, { seg: 24, edges: false }), 0, 0.9, 0));
  g.add(at(pane(1.1, 0.4, pal.gold, { emissive: pal.gold, emi: 0.25 }), 0, 1.3, 1.0)); // inscription
  // bronze figure — rounded founder body
  const body = sphere(0.7, pal.bronze, { detail: 2, edges: false, metal: 0.4, rough: 0.5 });
  body.scale.set(1, 1.3, 0.8);
  body.position.y = 3.0;
  g.add(body);
  const head = sphere(0.42, shade(pal.bronze, 0.08), {
    detail: 2,
    edges: false,
    metal: 0.4,
    rough: 0.5,
  });
  head.position.y = 3.9;
  g.add(head);
  const eyeL = sphere(0.08, "#FBF2E8", { detail: 1, edges: false });
  eyeL.position.set(-0.16, 3.95, 0.34);
  g.add(eyeL);
  const eyeR = sphere(0.08, "#FBF2E8", { detail: 1, edges: false });
  eyeR.position.set(0.16, 3.95, 0.34);
  g.add(eyeR);
  const tail = cone(0.26, 0.5, pal.bronze, { seg: 3, edges: false, metal: 0.4, rough: 0.5 });
  tail.rotation.z = 0.6;
  tail.position.set(-0.6, 2.7, 0.3);
  g.add(tail);
  return g;
}
/* tiered classical fountain w/ animated water */
export function fountain(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(cyl(2.4, 2.6, 0.55, pal.stoneDk, { seg: 30, edges: true, edgeOpacity: 0.12 }));
  g.add(at(cyl(2.45, 2.45, 0.16, pal.dark, { seg: 30, edges: false }), 0, 0.55, 0)); // dark rim
  const w1 = cyl(2.1, 2.1, 0.16, pal.water, {
    seg: 30,
    edges: false,
    emissive: pal.water,
    emi: 0.06,
    rough: 0.4,
  });
  w1.position.y = 0.5;
  w1.receiveShadow = false;
  g.add(w1);
  g.add(at(cyl(0.5, 0.66, 1.0, pal.stone, { seg: 18, edges: false }), 0, 0.5, 0));
  g.add(at(cyl(0.95, 0.6, 0.3, pal.stone, { seg: 20, edges: false }), 0, 1.45, 0));
  const w2 = cyl(0.78, 0.78, 0.1, pal.water, {
    seg: 18,
    edges: false,
    emissive: pal.water,
    emi: 0.06,
    rough: 0.4,
  });
  w2.position.y = 1.75;
  w2.receiveShadow = false;
  g.add(w2);
  const jet = cone(0.26, 1.0, pal.water, {
    seg: 12,
    edges: false,
    transparent: true,
    opacity: 0.45,
    emissive: pal.water,
    emi: 0.12,
  });
  jet.position.y = 1.8;
  jet.castShadow = false;
  jet.userData.jet = true;
  g.add(jet);
  const drops = new THREE.Group();
  drops.userData.drops = true;
  for (let i = 0; i < 6; i++) {
    const d = sphere(0.07, pal.water, {
      detail: 0,
      edges: false,
      transparent: true,
      opacity: 0.6,
      emissive: pal.water,
      emi: 0.12,
    });
    d.userData.seed = Math.random() * 6.28;
    d.castShadow = false;
    drops.add(d);
  }
  drops.position.y = 1.9;
  g.add(drops);
  g.userData.water = true;
  return g;
}
export function bench(): THREE.Group {
  const g = new THREE.Group();
  const seat = box(1.5, 0.12, 0.45, P().stone, { edges: false });
  seat.position.y = 0.42;
  g.add(seat);
  [-0.6, 0.6].forEach((x) => {
    const l = box(0.16, 0.42, 0.42, P().dark, { edges: false });
    l.position.x = x;
    g.add(l);
  });
  return g;
}
export function lamp(withLight = false): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.1, 2.7, P().dark, { seg: 8, edges: false, metal: 0.2, rough: 0.6 }));
  const globe = sphere(0.22, P().glow, { detail: 1, edges: false, emissive: P().glow, emi: 1.0 });
  globe.position.y = 2.8;
  globe.castShadow = false;
  globe.userData.lampGlobe = true;
  g.add(globe);
  if (withLight) {
    const pl = new THREE.PointLight(0xffd79a, 0.5, 10, 2);
    pl.position.y = 2.8;
    pl.userData.lampLight = true;
    g.add(pl);
  }
  return g;
}
export function cloud(scale = 1): THREE.Group {
  const g = new THREE.Group();
  [
    [0, 0, 0, 1],
    [1.0, 0.1, 0.2, 0.78],
    [-0.95, 0.05, -0.1, 0.72],
    [0.4, 0.35, 0.1, 0.62],
    [-0.4, 0.3, 0.2, 0.58],
  ].forEach(([x, y, z, r]) => {
    const p = sphere(r * scale, "#FCFBF8", { detail: 1, edges: false, rough: 1 });
    p.scale.y = 0.6;
    p.position.set(x * scale, y * scale, z * scale);
    p.castShadow = false;
    g.add(p);
  });
  g.userData.cloud = true;
  return g;
}
export function person(color: string): THREE.Group {
  const g = new THREE.Group();
  const robe = cone(0.34, 1.05, color, { seg: 10, edges: false });
  g.add(robe);
  const head = sphere(0.2, shade(color, 0.1), { detail: 1, edges: false });
  head.position.y = 1.05;
  g.add(head);
  g.userData.person = true;
  return g;
}

/* ============================================================
   CONSTRUCTION props (pending / rejected world-state)
   ============================================================ */
/* dense scaffold cage — reads clearly as a building site */
export function scaffoldFor(w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  const H = h + 0.8;
  const hw = w / 2 + 0.45,
    hd = d / 2 + 0.45;
  const xs = [-hw, 0, hw],
    zs = [-hd, 0, hd];
  // verticals (corner + mid)
  xs.forEach((x) =>
    zs.forEach((z) => {
      if (x === 0 && z === 0) return;
      const pole = cyl(0.07, 0.07, H, pal.scaffold, { seg: 5, edges: false });
      pole.position.set(x, 0, z);
      g.add(pole);
    }),
  );
  // horizontal rails per level, all four sides
  const lv = Math.max(3, Math.round(H / 1.5));
  for (let i = 1; i <= lv; i++) {
    const y = H * (i / lv);
    [
      [0, -hd, w + 0.9, 0],
      [0, hd, w + 0.9, 0],
      [-hw, 0, d + 0.9, Math.PI / 2],
      [hw, 0, d + 0.9, Math.PI / 2],
    ].forEach(([x, z, len, ry]) => {
      const rail = cyl(0.035, 0.035, len, pal.scaffold, { seg: 4, edges: false });
      rail.rotation.z = Math.PI / 2;
      rail.rotation.y = ry;
      rail.position.set(x, y, z);
      g.add(rail);
    });
  }
  // diagonal cross-braces on front + right faces
  const brace = (x: number, z: number, ry: number) => {
    const len = Math.hypot(H, Math.max(w, d));
    const b = cyl(0.03, 0.03, len * 0.7, pal.scaffold, { seg: 4, edges: false });
    b.position.set(x, H * 0.45, z);
    b.rotation.y = ry;
    b.rotation.z = 0.7;
    g.add(b);
    const b2 = b.clone();
    b2.rotation.z = -0.7;
    g.add(b2);
  };
  brace(0, hd, 0);
  brace(hw, 0, Math.PI / 2);
  // plank decks at two levels
  [0.42, 0.74].forEach((f) => {
    const deck = box(w + 0.9, 0.08, 0.6, pal.plank, { edges: false });
    deck.position.set(0, H * f, -hd);
    g.add(deck);
    const deck2 = box(0.6, 0.08, d + 0.9, pal.plank, { edges: false });
    deck2.position.set(hw, H * f * 0.8, 0);
    g.add(deck2);
  });
  // tarp wrap on the front (two hanging panels)
  [-w * 0.22, w * 0.22].forEach((x, i) => {
    const tarp = box(w * 0.4, H * 0.55, 0.05, i ? pal.banner : pal.flag, {
      edges: false,
      opacity: 0.9,
      transparent: true,
    });
    tarp.position.set(x, H * 0.5, hd + 0.02);
    g.add(tarp);
  });
  // ladder on left face
  const lad = new THREE.Group();
  [[-0.25], [0.25]].forEach(([x]) =>
    lad.add(at(cyl(0.03, 0.03, H * 0.8, pal.plank, { seg: 4, edges: false }), x, 0, 0)),
  );
  for (let i = 1; i < 5; i++)
    lad.add(at(box(0.5, 0.03, 0.03, pal.plank, { edges: false }), 0, H * 0.8 * (i / 5), 0));
  lad.position.set(-hw, 0, hd * 0.4);
  g.add(lad);
  g.userData.scaffold = true;
  return g;
}
/* pile of building materials — stone blocks, planks, sand */
export function materialsPile(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  // stacked stone blocks
  g.add(at(box(1.6, 0.5, 0.9, pal.stoneDk, { edges: true, edgeOpacity: 0.12 }), 0, 0, 0));
  g.add(at(box(1.4, 0.5, 0.8, pal.stone, { edges: true, edgeOpacity: 0.12 }), 0.05, 0.5, 0));
  g.add(at(box(0.8, 0.5, 0.7, pal.stoneDk, { edges: true, edgeOpacity: 0.12 }), -0.3, 1.0, 0.05));
  // planks leaning
  const planks = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    planks.add(at(box(0.2, 2.2, 0.06, pal.plank, { edges: false }), i * 0.16, 0, i * 0.04));
  }
  planks.rotation.z = 0.5;
  planks.position.set(1.6, 0, -0.6);
  g.add(planks);
  // sand / aggregate cone
  const sand = cone(1.0, 0.7, pal.ground, { seg: 14, edges: false });
  sand.position.set(-1.7, 0, 0.4);
  g.add(sand);
  // a couple of barrels
  [
    [1.4, 0.9],
    [1.9, 0.5],
  ].forEach(([x, z]) =>
    g.add(
      at(
        cyl(0.32, 0.32, 0.7, pal.bronze, { seg: 10, edges: false, metal: 0.2, rough: 0.6 }),
        x,
        0,
        z,
      ),
    ),
  );
  return g;
}
/* a tall lattice tower crane */
export function crane(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  const TH = 11;
  g.add(box(1.8, 0.5, 1.8, pal.dark, { edges: false }));
  // lattice mast (4 legs + cross braces)
  const legs = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  legs.forEach(([x, z]) =>
    g.add(at(cyl(0.09, 0.1, TH, pal.scaffold, { seg: 5, edges: false }), x, 0.5, z)),
  );
  for (let i = 1; i < 7; i++) {
    const y = 0.5 + TH * (i / 7);
    [
      [0, -0.5],
      [0, 0.5],
    ].forEach(([x, z]) => {
      const r = cyl(0.04, 0.04, 1.1, pal.scaffold, { seg: 4, edges: false });
      r.rotation.z = Math.PI / 2;
      r.position.set(x, y, z);
      g.add(r);
    });
    [
      [-0.5, 0],
      [0.5, 0],
    ].forEach(([x, z]) => {
      const r = cyl(0.04, 0.04, 1.1, pal.scaffold, { seg: 4, edges: false });
      r.rotation.x = Math.PI / 2;
      r.position.set(x, y, z);
      g.add(r);
    });
  }
  // slewing jib + counter-jib
  const jib = box(11, 0.35, 0.45, pal.scaffold, { edges: false });
  jib.position.set(3.4, TH + 0.6, 0);
  g.add(jib);
  const cj = box(3.2, 0.35, 0.45, pal.scaffold, { edges: false });
  cj.position.set(-2.0, TH + 0.6, 0);
  g.add(cj);
  g.add(at(box(1.4, 0.7, 0.7, pal.dark, { edges: false }), -3.2, TH + 0.6, 0)); // counterweight
  g.add(
    at(
      box(0.7, 0.7, 0.7, pal.gold, { edges: false, emissive: pal.gold, emi: 0.15 }),
      0.4,
      TH + 0.4,
      0,
    ),
  ); // operator cab
  // hoist cable + hanging stone load
  g.add(at(cyl(0.02, 0.02, 3.4, "#2A241C", { seg: 4, edges: false }), 7.0, TH - 1.1, 0));
  g.add(at(box(1.0, 0.8, 1.0, pal.stoneDk, { edges: true, edgeOpacity: 0.12 }), 7.0, TH - 3.2, 0));
  return g;
}

export function obelisk(h = 5): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(box(1.4, 0.5, 1.4, pal.dark, { edges: false }));
  g.add(at(box(1.05, 0.4, 1.05, pal.stoneDk, { edges: true, edgeOpacity: 0.12 }), 0, 0.5, 0));
  const sh = cyl(0.34, 0.58, h, pal.stone, { seg: 4, edges: true, edgeOpacity: 0.1, flat: true });
  sh.rotation.y = Math.PI / 4;
  sh.position.y = 0.9;
  g.add(sh);
  g.add(
    at(
      cone(0.46, 0.8, pal.gold, { seg: 4, edges: false, emissive: pal.gold, emi: 0.25 }),
      0,
      h + 0.9,
      0,
    ),
  );
  return g;
}
export function rock(s = 1): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  [
    [0, 0, 0, 0.7],
    [0.5, 0, 0.3, 0.45],
    [-0.4, 0, -0.2, 0.4],
  ].forEach(([x, y, z, r]) => {
    const b = sphere(r * s, Math.random() > 0.5 ? pal.stoneDk : pal.stone, {
      detail: 0,
      edges: true,
      edgeOpacity: 0.12,
    });
    b.scale.y = 0.7;
    b.position.set(x * s, 0.2 * s, z * s);
    g.add(b);
  });
  return g;
}
export function statue(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(cyl(0.9, 1.05, 1.3, pal.stoneDk, { seg: 8, edges: true, edgeOpacity: 0.12 }));
  const body = cyl(0.36, 0.46, 1.7, pal.column, { seg: 10, edges: false, flat: false, rough: 0.7 });
  body.position.y = 1.3;
  g.add(body);
  const head = sphere(0.32, pal.column, { detail: 2, edges: false, rough: 0.7 });
  head.position.y = 3.2;
  g.add(head);
  g.add(at(box(0.16, 1.1, 0.16, pal.column, { edges: false }), 0.5, 1.7, 0));
  return g;
}
export function redFlag(h = 4): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.07, h, "#6E2618", { seg: 6, edges: false }));
  const fl = cloth(1.2, 0.78, "#D8432A", { emissive: "#D8432A", emi: 0.45 });
  fl.position.set(0.64, h - 0.5, 0);
  g.add(fl);
  return g;
}
/* wreckage overlay — a half-collapsed building (rejected state) */
export function wreck(h = 7): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  // collapsed rubble mounds at the base
  const rb = rubble();
  rb.position.set(-1.7, 0, 2.9);
  rb.scale.set(1.7, 1.8, 1.7);
  g.add(rb);
  const rb2 = rubble();
  rb2.position.set(2.5, 0, 2.3);
  rb2.scale.set(1.35, 1.4, 1.35);
  g.add(rb2);
  // large toppled wall slabs (fallen / leaning)
  [
    [-2.6, 0.6, 3.3, 1.45, 0.4, 0.22],
    [1.2, 0.5, 3.5, 1.25, 0.7, -0.45],
    [0.1, 1.0, 2.7, -0.55, 0.3, 0.5],
    [3.0, 0.5, 3.2, 0.3, 1.1, 1.15],
  ].forEach(([x, y, z, rx, ry, rz]) => {
    const c = box(
      1.9 + Math.random() * 0.9,
      2.2 + Math.random() * 0.9,
      0.5,
      Math.random() > 0.5 ? pal.wall2 : pal.wall,
      { edges: true, edgeOpacity: 0.13 },
    );
    c.position.set(x, y + 0.9, z);
    c.rotation.set(rx, ry, rz);
    g.add(c);
  });
  // snapped beams jutting out
  for (let i = 0; i < 6; i++) {
    const b = box(0.2, 2.0 + Math.random() * 1.8, 0.2, pal.plank, { edges: false });
    b.position.set(
      -2.4 + Math.random() * 4.8,
      h * 0.34 + Math.random() * 1.8,
      1.8 + Math.random() * 1.2,
    );
    b.rotation.set(Math.random() * 1.3, Math.random() * 3, 0.4 + Math.random() * 0.8);
    g.add(b);
  }
  // jagged dark cracks climbing the facade
  for (let i = 0; i < 3; i++) {
    const c = pane(0.2, 1.8 + Math.random(), pal.ink, {});
    c.position.set(-2.2 + i * 2.1, h * 0.36, 2.5);
    c.rotation.z = (Math.random() - 0.5) * 0.85;
    g.add(c);
  }
  // a snapped, leaning column
  const col = cyl(0.3, 0.34, Math.max(2.4, h * 0.55), pal.column, { seg: 10, edges: false });
  col.position.set(-3.1, 0, 3.5);
  col.rotation.z = 0.72;
  g.add(col);
  const colTop = cyl(0.3, 0.3, 1.5, pal.column, { seg: 10, edges: false });
  colTop.position.set(-4.6, 0.3, 3.9);
  colTop.rotation.z = 1.45;
  g.add(colTop);
  // soot / scorch patch on the ground
  const soot = slab(4.8, 3.2, 0.04, pal.ink, 1.3, { transparent: true, opacity: 0.42 });
  soot.position.set(0.2, 0.2, 3.1);
  g.add(soot);
  return g;
}
export function rubble(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  for (let i = 0; i < 7; i++) {
    const b = box(
      0.4 + Math.random() * 0.6,
      0.3 + Math.random() * 0.4,
      0.4 + Math.random() * 0.5,
      Math.random() > 0.5 ? pal.stoneDk : pal.wall2,
      { edges: true, edgeOpacity: 0.12 },
    );
    b.position.set(
      (Math.random() - 0.5) * 2.4,
      0.1 + Math.random() * 0.3,
      (Math.random() - 0.5) * 2.4,
    );
    b.rotation.set(Math.random() * 0.4, Math.random() * 3, Math.random() * 0.4);
    g.add(b);
  }
  return g;
}
