import test from 'node:test';
import assert from 'node:assert/strict';
const child = (node, path) => path.split('.').reduce((n, name) => n.FindFirstChild(name), node);

test('multiplayer clinic opens locally on sensor enter, preserves local UI during server patches, and closes on exit', async () => {
  const [{ GameServer }, { NetworkClient }, { loadProject }] = await Promise.all([
    import('../src/network/server.js'),
    import('../src/network/client.js'),
    import('../tools/project.mjs'),
  ]);
  const server = new GameServer(await loadProject('examples/neon-borough/project.openengine'));
  const inbox = [],
    connection = server.connect((m) => inbox.push(structuredClone(m)), 'Clinic Tester'),
    client = new NetworkClient((m) => connection.receive(m));
  const flush = () => {
    while (inbox.length) client.receive(inbox.shift());
  };
  flush();
  const player = server.engine.players.GetPlayerByUserId(connection.userId),
    screen = client.engine.ui.FindFirstChild('Clinic');
  const tick = (n) => {
    for (let i = 0; i < n; i++) {
      server.update(1 / 60);
      flush();
      client.update(1 / 60);
    }
  };
  try {
    assert.equal(screen.Enabled, false);
    player.Character.Position = { X: 11, Y: 1.4, Z: 24 };
    tick(20);
    assert.equal(screen.Enabled, true);
    const localPanel = screen.FindFirstChild('Panel');
    localPanel.BackgroundColor = '#123456';
    const serverScreen = server.engine.ui.FindFirstChild('Clinic');
    serverScreen.SetAttribute('Revision', 1);
    tick(5);
    assert.equal(screen.Enabled, true);
    assert.equal(localPanel.BackgroundColor, '#123456');
    const health = player.Character.GetAttribute('Health');
    player.Character.SetAttribute('Health', health - 20);
    tick(5);
    child(screen, 'Panel.Actions.Confirm').OnClick.Fire();
    tick(5);
    assert.equal(
      player.Character.GetAttribute('Health'),
      health - 20,
      'server rejects treatment without swag',
    );
    player.Character.Position = { X: 0, Y: 2, Z: 21 };
    tick(20);
    assert.equal(screen.Enabled, false);
    assert.deepEqual(
      server.engine.logs.filter((x) => x.level === 'error'),
      [],
    );
    assert.deepEqual(
      client.engine.logs.filter((x) => x.level === 'error'),
      [],
    );
  } finally {
    connection.close();
    client.dispose();
    server.dispose();
  }
});
