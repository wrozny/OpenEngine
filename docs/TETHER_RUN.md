# Tether Run

An editable multiplayer 2D grapple-platform racing template. Choose **Tether Run — multiplayer grapple race** under New project → Project template, or open **Tether Run** in Studio's examples, press Play, then Add client to race locally. A solo runner can practice. Windows builds contain separate client/server applications; web exports include a Node.js 24 server (`node server.cjs`).

## Controls

A/D runs; Space jumps, including a short coyote-time/jump-buffer window. Aim at a gold overhead anchor and hold left mouse to tether. W/S reels the rope in/out; release the mouse to let go. Shift dashes with a two-second cooldown. R returns to the current checkpoint. Mint pads launch you; coral live wires and falls trigger recovery. Reach the white finish marker before everyone else.

## Rounds and courses

Six-second countdown, up to 110 seconds of racing, seven-second results. The next round receives a new deterministic seed and fresh terrain. Fourteen decks form a continuous reachable spine, each with an overhead hook anchor. Deck heights/widths vary within bounded ranges. Late joins spectate until the next countdown. Checkpoints retain your progress after falls. The HUD shows deck progress, recoveries, dash readiness, course seed and phase.

The cream timing strip, monospaced course notation, flat ink footer and limited gold/mint/coral colors are authored UI instances under UIService/RaceHUD. Edit their typography/layout directly in Studio. The runner sprite is original embedded SVG artwork; no external art service or dependency is required.

## Source structure

- `Course.lua`: shared deterministic seeded layout generator. Bounds ensure platforms remain within the intended jump/grapple envelope.
- `Server.lua`: terrain generation, player lifecycle, round progression, checkpoint/winner rules, boost/hazard recovery and hook range/line-of-sight validation.
- `Client.lua`: immediately responsive owned movement, swing/reel constraint, jump buffering, dash, local rope visualization and HUD.
- `tools/create-tether.mjs`: regenerates the source scene and UI; portable documents embed scripts/art when packaged.

Movement is client-owned physics under the engine's existing bounds. The host validates hook requests and game progression, but this is an arcade template, not a competitive anti-cheat implementation. Rope simulation is an explicit distance constraint, not a multi-body rope with wrapping or breakable joints. Reeling and map difficulty are tunable Lua values. Generated courses are constrained variations, not a guarantee that every arbitrary generator edit stays playable.

The source scene intentionally generates its course when Play starts. Edit Course.lua to tune the procedural layout, rather than editing a baked platform set. Authoring changes never affect an already running round. Checkpoints and wins last for the current server connection; there is no persistent account leaderboard.
