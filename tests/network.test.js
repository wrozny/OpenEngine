import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { GameServer } from '../src/network/server.js';
import { NetworkClient } from '../src/network/client.js';
import { hostGame } from '../server/host.js';
import { createProject } from '../src/studio/projects.js';
import { SceneNode, serializeNode } from '../src/engine/scene.js';
import { Vector3 } from '../src/engine/math.js';
import { encode, decode, packet } from '../src/network/codec.js';

function fixture() {
  const project = createProject('Network test', '3D', false, false, true);
  const event = new SceneNode('RemoteEvent', 'Message', 'remote');
  project.services[0].children.push(serializeNode(event));
  const script = new SceneNode('ServerScript', 'Server', 'server');
  script.Source = `local players = game:GetService("Players")
local remote = workspace.Message
players.PlayerAdded:Connect(function(player)
    local actor = Instance.new("Object3D")
    actor.Name = player.UserId
    actor.Anchored = false
    actor.Position = Vector3.new(0, 2, 0)
    actor.Parent = workspace
    player:SetCharacter(actor)
    actor:SetNetworkOwner(player)
end)
players.PlayerRemoving:Connect(function(player)
    if player.Character then player.Character:Destroy() end
end)
remote.OnServerEvent:Connect(function(player, amount, vector, ref)
    if type(amount) ~= "number" or amount < 0 or amount > 10 then return end
    player.Character:SetAttribute("Score", amount)
    remote:FireClient(player, vector, ref)
end)`;
  project.services[1].children.push(serializeNode(script));
  const local = new SceneNode('LocalScript', 'Client', 'client');
  local.Source = `local players = game:GetService("Players")
game:GetService("UIService"):CreateLabel("side", tostring(game:GetService("RunService"):IsClient()))
workspace.Message.OnClientEvent:Connect(function(vector, ref)
    workspace:SetAttribute("Reply", vector)
    workspace:SetAttribute("ReplyId", ref.Id)
end)`;
  project.services[1].children.push(serializeNode(local));
  return project;
}
function localClient(server) {
  const inbox = [];
  const connection = server.connect((message) => inbox.push(structuredClone(message)));
  const client = new NetworkClient((message) => connection.receive(message));
  const flush = () => {
    while (inbox.length) client.receive(inbox.shift());
  };
  flush();
  return { client, connection, flush, inbox };
}

test('server/client Lua roles, unique players, replication, private source and targeted remotes', () => {
  const server = new GameServer(fixture());
  const a = localClient(server),
    b = localClient(server);
  a.flush();
  assert.notEqual(a.connection.userId, b.connection.userId);
  assert.equal(server.engine.players.GetPlayers().length, 2);
  assert.equal(a.client.engine.players.GetPlayers().length, 2);
  assert.equal(a.client.engine.ui.widgets.side.text, 'true');
  assert.equal(server.engine.workspace.GetAttribute('Side'), undefined);
  assert.ok(!JSON.stringify(server.clientProject()).includes('amount < 0'));
  const remote =
    a.client.engine.workspace.Message || a.client.engine.workspace.FindFirstChild('Message');
  const actor = a.client.engine.players.LocalPlayer.Character;
  remote.FireServer(4, new Vector3(1, 2, 3), actor);
  a.flush();
  b.flush();
  assert.equal(
    server.engine.players.GetPlayerByUserId(a.connection.userId).Character.GetAttribute('Score'),
    4,
  );
  assert.equal(a.client.engine.workspace.GetAttribute('ReplyId'), actor.Id);
  assert.deepEqual(a.client.engine.workspace.GetAttribute('Reply'), new Vector3(1, 2, 3));
  assert.equal(b.client.engine.workspace.GetAttribute('ReplyId'), undefined);
  assert.equal(
    a.client.engine.players.LocalPlayer.Character,
    actor,
    'reconciliation preserves instance identity',
  );
  assert.equal(server.engine.logs.filter((entry) => entry.level === 'error').length, 0);
  assert.equal(a.client.engine.logs.filter((entry) => entry.level === 'error').length, 0);
  a.connection.close();
  b.flush();
  assert.equal(b.client.engine.players.GetPlayers().length, 1);
  assert.ok(![...server.engine.nodes].some((node) => node.Id === actor.Id));
  a.client.dispose();
  b.client.dispose();
  b.connection.close();
  server.dispose();
});

test('physics updates require ownership, reject invalid teleports, and revoke/disconnect safely', () => {
  const server = new GameServer(fixture());
  const a = localClient(server),
    b = localClient(server);
  const player = server.engine.players.GetPlayerByUserId(a.connection.userId),
    actor = player.Character;
  const movement = (position) => ({
    type: 'physics',
    objects: [
      { id: actor.Id, position, velocity: { X: 0, Y: 0, Z: 0 }, rotation: { X: 0, Y: 0, Z: 0 } },
    ],
  });
  b.connection.receive(movement({ X: 1, Y: 2, Z: 0 }));
  assert.equal(actor.Position.X, 0);
  a.connection.receive(movement({ X: 1, Y: 2, Z: 0 }));
  assert.equal(actor.Position.X, 1);
  a.connection.receive(movement({ X: 1000, Y: 2, Z: 0 }));
  assert.equal(actor.Position.X, 1);
  a.connection.receive(movement({ X: NaN, Y: 2, Z: 0 }));
  assert.equal(actor.Position.X, 1);
  actor.SetNetworkOwner(null);
  a.connection.receive(movement({ X: 2, Y: 2, Z: 0 }));
  assert.equal(actor.Position.X, 1);
  a.connection.close();
  b.connection.close();
  a.client.dispose();
  b.client.dispose();
  server.dispose();
});

test('bounded codec rejects executable/cyclic/prototype payloads and preserves vectors and references', () => {
  const object = new SceneNode('Object3D');
  const nodes = new Map([[object.Id, object]]);
  assert.equal(decode(encode(object), nodes), object);
  assert.deepEqual(decode(encode(new Vector3(1, 2, 3)), nodes), new Vector3(1, 2, 3));
  assert.throws(() => encode(() => {}));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => encode(cyclic));
  assert.throws(() => decode(JSON.parse('{"__proto__": {"bad": true}}'), nodes));
  assert.throws(() => encode(Infinity));
  assert.throws(() => packet({ type: 'remote', args: Array(33).fill(null) }), /32 arguments/);
});

test('real WebSocket host serves web game, replicates two clients, removes disconnects and closes cleanly', async () => {
  const server = await hostGame(fixture(), { html: '<h1>Client</h1>' });
  const sockets = [];
  try {
    assert.match(await (await fetch(`http://127.0.0.1:${server.port}`)).text(), /Client/);
    const connect = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/socket`);
      sockets.push(socket);
      const messages = [];
      socket.on('message', (data) => messages.push(JSON.parse(data)));
      await once(socket, 'open');
      for (let i = 0; i < 100 && !messages.some((m) => m.type === 'snapshot'); i++)
        await new Promise((r) => setTimeout(r, 10));
      assert.ok(messages.some((m) => m.type === 'welcome'));
      return socket;
    };
    const a = await connect();
    await connect();
    assert.equal(server.game.peers.size, 2);
    a.close();
    await once(a, 'close');
    for (let i = 0; i < 100 && server.game.peers.size !== 1; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(server.game.peers.size, 1);
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
});

test('late joins receive dynamic scenes, owner bodies simulate, and server teleports reject stale client state', () => {
  const server = new GameServer(fixture()),
    a = localClient(server);
  const player = server.engine.players.GetPlayerByUserId(a.connection.userId),
    actor = player.Character;
  const localActor = a.client.engine.players.LocalPlayer.Character;
  assert.ok(localActor._body.mass > 0, 'owned client character must be dynamic');
  const prop = new SceneNode('Object3D', 'Spawned');
  prop.Position = new Vector3(5, 2, 0);
  prop.Parent = server.engine.workspace;
  server.sendSnapshot();
  a.flush();
  const localProp = [...a.client.engine.nodes].find((n) => n.Id === prop.Id);
  assert.ok(localProp);
  assert.equal(localProp._body.mass, 0, 'unowned replica must not simulate');
  actor.Position = new Vector3(20, 3, 0);
  server.sendSnapshot();
  a.flush();
  assert.equal(localActor.Position.X, 20);
  a.connection.receive({
    type: 'physics',
    objects: [
      {
        id: actor.Id,
        position: { X: 1, Y: 2, Z: 0 },
        velocity: { X: 0, Y: 0, Z: 0 },
        rotation: { X: 0, Y: 0, Z: 0 },
        epoch: 0,
      },
    ],
  });
  assert.equal(actor.Position.X, 20);
  const b = localClient(server);
  assert.ok([...b.client.engine.nodes].some((n) => n.Id === prop.Id));
  prop.Destroy();
  server.sendSnapshot();
  a.flush();
  b.flush();
  assert.equal(localProp.Destroyed, true);
  a.connection.close();
  b.connection.close();
  a.client.dispose();
  b.client.dispose();
  server.dispose();
});

test('multiplayer starters spawn independent owned characters in both dimensions', () => {
  for (const dimension of ['2D', '3D']) {
    const server = new GameServer(createProject('Starter', dimension, true, false, true));
    const a = localClient(server),
      b = localClient(server);
    a.flush();
    const actor = a.client.engine.players.LocalPlayer.Character;
    const before = actor.Position;
    a.client.engine.input.keys.add('d');
    for (let i = 0; i < 20; i++) {
      a.client.update(1 / 60);
      server.update(1 / 60);
      a.flush();
      b.flush();
    }
    assert.ok(actor.Position.Distance(before) > 0.1);
    assert.equal(server.engine.logs.filter((e) => e.level === 'error').length, 0);
    assert.equal(a.client.engine.logs.filter((e) => e.level === 'error').length, 0);
    a.connection.close();
    b.connection.close();
    a.client.dispose();
    b.client.dispose();
    server.dispose();
  }
});

test('Neon Borough runs multiplayer combat, respawning, pedestrians, car entry/driving/exit and cleanup', async () => {
  const { loadProject } = await import('../tools/project.mjs');
  const server = new GameServer(await loadProject('examples/neon-borough/project.openengine'));
  const a = localClient(server),
    b = localClient(server);
  a.flush();
  const players = server.engine.players.GetPlayers(),
    attacker = players[0],
    victim = players[1];
  const action = (connection, name, ...args) =>
    connection.receive({ type: 'remote', id: 'city-action', args: encode([name, ...args]) });
  const advance = (seconds) => {
    for (let i = 0; i < seconds * 60; i++) {
      server.update(1 / 60);
      a.flush();
      b.flush();
    }
  };
  const pedestrian = server.engine.workspace.FindFirstChild('Pedestrians').GetChildren()[0],
    npcBefore = pedestrian.Position;
  advance(1);
  assert.ok(pedestrian.Position.Distance(npcBefore) > 1);
  attacker.Character.Position = new Vector3(0, 1.5, 10);
  victim.Character.Position = new Vector3(0, 1.5, 0);
  action(a.connection, 'shoot', 123); // Invalid values must not disconnect the combat handler.
  for (let i = 0; i < 4; i++) {
    action(a.connection, 'shoot', new Vector3(0, 0, -1));
    advance(0.3);
  }
  assert.equal(victim.Character.GetAttribute('Health'), 0);
  assert.equal(attacker.Character.GetAttribute('Score'), 1);
  const old = victim.Character;
  advance(4.1);
  assert.notEqual(victim.Character, old);
  assert.equal(victim.Character.GetAttribute('Health'), 100);
  const car = server.engine.workspace.FindFirstChild('Cars').GetChildren()[0];
  attacker.Character.Position = car.Position.Add(new Vector3(3, 0, 0));
  action(a.connection, 'interact');
  advance(0.1);
  assert.equal(car.GetAttribute('Driver'), attacker.UserId);
  assert.equal(attacker.Character.GetNetworkOwner(), null);
  const carBefore = car.Position;
  for (let i = 0; i < 8; i++) {
    action(a.connection, 'drive', 1, 0);
    advance(0.1);
  }
  assert.ok(
    car.Position.Distance(carBefore) > 2,
    JSON.stringify({ before: carBefore, after: car.Position, velocity: car.Velocity }),
  );
  action(a.connection, 'interact');
  advance(0.1);
  assert.equal(car.GetAttribute('Driver'), '');
  assert.equal(attacker.Character.GetNetworkOwner(), attacker);
  assert.equal(attacker.Character.Visible, true);
  assert.deepEqual(
    server.engine.logs.filter((e) => e.level === 'error'),
    [],
  );
  assert.deepEqual(
    a.client.engine.logs.filter((e) => e.level === 'error'),
    [],
  );
  a.connection.close();
  b.connection.close();
  a.client.dispose();
  b.client.dispose();
  server.dispose();
});

test('LocalScript cosmetic instances survive snapshots while deleted server parents clean their children', () => {
  const server = new GameServer(fixture()),
    a = localClient(server);
  const actor = a.client.engine.players.LocalPlayer.Character;
  const cosmetic = new SceneNode('Object3D', 'Client-only visual');
  cosmetic.Sensor = true;
  cosmetic.Parent = actor;
  server.update(0.1);
  a.flush();
  assert.equal(cosmetic.Destroyed, false);
  assert.ok(![...server.engine.nodes].some((n) => n.Id === cosmetic.Id));
  server.engine.players.GetPlayers()[0].Character.Destroy();
  server.sendSnapshot();
  a.flush();
  assert.equal(cosmetic.Destroyed, true);
  a.connection.close();
  a.client.dispose();
  server.dispose();
});

test('LocalScripts in a leased object follow ownership and server attributes reject non-wire data early', () => {
  const server = new GameServer(fixture()),
    a = localClient(server),
    b = localClient(server);
  const actor = server.engine.players.GetPlayers()[0].Character;
  const local = new SceneNode('LocalScript', 'Owned logic');
  local.Source = 'game:GetService("RunService").Heartbeat:Connect(function() end)';
  local.Parent = actor;
  server.sendSnapshot();
  a.flush();
  b.flush();
  const count = (client) =>
    [...client.engine.lua.connections].filter((connection) => connection._owner?.Id === local.Id)
      .length;
  assert.equal(count(a.client), 1);
  assert.equal(count(b.client), 0);
  actor.SetNetworkOwner(null);
  a.flush();
  b.flush();
  assert.equal(count(a.client), 0);
  assert.equal(count(b.client), 0);
  actor.SetNetworkOwner(server.engine.players.GetPlayers()[1]);
  a.flush();
  b.flush();
  assert.equal(count(b.client), 1);
  assert.throws(() => actor.SetAttribute('Callback', () => {}), /attributes/);
  assert.equal(actor.GetAttribute('Callback'), undefined);
  server.sendSnapshot();
  a.connection.close();
  b.connection.close();
  a.client.dispose();
  b.client.dispose();
  server.dispose();
});

test('server gravity replicates to owned client simulations and 2D platformer starters configure both sides', () => {
  const server = new GameServer(createProject('Online platformer', '2D', true, true, true)),
    a = localClient(server);
  assert.ok(Math.abs(server.engine.physicsWorld.getGravity().Y - 980) < 0.001);
  assert.ok(Math.abs(a.client.engine.physicsWorld.getGravity().Y - 980) < 0.001);
  server.engine.physicsWorld.setGravity({ X: 0, Y: 300 });
  server.sendSnapshot();
  a.flush();
  assert.ok(Math.abs(a.client.engine.physicsWorld.getGravity().Y - 300) < 0.001);
  a.connection.close();
  a.client.dispose();
  server.dispose();
});

test('late packets after client disposal cannot restart Lua or resurrect a closed session', () => {
  const server = new GameServer(fixture()),
    a = localClient(server);
  const engine = a.client.engine;
  a.client.dispose();
  a.client.receive({
    type: 'welcome',
    userId: a.connection.userId,
    project: server.clientProject(),
  });
  a.client.receive(server.snapshot());
  a.client.update(1 / 20);
  assert.equal(a.client.engine, engine);
  assert.equal(engine.disposed, true);
  assert.equal(engine.running, false);
  assert.equal(engine.nodes.size, 1);
  a.connection.close();
  server.dispose();
});
