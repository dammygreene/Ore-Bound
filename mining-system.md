# MINING SYSTEM

States:
IDLE -> AIMING -> DRILLING -> BREAKING -> REVEAL -> COLLECT -> COOLDOWN

Mining time depends on terrain hardness and excavator stats.

Terrain defines:
- hardness
- material
- audio
- debris
- possible contents

When terrain is removed:
- reveal actual pre-generated state
- update tunnel
- update stats
- trigger effects

Server validates player position, target, tool, cooldown, durability and fuel.

Mining should feel responsive. Rare discoveries can briefly slow down for emphasis.
