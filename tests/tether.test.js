import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../tools/project.mjs';
import { GameServer } from '../src/network/server.js';
import { NetworkClient } from '../src/network/client.js';
import { Vector2 } from '../src/engine/math.js';
import { encode } from '../src/network/codec.js';
test('Tether Run generates courses, validates hooks, recovers falls and resets seeded rounds', async () => {
  const server = new GameServer(await loadProject('examples/tether-run/project.openengine'));
  const queue = [],
    peer = server.connect((m) => queue.push(structuredClone(m)), 'Runner'),
    client = new NetworkClient((m) => peer.receive(m));
  const flush = () => {
    while (queue.length) client.receive(queue.shift());
  };
  flush();
  const player = server.engine.players.GetPlayerByUserId(peer.userId),
    match = server.engine.workspace.FindFirstChild('Match');
  const tick = (n) => {
    for (let i = 0; i < n; i++) {
      server.update(1 / 60);
      flush();
    }
  };
  try {
    tick(370);
    assert.equal(match.GetAttribute('Phase'), 'Racing');
    const decks = server.engine.workspace
      .FindFirstChild('Course')
      .GetChildren()
      .filter((n) => n.Name.startsWith('Deck'));
    assert.ok(decks.length >= 14 && decks.length <= 18);
    assert.equal(match.GetAttribute('DeckCount'), decks.length);
    assert.equal(new Set(decks.slice(1).map((deck) => deck.GetAttribute('District'))).size, 5);
    for (let i = 1; i < decks.length; i++) {
      assert.ok(Math.abs(decks[i].Position.Y - decks[i - 1].Position.Y) <= 70.001);
      assert.ok(
        decks[i].Position.X - decks[i - 1].Position.X >= 269.999 &&
          decks[i].Position.X - decks[i - 1].Position.X <= 425.001,
      );
    }
    const anchor = server.engine.workspace.FindFirstChild('Course').FindFirstChild('Anchor 1');
    player.Character.Position = new Vector2(-45, 130);
    peer.receive({
      type: 'remote',
      id: server.engine.workspace.FindFirstChild('Action').Id,
      args: encode(['hook', anchor.Position]),
    });
    assert.equal(player.Character.GetAttribute('HookActive'), true);
    peer.receive({
      type: 'remote',
      id: server.engine.workspace.FindFirstChild('Action').Id,
      args: encode(['release']),
    });
    assert.equal(player.Character.GetAttribute('HookActive'), false);
    player.Character.Position = new Vector2(0, 800);
    tick(1);
    assert.ok(player.Character.Position.Y < 600);
    assert.equal(player.Character.GetAttribute('Falls'), 1);
    for (let i = 1; i < decks.length; i++) {
      player.Character.Position = decks[i].Position.Add(new Vector2(-20, -45));
      tick(1);
    }
    const last = decks.at(-1);
    player.Character.Position = last.Position.Add(new Vector2(45, -40));
    tick(1);
    assert.equal(match.GetAttribute('Phase'), 'Results');
    assert.equal(match.GetAttribute('Winner'), 'Runner');
    const seed = match.GetAttribute('Seed');
    tick(430);
    assert.equal(match.GetAttribute('Phase'), 'Countdown');
    assert.notEqual(match.GetAttribute('Seed'), seed);
    assert.deepEqual(
      server.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
    assert.deepEqual(
      client.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
  } finally {
    peer.close();
    client.dispose();
    server.dispose();
  }
});

test('course seeds reproduce varied traversal patterns within the grapple envelope', async () => {
  const server = new GameServer(await loadProject('examples/tether-run/project.openengine'));
  const signatures = new Set();
  try {
    for (let seed = 1; seed <= 64; seed++) {
      server.engine.lua.evaluate(
        `
        local Course=require(game:GetService("ScriptService").Course)
        local a,b=Course.Generate(${seed}),Course.Generate(${seed})
        assert(#a>=14 and #a<=18 and #a==#b)
        local signature={}
        for i,s in ipairs(a) do
            assert(s.x==b[i].x and s.y==b[i].y and s.district==b[i].district)
            assert(s.y>=-100 and s.y<=260 and s.width>=190)
            if i>1 then
                local previous=a[i-1]
                assert(s.x-previous.x>=270 and s.x-previous.x<=425)
                assert(math.abs(s.y-previous.y)<=70)
                local dx=s.x+s.anchorX-previous.x
                local dy=s.y-s.anchorHeight-(previous.y-50)
                assert(math.sqrt(dx*dx+dy*dy)<600)
            end
            signature[#signature+1]=s.x..":"..s.y..":"..s.district
        end
        assert(not a[#a].hazard)
        workspace:SetAttribute("CourseSignature",table.concat(signature,";"))
      `,
        'course variety',
      );
      signatures.add(server.engine.workspace.GetAttribute('CourseSignature'));
    }
    assert.equal(signatures.size, 64);
    const terrain = server.engine.workspace.FindFirstChild('Course');
    assert.ok(terrain.GetChildren().some((n) => n.Name.startsWith('Gap relay')));
    assert.ok(terrain.GetChildren().some((n) => n.Name.startsWith('Upper express')));
    const gate = terrain.FindFirstChild('Pulse gate');
    assert.ok(gate);
    server.update(1 / 60);
    const initial = gate.GetAttribute('Active');
    for (let frame = 0; frame < 100; frame++) server.update(1 / 60);
    assert.notEqual(gate.GetAttribute('Active'), initial);
    assert.deepEqual(
      server.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
  } finally {
    server.dispose();
  }
});

test('owned runner predicts a tether, reels its constraint and releases its local rope', async () => {
  const server = new GameServer(await loadProject('examples/tether-run/project.openengine')),
    queue = [],
    peer = server.connect((m) => queue.push(structuredClone(m)), 'Swing tester'),
    client = new NetworkClient((m) => peer.receive(m));
  const flush = () => {
    while (queue.length) client.receive(queue.shift());
  };
  flush();
  const tick = (n) => {
    for (let i = 0; i < n; i++) {
      server.update(1 / 60);
      flush();
      client.update(1 / 60);
    }
  };
  try {
    tick(370);
    const actor = client.engine.players.LocalPlayer.Character,
      anchor = client.engine.workspace.FindFirstChild('Course').FindFirstChild('Anchor 1');
    client.engine.input.MousePosition = anchor.Position;
    client.engine.input.buttons.add(0);
    client.engine.input.Began.Fire('mouse0');
    tick(8);
    assert.ok(actor.FindFirstChild('Local tether'));
    assert.equal(
      server.engine.players.GetPlayerByUserId(peer.userId).Character.GetAttribute('HookActive'),
      true,
    );
    const initial = actor.Position.Distance(anchor.Position);
    client.engine.input.keys.add('w');
    tick(90);
    assert.ok(actor.Position.Distance(anchor.Position) < initial - 20);
    client.engine.input.keys.clear();
    client.engine.input.buttons.clear();
    client.engine.input.Ended.Fire('mouse0');
    tick(2);
    assert.equal(actor.FindFirstChild('Local tether'), undefined);
    const pad = server.engine.workspace
      .FindFirstChild('Course')
      .GetChildren()
      .find((n) => n.GetAttribute('Boost'));
    server.engine.players.GetPlayerByUserId(peer.userId).Character.Position = pad.Position.Add(
      new Vector2(0, -20),
    );
    tick(4);
    assert.ok(actor.Velocity.X > 500, 'server boost reaches the predicted owning client');

    assert.deepEqual(
      client.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
    assert.deepEqual(
      server.engine.logs.filter((e) => e.level === 'error'),
      [],
    );
  } finally {
    peer.close();
    client.dispose();
    server.dispose();
  }
});
