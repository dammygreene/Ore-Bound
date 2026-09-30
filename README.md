# Ore Bound

Ore Bound is a playable **3D underground exploration game** built with TypeScript, Vite and Three.js.

The game keeps a deterministic grid/chunk simulation internally, but presents it as a stylized low-poly 3D mining world: a heavy excavator, a surface garage, headlights, tunnel walls, ceilings, fog, cave pockets, props, scanner pulses, drilling particles and cinematic discovery effects.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL. In Arena, use the live preview.

## Build and test

```bash
npm test
npm run build
```

## Controls

- **WASD / arrows**: drive through open tunnels or begin drilling adjacent solid terrain
- **Space**: drill the wall currently faced
- **E**: interact with garage stations on the surface; drill underground
- **Shift / C**: scanner pulse
- **R**: return to the surface garage
- **G / Tab**: command tablet with inventory, discoveries, stats, garage and upgrades
- Touch/mobile: floating joystick plus Drill, Scan, Boost and Return controls

## Implemented vertical slice

- Perspective third-person Three.js camera with follow lag and shake
- Upgraded stylized 3D excavator model with rounded tracks, sprockets, cabin windows, fuel tank, exhaust, roof beacon, hydraulic drill arm, spinning multi-part drill bit and headlights
- Reusable stylized visual kit with rounded/beveled geometry, chunky rocks, mineral shards and clean game materials
- 3D tunnel conversion from deterministic grid cells: rounded floor slabs, beveled rock walls, ceilings, cave spaces and solid drill faces
- Surface garage scene with repair/fuel/storage stations, lights, crates, machinery silhouettes and tunnel portal
- Dynamic underground lighting, shadows on higher quality tiers, fog and headlight falloff
- Procedural environment props: rails, supports, pipes, cables, rubble, rocks, barrels, crystals and reflective diamond wall fragments
- Drilling event visuals: drill animation, rock face cracks, dust, debris, sparks, temporary drill light and camera vibration
- Scanner pulse visuals in the 3D world with expanding sonar rings and directional indicator
- Resource discovery effects for gold, diamonds, rare minerals and artifacts
- Deterministic seeded world/chunk generation with pre-placed hidden resources and hazards
- Persistent mined tunnels, cargo, discoveries, upgrades and player state in `localStorage`
- Fuel, durability, cargo, selling, repairs and upgrades
- Minimal HUD that keeps the world dominant, with detailed info in the command tablet
- Responsive mobile/PC controls and accessibility-friendly options
- Vitest coverage for deterministic generation and scanner behavior

Blockchain/token systems are intentionally not implemented yet, matching the docs' instruction to make the mining loop genuinely playable first.
