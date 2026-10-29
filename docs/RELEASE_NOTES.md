OpenEngine 0.7.1 makes **Tether Run** courses more varied and fixes authored UI in single-file web exports.

## Tether Run course update

Courses now draw 14–18 decks from five shuffled district types: stair climbs, wide skyline gaps, elevated express routes, alternating switchyards and launch-pad districts. Additional grapple relays, lower service steps and upper bypasses offer different lines through a course. Pulse gates alternate between live coral and safe green; the finish deck stays clear.

Each server starts with a fresh random seed. Later rounds advance the seed; a given seed reproduces its layout. District palettes, facade windows, anchor heights, spacing, widths and course length vary. The HUD shows the current district and actual deck count. Late joins have an explicit spectating label, and remote tethers clear when racing stops.

## Web UI fix

Single-file exports now embed the UI stylesheet extracted by the bundler. This restores the positioning and styling of authored UI in web builds, including Tether Run's timing header and control footer. The fix applies to all engine projects using authored UI. Re-export older games from this Studio version to include it.

## Downloads

- **TetherRun-Windows.zip**: extract both folders, start TetherRunServer, then TetherRun. LAN clients join `ws://HOST-IP:7777/socket`. No Node.js installation needed.
- **TetherRun-web.zip**: install Node.js 24, extract, run `node server.cjs`, open http://localhost:7777.
- **TetherRun-source.zip**: editable Lua, artwork, scene/UI and portable project.
- **OpenEngineStudio-Windows.zip**: updated Studio with the template and export fix.
- **Example.Projects.zip**: all example projects. Apex Circuit and Neon Borough builds remain available.

Validation includes 73 unit tests, 64 course seeds, two focused Studio browser tests, and two clients joining the extracted web ZIP with checks of the HUD's real CSS and geometry. Release publication also runs the web ZIP smoke check. Windows applications are cross-packaged; native Windows execution is not claimed.
