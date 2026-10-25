# Validation and platform coverage — 0.2

Verification was performed in the Linux cloud workspace. Windows executables are
cross-packaged, not launch-tested on Windows.

| Check                                             | Result                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                        | 29 tests passed, with no skips. Covers hierarchy, clone/history, legacy Object2D migration, nested/typed attributes and callbacks, Lua modules/budgets, contacts/rays, 2D and 3D controllers, physics, world bounds, zombie waves/upgrades/death/restart, Parcel Panic tasks/football/respawn/restart, per-face UV repeats, recent-file permissions, and native assembly. |
| `npm run test:browser`                            | All 8 Chromium integration tests passed in one run. Covers explicit startup and missing recents, dragging/attributes/portable save, context insertion and batch deletion, Monaco highlighting/completion/diagnostics/source saving, resized and rearranged panel persistence, actual 3D editing and custom sky upload, and execution of offline 2D/3D exports.            |
| `npm run build`                                   | Production Studio, worker/font assets, game runtime and offline runtime template built.                                                                                                                                                                                                                                                                                   |
| `node tools/smoke-production.mjs`                 | Production launcher, Monaco, Studio Play and standalone runtime ran under desktop CSP.                                                                                                                                                                                                                                                                                    |
| Packaged Linux Studio plus `npm run test:desktop` | Real packaged executables exercised launcher, Monaco, file save/open/recents, 2D/3D Play, in-app native exports, then launched both exported games with their own bundled data.                                                                                                                                                                                           |
| `npm run package:examples`                        | ZIP unpacked and both named project documents validated; editable Lua and embedded artwork verified present.                                                                                                                                                                                                                                                              |
| `npm run format:check`                            | Pinned Prettier checks passed.                                                                                                                                                                                                                                                                                                                                            |

Browser tests use system Chromium when available, otherwise Playwright's installed
Chromium. The headless Linux native runner uses `--ozone-platform=headless`, software
WebGL and `--no-sandbox` for the container only, with temporary writable XDG config/cache
paths. Distributed applications do not force those flags or paths. Temporary exports
and profiles are removed after the native test.

The editor and both games were also visually inspected. Built-in materials, scene
selection and story HUD were checked in rendered screenshots. Idle 3D views invalidate
only when camera, objects, selection, controls, size or textures change.

## Reproduce

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:production
npm run package:examples
npm run package:studio -- --platform linux
npm run test:desktop -- --executable release/OpenEngineStudio-linux-x64/OpenEngineStudio
```

## Limits

- Windows-specific launch, native dialogs, drivers/audio devices and unsigned-app
  reputation prompts require verification on Windows. macOS/ARM/signing are unvalidated.
- Browser tests use Chromium; Firefox/Safari, touch/gamepad and assistive technologies
  are not tested. 3D needs WebGL and a functional graphics driver/software implementation.
- Monaco completion is engine-aware assistance with basic alias/scene inference, not
  a full Lua language server or type checker. Syntax diagnostics compile without running.
- Primitive physics is tested in representative scenarios, not every possible Box2D or
  Cannon configuration. Circular primitives should use matching circular dimensions.
- No long-duration soak test, arbitrary imported-mesh collider support, inherited
  transforms, skeletal animation, networking or formal large-world performance target
  is claimed. Direct-chase zombie AI can be blocked by cover.
- GitHub Actions runs checks/builds after pushes. A locally successful build or pushed
  version tag does not itself prove that the remote release upload completed.
