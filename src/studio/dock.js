import { GoldenLayout, LayoutConfig } from 'golden-layout';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
const KEY = 'openengine.layout.v2';
const component = (type, title) => ({
  type: 'component',
  componentType: type,
  title,
  isClosable: false,
});
const defaultLayout = () => ({
  settings: { showPopoutIcon: false, showCloseIcon: false, reorderEnabled: true },
  dimensions: { borderWidth: 5, headerHeight: 34, minItemWidth: 180, minItemHeight: 100 },
  root: {
    type: 'row',
    content: [
      { ...component('explorer', 'Explorer'), size: '19%' },
      {
        type: 'column',
        size: '58%',
        content: [
          {
            type: 'stack',
            size: '77%',
            content: [component('scene', 'Scene'), component('script', 'Script')],
          },
          { ...component('output', 'Output'), size: '23%' },
        ],
      },
      { ...component('inspector', 'Properties'), size: '23%' },
    ],
  },
});

/** Panels own their DOM; Golden Layout manages docking, resizing and tab placement. */
export class StudioDock {
  constructor(host, panels, onResize = () => {}) {
    this.host = host;
    this.panels = panels;
    this.containers = new Map();
    this.onResize = onResize;
    this.layout = new GoldenLayout(host);
    this.layout.resizeWithContainerAutomatically = true;
    for (const [type, node] of Object.entries(panels))
      this.layout.registerComponentFactoryFunction(type, (container) => {
        container.element.append(node);
        this.containers.set(type, container);
        container.on('resize', onResize);
        container.on('shown', onResize);
      });
    let config = defaultLayout();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved) {
        const types = [];
        const visit = (n) => {
          if (n?.type === 'component') types.push(n.componentType);
          for (const child of n?.content || []) visit(child);
        };
        visit(saved.root);
        if (types.length === 5 && new Set(types).size === 5 && types.every((type) => panels[type]))
          config = LayoutConfig.fromResolved(saved);
      }
    } catch {}
    this.layout.loadLayout(config);
    this.layout.on('stateChanged', () => {
      this.persist();
      onResize();
    });
    this.observer = new ResizeObserver(() => {
      this.layout.setSize(host.clientWidth, host.clientHeight);
      onResize();
    });
    this.observer.observe(host);
  }
  activate(type) {
    const container = this.containers.get(type);
    container?.focus();
    this.onResize();
  }
  reset() {
    this.containers.clear();
    this.layout.loadLayout(defaultLayout());
    this.onResize();
  }
  persist() {
    if (this.disposed) return;
    try {
      const config = this.layout.saveLayout(),
        types = [];
      const visit = (node) => {
        if (node?.type === 'component') types.push(node.componentType);
        for (const child of node?.content || []) visit(child);
      };
      visit(config.root);
      if (
        types.length === 5 &&
        new Set(types).size === 5 &&
        types.every((type) => this.panels[type])
      )
        localStorage.setItem(KEY, JSON.stringify(config));
    } catch {
      /* Incomplete drag/drop graphs must never replace the last complete layout. */
    }
  }
  dispose() {
    this.persist();
    this.disposed = true;
    this.observer.disconnect();
    this.layout.destroy();
  }
}
