import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

/**
 * Hq3DScene — the heavy WebGL module for the mentor "Headquarters".
 *
 * SLICE 0 SCOPE: a deliberately minimal golden-hour proof-of-life — the island,
 * one low-poly landmark (the Watchtower), warm directional "sun" lighting, and a
 * damped orbit. It exists to prove the SSR-safe lazy pipeline + the build, NOT to
 * be the final art direction (the full seven-building world + verification
 * world-states + fly-in land in Slice 1).
 *
 * This module is the ONLY one that imports three / @react-three/fiber / drei. It
 * is reached EXCLUSIVELY through React.lazy(() => import(...)) inside
 * Hq3DBoundary, so three.js is never evaluated by the Cloudflare Worker SSR
 * build or shipped in the initial client paint. Default export so React.lazy can
 * consume it.
 *
 * Stone-craft palette (locked decision Q1): warm stone walls #E6D6B4, burnt-orange
 * roofs #9A5C2E, gold #D7A248, rose accent #F4B5AA — golden-hour warm, and
 * intentionally distinct from the student "paper town".
 */

const STONE = {
  islandTop: "#8a7a5c",
  islandBase: "#5b4f3a",
  lawn: "#7c8a4a",
  court: "#9a875f",
  wall: "#E6D6B4",
  wallShadow: "#d6c39a",
  roof: "#9A5C2E",
  gold: "#D7A248",
  beacon: "#ffd27a",
} as const;

/** A faceted low-poly material. flatShading is the whole language of the world. */
function stone(color: string, opts?: { roughness?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      roughness={opts?.roughness ?? 0.92}
      metalness={0}
    />
  );
}

/** The rounded island the campus sits on (base plinth + warm lawn + court ring). */
function Island() {
  return (
    <group>
      {/* dark base slab */}
      <mesh position={[0, -1.1, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[26, 27.5, 2, 10]} />
        {stone(STONE.islandBase)}
      </mesh>
      {/* warm lawn disc */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[24.5, 24.5, 0.3, 10]} />
        {stone(STONE.lawn, { roughness: 0.98 })}
      </mesh>
      {/* central cobbled court */}
      <mesh position={[0, 0.22, 0]} receiveShadow>
        <cylinderGeometry args={[6.2, 6.2, 0.16, 24]} />
        {stone(STONE.court)}
      </mesh>
      {/* court inlay ring (gold) */}
      <mesh position={[0, 0.32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.2, 5.7, 32]} />
        <meshStandardMaterial color={STONE.gold} flatShading metalness={0.2} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** The Watchtower — a 4-tier stepped tower with a hip roof + pulsing beacon orb. */
function Watchtower() {
  return (
    <group position={[0, 0.3, 0]}>
      {/* two-tier plinth */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.2, 1, 7.2]} />
        {stone(STONE.islandBase)}
      </mesh>
      {/* tier 1 (colonnaded base) */}
      <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 2.4, 6]} />
        {stone(STONE.wall)}
      </mesh>
      {/* tier 2 */}
      <mesh position={[0, 5.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 3.2, 4.8]} />
        {stone(STONE.wallShadow)}
      </mesh>
      {/* tier 3 (balcony ring) */}
      <mesh position={[0, 7.4, 0]} castShadow>
        <cylinderGeometry args={[3.2, 3.2, 0.5, 8]} />
        {stone(STONE.gold, { roughness: 0.7 })}
      </mesh>
      {/* tier 4 (lantern shaft) */}
      <mesh position={[0, 9.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 3.4, 3.2]} />
        {stone(STONE.wall)}
      </mesh>
      {/* hip roof (4-sided pyramid) */}
      <mesh position={[0, 12.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.0, 2.6, 4]} />
        {stone(STONE.roof, { roughness: 0.85 })}
      </mesh>
      {/* beacon orb */}
      <mesh position={[0, 14.2, 0]}>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial
          color={STONE.beacon}
          emissive={STONE.beacon}
          emissiveIntensity={1.4}
          flatShading
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, 14.2, 0]}
        color={STONE.beacon}
        intensity={6}
        distance={18}
        decay={2}
      />
    </group>
  );
}

export default function Hq3DScene({ reducedMotion = false }: { reducedMotion?: boolean }) {
  // fiber mounts client-only (via the lazy boundary) into an already-laid-out
  // container; react-use-measure can read 0 and miss the initial ResizeObserver
  // callback, leaving the <canvas> stuck at its 300x150 default (invisible) until
  // something fires a resize. Kick one re-measure on the next frame so it sizes to
  // the container. (Caught in the Slice 0 browser walk — compile-clean hid it.)
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, toneMappingExposure: 0.82 }}
      camera={{ position: [27, 20, 43], fov: 33, near: 0.1, far: 500 }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Golden-hour sky shows through the transparent canvas from the CSS hero
          behind it; subtle warm fog gives depth without hiding the gradient. */}
      <fog attach="fog" args={["#d8b884", 70, 220]} />

      {/* Lighting rig — low warm "sun" for long golden-hour shadows + a cool fill. */}
      <hemisphereLight args={["#f3d7a8", "#6b5a3e", 0.55]} />
      <ambientLight color="#ffe9c8" intensity={0.25} />
      <directionalLight
        position={[33, 24, 15]}
        color="#ffc97e"
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
      <directionalLight position={[-22, 16, -12]} color="#bfc9e2" intensity={0.28} />

      <Island />
      <Watchtower />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={22}
        maxDistance={92}
        minPolarAngle={0.35}
        maxPolarAngle={1.32}
        target={[0, 6, 0]}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.18}
      />
    </Canvas>
  );
}
