/* ============================================================
   UniPlug · The Quarter — the seven landmark buildings.
   Faithful TS/ESM port of quarter3d/buildings.js. Was window.QBuild.
   Each a distinct silhouette so a student reads the skyline and
   instantly knows which is which. Built at origin, base y=0,
   entrance facing +z. Authored for three.js r128.
   ============================================================ */
import { THREE, Q, box, cyl, cone, sphere, torus, gable, hip, pane, cloth, column } from "./kit";

const T = THREE;
const P = () => Q.PAL as Record<string, string>;

/* shared: arched doorway pane on +z face */
function doorway(w: number, h: number, color: string): THREE.Group {
  const g = new T.Group();
  const d = pane(w, h, color, { emissive: color, emi: 0.12 });
  d.position.y = 0;
  g.add(d);
  const arch = cyl(w / 2, w / 2, 0.14, color, {
    seg: 18,
    edges: false,
    emissive: color,
    emi: 0.12,
  });
  arch.rotation.x = Math.PI / 2;
  arch.scale.set(1, 1, 1);
  arch.position.y = h;
  g.add(arch);
  return g;
}
function tagBeacon(mesh: THREE.Mesh, emi: number): THREE.Mesh {
  mesh.userData.beacon = true;
  mesh.userData.baseEmi = emi;
  return mesh;
}

/* ---------- THE SQUARE — open welcome rotunda ---------- */
export function square(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  // stepped round base
  g.add(
    cyl(4.2, 4.5, 0.4, pal.court, { seg: 32, edges: true, edgeColor: pal.line, edgeOpacity: 0.12 }),
  );
  const step2 = cyl(3.6, 3.9, 0.4, pal.stone, { seg: 32, edges: false });
  step2.position.y = 0.4;
  g.add(step2);
  const floor = cyl(3.4, 3.4, 0.16, pal.courtRose, { seg: 32, edges: false });
  floor.position.y = 0.8;
  g.add(floor);
  // ring of columns
  const N = 8,
    rr = 2.9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const col = column(3.2, 0.26, pal.column, { seg: 12 });
    col.position.set(Math.cos(a) * rr, 0.8, Math.sin(a) * rr);
    g.add(col);
  }
  // entablature ring
  const ent = cyl(rr + 0.4, rr + 0.4, 0.4, pal.wall3, { seg: 32, edges: false });
  ent.position.y = 4.2;
  g.add(ent);
  const entIn = cyl(rr + 0.1, rr + 0.1, 0.42, pal.wall, { seg: 32, edges: false });
  entIn.position.y = 4.18;
  g.add(entIn);
  // rose cupola dome
  const dome = sphere(rr + 0.2, pal.rose, { detail: 2, flat: false, rough: 0.6 });
  dome.scale.set(1, 0.62, 1);
  dome.position.y = 4.6;
  dome.castShadow = true;
  g.add(dome);
  const ringTrim = torus(rr + 0.2, 0.12, pal.roseDeep, { rseg: 8, tseg: 32 });
  ringTrim.rotation.x = Math.PI / 2;
  ringTrim.position.y = 4.62;
  g.add(ringTrim);
  // finial = umark dot
  const fin = tagBeacon(
    sphere(0.34, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.3 }),
    0.3,
  );
  fin.position.y = 6.5;
  g.add(fin);
  const fstem = cyl(0.06, 0.06, 0.5, pal.roseDeep, { seg: 6, edges: false });
  fstem.position.y = 6.0;
  g.add(fstem);
  g.userData = { zoneId: "square", labelY: 7.4 };
  return g;
}

/* ---------- THE SWITCHBOARD — grand civic exchange (portico + clock-tower) ---------- */
export function switchboard(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  // monumental stepped base (dark anchor)
  g.add(box(13.4, 0.6, 9.4, pal.baseDk, { edges: false }));
  const s2 = box(12.3, 0.5, 8.5, pal.stoneDk, { edges: false });
  s2.position.y = 0.6;
  g.add(s2);
  // main hall + dark base band + light cornice (mid + dark + light = pop)
  const hall = box(10.6, 5.4, 6.6, pal.wall, {
    edges: true,
    edgeColor: pal.trim,
    edgeOpacity: 0.2,
  });
  hall.position.y = 1.1;
  g.add(hall);
  const band = box(10.8, 0.7, 6.8, pal.trim, { edges: false });
  band.position.set(0, 1.1, 0);
  g.add(band);
  const cornice = box(11.2, 0.6, 7.2, pal.wall3, { edges: false });
  cornice.position.set(0, 6.4, 0);
  g.add(cornice);
  // upper arcade of glowing rose niches (refined patch-bay — the connection motif)
  for (let i = 0; i < 7; i++) {
    const x = -4.5 + i * 1.5;
    const niche = box(1.0, 2.0, 0.3, pal.trim, { edges: false });
    niche.position.set(x, 4.0, 3.42);
    g.add(niche);
    const top = cyl(0.5, 0.5, 0.3, pal.trim, { seg: 14, edges: false });
    top.rotation.x = Math.PI / 2;
    top.position.set(x, 6.0, 3.42);
    g.add(top);
    const node = tagBeacon(
      sphere(0.2, pal.wireGlow, { detail: 1, flat: false, emissive: pal.rose, emi: 0.6 }),
      0.6,
    );
    node.position.set(x, 4.6, 3.6);
    node.castShadow = false;
    g.add(node);
  }
  // grand front portico: six columns + entablature + pediment
  [-5, -3, -1, 1, 3, 5].forEach((x) => {
    const c = column(4.6, 0.36, pal.column, { seg: 14 });
    c.position.set(x, 1.1, 4.5);
    g.add(c);
  });
  const archi = box(11.6, 0.4, 1.6, pal.trim, { edges: false });
  archi.position.set(0, 5.7, 4.5);
  g.add(archi);
  const entab = box(11.4, 0.7, 1.5, pal.wall3, { edges: false });
  entab.position.set(0, 6.0, 4.5);
  g.add(entab);
  const ped = gable(11.6, 1.9, 1.5, pal.wall3, {
    edges: true,
    edgeColor: pal.trim,
    edgeOpacity: 0.14,
  });
  ped.position.set(0, 6.7, 4.5);
  g.add(ped);
  const pedOrb = tagBeacon(
    sphere(0.32, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.4 }),
    0.4,
  );
  pedOrb.position.set(0, 7.2, 4.7);
  g.add(pedOrb);
  // grand arched entrance behind the columns
  const ent = doorway(2.6, 3.4, pal.glow);
  ent.position.set(0, 1.1, 3.62);
  g.add(ent);
  // central exchange clock-tower (elegant, stepped) rising behind the pediment
  const tower = box(3.2, 4.4, 3.2, pal.wall2, {
    edges: true,
    edgeColor: pal.trim,
    edgeOpacity: 0.2,
  });
  tower.position.set(0, 6.4, -0.6);
  g.add(tower);
  const tBand = box(3.4, 0.5, 3.4, pal.trim, { edges: false });
  tBand.position.set(0, 6.4, -0.6);
  g.add(tBand);
  const tCorn = box(3.6, 0.6, 3.6, pal.wall3, { edges: false });
  tCorn.position.set(0, 10.8, -0.6);
  g.add(tCorn);
  const clock = cyl(0.85, 0.85, 0.16, pal.column, { seg: 20, edges: false });
  clock.rotation.x = Math.PI / 2;
  clock.position.set(0, 8.7, 1.0);
  g.add(clock);
  const cring = torus(0.9, 0.08, pal.trim, { rseg: 6, tseg: 20 });
  cring.position.set(0, 8.7, 1.0);
  g.add(cring);
  const ch = box(0.07, 0.55, 0.05, pal.ink, { edges: false });
  ch.position.set(0, 8.85, 1.08);
  g.add(ch);
  // cupola + spire + rose beacon
  const cupola = cyl(1.5, 1.9, 1.0, pal.roseDeep, { seg: 8, edges: false });
  cupola.position.set(0, 11.4, -0.6);
  g.add(cupola);
  const spire = cone(1.1, 2.2, pal.roof2, { seg: 8, edges: false });
  spire.position.set(0, 12.4, -0.6);
  g.add(spire);
  const orb = tagBeacon(
    sphere(0.55, pal.rose, { detail: 2, flat: false, emissive: pal.rose, emi: 0.6, rough: 0.5 }),
    0.6,
  );
  orb.position.set(0, 14.9, -0.6);
  g.add(orb);
  const halo = torus(1.0, 0.07, pal.wireGlow, { rseg: 8, tseg: 24 });
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 14.9, -0.6);
  tagBeacon(halo, 0.4);
  g.add(halo);
  // glowing connection cables from the beacon to corner posts (the motif)
  (
    [
      [-5.6, 2.8],
      [5.6, 2.8],
      [-5.6, -3.2],
      [5.6, -3.2],
    ] as [number, number][]
  ).forEach(([px, pz]) => {
    const post = cyl(0.16, 0.2, 4.4, pal.trim, { seg: 8, edges: false });
    post.position.set(px, 1.1, pz);
    g.add(post);
    const knob = tagBeacon(
      sphere(0.22, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.45 }),
      0.45,
    );
    knob.position.set(px, 5.6, pz);
    g.add(knob);
    const a = new T.Vector3(0, 14.6, -0.6),
      b = new T.Vector3(px, 5.6, pz),
      pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(
        new T.Vector3(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 1.6,
          a.z + (b.z - a.z) * t,
        ),
      );
    }
    const cable = new T.Line(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({
        color: new T.Color(pal.roseDeep),
        transparent: true,
        opacity: 0.6,
      }),
    );
    cable.castShadow = false;
    g.add(cable);
  });
  g.userData = { zoneId: "switchboard", labelY: 16.6 };
  return g;
}

/* ---------- THE STUDIO — cinema / broadcast theatre ---------- */
export function studio(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(box(9.6, 0.6, 7.2, pal.baseDk, { edges: false }));
  const hall = box(8.4, 4.8, 6.0, pal.wall, { edges: true, edgeColor: pal.trim, edgeOpacity: 0.2 });
  hall.position.y = 0.6;
  g.add(hall);
  const band = box(8.6, 0.7, 6.2, pal.trim, { edges: false });
  band.position.set(0, 0.6, 0);
  g.add(band);
  // pilasters for rhythm
  [-3.4, -1.7, 1.7, 3.4].forEach((x) => {
    const pil = box(0.5, 4.8, 0.3, pal.wall3, { edges: false });
    pil.position.set(x, 0.6, 3.06);
    g.add(pil);
  });
  const cornice = box(8.8, 0.5, 6.4, pal.wall3, { edges: false });
  cornice.position.set(0, 5.4, 0);
  g.add(cornice);
  // barrel-vault roof sitting on the walls (ridge along x), deep coral, with ribs
  const vault = cyl(3.0, 3.0, 8.8, pal.roof, { seg: 26, edges: false });
  vault.rotation.z = Math.PI / 2;
  vault.position.set(0, 5.4, 0);
  g.add(vault);
  for (let i = -2; i <= 2; i++) {
    const rib = torus(3.02, 0.12, pal.roofDk, { rseg: 6, tseg: 26 });
    rib.rotation.y = Math.PI / 2;
    rib.position.set(i * 2.0, 5.4, 0);
    g.add(rib);
  }
  // projecting marquee canopy over the entrance
  const marq = box(5.2, 0.5, 2.0, pal.roseDeep, { edges: false });
  marq.position.set(0, 3.7, 3.7);
  g.add(marq);
  const marqU = box(4.8, 0.12, 1.8, pal.trim, { edges: false });
  marqU.position.set(0, 3.55, 3.7);
  g.add(marqU);
  for (let i = 0; i < 9; i++) {
    const b = tagBeacon(
      sphere(0.11, pal.glow, { detail: 0, flat: false, emissive: pal.glow, emi: 0.7 }),
      0.7,
    );
    b.position.set(-2.0 + i * 0.5, 3.5, 4.62);
    b.castShadow = false;
    g.add(b);
  }
  const valance = box(5.2, 0.4, 0.12, pal.roof2, { edges: false });
  valance.position.set(0, 3.45, 4.66);
  g.add(valance);
  // vertical blade sign (classic cinema)
  const blade = box(0.7, 3.4, 0.5, pal.roseDeep, { edges: false });
  blade.position.set(0, 4.0, 4.5);
  g.add(blade);
  for (let i = 0; i < 6; i++) {
    const b = tagBeacon(
      sphere(0.1, pal.glow, { detail: 0, flat: false, emissive: pal.glow, emi: 0.7 }),
      0.7,
    );
    b.position.set(0, 4.5 + i * 0.45, 4.78);
    b.castShadow = false;
    g.add(b);
  }
  const bladeTop = tagBeacon(
    sphere(0.3, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.6 }),
    0.6,
  );
  bladeTop.position.set(0, 7.7, 4.5);
  g.add(bladeTop);
  // arched stage window (glass)
  const stage = pane(3.6, 2.4, pal.glass, { emissive: pal.glass, emi: 0.16 });
  stage.position.set(0, 0.7, 3.07);
  g.add(stage);
  const archw = cyl(1.8, 1.8, 0.12, pal.glass, {
    seg: 18,
    edges: false,
    emissive: pal.glass,
    emi: 0.16,
  });
  archw.rotation.x = Math.PI / 2;
  archw.position.set(0, 3.1, 3.07);
  g.add(archw);
  // broadcast antenna + on-air
  const ant = cyl(0.08, 0.1, 2.2, pal.trim, { seg: 6, edges: false });
  ant.position.set(-3.0, 8.4, 0);
  g.add(ant);
  const onair = tagBeacon(
    sphere(0.26, pal.roof, { detail: 1, flat: false, emissive: pal.roof2, emi: 0.7 }),
    0.7,
  );
  onair.position.set(-3.0, 10.7, 0);
  g.add(onair);
  const aring = torus(0.5, 0.05, pal.wireGlow, { rseg: 6, tseg: 18 });
  aring.rotation.x = Math.PI / 2;
  aring.position.set(-3.0, 10.7, 0);
  tagBeacon(aring, 0.4);
  g.add(aring);
  g.userData = { zoneId: "studio", labelY: 9.0 };
  return g;
}

/* ---------- THE LOCKER — document archive / scriptorium ---------- */
export function locker(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(box(6.4, 0.55, 5.0, pal.baseDk, { edges: false }));
  const hall = box(5.6, 4.2, 4.2, pal.wall, { edges: true, edgeColor: pal.trim, edgeOpacity: 0.2 });
  hall.position.y = 0.55;
  g.add(hall);
  const band = box(5.8, 0.6, 4.4, pal.trim, { edges: false });
  band.position.set(0, 0.55, 0);
  g.add(band);
  // facade: four tall document bays (deep lockers) on +z
  [-2.1, -1.05, 1.05, 2.1].forEach((x) => {
    const bay = box(0.92, 2.6, 0.44, pal.wall3, { edges: false });
    bay.position.set(x, 1.3, 2.12);
    g.add(bay);
    const slot = pane(0.62, 1.9, pal.glow, { emissive: pal.glow, emi: 0.4 });
    slot.position.set(x, 1.55, 2.4);
    g.add(slot);
    const handle = box(0.44, 0.1, 0.1, pal.trim, { edges: false });
    handle.position.set(x, 2.2, 2.46);
    g.add(handle);
  });
  // flat cornice + stepped roof + glowing skylight lantern (knowledge within)
  const cornice = box(6.0, 0.5, 4.6, pal.wall3, { edges: false });
  cornice.position.set(0, 4.75, 0);
  g.add(cornice);
  const roof = box(5.0, 0.5, 3.6, pal.roof, { edges: false });
  roof.position.set(0, 5.25, 0);
  g.add(roof);
  const roofTrim = box(5.2, 0.16, 3.8, pal.roofDk, { edges: false });
  roofTrim.position.set(0, 5.25, 0);
  g.add(roofTrim);
  const skyl = box(2.4, 0.9, 1.6, pal.glass, { emissive: pal.glass, emi: 0.2 });
  skyl.position.set(0, 5.75, 0);
  g.add(skyl);
  const skylHat = box(2.8, 0.28, 2.0, pal.trim, { edges: false });
  skylHat.position.set(0, 6.65, 0);
  g.add(skylHat);
  const lanternGlow = tagBeacon(
    sphere(0.3, pal.glow, { detail: 1, flat: false, emissive: pal.glow, emi: 0.6 }),
    0.6,
  );
  lanternGlow.position.set(0, 6.0, 0);
  lanternGlow.castShadow = false;
  g.add(lanternGlow);
  // entrance — a proud central portal
  const portal = box(1.5, 2.7, 0.34, pal.trim, { edges: false });
  portal.position.set(0, 0.55, 2.0);
  g.add(portal);
  const door = pane(1.04, 2.1, pal.roseDeep, {});
  door.position.set(0, 0.55, 2.26);
  g.add(door);
  const warmDoor = pane(0.8, 1.7, pal.glow, { emissive: pal.glow, emi: 0.3 });
  warmDoor.position.set(0, 0.66, 2.34);
  g.add(warmDoor);
  const emblem = cyl(0.42, 0.42, 0.12, pal.rose, {
    seg: 20,
    edges: false,
    emissive: pal.rose,
    emi: 0.16,
  });
  emblem.rotation.x = Math.PI / 2;
  emblem.position.set(0, 4.35, 2.42);
  g.add(emblem);
  g.userData = { zoneId: "locker", labelY: 7.6 };
  return g;
}

/* ---------- THE CLIMB — stepped pyramid temple (the Climber's ascent) ---------- */
export function climb(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(box(7.0, 0.55, 7.0, pal.baseDk, { edges: false }));
  // five ascending terraces — a temple climbed step by step
  const widths = [6.2, 5.2, 4.2, 3.2, 2.2];
  const cols = [pal.wall, pal.wall2, pal.wall, pal.wall2, pal.wall3];
  let y = 0.55;
  const TH = 1.15;
  widths.forEach((w, i) => {
    const tier = box(w, TH, w, cols[i], { edges: true, edgeColor: pal.trim, edgeOpacity: 0.18 });
    tier.position.y = y;
    g.add(tier);
    const band = box(w + 0.18, 0.34, w + 0.18, pal.trim, { edges: false });
    band.position.y = y;
    g.add(band);
    y += TH;
  });
  const topY = y;
  // grand central staircase up the front (plaza-facing +z)
  for (let s = 0; s < 13; s++) {
    const t = s / 12;
    const st = box(2.2, 0.3, 0.52, pal.stone, { edges: false });
    st.position.set(0, 0.55 + t * (topY - 0.55), 3.2 - t * 2.3);
    g.add(st);
  }
  // summit temple (cella) with a glowing doorway
  const cella = box(2.0, 1.5, 2.0, pal.wall3, {
    edges: true,
    edgeColor: pal.trim,
    edgeOpacity: 0.2,
  });
  cella.position.y = topY;
  g.add(cella);
  const lintel = box(2.24, 0.3, 2.24, pal.trim, { edges: false });
  lintel.position.y = topY + 1.5;
  g.add(lintel);
  const cellaRoof = hip(1.7, 1.0, pal.roof, { edges: false });
  cellaRoof.position.y = topY + 1.8;
  g.add(cellaRoof);
  const shrineDoor = pane(0.9, 1.1, pal.glow, { emissive: pal.glow, emi: 0.5 });
  shrineDoor.position.set(0, topY, 1.02);
  g.add(shrineDoor);
  // banner + summit beacon
  const pole = cyl(0.09, 0.11, 2.2, pal.trim, { seg: 8, edges: false });
  pole.position.y = topY + 2.6;
  g.add(pole);
  const flag = cloth(1.3, 0.8, pal.rose, { emissive: pal.rose, emi: 0.12 });
  flag.position.set(0.65, topY + 4.2, 0);
  flag.userData.cloth = true;
  g.add(flag);
  const summit = tagBeacon(
    sphere(0.26, pal.glow, { detail: 1, flat: false, emissive: pal.glow, emi: 0.6 }),
    0.6,
  );
  summit.position.y = topY + 4.8;
  summit.castShadow = false;
  g.add(summit);
  g.userData = { zoneId: "climb", labelY: topY + 5.6 };
  return g;
}

/* ---------- THE LINE — signal office (your direct line to your Plugs) ---------- */
export function line(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  g.add(box(5.0, 0.5, 4.4, pal.baseDk, { edges: false }));
  const hall = box(4.4, 3.6, 3.8, pal.wall, { edges: true, edgeColor: pal.trim, edgeOpacity: 0.2 });
  hall.position.y = 0.5;
  g.add(hall);
  const band = box(4.6, 0.6, 4.0, pal.trim, { edges: false });
  band.position.set(0, 0.5, 0);
  g.add(band);
  const roof = hip(3.4, 1.6, pal.roof, { edges: false });
  roof.position.y = 4.1;
  g.add(roof);
  const finial = sphere(0.18, pal.roseDeep, { detail: 1, flat: false });
  finial.position.y = 5.7;
  g.add(finial);
  // glowing speech-slot window
  const win = pane(2.4, 1.6, pal.glow, { emissive: pal.glow, emi: 0.4 });
  win.position.set(0, 1.2, 1.92);
  g.add(win);
  const sill = box(2.8, 0.22, 0.4, pal.stone, { edges: false });
  sill.position.set(0, 1.1, 2.0);
  g.add(sill);
  const door = pane(1.2, 2.0, pal.roseDeep, {});
  door.position.set(0, 0.5, 1.93);
  g.add(door);
  // tall aerial mast + concentric signal rings broadcasting (the connection motif)
  const mast = cyl(0.12, 0.16, 4.6, pal.trim, { seg: 8, edges: false });
  mast.position.set(0, 4.1, -0.4);
  g.add(mast);
  const tip = tagBeacon(
    sphere(0.26, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.6 }),
    0.6,
  );
  tip.position.set(0, 9.0, -0.4);
  tip.castShadow = false;
  g.add(tip);
  [0.7, 1.2, 1.7].forEach((r, i) => {
    const rg = torus(r, 0.05, pal.wireGlow, { rseg: 6, tseg: 24 });
    rg.rotation.x = Math.PI / 2;
    rg.position.set(0, 8.4, -0.4);
    tagBeacon(rg, 0.45 - i * 0.1);
    g.add(rg);
  });
  // festoon "line" from the mast to a small post
  const post = cyl(0.1, 0.12, 2.2, pal.trim, { seg: 8, edges: false });
  post.position.set(3.2, 0, 1.0);
  g.add(post);
  const knob = tagBeacon(
    sphere(0.16, pal.rose, { detail: 1, flat: false, emissive: pal.rose, emi: 0.45 }),
    0.45,
  );
  knob.position.set(3.2, 2.3, 1.0);
  g.add(knob);
  const a = new T.Vector3(0, 8.6, -0.4),
    b = new T.Vector3(3.2, 2.3, 1.0),
    pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(
      new T.Vector3(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 1.2,
        a.z + (b.z - a.z) * t,
      ),
    );
  }
  const cable = new T.Line(
    new T.BufferGeometry().setFromPoints(pts),
    new T.LineBasicMaterial({ color: new T.Color(pal.roseDeep), transparent: true, opacity: 0.6 }),
  );
  cable.castShadow = false;
  g.add(cable);
  g.userData = { zoneId: "line", labelY: 9.8 };
  return g;
}

/* ---------- THE DORM — cozy home, gable + chimney ---------- */
export function dorm(): THREE.Group {
  const g = new T.Group();
  const pal = P();
  const base = box(5.6, 3.6, 5.0, pal.wall2, {
    edges: true,
    edgeColor: pal.line,
    edgeOpacity: 0.12,
  });
  g.add(base);
  const plinth = box(6.0, 0.4, 5.4, pal.stoneDk, { edges: false });
  plinth.position.y = -0.02;
  g.add(plinth);
  // steep gable roof
  const roof = gable(6.2, 2.6, 5.6, pal.roof, { edges: false });
  roof.position.y = 3.6;
  g.add(roof);
  const ridge = box(6.3, 0.18, 0.18, pal.roofDk, { edges: false });
  ridge.position.set(0, 6.18, 0);
  g.add(ridge);
  // chimney + puff
  const chim = box(0.7, 1.4, 0.7, pal.stoneDk, { edges: false });
  chim.position.set(1.7, 4.4, -0.6);
  g.add(chim);
  const cap = box(0.9, 0.2, 0.9, pal.trim, { edges: false });
  cap.position.set(1.7, 5.8, -0.6);
  g.add(cap);
  // round attic window in gable
  const round = cyl(0.6, 0.6, 0.16, pal.glow, {
    seg: 20,
    edges: false,
    emissive: pal.glow,
    emi: 0.4,
  });
  round.rotation.x = Math.PI / 2;
  round.position.set(0, 4.7, 2.55);
  g.add(round);
  const rtrim = torus(0.62, 0.08, pal.column, { rseg: 6, tseg: 18 });
  rtrim.position.set(0, 4.7, 2.55);
  g.add(rtrim);
  // door + porch lamp
  const door = pane(1.2, 2.0, pal.roseDeep, {});
  door.position.set(0, 0.2, 2.51);
  g.add(door);
  const lamp = tagBeacon(
    sphere(0.14, pal.glow, { detail: 0, flat: false, emissive: pal.glow, emi: 0.6 }),
    0.6,
  );
  lamp.position.set(0.9, 2.4, 2.55);
  lamp.castShadow = false;
  g.add(lamp);
  // two windows + flower boxes
  [-1.5, 1.5].forEach((x) => {
    const w = pane(1.0, 1.1, pal.glass, { emissive: pal.glass, emi: 0.12 });
    w.position.set(x, 1.2, 2.51);
    g.add(w);
    const boxp = box(1.2, 0.3, 0.34, pal.trunk, { edges: false });
    boxp.position.set(x, 0.7, 2.62);
    g.add(boxp);
    [-0.3, 0, 0.3].forEach((fx) => {
      const fl = sphere(0.12, Math.random() > 0.5 ? pal.rose : pal.roof, { detail: 0, flat: true });
      fl.position.set(x + fx, 1.0, 2.66);
      fl.castShadow = false;
      g.add(fl);
    });
  });
  g.userData = { zoneId: "dorm", labelY: 7.2 };
  return g;
}

export const BUILDINGS: Record<string, () => THREE.Group> = {
  square,
  switchboard,
  studio,
  locker,
  climb,
  line,
  dorm,
};
