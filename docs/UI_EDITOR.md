# Visual UI authoring

For all Lua APIs, exact defaults and complete scripting recipes in one file, see [LUA_REFERENCE.md](LUA_REFERENCE.md).

UIService is a real service in Explorer in both 2D and 3D projects. Existing version 1 projects gain this service automatically when opened; their existing scripted widgets continue to work.

## Build your first interface

1. Select **UIService** in Explorer. Studio opens the **UI** tab.
2. Click **Responsive dialog** for an editable starting point, or add **ScreenGui**, then drag **Frame**, **TextLabel**, **TextButton**, **ImageLabel** or **TextInput** from the palette onto the canvas. Selecting a Frame makes it the insertion parent; otherwise elements go into a ScreenGui.
3. Drag an element to move it. Drag a corner handle to resize. Enable **Snap 8** for a regular pixel grid. Each drag is one undoable edit. Arrow keys nudge by one pixel; Shift+arrows move ten. Ctrl/Cmd+D duplicates; Delete removes.
4. Use the mouse wheel to zoom around the cursor; middle drag pans. **Fit** frames the artboard. **Center** sets a centered position and anchor; **Fill** stretches to the parent.
5. Change properties in the Properties panel. Explorer controls nesting and sibling order. Scripts and modules can live under UI instances.
6. Switch between Desktop, Tablet and Phone to check the same document at different sizes. **Play** tests native controls and Lua events; Save keeps UI in the portable project document. Windows and offline web exports include the interface.

## Responsive layout

`Position` and `Size` use `UDim2`: parent fractions plus pixel offsets. For example `UDim2.new(1, -48, 0, 300)` means the parent's full width minus 48 pixels, and a height of 300 pixels. `UDim2.new(0.5, 0, 0.5, 0)` positions at the parent's center. `AnchorPoint = Vector2.new(0.5, 0.5)` makes the element's center its positioning pivot.

- **Responsive** ScreenGui fills the current viewport; parent fractions adapt as it changes.
- **Fit** uses DesignWidth/DesignHeight as a design artboard and scales it uniformly to fit the viewport, preserving proportions.
- **MinSize / MaxSize** constrain dimensions in design pixels; a zero maximum is unbounded. **AspectRatio** preserves width/height when positive.
- Frame **Layout** can be Absolute, Row or Column. Row/Column lays out children in hierarchy order using Padding, Gap, Align and Justify. Positive FlexGrow distributes remaining main-axis space. Row **Wrap** starts new lines when needed. Hidden children leave the flow. Dragging a flow child reorders it; Position applies to absolute layouts.
- Use a responsive outer frame with a maximum width, and flow layouts inside, for panels that work on a phone and a desktop. The dialog preset demonstrates this.
- **ClipChildren**, **ZIndex** and ScreenGui **DisplayOrder** control clipping and stacking. Enabled hides a ScreenGui at runtime; Studio still shows the selected disabled screen for editing.

There are no implicit content breakpoints or automatic text-size changes. Check each target size and use fractions, constraints, wrapping or Fit deliberately. Touch controls, text inputs and keyboard-focusable buttons use browser-native UI behavior; game movement keys belong to the game canvas, so focus the canvas to resume movement after typing.

## Events and animation

Use the Properties panel's **Add OnClick/OnHoverStart/OnHoverEnd/OnValueChanged handler** buttons to create a Script for a single-player project or a LocalScript for multiplayer. Select the generated child in Explorer to edit it in the Script tab.

```lua
local button = script.Parent

button.OnClick:Connect(function()
    print("Clicked", button.Name)
end)

button.OnHoverStart:Connect(function()
    button:Tween({BackgroundColor = "#609ce8"}, 0.15, "OutCubic")
end)
button.OnHoverEnd:Connect(function()
    button:Tween({BackgroundColor = "#4777c3"}, 0.15, "OutCubic")
end)
```

EnterEffect presets: None, Fade, SlideUp, Pop. HoverEffect: None, Grow, Lift, Glow. ClickEffect: None, Press, Pulse. These work without a script. Disabled prevents interaction. Interactable lets a Frame receive pointer events or intercept clicks behind a modal. Events also make their element interactive automatically.

`element:Tween(goals, duration, easing)` supports Position, Size, AnchorPoint, Opacity, BackgroundOpacity, BackgroundColor, TextColor, BorderColor, CornerRadius, BorderWidth and TextSize. Color goals use `#RRGGBB`. Easing: Linear, OutQuad, OutCubic, InOutCubic, OutBack. Duration is seconds.

```lua
local panel = script.Parent
local tween = panel:Tween({Opacity = 1, Position = UDim2.new(0.5, 0, 0.5, 0)}, 0.3)
tween.Completed:Connect(function(completed)
    print("Finished", completed) -- false if cancelled
end)
-- tween:Cancel()
```

A new tween that touches an already animated property cancels the previous tween on that element. Destroying its target or owner script cancels it and removes subscriptions. Tweens advance with simulation time. UI in multiplayer belongs in LocalScripts; use RemoteEvents for requests and validate rewards/costs on the server.

## Proximity UI and collision transitions

`OnCollisionStart` is the explicit name for the existing `OnCollision` enter signal. They are aliases; subscribe to one. `OnCollisionEnd` fires when an overlapping pair separates, or when a body is removed, rebuilt, reparented out of Workspace, or destroyed. Remaining instances receive the removed instance as the argument. `GetTouchingObjects()` returns current touching instances. Multiple fixtures produce one start/end pair per instance overlap.

```lua
local screen = game:GetService("UIService").Shop
local player = game:GetService("Players").LocalPlayer
local zone = workspace.ShopZone -- Sensor = true

zone.OnCollisionStart:Connect(function(other)
    if other == player.Character then screen.Enabled = true end
end)
zone.OnCollisionEnd:Connect(function(other)
    if other == player.Character then screen.Enabled = false end
end)
```

Neon Borough's mint-colored clinic marker at the plaza demonstrates a responsive panel, collision start/end, button click/hover, tweens, and a server-validated treatment purchase. Its LocalScript lives at UIService → Clinic → Clinic UI. Treatment costs 25 SWAG; the server checks proximity, health, balance and driving state before charging. The example also closes when a character dies or is replaced.
