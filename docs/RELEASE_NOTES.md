OpenEngine 0.5.0 adds a visual UI editor and authored UI runtime, with responsive layouts, Lua events, animation and a playable proximity UI example.

## Downloads

- **OpenEngineStudio-Windows.zip** — extract the whole ZIP and run `OpenEngineStudio.exe`.
- **NeonBorough-Windows.zip** — client and dedicated Server application folders. Start the Server, then the client. Other players join `ws://SERVER-IP:7777/socket`; allow TCP 7777 on the host. No Node.js install needed.
- **NeonBorough-web.zip** — web client and self-contained server. Install Node.js 24 LTS, run `node server.cjs`, visit `http://localhost:7777`.
- **NeonBorough-source.zip** — editable Lua/scene and portable `Neon Borough.openengine` document, including the clinic UI example.
- **Example.Projects.zip** — Dead Signal, Parcel Panic and Neon Borough, with editable source and portable Studio documents.
- **SHA256SUMS.txt** — checksums for those exact filenames. GitHub's Source code downloads contain the full engine.

## Visual UI

UIService now appears in Explorer. The dockable UI tab offers a draggable element palette, responsive dialog preset, move/resize handles, snapping, zoom/pan, keyboard nudging, undo/redo and Desktop/Tablet/Phone previews. Author ScreenGui, Frame, TextLabel, TextButton, ImageLabel and TextInput instances directly in your project.

Responsive layout uses UDim2 parent fractions plus pixel offsets, anchors, size constraints, aspect ratios and row/column flow with padding, gaps, wrapping and flex growth. Properties include typography, colors, borders, clipping, stacking and interaction. Buttons and inputs use native browser focus behavior. Windows and offline web exports include authored UI.

Choose entrance, hover and click animation presets or animate properties with `element:Tween`. Create Lua click/hover/input handlers from Properties. In multiplayer these handlers are LocalScripts; server authority remains behind RemoteEvents.

## Collision transitions and clinic example

`OnCollisionStart` explicitly names the existing `OnCollision` enter event. `OnCollisionEnd` also handles removed/destroyed/rebuilt bodies, and `GetTouchingObjects()` exposes active overlaps. Events are deduplicated per instance pair.

Neon Borough's mint-colored plaza clinic demonstrates an authored responsive panel opening/closing on sensor entry/exit, hover/click events, a tween and a server-validated purchase: restore health for 25 SWAG. It closes on death, character replacement and driving. Earlier project documents and scripted widgets remain compatible.

See `docs/UI_EDITOR.md` in the source for authoring and scripting examples.
