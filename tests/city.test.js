import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../src/network/server.js';
import { NetworkClient } from '../src/network/client.js';
import { Vector3 } from '../src/engine/math.js';
import { encode } from '../src/network/codec.js';
import { loadProject } from '../tools/project.mjs';

function join(server, name) {
  const inbox = [];
  const connection = server.connect((message) => inbox.push(structuredClone(message)), name);
  const client = new NetworkClient((message) => connection.receive(message));
  const flush = () => {
    while (inbox.length) client.receive(inbox.shift());
  };
  flush();
  return {
    connection,
    client,
    flush,
    player: server.engine.players.GetPlayerByUserId(connection.userId),
  };
}
function send(peer, action, ...args) {
  peer.connection.receive({ type: 'remote', id: 'city-action', args: encode([action, ...args]) });
}
function advance(server, seconds, peers = []) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    server.update(1 / 60);
    for (const peer of peers) peer.flush();
  }
}
function clean(server, peers) {
  assert.deepEqual(
    server.engine.logs.filter((entry) => entry.level === 'error'),
    [],
  );
  for (const peer of peers) {
    assert.deepEqual(
      peer.client.engine.logs.filter((entry) => entry.level === 'error'),
      [],
    );
    peer.connection.close();
    peer.client.dispose();
  }
  server.dispose();
}

test('city cars accelerate across real intersection curbs, brake, and keep details aligned after physics', async () => {
  const server = new GameServer(await loadProject('examples/neon-borough/project.openengine'));
  const a = join(server, 'Driver');
  advance(server, 0.6, [a]);
  const car = server.engine.workspace.FindFirstChild('Cars').GetChildren()[0];
  car.Position = new Vector3(0, 0.5, 8);
  car.Velocity = new Vector3();
  a.player.Character.Position = car.Position.Add(new Vector3(3, 1, 0));
  send(a, 'interact');
  advance(server, 0.1, [a]);
  assert.equal(car.GetAttribute('Driver'), a.player.UserId);
  for (let i = 0; i < 66; i++) {
    if (i % 6 === 0) send(a, 'drive', 1, 1);
    advance(server, 1 / 60, [a]);
  }
  let highest = car.Position.Y;
  for (let i = 0; i < 150; i++) {
    if (i % 6 === 0) send(a, 'drive', 1, 0);
    advance(server, 1 / 60, [a]);
    highest = Math.max(highest, car.Position.Y);
  }
  assert.ok(car.Position.X > 30, JSON.stringify(car.Position));
  assert.ok(highest < 1.5, 'curbs must not launch the car');
  const cabin = server.engine.workspace
    .FindFirstChild('CarDetails')
    .GetChildren()
    .find((n) => n.Name === car.Name + ' cabin');
  assert.ok(Math.abs(cabin.Position.Y - car.Position.Y - 0.65) < 1e-6);
  assert.ok(cabin.Position.Distance(car.Position) < 0.8);
  send(a, 'drive', 0, 0);
  advance(server, 1.6, [a]);
  assert.ok(Math.hypot(car.Velocity.X, car.Velocity.Z) < 0.15);
  clean(server, [a]);
});

test('residents recover when lost or destroyed instead of leaving a broken city update', async () => {
  const server = new GameServer(await loadProject('examples/neon-borough/project.openengine'));
  const folder = server.engine.workspace.FindFirstChild('Pedestrians'),
    first = folder.GetChildren()[0];
  first.Position = new Vector3(0, -20, 0);
  advance(server, 0.1);
  assert.ok(first.Position.Y > 0);
  const id = first.Id;
  first.Destroy();
  advance(server, 0.1);
  assert.equal(folder.GetChildren().length, 8);
  assert.ok(!folder.GetChildren().some((n) => n.Id === id));
  advance(server, 1);
  clean(server, []);
});
