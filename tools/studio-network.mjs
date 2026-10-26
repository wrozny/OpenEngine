import { hostGame } from '../server/host.js';
/** Development-only endpoints are loopback-only and do not expose source projects on the LAN. */
export function studioNetwork() {
  let session;
  return {
    name: 'openengine-studio-network',
    configureServer(vite) {
      vite.httpServer?.once('close', () => session?.close());
      vite.middlewares.use('/__openengine_network', async (request, response) => {
        if (
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) ||
          (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host)
        ) {
          response.writeHead(403);
          response.end();
          return;
        }
        try {
          if (request.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (size > 64 * 1024 * 1024) throw new Error('Project too large');
              chunks.push(chunk);
            }
            const project = JSON.parse(Buffer.concat(chunks).toString());
            await session?.close();
            session = await hostGame(project);
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ url: `ws://127.0.0.1:${session.port}/socket` }));
          } else if (request.method === 'DELETE') {
            await session?.close();
            session = null;
            response.end('{}');
          } else if (request.method === 'GET') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(session?.status() || {}));
          } else {
            response.writeHead(405);
            response.end();
          }
        } catch (error) {
          response.writeHead(400);
          response.end(error.message);
        }
      });
    },
  };
}
