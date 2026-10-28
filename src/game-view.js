import { UIRenderer } from './ui/renderer.js';
import './ui/ui.css';
import { WorldLabels } from './world-labels.js';
import { Engine } from './engine/engine.js';
import { Renderer3D } from './engine/renderer3d.js';
import { Renderer } from './engine/renderer.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className || '';
  if (text != null) node.textContent = text;
  return node;
}

/** Owns DOM, input subscriptions and animation lifetime for one Play session. */
export class GameView {
  constructor(container, project, { onLog, onStop, engine, network } = {}) {
    this.container = container;
    this.engine = engine || new Engine(project, { onLog });
    this.network = network;
    this.root = element('div', 'game-view');
    this.canvas = element('canvas', 'game-canvas');
    this.canvas.setAttribute(
      'aria-label',
      'Game viewport. WASD to move, mouse to aim, left click to fire.',
    );
    this.root.append(this.canvas);
    this.authoredHost = element('div', 'authored-ui');
    this.root.append(this.authoredHost);
    this.authoredUI = new UIRenderer(this.authoredHost, { assets: project.assets });
    this.hud = element('div', 'game-hud');
    this.root.append(this.hud);
    this.widgets = element('div', 'game-widgets');
    this.root.append(this.widgets);
    this.modal = element('div', 'game-overlay');
    this.root.append(this.modal);
    this.help = element(
      'div',
      'game-help',
      project.controls || 'Click the canvas to focus · keyboard and mouse',
    );
    this.help.hidden = !!project.hideControlHint;
    this.root.append(this.help);
    if (onStop) {
      const stop = element('button', 'game-exit', '■  Stop play');
      stop.onclick = onStop;
      this.root.append(stop);
    }
    container.append(this.root);
    this.renderer = new (project.dimension === '3D' ? Renderer3D : Renderer)(
      this.canvas,
      project.assets,
    );
    this.renderer.camera = this.engine.camera;
    this.worldLabels = new WorldLabels(this.engine, this.renderer, this.network);
    this.renderer.resize();
    this.engine.input.attach(
      this.canvas,
      (x, y) => this.renderer.screenToWorld(x, y),
      () => this.engine.audio.unlock(),
    );
    this.dirtyUI = true;
    this.engine.ui.Changed.Connect(() => {
      this.dirtyUI = true;
    });
    this.engine.start();
    this.lastTime = performance.now();
    const frame = (now) => {
      if (this.disposed) return;
      this.engine.input.updatePointer();
      (this.network || this.engine).update(document.hidden ? 0 : (now - this.lastTime) / 1000);
      this.lastTime = now;
      if (this.network) {
        const camera = this.engine.camera,
          follow = camera.Follow;
        this.renderer.camera = {
          ...camera,
          Position:
            follow && !follow.Destroyed
              ? this.engine.dimension === '3D'
                ? this.network.transform(follow).Position.Add(camera.Offset)
                : this.network.transform(follow).Position
              : camera.Position,
        };
      }
      this.renderer.draw(this.engine.workspace.GetDescendants(), {
        workspace: this.engine.workspace,
        transform: this.network ? (node) => this.network.transform(node) : undefined,
      });
      if (this.dirtyUI) {
        this.renderUI();
        this.dirtyUI = false;
      }
      this.authoredUI.render(this.engine.ui, this.renderer.width, this.renderer.height);
      this.worldLabels.update();
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
    this.canvas.focus();
  }
  renderUI() {
    const ui = this.engine.ui;
    this.hud.replaceChildren();
    const data = ui.hud;
    if (Object.keys(data).length) {
      const identity = element('div', 'hud-identity');
      identity.append(
        element('span', 'eyebrow', this.engine.project.name.toUpperCase()),
        element('strong', '', `Wave ${data.wave || '—'}`),
      );
      const stats = element('div', 'hud-stats');
      const hp = element('div', 'hud-health');
      hp.append(element('span', '', `${data.health || 0} / ${data.maxHealth || 100} HP`));
      const track = element('div', 'health-track'),
        fill = element('div', 'health-fill');
      fill.style.width = `${Math.max(0, Math.min(100, (Number(data.health) / Number(data.maxHealth)) * 100))}%`;
      track.append(fill);
      hp.append(track);
      stats.append(
        hp,
        element('span', '', `${data.remaining || 0} infected`),
        element('span', 'hud-points', `${data.points || 0} pts`),
      );
      this.hud.append(identity, stats);
    }
    this.widgets.replaceChildren();
    this.worldLabels.reset();
    for (const [id, widget] of Object.entries(ui.widgets)) {
      const node = element(
        widget.type === 'button' ? 'button' : 'div',
        'game-widget ' + widget.type,
        widget.type === 'bar' ? undefined : widget.text,
      );
      node.dataset.widget = id;
      if (widget.type === 'world-label') {
        if (widget.color) node.style.color = widget.color;
        this.widgets.append(node);
        this.worldLabels.add(node, widget);
        continue;
      }
      const right = widget.anchor.includes('Right'),
        bottom = widget.anchor.includes('Bottom');
      node.style[right ? 'right' : 'left'] = widget.x + 'px';
      node.style[bottom ? 'bottom' : 'top'] = widget.y + 'px';
      if (widget.anchor === 'Center') {
        node.style.left = 'calc(50% + ' + widget.x + 'px)';
        node.style.top = 'calc(50% + ' + widget.y + 'px)';
        node.style.transform = 'translate(-50%, -50%)';
      }
      if (widget.width) node.style.width = widget.width + 'px';
      if (widget.height) node.style.height = widget.height + 'px';
      if (widget.color) node.style.color = widget.color;
      if (widget.type === 'bar') {
        const fill = element('div');
        fill.style.width = Math.max(0, Math.min(100, (widget.value / widget.maximum) * 100)) + '%';
        fill.style.background = widget.color;
        node.append(fill);
      }
      if (widget.type === 'button')
        node.onclick = () => {
          this.engine.audio.unlock();
          ui.OnAction.Fire(id);
          this.canvas.focus();
        };
      this.widgets.append(node);
    }
    this.modal.replaceChildren();
    this.modal.hidden = ui.State === 'playing';
    if (this.modal.hidden) return;
    const panel = element('div', 'game-panel');
    panel.append(
      element('div', 'eyebrow', ui.State === 'dead' ? 'TRANSMISSION ENDED' : 'SUPPLY DROP'),
      element('h1', '', ui.Title),
      element('p', '', ui.Subtitle),
    );
    if (ui.State === 'upgrading') {
      panel.append(element('div', 'shop-balance', `${data.points} points available`));
      const grid = element('div', 'upgrade-grid');
      for (const [id, upgrade] of Object.entries(ui.upgrades)) {
        const button = element('button', 'upgrade-card');
        button.dataset.action = id;
        button.append(
          element('strong', '', upgrade.title),
          element('span', '', upgrade.description),
          element('b', '', `${upgrade.cost} pts`),
        );
        button.disabled = !upgrade.affordable;
        button.onclick = () => {
          this.engine.audio.unlock();
          ui.OnAction.Fire(id);
          this.canvas.focus();
        };
        grid.append(button);
      }
      panel.append(grid);
    }
    const button = element(
      'button',
      'primary game-continue',
      ui.State === 'dead' || ui.State === 'complete' ? 'Play again  ↻' : 'Start next wave  →',
    );
    button.dataset.action = ui.State === 'dead' || ui.State === 'complete' ? 'restart' : 'next';
    button.onclick = () => {
      this.engine.audio.unlock();
      ui.OnAction.Fire(button.dataset.action);
      this.canvas.focus();
    };
    panel.append(button);
    this.modal.append(panel);
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.authoredUI.dispose();
    this.engine.dispose();
    this.renderer.dispose?.();
    this.root.remove();
  }
}
