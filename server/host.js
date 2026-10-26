import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GameServer } from '../src/network/server.js';

/** One process owns physics and Lua. HTTP serves the client; WebSocket carries the bounded protocol. */
export async function hostGame(project, { host = '127.0.0.1', port = 0, html = '', onLog } = {}) {
  const logs = [];
  const game = new GameServer(project, {
    onLog: (entry) => {
      logs.push(entry);
      if (logs.length > 100) logs.shift();
      onLog?.(entry);
    },
  });
  const http = createServer((request, response) => {
    if (
      request.method !== 'GET' ||
      !['/', '/index.html', '/health'].includes(request.url?.split('?')[0])
    ) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.url === '/health') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ name: project.name, players: game.peers.size }));
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        html || '<p>OpenEngine game server is running. Connect from the game client.</p>',
      );
    }
  });
  const wss = new WebSocketServer({
    server: http,
    path: '/socket',
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  wss.on('connection', (socket, request) => {
    let connection;
    try {
      connection = game.connect(
        (message) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          if (socket.bufferedAmount > 4 * 1024 * 1024) {
            socket.close(1013, 'Slow connection');
            return;
          }
          socket.send(JSON.stringify(message));
        },
        new URL(request.url, 'http://localhost').searchParams.get('name') || 'Player',
      );
    } catch {
      socket.close(1013, 'Server full');
      return;
    }
    socket.on('message', (data, binary) => {
      if (binary) {
        socket.close(1003, 'Text JSON only');
        return;
      }
      try {
        connection.receive(JSON.parse(data.toString()));
      } catch {
        socket.close(1007, 'Invalid JSON');
      }
    });
    socket.on('close', () => connection.close());
    socket.on('error', () => connection.close());
    socket.alive = true;
    socket.on('pong', () => {
      socket.alive = true;
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) socket.terminate();
      else {
        socket.alive = false;
        socket.ping();
      }
    }
  }, 15000);
  let previous = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    try {
      game.update((now - previous) / 1000);
    } catch (error) {
      game.engine.log('error', error.message);
    }
    previous = now;
  }, 1000 / 60);
  try {
    await new Promise((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, host, resolve);
    });
  } catch (error) {
    clearInterval(tick);
    clearInterval(heartbeat);
    game.dispose();
    throw error;
  }
  return {
    game,
    port: http.address().port,
    status: () => ({
      players: game.peers.size,
      time: game.engine.runService.Time,
      logs: [...logs],
    }),
    close: async () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
      game.dispose();
      await new Promise((resolve) => http.close(resolve));
    },
  };
}
