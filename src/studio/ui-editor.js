import { createDialog } from '../ui/templates.js';
import { el } from './dom.js';
import { UIRenderer } from '../ui/renderer.js';
import { UDim2 } from '../engine/ui-types.js';
import { isUIElement } from '../engine/ui-schema.js';
import '../ui/ui.css';
import './ui-editor.css';

/** A shared runtime canvas with authoring handles. Each gesture records one undo entry. */
export class UIEditor {
  constructor(store, onError) {
    Object.assign(this, {
      store,
      onError,
      width: 1280,
      height: 720,
      zoom: 0.5,
      panX: 24,
      panY: 24,
    });
    this.host = el('section', 'panel ui-editor');
    const toolbar = el('div', 'ui-tools');
    this.devices = el('select');
    this.devices.setAttribute('aria-label', 'UI preview device');
    for (const [name, w, h] of [
      ['Desktop', 1280, 720],
      ['Tablet', 768, 1024],
      ['Phone', 390, 844],
    ]) {
      const o = el('option', '', name);
      o.value = `${w},${h}`;
      this.devices.append(o);
    }
    this.devices.onchange = () => {
      [this.width, this.height] = this.devices.value.split(',').map(Number);
      this.fit();
    };
    toolbar.append(this.devices);
    for (const [name, fn] of [
      ['Fit', () => this.fit()],
      [
        '−',
        () => {
          this.zoom /= 1.2;
          this.refresh();
        },
      ],
      [
        '+',
        () => {
          this.zoom *= 1.2;
          this.refresh();
        },
      ],
      ['Center', () => this.align()],
      ['Fill', () => this.fill()],
    ]) {
      const b = el('button', '', name);
      b.onclick = fn;
      toolbar.append(b);
    }
    this.snap = el('input');
    this.snap.type = 'checkbox';
    this.snap.setAttribute('aria-label', 'Snap UI to 8 pixels');
    const label = el('label', '', 'Snap 8');
    label.prepend(this.snap);
    toolbar.append(label);
    const palette = el('div', 'ui-palette');
    for (const type of [
      'ScreenGui',
      'Frame',
      'TextLabel',
      'TextButton',
      'ImageLabel',
      'TextInput',
      'UIListLayout',
      'UIGridLayout',
      'UICorner',
      'UIPadding',
    ]) {
      const b = el('button', '', type);
      b.draggable = true;
      b.onclick = () => store.addUI(type);
      b.ondragstart = (e) => e.dataTransfer.setData('text/ui-element', type);
      palette.append(b);
    }
    const preset = el('button', '', 'Responsive dialog');
    preset.onclick = () => {
      const screen = createDialog();
      store.transact(() => (screen.Parent = store.uiService));
      store.expanded.add(store.uiService.Id);
      store.expanded.add(screen.Id);
      store.select(screen);
    };
    palette.append(preset);
    this.stage = el('div', 'ui-stage');
    this.stage.tabIndex = 0;
    this.stage.setAttribute('aria-label', 'UI design canvas');
    this.board = el('div', 'ui-artboard');
    this.surface = el('div');
    this.overlay = el('div', 'ui-selection');
    this.board.append(this.surface, this.overlay);
    this.stage.append(this.board);
    this.renderer = new UIRenderer(this.surface, {
      editing: true,
      onSelect: (node) => store.select(node),
    });
    this.hint = el(
      'div',
      'ui-canvas-hint',
      'Drag elements onto the canvas · Drag to move · Corner to resize · Middle drag to pan · Wheel to zoom',
    );
    this.host.append(toolbar, palette, this.stage, this.hint);
    this.stage.ondragover = (e) => {
      if (e.dataTransfer.types.includes('text/ui-element')) e.preventDefault();
    };
    this.stage.ondrop = (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/ui-element');
      if (!type) return;
      let hit = this.store.nodes.find(
        (n) => n.Id === e.target.closest('[data-ui-id]')?.dataset.uiId,
      );
      while (hit && !['Frame', 'ScreenGui'].includes(hit.ClassName)) hit = hit.Parent;
      if (hit) store.select(hit);
      if (
        ![
          'ScreenGui',
          'Frame',
          'TextLabel',
          'TextButton',
          'ImageLabel',
          'TextInput',
          'UIListLayout',
          'UIGridLayout',
          'UICorner',
          'UIPadding',
        ].includes(type)
      )
        return;
      const node = store.addUI(type);
      if (isUIElement(node)) {
        const box = this.board.getBoundingClientRect(),
          parent = this.renderer.layout.get(node.Parent.Id);
        store.transact(
          () =>
            (node.Position = new UDim2(
              0,
              (e.clientX - box.left) / this.zoom - (parent?.x || 0),
              0,
              (e.clientY - box.top) / this.zoom - (parent?.y || 0),
            )),
        );
      }
    };
    this.stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.stage.getBoundingClientRect(),
          x = e.clientX - r.left,
          y = e.clientY - r.top,
          old = this.zoom;
        this.zoom = Math.max(0.1, Math.min(3, old * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        this.panX = x - ((x - this.panX) * this.zoom) / old;
        this.panY = y - ((y - this.panY) * this.zoom) / old;
        this.refresh();
      },
      { passive: false },
    );
    this.stage.addEventListener(
      'click',
      (event) => {
        if (this.suppressClick) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.suppressClick = false;
        }
      },
      true,
    );
    this.stage.onpointerdown = (e) => {
      this.suppressClick = false;
      this.begin(e);
    };
    this.stage.onkeydown = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.fit();
      }
      const node = store.selected;
      if (!isUIElement(node)) return;
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ];
      if (delta) {
        e.preventDefault();
        e.stopPropagation();
        const d = e.shiftKey ? 10 : 1;
        store.transact(
          () =>
            (node.Position = new UDim2(
              node.Position.XScale,
              node.Position.XOffset + delta[0] * d,
              node.Position.YScale,
              node.Position.YOffset + delta[1] * d,
            )),
          'ui-nudge',
        );
      }
    };
    this.observer = new ResizeObserver(() => {
      if (!this.initialFit && this.stage.clientWidth) {
        this.initialFit = true;
        this.fit();
      }
    });
    this.observer.observe(this.stage);
  }
  dispose() {
    this.observer.disconnect();
    this.renderer.dispose();
  }
  fit() {
    this.zoom = Math.max(
      0.1,
      Math.min(
        (this.stage.clientWidth - 48) / this.width,
        (this.stage.clientHeight - 48) / this.height,
        1,
      ),
    );
    this.panX = (this.stage.clientWidth - this.width * this.zoom) / 2;
    this.panY = (this.stage.clientHeight - this.height * this.zoom) / 2;
    this.refresh();
  }
  align() {
    const n = this.store.selected;
    if (isUIElement(n))
      this.store.transact(() => {
        n.AnchorPoint = { X: 0.5, Y: 0.5 };
        n.Position = new UDim2(0.5, 0, 0.5, 0);
      });
  }
  fill() {
    const n = this.store.selected;
    if (isUIElement(n))
      this.store.transact(() => {
        n.AnchorPoint = { X: 0, Y: 0 };
        n.Position = new UDim2();
        n.Size = new UDim2(1, 0, 1, 0);
      });
  }
  refresh() {
    if (this.gesture) return;
    let screen = this.store.selected;
    while (screen && screen.ClassName !== 'ScreenGui') screen = screen.Parent;
    screen ||= this.store.uiService.GetChildren().find((n) => n.ClassName === 'ScreenGui');
    this.board.style.cssText = `width:${this.width}px;height:${this.height}px;transform:translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
    this.renderer.render(this.store.uiService, this.width, this.height, { screenId: screen?.Id });
    this.overlay.replaceChildren();
    const rect = this.renderer.layout.get(this.store.selectedId);
    this.overlay.hidden = !rect || !isUIElement(this.store.selected);
    if (rect) {
      this.overlay.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px`;
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        const h = el('div', 'ui-handle ' + corner);
        h.dataset.handle = corner;
        this.overlay.append(h);
      }
    }
  }
  begin(e) {
    const pan = e.button === 1;
    if (e.button !== 0 && !pan) return;
    const entry = e.target.closest('[data-ui-id]');
    const node = entry && this.store.nodes.find((n) => n.Id === entry.dataset.uiId);
    const resize = e.target.dataset.handle;
    if (!pan && !resize && !isUIElement(node)) return;
    e.preventDefault();
    this.stage.focus();
    if (node && !resize) this.store.select(node);
    const target = this.store.selected;
    if (!pan && !isUIElement(target)) return;
    const before = this.store.project,
      startX = e.clientX,
      startY = e.clientY,
      p = target?.Position,
      size = target?.Size,
      panX = this.panX,
      panY = this.panY,
      rect = this.renderer.layout.get(target?.Id),
      scale = rect?.scale || 1;
    this.gesture = true;
    this.stage.setPointerCapture(e.pointerId);
    const move = (event) => {
      let dx = (event.clientX - startX) / this.zoom,
        dy = (event.clientY - startY) / this.zoom;
      if (pan) {
        this.panX = panX + dx * this.zoom;
        this.panY = panY + dy * this.zoom;
      } else {
        dx /= scale;
        dy /= scale;
        if (this.snap.checked) {
          dx = Math.round(dx / 8) * 8;
          dy = Math.round(dy / 8) * 8;
        }
        if (resize) {
          const sx = resize.includes('w') ? -1 : 1,
            sy = resize.includes('n') ? -1 : 1;
          const wx = Math.max(-rect.width / scale + 8, sx * dx),
            hy = Math.max(-rect.height / scale + 8, sy * dy);
          target.Size = new UDim2(size.XScale, size.XOffset + wx, size.YScale, size.YOffset + hy);
          target.Position = new UDim2(
            p.XScale,
            p.XOffset + wx * (target.AnchorPoint.X - (sx < 0 ? 1 : 0)),
            p.YScale,
            p.YOffset + hy * (target.AnchorPoint.Y - (sy < 0 ? 1 : 0)),
          );
        } else if (['Row', 'Column'].includes(target.Parent.Layout)) {
          const vertical = target.Parent.Layout === 'Column',
            bounds = this.board.getBoundingClientRect(),
            point =
              (vertical ? event.clientY - bounds.top : event.clientX - bounds.left) / this.zoom;
          let index = 1;
          for (const sibling of target.Parent.GetChildren().filter(isUIElement)) {
            if (sibling === target) continue;
            const r = this.renderer.layout.get(sibling.Id);
            if (r && point > (vertical ? r.y + r.height / 2 : r.x + r.width / 2)) index++;
          }
          target.SetSiblingIndex(index);
        } else target.Position = new UDim2(p.XScale, p.XOffset + dx, p.YScale, p.YOffset + dy);
      }
      this.gesture = false;
      this.refresh();
      this.gesture = true;
    };
    const finish = (event) => {
      this.stage.removeEventListener('keydown', cancel);
      this.stage.removeEventListener('pointermove', move);
      this.stage.removeEventListener('pointerup', finish);
      this.stage.removeEventListener('pointercancel', finish);
      this.gesture = false;
      this.stage.releasePointerCapture(e.pointerId);
      if (event.type === 'pointercancel') {
        this.suppressClick = true;
        this.store.restore(before);
        this.store.Changed.Fire('selection');
      } else if (!pan && JSON.stringify(before) !== JSON.stringify(this.store.project))
        this.store.record(before);
      this.refresh();
    };
    const cancel = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish({ type: 'pointercancel' });
      }
    };
    this.stage.addEventListener('keydown', cancel);
    this.stage.addEventListener('pointermove', move);
    this.stage.addEventListener('pointerup', finish);
    this.stage.addEventListener('pointercancel', finish);
  }
}
