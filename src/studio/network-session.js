import { connectWebSocket } from '../network/client.js';
import { GameView } from '../game-view.js';
import { el } from './dom.js';

let controls = Promise.resolve();
function request(method, project) {
  if (method === 'GET') return performRequest(method, project);
  controls = controls.catch(() => {}).then(() => performRequest(method, project));
  return controls;
}
async function performRequest(method, project) {
  if (window.desktop) {
    if (method === 'POST') return window.desktop.startServer(JSON.stringify(project));
    if (method === 'DELETE') return window.desktop.stopServer();
    return window.desktop.serverStatus();
  }
  const response = await fetch('/__openengine_network', {
    method,
    keepalive: method === 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: project ? JSON.stringify(project) : undefined,
  });
  if (!response.ok)
    throw new Error('Multiplayer Studio testing needs desktop Studio or npm run dev on localhost.');
  return response.json();
}

/** A dedicated host plus independent client runtimes, each with its own Lua VM and input focus. */
export class StudioNetworkSession {
  constructor(container, project, { onLog, onStop }) {
    Object.assign(this, { project, onLog, onStop });
    this.clients = [];
    this.container = container;
    this.root = el('section', 'network-session');
    const toolbar = el('div', 'network-toolbar');
    const title = el('strong', '', 'Multiplayer test');
    const add = el('button', '', 'Add client');
    add.onclick = () => this.addClient();
    this.add = add;
    const stop = el('button', '', 'Stop server');
    stop.onclick = onStop;
    toolbar.append(title, add, stop);
    this.server = el('pre', 'network-server', 'Starting dedicated server…');
    this.server.setAttribute('aria-label', 'Server instance');
    this.grid = el('div', 'network-clients');
    this.root.append(toolbar, this.server, this.grid);
    container.append(this.root);
    this.start();
  }
  async start() {
    try {
      const { url } = await request('POST', this.project);
      if (this.disposed) return;
      this.url = url;
      this.addClient();
      this.poll = setInterval(async () => {
        try {
          const status = await request('GET');
          if (!this.disposed)
            this.server.textContent =
              `SERVER · ${status.players || 0} players · ${(status.time || 0).toFixed(1)}s · ${url}\n` +
              (status.logs || [])
                .slice(-4)
                .map((entry) => `[${entry.level}] ${entry.message}`)
                .join('\n');
        } catch (error) {
          this.onLog({ level: 'error', message: error.message });
        }
      }, 500);
    } catch (error) {
      this.server.textContent = error.message;
      this.onLog({ level: 'error', message: error.message });
    }
  }
  addClient() {
    if (!this.url || this.clients.length >= 8) return;
    const number = (this.number = (this.number || 0) + 1),
      panel = el('section', 'network-client');
    panel.setAttribute('aria-label', 'Client ' + number);
    const heading = el('div', 'network-client-heading'),
      label = el('span', '', `Client ${number} · connecting`),
      close = el('button', '', 'Disconnect');
    heading.append(label, close);
    const content = el('div', 'network-client-view');
    panel.append(heading, content);
    this.grid.append(panel);
    const entry = { panel };
    this.clients.push(entry);
    const url = new URL(this.url);
    url.searchParams.set('name', 'Player ' + number);
    entry.client = connectWebSocket(url, {
      onLog: (event) => this.onLog({ ...event, message: `[Client ${number}] ${event.message}` }),
      onReady: (engine) => {
        label.textContent = `Client ${number} · ${engine.players.LocalPlayer.UserId.slice(0, 8)}`;
        entry.view = new GameView(content, engine.project, { engine, network: entry.client });
      },
      onDisconnect: (message) => {
        label.textContent = `Client ${number} · ${message}`;
      },
    });
    close.onclick = () => {
      entry.client.dispose();
      entry.view?.dispose();
      panel.remove();
      this.clients.splice(this.clients.indexOf(entry), 1);
      this.add.disabled = false;
    };
    this.add.disabled = this.clients.length >= 8;
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.poll);
    for (const entry of this.clients) {
      entry.client.dispose();
      entry.view?.dispose();
    }
    this.clients = [];
    this.root.remove();
    request('DELETE').catch(() => {});
  }
}
