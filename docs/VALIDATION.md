# Validation and platform coverage

This release was developed and verified in the Linux cloud workspace. The production
runtime, editor, game logic, and native export path have been exercised; Windows
executables were cross-packaged, not run on Windows.

## Checks performed

| Check                                                            | Result / scope                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                       | 14 passing tests: hierarchy/clone/destruction, event dispatch, Lua modules/hierarchy/nil parenting, instruction budgets, collision callbacks, raycasts, real zombie game death/restart, projectile rewards and wave upgrades, subscription cleanup, custom UI/gravity, input movement, Workspace physics ownership, module cycles, and native distribution assembly. |
| `npm run test:browser`                                           | 4 passing Chromium integration tests: transforms/undo/redo, Lua editing and Play, portable save/reload, viewport drag, game HUD, actual exported offline game execution, new projects/modules and invalid file handling.                                                                                                                                             |
| `npm run build`                                                  | Production Studio, standalone runtime and offline export template built successfully.                                                                                                                                                                                                                                                                                |
| `node tools/smoke-production.mjs`                                | Production Studio Play and standalone runtime execute under the same CSP as desktop.                                                                                                                                                                                                                                                                                 |
| `npm run desktop:prepare`                                        | Official Linux Electron runtime installed with checksum verification.                                                                                                                                                                                                                                                                                                |
| Headless Electron source startup                                 | Actual desktop Studio loaded, Play executed Lua, and the health HUD appeared.                                                                                                                                                                                                                                                                                        |
| `npm run package:studio -- --platform linux` plus `test:desktop` | Actual packaged Studio opened/saved a project via IPC, played Lua, exported a native game in-app, and that exported game started with its custom bundled project.                                                                                                                                                                                                    |
| Windows game and Studio packaging                                | Both x64 packages produced with their `.exe`, Electron runtime, compiled application, project data where applicable, and license files.                                                                                                                                                                                                                              |
| Offline web packaging                                            | Self-contained ZIP produced; the browser integration test unpacks a generated export and executes its HTML runtime.                                                                                                                                                                                                                                                  |
| `npm run format:check`                                           | Source formatting checked with pinned Prettier.                                                                                                                                                                                                                                                                                                                      |

The native end-to-end smoke test uses the real packaged Linux executables, a sandboxed
renderer/preload, and programmatically selected temporary dialog paths. Its headless
Linux runner passes `--no-sandbox` and `--ozone-platform=headless` only for the test
container. Distributed applications do not set those flags. All temporary test exports
are removed afterwards.

## Reproduce native export validation on Linux

```sh
npm ci
npm run package:studio -- --platform linux
npm run test:desktop -- --executable release/OpenEngineStudio-linux-x64/OpenEngineStudio
```

Production browser validation:

```sh
npx playwright install chromium
npm run test:production
```

## Coverage limits

- Windows binaries are valid cross-packaging outputs; Windows launch, graphics/audio
  device behavior, unsigned-app reputation prompts, and native file dialogs still
  require a Windows machine for platform-specific verification.
- The actual Linux desktop export round-trip is tested, including launching the
  exported game. macOS, ARM64 and signing/notarization are not validated here.
- Chromium tests validate the shared browser runtime. Firefox/Safari, touch/gamepad,
  and accessibility with assistive technology were not tested.
- Physics is provided by Planck. Engine tests cover representative contacts, motion
  and rays, not every possible Box2D configuration.
- The zombie game uses deliberately simple direct-chase AI. Cover can block zombies;
  there is no navigation mesh/pathfinding system.
- No long-duration soak test or formal performance target is claimed.

The GitHub Actions workflow runs formatting, headless tests, production build, browser
integration and offline packaging on future pushes. It has been added to the repository;
no remote CI run or publication is claimed from this workspace.
