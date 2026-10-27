import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../tools/project.mjs';
import { GameServer } from '../src/network/server.js';
import { NetworkClient } from '../src/network/client.js';
import { Vector3 } from '../src/engine/math.js';
test('Apex Circuit starts rounds, spawns owned raycast cars, validates order, declares a winner and restarts', async () => {
  const server = new GameServer(await loadProject('examples/apex-circuit/project.openengine'));
  const inbox = [],
    connection = server.connect((m) => inbox.push(structuredClone(m)), 'Alice'),
    client = new NetworkClient((m) => connection.receive(m));
  const flush = () => {
    while (inbox.length) client.receive(inbox.shift());
  };
  flush();
  const player = server.engine.players.GetPlayerByUserId(connection.userId),
    state = server.engine.workspace.FindFirstChild('RaceState');
  const tick = (n) => {
    for (let i = 0; i < n; i++) {
      server.update(1 / 60);
      flush();
    }
  };
  try {
    assert.equal(player.Character.FindFirstChild('Drive').ClassName, 'Car3D');
    tick(490);
    assert.equal(state.GetAttribute('Phase'), 'Racing');
    assert.equal(player.Character.GetNetworkOwner(), player);
    const actor = player.Character;
    actor.Position = new Vector3(90, 2, 0);
    tick(1);
    assert.equal(actor.GetAttribute('Checkpoint'), 1, 'out of order gate does not advance');
    for (let i = 1; i <= 4; i++) {
      const gate = server.engine.workspace.FindFirstChild('Checkpoints').FindFirstChild(String(i));
      actor.Position = gate.Position;
      tick(2);
    }
    assert.equal(state.GetAttribute('Phase'), 'Results');
    assert.equal(state.GetAttribute('Winner'), 'Alice');
    tick(490);
    assert.equal(state.GetAttribute('Phase'), 'Countdown');
    assert.notEqual(player.Character, actor);
    assert.equal(actor.Destroyed, true);
    assert.deepEqual(
      server.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
    assert.deepEqual(
      client.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
  } finally {
    connection.close();
    client.dispose();
    server.dispose();
  }
});
