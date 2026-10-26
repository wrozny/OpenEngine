OpenEngine 0.3 adds dedicated-server multiplayer and **Neon Borough**, an original online city sandbox.

## Downloads

- **OpenEngineStudio-Windows.zip** — extract the whole ZIP and run `OpenEngineStudio.exe`. No Node.js/Lua install required.
- **Example Projects.zip** — editable sources and portable Studio documents for Dead Signal, Parcel Panic and Neon Borough.
- **NeonBorough-Windows.zip** — separate ready-to-run client and Server application folders. Start the Server, then run the client. Other computers join `ws://SERVER-IP:7777/socket`; allow TCP 7777 through the firewall. Keep each entire application folder together and distribute only the client folder to players.
- **NeonBorough-web.zip** — web client and bundled server. With Node.js 24 LTS installed, run `node server.cjs`, then visit `http://localhost:7777` (or the host IP from another computer).
- **SHA256SUMS.txt** — download checksums. GitHub's Source code downloads contain the complete engine.

## Multiplayer

Enable Multiplayer in the launcher or Project settings. Studio opens a dedicated WebSocket host and one independent client. Add client starts another player; Disconnect/Stop server clean up the session. The server panel shows players, time and logs.

Lua gains ServerScript, LocalScript, Players (session UUIDs, joins/removals, characters), RemoteEvent (client/server messages), RunService side detection and physics ownership. Server scenes replicate at 20 Hz with incremental updates; clients smooth remote transforms and simulate their leased objects. Server teleports override client prediction. Server-only script subtrees are excluded from client documents and builds.

Web exports include a self-contained Node host. Native exports produce separate client and Server applications; the native server has a status window and stop button and needs no Node install. Native and web clients share the same protocol. Use HTTPS/WSS behind a reverse proxy for public web deployments.

## Neon Borough

An original 3D city with roads, buildings, a plaza, pedestrians, three enterable arcade cars and shared shooting/respawning. WASD moves/drives, Space jumps, right drag looks, left click shoots and E enters/exits cars. The host validates combat, tracks takedowns and simulates cars/residents. Sources are separated into shared configuration, server rules and local presentation.

## Scope and validation

The initial multiplayer protocol supports small sessions, not matchmaking, persistent accounts, competitive anti-cheat or lag-compensated combat. Physics ownership is an explicit trust lease with coarse movement bounds. The 32-player cap is not a tested capacity guarantee. See docs/MULTIPLAYER.md for the API, deployment instructions and limits.

Existing 2D/3D single-player games remain supported. Automated verification covers Lua roles, two-client networking, ownership/corrections, source redaction, late joins, combat, respawn, vehicles, browser Studio testing and exported hosting. Windows applications are cross-packaged; native launch tests run on Linux, so Windows-specific verification still requires Windows. Distributions are unsigned.
