OpenEngine 0.6.0 adds editor comfort tools, native raycast cars, improved multiplayer presentation and Apex Circuit racing.

## Downloads

- **OpenEngineStudio-Windows.zip**: extract the entire ZIP, run OpenEngineStudio.exe.
- **ApexCircuit-Windows.zip**: racing client and dedicated Server application folders. Start the Server, then the client; use ws://HOST-IP:7777/socket on other machines.
- **ApexCircuit-web.zip**: web client and headless server. With Node.js 24, run `node server.cjs`, then open http://localhost:7777.
- **ApexCircuit-source.zip**: editable racing source, portable Studio document, Lua reference and vehicle documentation.
- **Example.Projects.zip**: all four portable example projects and source folders.
- **NeonBorough-Windows.zip**, **NeonBorough-web.zip**, **NeonBorough-source.zip**: updated city builds and source.
- **SHA256SUMS.txt**: checksums for the published downloads.

## Editor

Right-click Rename, F2 and inline editing improve Explorer naming. Properties has a persistent search field with Escape to clear. Library searches and inserts/drags objects, native car components, layout/style modifiers and behavior snippets. Lua hints deduplicate identifiers, suppress repeated word suggestions and describe methods and inferred component properties/defaults.

UIListLayout and UIGridLayout arrange siblings; UICorner and UIPadding modify parent appearance/layout. They serialize as child instances and are editable from Properties and the UI palette.

## Physics and networking

Car3D uses Cannon's four-wheel RaycastVehicle for suspension, damping, traction, rear-wheel drive, braking and speed-sensitive steering. Car2D is a side-view two-ray suspension car with drive/lean controls. Components expose bounded SetInput, Speed and GetWheelPosition. Physical objects gain ApplyImpulse. See docs/VEHICLES.md for tuning and conventions.

Remote rendering buffers snapshots for 100 ms and extrapolates velocity for at most 150 ms during gaps. Small owner corrections ease visually while query bodies remain authoritative. Large teleports snap. This is bounded presentation smoothing with existing owner physics prediction, not input-history rollback or competitive anti-cheat.

## Apex Circuit

A multiplayer circuit with rolling terrain, a countdown, ordered checkpoints, first-finisher results, server-validated recovery and round resets. Cars simulate on their owners for immediate controls; the host decides progression/winners. A solo driver can practice; late joins spectate until the next round. WASD drives, Space brakes, R recovers.

Windows applications are cross-packaged in Linux. Car2D is side-view, not a top-down kart. Network leases retain coarse movement guards; competitive anti-cheat and advanced tire/visual animation are outside this release.
