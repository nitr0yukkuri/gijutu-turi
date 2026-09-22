import { useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { createGoFish } from "../go-fish.js";
import { createK8sFish } from "../k8s-fish.js";
import type { FishSpecies } from "./types";

function Fish({ species }: { species: FishSpecies }) {
  const fish = useMemo(() => species === "k8s" ? createK8sFish({ detail: "low" }) : createGoFish({ detail: "low" }), [species]);
  useEffect(() => () => fish.dispose(), [fish]);
  useFrame(({ clock }) => fish.update(clock.getElapsedTime(), { power: 0.42, glow: 1 }));
  return <primitive object={fish.group} scale={species === "k8s" ? 0.55 : 0.66} rotation={[0, 0.14, 0]} />;
}

export function CollectionFishPreview({ species }: { species: FishSpecies }) {
  return <Canvas camera={{ fov: 33, near: 0.1, far: 80, position: [0.65, 0.12, 10.3] }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); }}>
    <hemisphereLight args={[0xc6e9fb, 0x062441, 1.2]} />
    <directionalLight color={0xa3e6ff} intensity={1.7} position={[-3, 5, 5]} />
    <directionalLight color={0x178cbf} intensity={2.7} position={[2, 3, -5]} />
    <Fish species={species} />
  </Canvas>;
}
