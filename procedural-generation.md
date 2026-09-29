# PROCEDURAL GENERATION

World generation must be deterministic, versioned and testable.

Inputs:
seed
chunkX
chunkY
generationVersion

Output:
terrain, resources, hazards and structures.

Use a stable seeded PRNG, never Math.random for world-critical generation.

Same inputs must always produce the same output.

Provide debug/test seeds for guaranteed resources and hazards.
