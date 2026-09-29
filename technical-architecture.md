# TECHNICAL ARCHITECTURE

Frontend:
Vite + TypeScript + Three.js.
Recommended supporting libraries: Zustand, Zod, Vitest, Playwright.

Backend responsibilities:
authentication, sessions, world validation, mining, inventory, economy, leaderboards and seasons.

Database entities:
User, PlayerProfile, Mine, MineChunk, Excavator, ExcavatorUpgrade, Inventory, Discovery, Session, LeaderboardEntry, Season, RewardClaim.

Use command/event APIs.

Example endpoints:
POST /sessions
POST /sessions/:id/commands
GET /mine/chunks
GET /player
GET /leaderboards
GET /seasons

Version world generation. Never silently alter generation for existing worlds.
