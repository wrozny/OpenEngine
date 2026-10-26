OpenEngine 0.4 improves character traversal and Neon Borough, with server-authoritative swag displayed above player heads.

## Downloads

- **OpenEngineStudio-Windows.zip** — extract the whole ZIP and run `OpenEngineStudio.exe`.
- **NeonBorough-Windows.zip** — ready-to-run client and Server application folders. Start the Server, then the client. Other players join `ws://SERVER-IP:7777/socket`; allow TCP 7777 through the host firewall. Keep each application folder intact. No Node.js install is needed.
- **NeonBorough-web.zip** — web client and self-contained server. With Node.js 24 LTS installed, run `node server.cjs`, then visit `http://localhost:7777` or the host IP.
- **NeonBorough-source.zip** — the game's editable Lua, source scene and portable `Neon Borough.openengine` Studio document.
- **Example.Projects.zip** — all three editable examples and portable Studio documents.
- **SHA256SUMS.txt** — checksums use the exact published filenames. GitHub's Source code ZIP/tarballs include the full engine.

## Traversal

- Default 3D controllers and 2D platformer controllers follow walkable slopes and step over low curbs without jumping.
- Editable StepHeight and MaxSlopeAngle settings, multiple foot probes, diagonal corner detection, headroom/destination clearance, and steep-ramp rejection.
- A real Wedge primitive with shared rendering/convex collision geometry, raycasting and tiled materials. The ramp rises toward local +Z.
- Exact untouched older default controller scripts upgrade automatically; custom Lua stays intact.
- Reusable PhysicsService.GetGround / MoveCharacter helpers and a post-physics PostSimulation event.

## Neon Borough

- Sidewalk height reduced from 0.30 m to 0.12 m. Cars and residents use the traversal helper; cars cross the city's intersection curbs.
- Gradual acceleration, braking and low-speed steering; wheels/cabins and passengers follow after physics. Wheel placement now matches the chassis ground clearance.
- Residents award **10 swag** and player takedowns award **50 swag**, decided by the host exactly once per kill. Swag and takedowns survive character respawns during the same connection; reconnecting starts a new session.
- Player names and swag appear above heads for every client, with wall occlusion and range/visibility limits. HUD swag, confirmed-hit feedback and a shared takedown feed are included.
- Fast server-controlled vehicle impacts can defeat residents/players and earn swag. Cars brake on stale input. Lost/destroyed residents recover and stuck walkers turn around.
- Spawn slots use a grid, and character facing follows aim. Private vehicle/resident logic is separated into server-only modules.
- Empty labels no longer leave blank HUD boxes, and unchanged UI text/colors avoid needless DOM rebuilding.

Validated with automated traversal, ceiling/wall/steep-ramp rejection, diagonal approaches, physics, networked rewards/respawns, real city curb crossing, vehicle impacts, world-label visibility, Studio editing and rendered multiplayer gameplay checks. Windows builds are cross-packaged; native execution is tested on Linux, so Windows-specific launch verification still needs Windows. Use matching 0.4 clients/servers. Public web hosting requires a running Node host and TLS/WSS behind a reverse proxy. This remains an initial small-session multiplayer engine, without account persistence, competitive anti-cheat or matchmaking.
