/* ============================================================
   UniPlug · Headquarters — the seven landmark buildings
   Faithful TS port of hq3d/buildings.js. Each factory reads the
   active palette via P(); front faces +z; base at y=0.
   BUILDINGS[zoneId]() → THREE.Group (userData.labelY, etc.)
   ============================================================ */
import * as THREE from "three";
import {
  P,
  at,
  box,
  cyl,
  cone,
  sphere,
  torus,
  gable,
  hip,
  wedge,
  pane,
  column,
  windowRows,
  cloth,
  shade,
} from "./hqKit";
import type { Pal, MOpts } from "./hqKit";

function facZ(
  g: THREE.Group,
  w: number,
  top: number,
  bot: number,
  cols: number,
  rows: number,
  z: number,
  o: MOpts = {},
): THREE.Group {
  const win = windowRows(w, top, bot, cols, rows, o);
  win.position.z = z;
  g.add(win);
  return win;
}
function facX(
  g: THREE.Group,
  w: number,
  top: number,
  bot: number,
  cols: number,
  rows: number,
  x: number,
  o: MOpts = {},
): THREE.Group {
  const win = windowRows(w, top, bot, cols, rows, o);
  win.position.x = x;
  win.rotation.y = Math.PI / 2;
  g.add(win);
  return win;
}
function steps(g: THREE.Group, w: number, d: number, z: number, n = 3): void {
  for (let i = 0; i < n; i++)
    g.add(
      at(
        box(w - i * 0.6, 0.2, d, P().stoneDk, { edges: false }),
        0,
        0.2 * (n - 1 - i) ? 0 : 0,
        z + i * 0.0,
      ),
    );
}
function pediment(w: number, h: number, d: number, color: string): THREE.Mesh {
  const ped = gable(w, h, d, color, { edges: true, edgeOpacity: 0.1 });
  ped.rotation.y = Math.PI / 2;
  return ped;
}
function crenelRow(
  g: THREE.Group,
  cx: number,
  cz: number,
  half: number,
  axis: string,
  y: number,
  color: string,
): void {
  const n = Math.max(2, Math.round((half * 2) / 0.9));
  for (let i = 0; i < n; i++) {
    const t = -half + (half * 2 * (i + 0.5)) / n,
      w = ((half * 2) / n) * 0.6;
    if (axis === "x") g.add(at(box(w, 0.55, 0.42, color, { edges: false }), cx + t, y, cz));
    else g.add(at(box(0.42, 0.55, w, color, { edges: false }), cx, y, cz + t));
  }
}
function crenelSquare(
  g: THREE.Group,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  y: number,
  color: string,
): void {
  crenelRow(g, cx, cz + hz, hx, "x", y, color);
  crenelRow(g, cx, cz - hz, hx, "x", y, color);
  crenelRow(g, cx + hx, cz, hz, "z", y, color);
  crenelRow(g, cx - hx, cz, hz, "z", y, color);
}
function turret(g: THREE.Group, x: number, z: number, pal: Pal): void {
  g.add(
    at(
      cyl(1.15, 1.32, 7.4, pal.wall2, {
        seg: 14,
        edges: true,
        edgeOpacity: 0.1,
        flat: false,
        rough: pal.roughWall,
      }),
      x,
      0.95,
      z,
    ),
  );
  g.add(at(cyl(1.46, 1.46, 0.4, pal.wall3, { seg: 14, edges: false }), x, 8.35, z));
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.add(
      at(
        box(0.4, 0.55, 0.4, pal.wall3, { edges: false }),
        x + Math.sin(a) * 1.42,
        8.75,
        z + Math.cos(a) * 1.42,
      ),
    );
  }
  g.add(at(cone(1.55, 2.4, pal.roof, { seg: 14, edges: true, edgeOpacity: 0.12 }), x, 9.3, z));
  g.add(
    at(
      sphere(0.22, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.45 }),
      x,
      11.7,
      z,
    ),
  );
  const fl = cloth(0.95, 0.55, pal.banner, { emissive: pal.banner, emi: 0.14 });
  fl.position.set(x + 0.5, 11.2, z);
  g.add(fl);
}

/* ---------------- THE WATCHTOWER — command / overview ---------------- */
export function watchtower(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(box(7.4, 0.7, 7.4, pal.stone, { edges: true, edgeOpacity: 0.1 }));
  for (let i = 0; i < 3; i++)
    g.add(
      at(box(4 - i * 0.5, 0.22, 1.0, pal.stoneDk, { edges: false }), 0, 0.7 + 0.0, 3.7 - i * 0.55),
    );
  // tier 1 — colonnaded base
  g.add(
    at(
      box(4.6, 4.4, 4.6, pal.wall, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      0.7,
      0,
    ),
  );
  [-1.85, -0.62, 0.62, 1.85].forEach((x) => g.add(at(column(4.2, 0.24, pal.column), x, 0.7, 2.4)));
  g.add(at(box(1.5, 2.4, 0.3, pal.trim, { edges: false }), 0, 0.7, 2.35));
  g.add(at(pane(1.15, 2.0, pal.glow, { emissive: pal.glow, emi: 0.5 }), 0, 0.8, 2.5));
  facX(g, 3.8, 4.6, 1.3, 2, 2, 2.32, { wW: 0.66, wH: 0.95, emi: 0.5 });
  g.add(at(box(5.0, 0.34, 5.0, pal.accent, { edges: false, metal: 0.2, rough: 0.6 }), 0, 5.1, 0));
  // tier 2
  g.add(
    at(
      box(3.8, 3.8, 3.8, pal.wall2, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      5.44,
      0,
    ),
  );
  facZ(g, 3.2, 8.6, 5.9, 2, 1, 1.92, { wW: 0.78, wH: 1.3, emi: 0.55 });
  facX(g, 3.2, 8.6, 5.9, 2, 1, 1.92, { wW: 0.78, wH: 1.3, emi: 0.55 });
  g.add(at(box(4.0, 0.26, 4.0, pal.accent, { edges: false }), 0, 9.24, 0));
  // tier 3 + balcony ring
  g.add(
    at(
      box(3.0, 3.4, 3.0, pal.wall, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      9.5,
      0,
    ),
  );
  const balc = torus(2.25, 0.16, pal.bronze, { rseg: 8, tseg: 24, metal: 0.3, rough: 0.5 });
  balc.rotation.x = Math.PI / 2;
  balc.position.y = 9.7;
  g.add(balc);
  facZ(g, 2.4, 12.4, 10.4, 2, 1, 1.52, { wW: 0.68, wH: 1.1, emi: 0.6 });
  // tier 4 (slim crown room)
  g.add(
    at(
      box(2.3, 2.6, 2.3, pal.wall3, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      12.9,
      0,
    ),
  );
  facZ(g, 1.9, 15.0, 13.3, 1, 1, 1.17, { wW: 1.0, wH: 1.2, emi: 0.7, allLit: true });
  // hip roof + lantern + BEACON
  g.add(at(hip(2.0, 2.6, pal.roof, { edges: true, edgeOpacity: 0.12 }), 0, 15.5, 0));
  g.add(
    at(cyl(0.58, 0.64, 1.1, pal.column, { seg: 10, edges: true, edgeOpacity: 0.1 }), 0, 17.5, 0),
  );
  const beaconGlass = box(1.0, 1.3, 1.0, pal.glass, {
    transparent: true,
    opacity: 0.4,
    edges: true,
    edgeColor: pal.gold,
    edgeOpacity: 0.3,
  });
  g.add(at(beaconGlass, 0, 18.6, 0));
  const orb = sphere(0.5, pal.gold, { detail: 2, edges: false, emissive: pal.gold, emi: 1.0 });
  orb.castShadow = false;
  g.add(at(orb, 0, 19.25, 0));
  g.userData.beacon = { mesh: orb, base: 1.0, amp: 0.5 };
  g.add(at(cone(0.5, 0.85, pal.accent, { seg: 10, edges: false }), 0, 19.7, 0));
  g.userData.labelY = 20.8;
  return g;
}

/* ---------------- THE FORUM — sessions (a castle: keep, bailey & gatehouse) ---------------- */
export function forum(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  // bailey platform — two distinct tiers (no coplanar faces → no flicker)
  g.add(box(13.8, 0.5, 10.4, pal.stoneDk, { edges: true, edgeOpacity: 0.1 })); // 0..0.5
  g.add(at(box(12.4, 0.45, 9.0, pal.stone, { edges: true, edgeOpacity: 0.1 }), 0, 0.5, 0)); // 0.5..0.95
  const Y0 = 0.95;
  // rear curtain wall + merlons
  g.add(
    at(
      box(11.8, 2.8, 0.8, pal.wall, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      Y0,
      -4.1,
    ),
  );
  crenelRow(g, 0, -4.1, 5.9, "x", Y0 + 2.8, pal.wall3);
  // central keep (donjon)
  g.add(
    at(
      box(5.6, 8.0, 5.6, pal.wall, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      Y0,
      -0.7,
    ),
  ); // 0.95..8.95
  g.add(at(box(6.0, 0.3, 6.0, pal.wall3, { edges: false }), 0, Y0 + 3.3, -0.7)); // string course
  g.add(at(box(6.1, 0.55, 6.1, pal.wall3, { edges: true, edgeOpacity: 0.1 }), 0, Y0 + 8.0, -0.7)); // parapet walk
  crenelSquare(g, 0, -0.7, 3.0, 3.0, Y0 + 8.55, pal.wall3);
  facZ(g, 4.4, Y0 + 7.2, Y0 + 1.4, 2, 2, 2.18, { wW: 0.72, wH: 1.5, emi: 0.6, litChance: 0.85 }); // warm keep windows
  g.add(at(box(2.6, 1.6, 2.6, pal.wall2, { edges: true, edgeOpacity: 0.1 }), 0, Y0 + 9.5, -0.7)); // crown room
  g.add(at(hip(1.95, 1.9, pal.roof, { edges: true, edgeOpacity: 0.12 }), 0, Y0 + 11.1, -0.7));
  g.add(
    at(
      sphere(0.26, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.55 }),
      0,
      Y0 + 13.2,
      -0.7,
    ),
  );
  // four corner turrets
  turret(g, -5.5, -3.3, pal);
  turret(g, 5.5, -3.3, pal);
  turret(g, -5.5, 3.5, pal);
  turret(g, 5.5, 3.5, pal);
  // gatehouse — two squat towers flanking an arched, glowing portcullis (+z front)
  [-2.3, 2.3].forEach((x) => {
    g.add(
      at(
        box(2.3, 5.6, 2.3, pal.wall2, {
          edges: true,
          edgeOpacity: 0.1,
          flat: pal.flatWalls,
          rough: pal.roughWall,
        }),
        x,
        Y0,
        3.7,
      ),
    );
    crenelSquare(g, x, 3.7, 1.15, 1.15, Y0 + 5.6, pal.wall3);
  });
  g.add(at(box(2.7, 3.8, 0.5, pal.trim, { edges: false }), 0, Y0, 4.6));
  g.add(at(pane(2.1, 3.1, pal.glow, { emissive: pal.glow, emi: 0.5 }), 0, Y0 + 0.1, 4.84));
  for (let i = 0; i < 5; i++)
    g.add(
      at(
        box(0.12, 3.0, 0.12, pal.bronze, { edges: false, metal: 0.3, rough: 0.5 }),
        -0.9 + i * 0.45,
        Y0 + 0.1,
        4.92,
      ),
    );
  g.add(at(box(2.9, 0.6, 0.8, pal.wall3, { edges: false }), 0, Y0 + 3.8, 4.6)); // lintel
  g.add(
    at(cloth(1.0, 2.5, pal.banner, { emissive: pal.banner, emi: 0.14 }), -1.25, Y0 + 3.5, 4.96),
  );
  g.add(at(cloth(1.0, 2.5, pal.accent, { emissive: pal.accent, emi: 0.12 }), 1.25, Y0 + 3.5, 4.96));
  g.userData.labelY = 14.6;
  return g;
}

/* ---------------- THE SUNDIAL — availability (open court) ---------------- */
export function sundial(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(cyl(5.6, 5.8, 0.5, pal.court, { seg: 36, edges: true, edgeOpacity: 0.1 }));
  g.add(at(cyl(5.0, 5.0, 0.06, pal.courtDk, { seg: 36, edges: false }), 0, 0.5, 0));
  // colonnade ring (open-air)
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.cos(a) > 0.45 && Math.sin(a) > -0.2) continue;
    /* opening toward camera-ish */ g.add(
      at(column(3.0, 0.22, pal.column), Math.sin(a) * 4.9, 0.5, Math.cos(a) * 4.9),
    );
  }
  // low architrave ring (back half)
  const ring = torus(4.95, 0.18, pal.wall3, { rseg: 6, tseg: 36 });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 3.5;
  g.add(ring);
  // the great sundial: dial plate + hour pips + angled gnomon
  g.add(at(cyl(3.2, 3.2, 0.14, pal.stone, { seg: 32, edges: false }), 0, 0.56, 0));
  const dial = cyl(3.0, 3.0, 0.05, pal.wall3, { seg: 32, edges: false });
  dial.position.y = 0.7;
  g.add(dial);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const pip = box(0.12, 0.05, 0.5, pal.bronze, { edges: false });
    pip.position.set(Math.sin(a) * 2.5, 0.74, Math.cos(a) * 2.5);
    pip.rotation.y = a;
    g.add(pip);
  }
  const gn = wedge(0.18, 2.6, 2.6, pal.bronze, { edges: false, metal: 0.3, rough: 0.5 });
  gn.position.set(0, 0.72, -0.2);
  gn.userData.gnomon = true;
  g.add(gn);
  g.add(
    at(
      sphere(0.2, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.4 }),
      0,
      0.72,
      1.1,
    ),
  );
  g.userData.labelY = 4.6;
  return g;
}

/* ---------------- THE VAULT — earnings (strongroom) ---------------- */
export function vault(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(box(6, 0.6, 6, pal.stone, { edges: true, edgeOpacity: 0.1 }));
  // heavy block w/ chamfered top
  g.add(
    at(
      box(4.6, 3.8, 4.6, pal.wall2, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      0.6,
      0,
    ),
  );
  g.add(at(box(5.0, 0.4, 5.0, pal.accent, { edges: false, metal: 0.2, rough: 0.6 }), 0, 4.4, 0));
  g.add(at(box(3.4, 0.9, 3.4, pal.wall3, { edges: true, edgeOpacity: 0.1 }), 0, 4.8, 0));
  g.add(at(hip(2.4, 1.4, pal.roof2, { edges: true, edgeOpacity: 0.12 }), 0, 5.7, 0));
  g.add(
    at(sphere(0.3, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.5 }), 0, 7.1, 0),
  );
  // round vault door on +z with warm glow leaking
  const glowRing = cyl(1.85, 1.85, 0.05, pal.glow, {
    seg: 30,
    edges: false,
    emissive: pal.glow,
    emi: 0.8,
  });
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.set(0, 2.1, 2.32);
  glowRing.castShadow = false;
  g.add(glowRing);
  const door = cyl(1.6, 1.6, 0.4, shade(pal.bronze, -0.1), {
    seg: 30,
    edges: false,
    metal: 0.5,
    rough: 0.45,
  });
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 2.1, 2.45);
  g.add(door);
  const ring1 = torus(1.2, 0.12, pal.gold, { rseg: 8, tseg: 28, metal: 0.5, rough: 0.4 });
  ring1.position.set(0, 2.1, 2.66);
  g.add(ring1);
  const ring2 = torus(0.7, 0.1, pal.gold, { rseg: 8, tseg: 24, metal: 0.5, rough: 0.4 });
  ring2.position.set(0, 2.1, 2.68);
  g.add(ring2);
  // spokes
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = box(0.12, 1.5, 0.1, pal.gold, { edges: false, metal: 0.5, rough: 0.4 });
    sp.position.set(0, 2.1, 2.66);
    sp.rotation.z = a;
    g.add(sp);
  }
  const hub = sphere(0.28, pal.gold, {
    detail: 1,
    edges: false,
    emissive: pal.gold,
    emi: 0.4,
    metal: 0.5,
  });
  hub.position.set(0, 2.1, 2.74);
  g.add(hub);
  // coin glint windows high up
  facX(g, 3.6, 4.0, 3.2, 3, 1, 2.32, { wW: 0.4, wH: 0.4, emi: 0.6, litChance: 0.7 });
  g.userData.labelY = 7.8;
  return g;
}

/* ---------------- THE LAURELS — standing (triumphal arch) ---------------- */
export function laurels(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(box(8, 0.5, 4, pal.court, { edges: true, edgeOpacity: 0.1 }));
  // two piers
  [-2.6, 2.6].forEach((x) => {
    g.add(
      at(
        box(1.8, 5, 2.4, pal.wall3, {
          edges: true,
          edgeOpacity: pal.edgeOpacity,
          flat: pal.flatWalls,
          rough: pal.roughWall,
        }),
        x,
        0.5,
        0,
      ),
    );
    g.add(at(column(4.2, 0.22, pal.column), x, 0.5, 1.0));
  });
  // span / entablature
  g.add(at(box(7.2, 1.4, 2.6, pal.wall, { edges: true, edgeOpacity: pal.edgeOpacity }), 0, 5.5, 0));
  g.add(at(box(7.6, 0.4, 2.9, pal.accent, { edges: false, metal: 0.2, rough: 0.6 }), 0, 6.9, 0));
  // attic block + inscription band
  g.add(at(box(5.5, 1.3, 2.0, pal.wall3, { edges: true, edgeOpacity: 0.1 }), 0, 7.3, 0));
  g.add(at(pane(4.6, 0.7, pal.gold, { emissive: pal.gold, emi: 0.3 }), 0, 7.6, 1.02));
  // keystone glow under arch
  g.add(
    at(
      cone(0.5, 0.8, pal.gold, { seg: 4, edges: false, emissive: pal.gold, emi: 0.4 }),
      0,
      4.7,
      1.0,
    ),
  );
  // laurel wreath (two green tori)
  [-0.5, 0.5].forEach((s) => {
    const lw = torus(0.9, 0.16, pal.foliageDk, { rseg: 8, tseg: 24 });
    lw.position.set(s * 0.0, 8.9, 0);
    lw.rotation.z = s * 0.5;
    lw.scale.x = 0.6;
    g.add(lw);
  });
  const star = sphere(0.32, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.6 });
  star.position.set(0, 8.9, 0.1);
  star.castShadow = false;
  g.add(star);
  g.userData.labelY = 9.8;
  return g;
}

/* ---------------- THE FORGE — profile/proof/verification ---------------- */
export function forge(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(box(8, 0.5, 7, pal.stone, { edges: true, edgeOpacity: 0.1 }));
  g.add(
    at(
      box(6.2, 3.6, 5, pal.wall, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      0.5,
      -0.2,
    ),
  );
  g.add(at(gable(6.6, 1.8, 5.4, pal.roof2, { edges: true, edgeOpacity: 0.12 }), 0, 4.1, -0.2));
  facX(g, 4.4, 3.6, 1.0, 3, 1, 3.12, { wW: 0.55, wH: 0.8, emi: 0.6 });
  // big arched furnace mouth on +z, ALWAYS glowing (forge stays active)
  g.add(at(box(2.6, 2.4, 0.5, pal.trim, { edges: false }), 0, 0.5, 2.4));
  const fire = box(2.0, 1.9, 0.4, "#FF8A3A", { emissive: "#FF8A3A", emi: 1.2 });
  fire.position.set(0, 0.6, 2.58);
  fire.castShadow = false;
  fire.userData.forgeFire = true;
  g.add(fire);
  const fireGlow = cyl(1.5, 1.8, 0.1, "#FFB24D", {
    seg: 18,
    edges: false,
    emissive: "#FFB24D",
    emi: 0.6,
    transparent: true,
    opacity: 0.5,
  });
  fireGlow.rotation.x = Math.PI / 2;
  fireGlow.position.set(0, 1.4, 2.7);
  fireGlow.castShadow = false;
  fireGlow.userData.forgeFire = true;
  g.add(fireGlow);
  // anvil out front
  g.add(at(box(0.5, 0.5, 0.3, pal.stoneDk, { edges: false }), 2.4, 0.5, 3.4));
  g.add(at(box(1.0, 0.3, 0.5, "#3A332C", { edges: false, metal: 0.4, rough: 0.5 }), 2.4, 1.0, 3.4));
  // chimney + smoke
  const chim = box(1.2, 3.0, 1.2, pal.wall2, { edges: true, edgeOpacity: 0.1 });
  chim.position.set(-2.0, 4.0, -1.2);
  g.add(chim);
  g.add(at(box(1.4, 0.3, 1.4, pal.trim, { edges: false }), -2.0, 7.0, -1.2));
  [
    [-2.0, 7.6, 0.6, 0.5],
    [-1.7, 8.4, 0.8, 0.4],
    [-2.2, 9.2, 1.0, 0.32],
  ].forEach(([x, y, r, o]) => {
    const s = sphere(r, "#D8CFC4", { detail: 1, edges: false, transparent: true, opacity: o });
    s.scale.y = 0.7;
    s.position.set(x, y, -1.2);
    s.castShadow = false;
    s.userData.smoke = true;
    g.add(s);
  });
  // hanging shingle sign
  g.add(at(box(0.1, 0.6, 0.1, pal.bronze, { edges: false }), -2.6, 3.0, 2.6));
  g.add(at(box(1.0, 0.7, 0.12, pal.accent, { edges: true, edgeOpacity: 0.1 }), -2.6, 2.4, 2.9));
  g.userData.labelY = 6.4;
  return g;
}

/* ---------------- THE EMBASSY — support / disputes / safety (domed consulate) ---------------- */
export function embassy(): THREE.Group {
  const g = new THREE.Group();
  const pal = P();
  g.add(box(6.8, 0.5, 6.2, pal.stoneDk, { edges: true, edgeOpacity: 0.1 })); // 0..0.5 socle
  g.add(
    at(
      box(4.8, 3.6, 4.2, pal.wall3, {
        edges: true,
        edgeOpacity: pal.edgeOpacity,
        flat: pal.flatWalls,
        rough: pal.roughWall,
      }),
      0,
      0.5,
      -0.3,
    ),
  ); // 0.5..4.1
  facX(g, 3.6, 3.6, 1.2, 2, 1, 2.1, { wW: 0.7, wH: 1.0, emi: 0.55 });
  // portico columns + FLAT entablature (no pediment triangle)
  [-1.7, -0.57, 0.57, 1.7].forEach((x) => g.add(at(column(3.3, 0.2, pal.column), x, 0.5, 2.3)));
  g.add(at(box(4.7, 0.6, 1.3, pal.wall, { edges: true, edgeOpacity: 0.1 }), 0, 3.8, 2.3)); // architrave
  g.add(at(box(5.0, 0.28, 1.5, pal.accent, { edges: false, metal: 0.2, rough: 0.6 }), 0, 4.4, 2.3)); // cornice
  // low parapet + small consular dome over the block
  g.add(at(box(5.0, 0.7, 4.5, pal.wall, { edges: true, edgeOpacity: 0.1 }), 0, 4.1, -0.3)); // parapet
  g.add(at(cyl(1.25, 1.45, 0.55, pal.wall3, { seg: 18, edges: false }), 0, 4.8, -0.3)); // drum
  const dome = sphere(1.3, pal.dome, { detail: 2, edges: false, rough: 0.6 });
  dome.scale.y = 0.72;
  dome.position.set(0, 5.35, -0.3);
  g.add(dome);
  g.add(
    at(
      sphere(0.2, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.5 }),
      0,
      6.35,
      -0.3,
    ),
  );
  // round consular seal above the doorway
  g.add(
    at(
      cyl(0.52, 0.52, 0.12, pal.gold, { seg: 20, edges: false, emissive: pal.gold, emi: 0.3 }),
      0,
      2.9,
      2.92,
    ),
  );
  // double doors w/ warm glow
  g.add(at(box(1.3, 2.0, 0.2, pal.trim, { edges: false }), 0, 0.5, 2.05));
  g.add(at(pane(1.05, 1.7, pal.glow, { emissive: pal.glow, emi: 0.45 }), 0, 0.6, 2.18));
  // flagpole + flag (the consulate signature)
  g.add(
    at(
      cyl(0.06, 0.07, 5.8, pal.bronze, { seg: 8, edges: false, metal: 0.2, rough: 0.6 }),
      2.95,
      0.5,
      2.3,
    ),
  );
  const flag = cloth(1.4, 0.9, pal.flag, { emissive: pal.flag, emi: 0.14 });
  flag.position.set(3.65, 5.4, 2.3);
  g.add(flag);
  g.add(
    at(
      sphere(0.12, pal.gold, { detail: 1, edges: false, emissive: pal.gold, emi: 0.4 }),
      2.95,
      6.3,
      2.3,
    ),
  );
  g.userData.labelY = 6.6;
  return g;
}

export const BUILDINGS = { watchtower, forum, sundial, vault, laurels, forge, embassy };
