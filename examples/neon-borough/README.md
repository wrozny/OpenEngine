# Neon Borough

An original online city sandbox for OpenEngine 0.3: walking, jumping, shared shooting, eight pedestrians and three enterable arcade cars. No franchise artwork or third-party game assets are used.

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
