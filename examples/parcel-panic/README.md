# Parcel Panic

A small 3D story game about an extremely questionable first day at an island post office.

## Play

Extract **Example Projects.zip** from the OpenEngine release. In Studio open
**Parcel Panic.openengine** from the Parcel Panic folder, then press Play.
The named document embeds every script and image. No extra downloads are needed.

- WASD: walk; Space: jump.
- Hold right mouse and drag: look around.
- E: interact with the post box or bell, or kick a nearby football.
- R: return to the spawn point.

Collect three parcels, deliver them to the blue post box, score a goal, and ring the
golden bell. Falling off the island returns the player to spawn. Lost footballs are
replaced. Completing the story offers a fresh run.

## Learn from the source

- `scripts/Story.lua` owns task progression, pickups, interactions, recovery and restart.
- `scripts/Mission.lua` is a ModuleScript holding shared mission data.
- The Player's `PlayerController3D` is an editable Lua template with exposed controls.
- Objects demonstrate box, sphere and cylinder physics, tiled procedural materials,
  an embedded football texture, sky settings, and a workspace fallen-object barrier.

In the repository, `project.openengine` references the separate source files. To
package from those files rather than a Studio save:

```sh
npm run package:game -- --project examples/parcel-panic/project.openengine --platform win32
```

`tools/create-story.mjs` regenerates the initial scene; it overwrites that source scene,
so use it only when intentionally editing the generator. Routine Studio edits should
be saved to a separate .openengine document.
