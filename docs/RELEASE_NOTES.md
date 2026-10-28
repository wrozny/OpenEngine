OpenEngine 0.7.0 introduces **Tether Run**, an editable multiplayer 2D grapple-platform racing template.

## Play Tether Run

- **TetherRun-Windows.zip**: extract both application folders. Start TetherRunServer, then TetherRun. Other computers join `ws://HOST-IP:7777/socket`. No Node.js installation is needed.
- **TetherRun-web.zip**: install Node.js 24, extract, run `node server.cjs`, open http://localhost:7777.
- **TetherRun-source.zip**: editable Lua, original SVG runner, scene/UI and portable `Tether Run.openengine` document.
- **OpenEngineStudio-Windows.zip**: extract and launch OpenEngineStudio.exe; Tether Run is in the launcher examples.
- **Example.Projects.zip**: all five examples with editable source and portable documents.
- Existing Apex Circuit and Neon Borough builds/source remain available. SHA256SUMS.txt covers the exact published filenames.

## Rooftop grapple racing

Fourteen seeded decks vary in spacing, height and width each round. Hold mouse at a gold anchor to grapple, W/S to reel, A/D to build movement, release to swing onward. Space jumps with coyote time and input buffering; Shift dashes on a cooldown. Mint launch pads, coral hazards and checkpoint recovery add choices to the race.

A six-second countdown starts a 110-second race. The first finisher wins; a seven-second results phase generates the next course. Late joins spectate until the next round. The host controls progression, validates hook range/line of sight and handles hazards/boosts/recovery. Owners predict their movement immediately. This is an arcade template using existing coarse physics guards, not competitive anti-cheat.

The authored HUD uses a flat cream timing strip, ink footer, restrained type and gold/mint/coral cues. The scene, Lua and original runner sprite are editable; no external art dependency. See docs/TETHER_RUN.md.

## Editor additions since 0.6

Explorer searches names/classes while retaining matching ancestors. Save a selected subtree as a reusable project-local template, then click or drag it from Library. Copies receive fresh IDs and remain independent; these are not linked prefabs. Private editor template metadata is omitted from multiplayer client documents.

Rope gameplay uses a distance constraint, without wrapping or a multi-body rope solver. Desktop execution is verified on Linux; Windows builds are cross-packaged.
