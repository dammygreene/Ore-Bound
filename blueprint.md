# SYSTEM BLUEPRINT

## Architecture

CLIENT
- Three.js renderer
- game simulation
- input
- UI
- audio
- local cache
- wallet adapter

SERVER
- authentication
- session authority
- mine state
- world seed
- mining validation
- inventory
- economy
- leaderboards
- seasons
- reward claims

BLOCKCHAIN
- token
- ownership
- marketplace
- optional seasonal distributions

## Data flow

Input
-> command
-> optional local prediction
-> server validation
-> authoritative result
-> client reconciliation
-> renderer

## Logical world

Grid:
x = horizontal
y = depth

Chunks are addressed by chunkX/chunkY.

Base terrain is generated from seed + chunk coordinates + generation version.

Persistent modifications are stored separately.

## Core services

WorldGenerator
MineRepository
MiningService
ScannerService
InventoryService
EconomyService
LeaderboardService
SeasonService

## State ownership

Client:
- camera
- animations
- input
- UI
- visual effects

Server:
- inventory
- resources
- mine changes
- rewards
- progression
- leaderboards
- season points

## Networking

Send commands rather than entire state.

Examples:
MOVE
MINE_TILE
SCAN
INTERACT
RETURN_SURFACE

## Persistence

Entities:
User
PlayerProfile
Mine
MineChunk
Excavator
ExcavatorUpgrade
Inventory
Discovery
Session
LeaderboardEntry
Season
RewardClaim

## Security

Never accept client values for:
- resource quantity
- reward amount
- mining speed
- score
- claims
- inventory

## Failure handling

Disconnect:
- preserve confirmed state
- reconnect
- reconcile

Server rejection:
- restore valid state
- show concise reason

Asset failure:
- use primitive fallback geometry

## Scaling

Start with one mine per player and limited concurrent sessions, while keeping services separable.
