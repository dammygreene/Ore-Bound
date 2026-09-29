# PERFORMANCE

Targets:
- 60 FPS capable mobile
- stable 30 FPS fallback on weak mobile
- 60 FPS desktop

Use:
- instancing
- batching
- object pools
- compressed textures
- LOD
- chunk streaming
- adaptive render resolution

Avoid many dynamic shadow-casting lights.

Quality tiers:
LOW, MEDIUM, HIGH, ULTRA

Test at:
320px, 375px, 390px, 430px widths.

Expose debug metrics:
FPS, frame time, draw calls, triangles, active chunks, meshes and particles.
