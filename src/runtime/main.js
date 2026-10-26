import { startMultiplayer } from './multiplayer.js';
import '../game.css';
import { GameView } from '../game-view.js';
import { validateProject } from '../engine/scene.js';

const app = document.querySelector('#app');
app.className = 'runtime-shell';
try {
  let project;
  if (window.desktop) project = await window.desktop.getBundledProject();
  else {
    const response = await fetch('./project.json');
    if (response.ok && response.headers.get('content-type')?.includes('json'))
      project = await response.json();
  }
  if (!project) throw new Error('No project is bundled. Open Studio and build a game first.');
  validateProject(project);
  document.title = project.name;
  const view = project.multiplayer
    ? startMultiplayer(app, project)
    : new GameView(app, project, {
        onLog: (entry) => {
          if (entry.level === 'error') console.error(entry.message);
        },
      });
  window.addEventListener('beforeunload', () => view.dispose());
} catch (error) {
  app.className = 'runtime-error';
  app.textContent = `Could not start the game.\n${error.message}`;
}
