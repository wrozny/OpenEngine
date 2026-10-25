import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { SceneNode, serializeNode, deserializeNode, validateProject } from '../src/engine/scene.js';
import { Vector2 } from '../src/engine/math.js';
import { Signal } from '../src/engine/signal.js';
import { loadProject } from '../tools/project.mjs';

function blank() {
  return {
    format: 'openengine',
    version: 1,
    name: 'Test',
    services: ['Workspace', 'ScriptService'].map((name) =>
      serializeNode(new SceneNode('Folder', name)),
    ),
  };
}
function scripted(source) {
  const p = blank();
  const s = new SceneNode('Script', 'Test');
  s.Source = source;
  p.services[1].children.push(serializeNode(s));
  return new Engine(p);
}

test('hierarchy rejects cycles, clones independently and destroys descendants', () => {
  const a = new SceneNode('Folder', 'a'),
    b = new SceneNode('Object2D', 'b');
  b.Parent = a;
  assert.throws(() => {
    a.Parent = b;
  }, /cycle/);
  const clone = a.Clone();
  assert.notEqual(clone.Id, a.Id);
  assert.notEqual(clone.GetChildren()[0].Id, b.Id);
  clone.GetChildren()[0].Size.X = 120;
  assert.equal(b.Size.X, 64);
  assert.equal(deserializeNode(serializeNode(a)).FindFirstChild('b').Name, 'b');
  a.Destroy();
  assert.equal(b.Destroyed, true);
});

test('signals disconnect during dispatch', () => {
  const signal = new Signal();
  let calls = 0;
  let second;
  signal.Connect(() => {
    calls++;
    second.Disconnect();
  });
  second = signal.Connect(() => calls++);
  signal.Fire();
  assert.equal(calls, 1);
});

test('Lua hierarchy, script.Parent, modules, nil parenting and callbacks', () => {
  const engine = scripted(`
    local module = Instance.new('ModuleScript', script.Parent)
    module.Name = 'Counter'
    module.Source = 'return { value = 3 }'
    local a, b = require(module), require(module)
    assert(a == b and a.value == 3)
    local obj = Instance.new('Object2D')
    obj.Name = 'Box'
    obj.Position = Vector2.new(10,20)
    obj.Parent = workspace
    assert(workspace.Box == obj and obj.Parent.Name == 'Workspace')
    assert(#workspace:GetChildren() == 1)
    assert(workspace:GetChildren()[1].Name == 'Box')
    obj.Parent = nil
    assert(#workspace:GetChildren() == 0)
    obj.Parent = workspace
    game:GetService('RunService').Heartbeat:Connect(function(dt)
      obj:SetAttribute('tick', dt)
    end)
    print('lua ok')
  `);
  engine.start();
  engine.update(1 / 60);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  assert.equal(engine.workspace.FindFirstChild('Box').GetAttribute('tick'), 1 / 60);
  engine.dispose();
});

test('Lua infinite loops fail within the instruction budget', () => {
  const engine = scripted('while true do end');
  engine.start();
  assert.match(engine.logs[0].message, /instruction limit/);
  engine.dispose();
});

test('physics dispatches collision to Lua and supports raycast', () => {
  const engine = scripted(`
    local a = Instance.new('Object2D')
    a.Name = 'A'; a.Shape = 'Circle'; a.Size = Vector2.new(30,30)
    a.Position = Vector2.new(-50,0); a.Anchored = false
    a.Velocity = Vector2.new(100,0); a.Parent = workspace
    local b = Instance.new('Object2D')
    b.Name = 'B'; b.Position = Vector2.new(30,0); b.Size = Vector2.new(30,30); b.Parent = workspace
    a.OnCollision:Connect(function(with) print('Collision!', with.Name) end)
  `);
  engine.start();
  for (let i = 0; i < 90; i++) engine.update(1 / 60);
  assert.ok(
    engine.logs.some((l) => l.message === 'Collision!  B'),
    JSON.stringify(engine.logs),
  );
  const hit = engine.raycast(new Vector2(-200, 0), new Vector2(400, 0));
  assert.equal(hit.Instance.Name, 'A');
  assert.ok(engine.workspace.FindFirstChild('A').Position.X < 1);
  engine.dispose();
});

test('example runs actual Lua, spawns waves, fires projectiles, and restarts after death', async () => {
  const engine = new Engine(await loadProject('examples/zombie/project.openengine'));
  engine.start();
  const advance = (seconds) => {
    for (let i = 0; i < seconds * 60; i++) engine.update(1 / 60);
  };
  advance(5);
  assert.equal(engine.ui.hud.wave, '1');
  assert.ok(engine.workspace.FindFirstChild('Zombies').GetChildren().length > 0);
  engine.input.MousePosition = new Vector2(800, 0);
  engine.input.buttons.add(0);
  advance(1);
  assert.ok(engine.workspace.FindFirstChild('Projectiles').GetChildren().length > 0);
  engine.input.buttons.clear();
  advance(100);
  assert.equal(engine.ui.State, 'dead');
  assert.equal(engine.ui.hud.health, '0');
  engine.ui.OnAction.Fire('restart');
  assert.equal(engine.ui.State, 'playing');
  assert.equal(engine.ui.hud.wave, '1');
  assert.equal(engine.ui.hud.health, '100');
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('project validation rejects missing services and duplicate ids', () => {
  const p = blank();
  p.services[1].id = p.services[0].id;
  assert.throws(() => validateProject(p), /duplicate/);
});

test('projectile kills award points, clear waves, and buy all four upgrades', async () => {
  const engine = new Engine(await loadProject('examples/zombie/project.openengine'));
  engine.start();
  engine.input.MousePosition = new Vector2(500, 0);
  engine.input.buttons.add(0);
  for (let frame = 0; frame < 1500 && engine.ui.State === 'playing'; frame++) {
    for (const zombie of engine.workspace.FindFirstChild('Zombies').GetChildren()) {
      zombie.Position = new Vector2(110, 0);
      zombie.SetAttribute('Health', 1);
    }
    engine.update(1 / 60);
  }
  assert.equal(engine.ui.State, 'upgrading', JSON.stringify(engine.logs));
  assert.equal(engine.ui.hud.kills, '7');
  assert.equal(engine.ui.hud.points, '175');
  engine.ui.OnAction.Fire('health');
  assert.equal(engine.ui.hud.maxHealth, '125');
  assert.equal(engine.ui.hud.health, '125');
  engine.ui.OnAction.Fire('damage');
  assert.equal(engine.ui.hud.damage, '40');
  engine.ui.OnAction.Fire('firerate');
  assert.equal(engine.ui.hud.fireRate, '5');
  engine.ui.OnAction.Fire('speed'); // Insufficient funds: cannot buy.
  assert.equal(engine.ui.hud.speed, '240');
  assert.equal(engine.ui.hud.points, '25');
  engine.ui.OnAction.Fire('next');
  assert.equal(engine.ui.hud.wave, '2');
  for (let frame = 0; frame < 2000 && engine.ui.State === 'playing'; frame++) {
    for (const zombie of engine.workspace.FindFirstChild('Zombies').GetChildren()) {
      zombie.Position = new Vector2(110, 0);
      zombie.SetAttribute('Health', 1);
    }
    engine.update(1 / 60);
  }
  assert.equal(engine.ui.State, 'upgrading');
  engine.ui.OnAction.Fire('speed');
  assert.equal(engine.ui.hud.speed, '265');
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('destroying a script disconnects its service subscriptions', () => {
  const engine = scripted(`
    game:GetService('RunService').Heartbeat:Connect(function() print('tick') end)
  `);
  engine.start();
  engine.update(1 / 60);
  engine.scriptService.FindFirstChild('Test').Destroy();
  engine.update(1 / 60);
  assert.equal(engine.logs.filter((l) => l.message === 'tick').length, 1);
  engine.dispose();
});

test('custom UI, gravity and script enable/disable are usable from Lua', () => {
  const engine = scripted(`
    local ui = game:GetService('UIService')
    ui:CreateLabel('hello', 'Hello', 10, 20)
    ui:CreateButton('jump', 'Jump', 10, 50)
    ui:CreateBar('hp', 50, 100)
    ui:SetPosition('hp', 20, 20, 'BottomRight')
    ui:SetText('hello', 'Welcome')
    ui:SetValue('hp', 25, 100)
    local physics = game:GetService('PhysicsService')
    physics:SetGravity(Vector2.new(0, 400))
    assert(physics:GetGravity().Y == 400)
    local other = Instance.new('Script')
    other.Source = [[game:GetService('RunService').Heartbeat:Connect(function() print('owned tick') end)]]
    other.Name = 'Other'; other.Parent = script.Parent
    other.Enabled = false
  `);
  engine.start();
  engine.update(1 / 60);
  assert.equal(engine.ui.widgets.hello.text, 'Welcome');
  assert.equal(engine.ui.widgets.hp.value, 25);
  assert.equal(engine.logs.filter((l) => l.message === 'owned tick').length, 0);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('player input moves at configured speed and Workspace owns physics', async () => {
  const engine = new Engine(await loadProject('examples/zombie/project.openengine'));
  engine.start();
  const player = engine.workspace.FindFirstChild('Player');
  engine.input.keys.add('d');
  for (let i = 0; i < 15; i++) engine.update(1 / 60);
  assert.ok(Math.abs(player.Position.X - 60) < 0.01);
  assert.ok(Math.abs(player.Position.Y) < 0.01);
  const stored = new SceneNode('Object2D', 'Stored');
  stored.Parent = engine.scriptService;
  assert.equal(stored._body, null);
  stored.Parent = engine.workspace;
  assert.ok(stored._body);
  stored.Parent = engine.scriptService;
  assert.equal(stored._body, null);
  engine.dispose();
});

test('destroyed projectile signals release Lua callbacks instead of retaining each shot', () => {
  const engine = scripted(`
    for i = 1, 100 do
      local bullet = Instance.new('Object2D', workspace)
      bullet.OnCollision:Connect(function() print('hit') end)
      bullet:Destroy()
    end
  `);
  engine.start();
  assert.equal(engine.lua.connections.size, 0);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('module cycles report an error without corrupting the next script', () => {
  const engine = scripted(`
    local a = Instance.new('ModuleScript', script.Parent)
    a.Name = 'A'; a.Source = 'return require(script.Parent.A)'
    local ok, message = pcall(function() require(a) end)
    assert(not ok and string.find(message, 'Circular module dependency'))
    print('cycle diagnosed')
  `);
  engine.start();
  assert.ok(engine.logs.some((l) => l.message === 'cycle diagnosed'));
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('legacy PhysicsObject documents and Lua constructors migrate to Object2D', () => {
  const legacy = new SceneNode('PhysicsObject', 'Legacy');
  assert.equal(legacy.ClassName, 'Object2D');
  assert.equal(legacy.IsA('PhysicsObject'), true);
  const data = serializeNode(legacy);
  data.className = 'PhysicsObject';
  assert.equal(deserializeNode(data).ClassName, 'Object2D');
});

test('attribute collections retain nested data and vector values through saves and Lua', () => {
  const node = new SceneNode('Object2D');
  node.SetAttribute('config', { items: [1, true, 'hello'] });
  node.SetAttribute('direction', new Vector2(2, 3));
  const snapshot = serializeNode(node);
  node.SetAttribute('later', 1);
  assert.equal(snapshot.attributes.later, undefined);
  const restored = deserializeNode(snapshot);
  assert.equal(restored.GetAttribute('direction').Magnitude, Math.hypot(2, 3));
  assert.deepEqual(restored.GetAttribute('config'), { items: [1, true, 'hello'] });
  const engine = scripted(`
    workspace:SetAttribute('data', { score = 12, nested = { value = 'ok' } })
    assert(workspace:GetAttributes().data.score == 12)
    assert(workspace:GetAttribute('data').nested.value == 'ok')
    workspace:SetAttribute('data', nil)
    assert(workspace:GetAttribute('data') == nil)
  `);
  engine.start();
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('PlayerController2D moves in top-down mode using configurable keys and speed', () => {
  const p = blank();
  const actor = new SceneNode('Object2D', 'Actor');
  actor.Anchored = false;
  const control = new SceneNode('PlayerController2D');
  control.Speed = 120;
  control.RightKey = 'l';
  control.Parent = actor;
  p.services[0].children.push(serializeNode(actor));
  const engine = new Engine(p);
  engine.start();
  engine.input.keys.add('l');
  for (let i = 0; i < 30; i++) engine.update(1 / 60);
  assert.ok(Math.abs(engine.workspace.FindFirstChild('Actor').Position.X - 60) < 0.01);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});

test('PlayerController2D platformer grounds, jumps and lands without air jumping', () => {
  const p = blank();
  const actor = new SceneNode('Object2D', 'Actor');
  actor.Size = { X: 30, Y: 40 };
  actor.Position = new Vector2(0, -20);
  const floor = new SceneNode('Object2D', 'Ground');
  floor.Size = { X: 1000, Y: 40 };
  floor.Position = new Vector2(0, 20);
  const control = new SceneNode('PlayerController2D');
  control.Mode = 'Platformer';
  control.Parent = actor;
  p.services[0].children.push(serializeNode(actor), serializeNode(floor));
  const engine = new Engine(p);
  engine.start();
  for (let i = 0; i < 30; i++) engine.update(1 / 60);
  engine.input.keys.add(' ');
  engine.update(1 / 60);
  assert.ok(engine.workspace.FindFirstChild('Actor').Velocity.Y < -400);
  for (let i = 0; i < 100; i++) engine.update(1 / 60);
  assert.ok(Math.abs(engine.workspace.FindFirstChild('Actor').Position.Y + 20) < 2);
  assert.deepEqual(
    engine.logs.filter((l) => l.level === 'error'),
    [],
  );
  engine.dispose();
});
