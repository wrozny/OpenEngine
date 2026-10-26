# Neon Borough

An original online city sandbox for OpenEngine 0.4: walking, jumping, shared shooting, eight pedestrians and three enterable arcade cars. No franchise artwork or third-party game assets are used.

Open **Neon Borough** from Studio's examples, press **Play**, then **Add client** to test with another player. Each canvas has separate input focus. WASD moves, Space jumps, right drag looks, left click shoots, and E enters/exits a nearby car. In a car WASD drives and steers. Shooting and cars are validated/simulated by the host. Players respawn in four seconds; pedestrians recover in eight.

The named `Neon Borough.openengine` in the release's Example Projects ZIP embeds all source. This source folder's `project.openengine` references the Lua files beside it; use the repository CLI to build it directly:

```sh
npm run package:game -- --project examples/neon-borough/project.openengine --platform web
npm run package:game -- --project examples/neon-borough/project.openengine --platform win32
```

Web: extract, install Node.js 24 LTS, run `node server.cjs`, then open `http://localhost:7777`. Other players use the server's IP. Windows: run the Server application, then the separate client application; join `ws://SERVER-IP:7777/socket`. Keep each distribution folder intact. See [multiplayer documentation](../../docs/MULTIPLAYER.md) for deployment, API examples and current limits.

- `scripts/Config.lua`: shared tuning.
- `scripts/Server.lua`: lifecycle, combat, cars and residents.
- `scripts/Client.lua`: local input, UI and camera.
- `tools/create-city.mjs` (repository): reproducible scene authoring.

## 0.4 gameplay update

Characters step over low edges and walk up ramps automatically. Sidewalks are lower, and cars cross curbs using the same traversal helper. Cars accelerate/brake gradually, and their details follow the chassis after physics.

Defeating a resident earns 10 **swag**; defeating a player earns 50. The server tracks it, shows it above each player's head, and preserves it along with takedowns after respawn. Reconnecting creates a fresh session. Fast vehicle impacts also count as takedowns. Confirmed hits flash the crosshair and play a hit sound. Residents recover if lost and turn away when blocked.

`Vehicles.lua` and `Residents.lua` are private modules under the server script. `SwagLabels.lua` creates local overhead UI from replicated attributes. Shared tuning, including rewards and vehicle handling, lives in `Config.lua`.

Release downloads include **NeonBorough-Windows.zip**, **NeonBorough-web.zip**, and a dedicated **NeonBorough-source.zip**. The source ZIP contains editable scripts and the portable Studio document; it does not require a compiled game installation. Read the [engine multiplayer guide](https://github.com/wrozny/OpenEngine/blob/main/docs/MULTIPLAYER.md) for hosting and API details.
