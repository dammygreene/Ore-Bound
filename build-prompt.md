# BUILD PROMPT
## 2.5D Mining Game

Build a polished browser-based 2.5D underground exploration game for mobile and PC using TypeScript and Three.js.

The core fantasy is: "There could be something valuable anywhere. Where should I dig next?"

The game is an exploration game first. Blockchain and token systems are secondary.

## Non-negotiable rules

DO NOT:
- make deeper terrain automatically mean better rewards
- roll random rewards only when a block is mined
- make expensive excavators guarantee rare loot
- make the game click-to-earn
- render the entire underground world
- trust the client with valuable state
- require blockchain transactions for normal mining
- build desktop controls and retrofit mobile later
- create fake multiplayer

MUST:
- use deterministic world generation
- place resources before discovery
- preserve persistent tunnels
- support mobile and PC from the first playable build
- separate simulation from rendering
- use Three.js for 2.5D rendering
- stream nearby chunks
- support touch, keyboard and mouse
- keep valuable state server-authoritative
- make exploration the primary gameplay mechanic

## Core loop

BUY/EQUIP EXCAVATOR
-> ENTER MINE
-> EXPLORE
-> SCAN
-> DIG
-> DISCOVER
-> MANAGE RISK
-> RETURN
-> SELL/STORE
-> REPAIR/UPGRADE
-> RETURN

## Technology

Recommended:
- Vite
- TypeScript
- Three.js
- Zustand
- Zod
- Vitest
- Playwright
- Howler or Web Audio API
- Rapier only where physics materially improves gameplay

Suggested source structure:

src/
  app/
  game/
  renderer/
  world/
  mining/
  excavators/
  resources/
  hazards/
  scanner/
  inventory/
  economy/
  progression/
  networking/
  audio/
  ui/
  wallet/
  analytics/
  debug/

## Rendering

Use an orthographic Three.js camera.

The simulation is a 2D grid. The renderer presents it as 2.5D using:
- layered geometry
- depth
- lighting
- shadows
- particles
- foreground/background layers
- excavator models
- local lights
- atmospheric effects

The logical world must not depend on Three.js.

## World

Generate the mine from a deterministic seed.

Pipeline:
seed -> geology -> terrain -> caves -> resources -> hazards -> artifacts -> structures

Resources exist before discovery.

Resources include:
- dirt
- rock
- hard rock
- gold veins
- large gold deposits
- diamonds
- rare minerals
- artifacts
- useful materials
- hazards
- special structures

Depth changes atmosphere and geology, not guaranteed reward quality.

## Persistent mine

Each player has a persistent mine.

Persist:
- mined tiles
- tunnel state
- discovered resources
- artifacts
- triggered hazards
- statistics
- deepest point
- total tunnel distance

Use chunk-level persistence.

## Chunk streaming

Only render nearby chunks. Unload distant render objects. Keep logical state server-side or reconstructable from seed plus persistent modifications.

Use instancing and object pooling.

## Mining

Mining should have:
- drill animation
- sound
- dust
- debris
- terrain break
- resource reveal
- camera feedback
- optional haptics

Mining speed depends on terrain hardness and excavator stats.

## Excavators

Classes:
- Starter
- Industrial
- Heavy
- Advanced
- Elite

Stats:
- mining speed
- durability
- fuel
- storage
- scanner range
- scanner accuracy
- armor
- efficiency
- hazard resistance

Upgrades:
- drill
- engine
- storage
- scanner
- armor
- fuel tank
- cooling
- tracks
- explosion protection

Better machines improve efficiency and capability, not guaranteed loot.

## Scanner

Scanner gives directional signals:
- none
- very weak
- weak
- medium
- strong
- very strong

Advanced scanners can reveal categories or hazards.

Avoid exact coordinates unless intentionally unlocked.

## Resources

Gold:
- small vein
- medium vein
- large vein
- massive deposit

Diamonds are very rare and should trigger:
- unique sound
- visual effect
- discovery notification
- record
- optional global feed
- optional share card

Rare discoveries:
- Ancient Chest
- Massive Diamond
- Lost Mining Machine
- Meteor Fragment
- Unknown Crystal
- Ancient Fossil
- Rare Artifact
- Legendary Gold Vein

## Hazards

Include:
- explosive
- landmine
- gas pocket
- unstable rock
- cave collapse
- electrical equipment

Prefer durability damage, fuel loss, movement penalties and repair costs over total destruction.

## Inventory

Cargo is limited and should create risk decisions.

Example:
Gold 14
Diamond 1
Iron 32
Artifacts 2
Capacity 87/100

## Surface

The surface hub contains:
- garage
- refinery
- storage
- repair
- upgrades
- excavator selection
- stats
- leaderboard
- mine entrance

## Economy

Resources can be stored, refined, sold and optionally traded.

Token utility may include:
- excavators
- repairs
- fuel
- upgrades
- scanners
- storage
- special areas
- equipment
- cosmetics
- marketplace fees

Do not force token use into the core mining loop.

## Blockchain

Blockchain is an external ownership/economy layer.

Keep normal mining off-chain.

Use blockchain where appropriate for:
- ownership
- marketplace
- special assets
- token utility
- reward claims

Never trust client-submitted resources, scores or claims.

## Social

Add:
- rare discovery feed
- player profiles
- leaderboards
- mine showcases
- share cards
- seasons

Leaderboard categories can include:
- gold
- diamonds
- rarest discovery
- largest mine
- longest tunnel
- blocks mined
- hazards survived
- largest deposit

## Seasons

Suggested duration: four weeks.

Season content:
- special geology
- events
- challenges
- cosmetics
- mining points
- leaderboard

Do not reset persistent excavator ownership without a strong reason.

## Controls

Mobile:
- virtual movement
- large dig/action button
- scanner
- interact
- inventory
- return to surface

PC:
W/Up = move deeper
A/Left = left
D/Right = right
S/Down = reverse
Space = scanner
E = interact
Shift = boost
Tab = inventory
Esc = pause

Every essential action must work through touch.

## Performance

Target:
- 60 FPS on capable mobile
- stable 30 FPS fallback on weaker devices
- 60 FPS desktop

Use:
- instancing
- pooled particles
- compressed textures
- low-poly assets
- limited dynamic lights
- LOD
- adaptive resolution
- chunk streaming

Quality tiers:
LOW / MEDIUM / HIGH / ULTRA

## Audio

Layers:
- surface ambience
- underground ambience
- engine
- drilling
- rock breaking
- scanner
- hazards
- discoveries
- UI

Rare discoveries should have distinctive audio.

## Development strategy

Build vertical slices.

M0:
renderer, camera, input, debug tools

M1:
excavator, terrain, mining, one resource, surface, return

M2:
deterministic world, chunks, persistence, scanner, caves, gold, diamonds

M3:
fuel, durability, storage, hazards, repairs

M4:
excavator classes, upgrades, progression

M5:
economy

M6:
social

M7:
seasons

M8:
wallet/token/blockchain

M9:
polish, optimization, accessibility, security

Do not build blockchain systems before the core mining loop is fun.

## Agent rules

Before each major feature:
1. inspect the repository
2. read relevant docs
3. implement the smallest vertical slice
4. run tests
5. run the development build
6. test mobile dimensions
7. test desktop
8. fix errors
9. update documentation

Never create fake production functionality. Use isolated mock adapters when an external dependency is unavailable.
