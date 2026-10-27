# Engine workflow research and priorities

This is a working comparison, not a claim that OpenEngine matches mature engines. Live retrieval of the official references below was attempted but blocked by the workspace proxy (HTTP 403). The comparison uses established designs; current product details need verification when documentation access is available.

| Reference                                                                                                              | Established strength                                          | OpenEngine opportunity                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Godot scenes and node references](https://docs.godotengine.org/en/stable/tutorials/scripting/scene_unique_nodes.html) | Composable scene trees and intentional node references        | Searchable hierarchy now; reusable scene assets and stable references next                                                                 |
| [Unity prefabs](https://docs.unity3d.com/Manual/Prefabs.html)                                                          | Reusable authored objects with linked instances and overrides | Our Clone is a copy, not a prefab system. Add explicit source links, override inspection and safe updates before calling anything a prefab |
| [Unreal Visual Logger](https://dev.epicgames.com/documentation/en-us/unreal-engine/visual-logger-in-unreal-engine)     | Spatial debugging tied to gameplay history                    | Ray/contact overlays and selected-object velocity/ownership inspection would help debug vehicles and networking                            |

## Improvements worth prioritizing

1. Scene navigation: filter by name/class while retaining ancestor context. Implemented after 0.6.0; Escape clears the filter without changing saved expansion state.
2. Reusable content: project-local prefab files with nested dependencies, cycle detection, explicit overrides, undo and missing-source recovery. Dragging a linked instance must behave differently from cloning.
3. Physics debugging: optional suspension rays, contact normals, center of mass, speed and ownership overlays. Debug drawing should never create collision bodies.
4. Network diagnostics: latency/jitter/loss simulation and server/client state comparison. Current bounded smoothing is not input replay reconciliation; measure correction errors before changing prediction.
5. Faster iteration: script diagnostics linked to instances, breakpoint-like frame stepping, and explicit runtime-to-authoring property transfer. Avoid silently saving Play state.

## Common tradeoffs to avoid

Deep feature sets can obscure basic authoring operations. Keep search, undo, keyboard shortcuts and clear property descriptions available before adding more panels. Reusable-content systems need transparent override rules; networking helpers need visible authority and measurable limits. Automatic behavior that hides those rules can make debugging harder.

This comparison identifies workflow patterns and gaps in OpenEngine, rather than asserting that another engine lacks a feature. Revisit priorities with actual project feedback and accessible primary documentation.

## Project-local reusable templates

Explorer's **Save as reusable template** captures the selected subtree into the project document. **Library** lists it as `Template: name`; click or drag to instantiate a fresh independent copy. Scripts, component tuning, UI and serializable attributes are preserved, with fresh instance IDs. Save/reopen retains the collection. Template editor metadata is stripped from multiplayer client documents so private script content is not exposed through this catalog.

These are deliberately independent copies, not linked prefabs: changes to a source template do not update previous instances. Linked updates/overrides remain future work. UI elements require a selected Frame/ScreenGui as insertion parent.
