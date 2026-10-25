OpenEngine 0.2 adds a 3D runtime and a redesigned authoring workflow.

## Downloads

- **OpenEngineStudio-Windows.zip**: extract into a folder and run **OpenEngineStudio.exe**.
  Keep all runtime files together. No Node.js or Lua installation is required.
- **Example Projects.zip**: extract, then open **Dead Signal/Dead Signal.openengine**
  or **Parcel Panic/Parcel Panic.openengine** in Studio. Both folders also include
  editable Lua source, scene data and artwork.
- **SHA256SUMS.txt**: checksums of both ZIPs.
- GitHub's **Source code** links contain the entire engine at this release tag.

## New in 0.2

- An explicit project launcher with 2D/3D creation, recent files, missing-file indicators,
  and removable history entries. Examples open only when selected.
- Neutral Studio styling, Lucide icons, draggable/dockable Golden Layout panels,
  persistent panel sizes and placement, and a layout reset.
- Context menus, multi-selection, undoable batch deletion/duplication, 2D movement,
  and 3D move/rotate/scale gizmos with editor camera navigation.
- Microsoft's Monaco editor with Lua coloring, engine-aware completions, signature help,
  hover documentation and compile-only syntax diagnostics.
- Object2D naming, compatibility with PhysicsObject projects, editable data attributes,
  and GetAttributes().
- Editable Lua PlayerController2D and PlayerController3D templates: top-down and
  platformer movement, grounded jumping, and free-camera flight.
- Three.js rendering and Cannon physics for Object3D boxes, spheres and cylinders,
  tiled materials/textures, an image-based sky and configurable fallen-object cleanup.
- Parcel Panic: collect and deliver parcels, kick a physical football into a goal,
  and ring a bell; lost players/balls recover and the story can restart.

The Windows distribution is unsigned and cross-packaged. Shared runtime and native
export behavior are validated on Linux; Windows-specific launch verification still
requires Windows. 3D rendering requires a WebGL-capable machine. This is a local,
single-player engine, with no Roblox compatibility or networking promise.
