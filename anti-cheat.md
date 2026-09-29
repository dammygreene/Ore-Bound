# ANTI-CHEAT

Assume the client is modified.

Threats:
- speed hacks
- instant mining
- fake coordinates
- fake rewards
- duplicate claims
- inventory tampering
- fake scores
- replay attacks

Server validates movement, mining cooldown, excavator stats, terrain hardness, fuel, durability, resources and inventory capacity.

Use idempotency keys for claims and purchases.

Only server-generated events count for leaderboards.
