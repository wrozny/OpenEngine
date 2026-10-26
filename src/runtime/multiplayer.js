import { connectWebSocket } from '../network/client.js';
import { GameView } from '../game-view.js';

/** The client build contains no private server scripts. Users can select a LAN or hosted server. */
export function startMultiplayer(container, project, options = {}) {
  const onLog =
    options.onLog ||
    ((entry) => {
      if (entry.level === 'error') console.error(entry.message);
    });
  const form = document.createElement('form');
  form.className = 'network-connect';
  const title = document.createElement('h1');
  title.textContent = project.name;
  const label = document.createElement('label');
  label.textContent = 'Server address';
  const address = document.createElement('input');
  address.setAttribute('aria-label', 'Server address');
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  address.value =
    new URLSearchParams(location.search).get('server') ||
    (location.protocol.startsWith('http')
      ? `${scheme}//${location.host}/socket`
      : 'ws://localhost:7777/socket');
  const name = document.createElement('input');
  name.placeholder = 'Player name';
  name.value = 'Player';
  name.maxLength = 24;
  name.setAttribute('aria-label', 'Player name');
  const button = document.createElement('button');
  button.textContent = 'Join server';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  label.append(address);
  form.append(title, label, name, button, status);
  container.append(form);
  let client,
    view,
    disposed = false;
  form.onsubmit = (event) => {
    event.preventDefault();
    let url;
    try {
      url = new URL(address.value);
      if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Use a ws:// or wss:// address');
      if (location.protocol === 'https:' && url.protocol === 'ws:')
        throw new Error('An HTTPS page needs a secure wss:// server address.');
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    client?.dispose();
    client = null;
    view?.dispose();
    view = null;
    url.searchParams.set('name', name.value);
    button.disabled = true;
    status.textContent = 'Connecting…';
    client = connectWebSocket(url, {
      onLog,
      onReady: (engine) => {
        if (disposed) return;
        form.hidden = true;
        view = new GameView(container, engine.project, {
          engine,
          network: client,
          onLog: options.onLog,
        });
      },
      onDisconnect: (reason) => {
        view?.dispose();
        view = null;
        form.hidden = false;
        button.disabled = false;
        status.textContent = reason;
      },
    });
  };
  return {
    dispose() {
      disposed = true;
      client?.dispose();
      view?.dispose();
      form.remove();
    },
  };
}
