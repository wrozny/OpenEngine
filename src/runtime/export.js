import { startMultiplayer } from './multiplayer.js';
import styles from '../game.css?inline';
import { GameView } from '../game-view.js';
const style = document.createElement('style');
style.textContent = styles;
document.head.append(style);
const host = document.createElement('div');
host.className = 'runtime-shell';
document.body.append(host);
try {
  const bytes = Uint8Array.from(atob('__OPENENGINE_PROJECT_BASE64__'), (c) => c.charCodeAt(0));
  const project = JSON.parse(new TextDecoder().decode(bytes));
  document.title = project.name;
  project.multiplayer
    ? startMultiplayer(host, project)
    : new GameView(host, project, {
        onLog: (entry) => {
          if (entry.level === 'error') console.error(entry.message);
        },
      });
} catch (error) {
  host.className = 'runtime-error';
  host.textContent = `Could not start game: ${error.message}`;
}
