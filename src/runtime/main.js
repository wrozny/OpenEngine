import '../game.css';
import { GameView } from '../game-view.js';
import { exampleProject } from '../example.js';
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
  project ||= exampleProject();
  validateProject(project);
  document.title = project.name;
  const view = new GameView(app, project, {
    onLog: (entry) => {
      if (entry.level === 'error') console.error(entry.message);
    },
  });
  window.addEventListener('beforeunload', () => view.dispose());
} catch (error) {
  app.className = 'runtime-error';
  app.textContent = `Could not start the game.\n${error.message}`;
}
