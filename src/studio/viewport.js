import { Renderer } from '../engine/renderer.js';
import { Renderer3D } from '../engine/renderer3d.js';
import { Vector2, Vector3 } from '../engine/math.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as THREE from 'three';

/** Scene interactions are independent from layout and project file management. */
export class SceneViewport {
  constructor(host, store, { onMenu, onStatus, onError }) {
    Object.assign(this, { host, store, onMenu, onStatus, onError });
    this.grid = true;
    this.snap = false;
    this.mode = 'translate';
    this.last = performance.now();
    this.keys = new Set();
    this.active = true;
    this.abort = new AbortController();
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()), {
      signal: this.abort.signal,
    });
    window.addEventListener(
      'blur',
      () => {
        this.keys.clear();
        this.rightDown = false;
      },
      { signal: this.abort.signal },
    );
    this.store.Changed.Connect((reason) => {
      this.ensureRenderer();
      if (reason === 'selection' || reason === 'document') this.updateGizmo();
    });
    this.ensureRenderer();
    const frame = (now) => {
      if (this.disposed) return;
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      if (this.active && this.canvas.clientWidth && this.canvas.clientHeight) {
        this.fly(dt);
        this.orbit?.update();
        this.renderer.assets = this.store.metadata.assets || {};
        this.renderer.draw(this.store.workspace.GetDescendants(), {
          workspace: this.store.workspace,
          selected: this.store.dimension === '3D' ? this.store.selection : this.store.selection,
          grid: this.grid,
        });
        this.updateGizmo();
      }
      this.frame = requestAnimationFrame(frame);
    };
    this.frame = requestAnimationFrame(frame);
  }
  ensureRenderer() {
    if (this.dimension === this.store.dimension) return;
    this.orbit?.dispose();
    this.transform?.dispose();
    this.renderer?.dispose?.();
    this.canvasAbort?.abort();
    this.dimension = this.store.dimension;
    this.grid = this.dimension !== '3D';
    this.host.querySelector('canvas')?.remove();
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'scene-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Scene editor');
    this.host.prepend(this.canvas);
    this.renderer = new (this.dimension === '3D' ? Renderer3D : Renderer)(
      this.canvas,
      this.store.metadata.assets,
    );
    this.renderer.resize();
    this.canvasAbort = new AbortController();
    const on = (event, callback) =>
      this.canvas.addEventListener(event, callback, { signal: this.canvasAbort.signal });
    if (this.dimension === '3D') this.setup3D();
    else this.renderer.camera.Zoom = 0.7;
    on('keydown', (event) => {
      if (['w', 'a', 's', 'd', ' ', 'control', 'shift'].includes(event.key.toLowerCase())) {
        this.keys.add(event.key.toLowerCase());
        event.preventDefault();
      }
    });
    on('contextmenu', (event) => {
      event.preventDefault();
      if (this.dimension === '3D') return;
      const point = this.point(event),
        node = this.renderer.hitTest(this.store.workspace.GetDescendants(), point);
      if (node && !this.store.selectedIds.has(node.Id)) this.store.select(node);
      this.onMenu(event.clientX, event.clientY, this.insertPosition(point));
    });
    on('pointerdown', (event) => this.pointerDown(event));
    on('pointermove', (event) => this.pointerMove(event));
    on('pointerup', (event) => this.pointerUp(event));
    on('pointercancel', () => this.finishDrag());
    if (this.dimension !== '3D')
      this.canvas.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          const before = this.point(event);
          this.renderer.camera.Zoom = Math.max(
            0.1,
            Math.min(4, this.renderer.camera.Zoom * Math.exp(-event.deltaY * 0.001)),
          );
          const after = this.point(event);
          this.renderer.camera.Position = this.renderer.camera.Position.Add(before.Sub(after));
        },
        { passive: false, signal: this.canvasAbort.signal },
      );
  }
  setup3D() {
    this.renderer.editor = true;
    this.orbit = new OrbitControls(this.renderer.viewCamera, this.canvas);
    this.orbit.enableDamping = true;
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.transform = new TransformControls(this.renderer.viewCamera, this.canvas);
    this.renderer.scene.add(this.transform.getHelper());
    this.transform.addEventListener('change', () => {
      this.renderer.overlayRevision = (this.renderer.overlayRevision || 0) + 1;
    });
    this.transform.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value;
      if (event.value) {
        this.beforeTransform = this.store.project;
        this.startTransformPositions = new Map(
          this.store.selection.map((node) => [node.Id, node.Position]),
        );
        this.activeStart = this.store.selected?.Position;
      } else if (this.beforeTransform) {
        this.store.record(this.beforeTransform);
        this.beforeTransform = null;
      }
    });
    this.transform.addEventListener('objectChange', () => {
      const node = this.store.selected,
        mesh = this.transform.object;
      if (!node || !mesh) return;
      node.Position = new Vector3(mesh.position.x, mesh.position.y, mesh.position.z);
      node.Rotation = new Vector3(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
      node.Size = new Vector3(
        Math.max(0.05, mesh.scale.x),
        Math.max(0.05, mesh.scale.y),
        Math.max(0.05, mesh.scale.z),
      );
      if (this.mode === 'translate' && this.activeStart) {
        const delta = node.Position.Sub(this.activeStart);
        for (const other of this.store.selection)
          if (other !== node && this.startTransformPositions.has(other.Id))
            other.Position = this.startTransformPositions.get(other.Id).Add(delta);
      }
    });
  }
  updateGizmo() {
    if (!this.transform || this.transform.dragging) return;
    const node = this.store.selected,
      mesh = node?.ClassName === 'Object3D' ? this.renderer.meshes.get(node.Id)?.mesh : null;
    if (mesh && this.transform.object !== mesh) this.transform.attach(mesh);
    else if (!mesh) this.transform.detach();
    this.transform.setMode(this.mode);
    this.transform.setTranslationSnap(this.snap ? 1 : null);
    this.transform.setRotationSnap(this.snap ? Math.PI / 12 : null);
    this.transform.setScaleSnap(this.snap ? 0.25 : null);
  }
  setMode(mode) {
    this.mode = mode;
    this.updateGizmo();
  }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    return this.dimension === '3D' ? new Vector2(x, y) : this.renderer.screenToWorld(x, y);
  }
  insertPosition(point) {
    if (this.dimension !== '3D') return point;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (point.X / this.renderer.width) * 2 - 1,
        (-point.Y / this.renderer.height) * 2 + 1,
      ),
      this.renderer.viewCamera,
    );
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)
      ? new Vector3(hit.x, 1, hit.z)
      : new Vector3(0, 1, 0);
  }
  pointerDown(event) {
    this.canvas.focus();
    this.moved = 0;
    this.downScreen = { x: event.clientX, y: event.clientY };
    this.rightDown = event.button === 2;
    if (this.dimension === '3D') return;
    if (event.button === 1 || event.altKey) {
      this.drag = { pan: true, screen: this.downScreen, position: this.renderer.camera.Position };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = this.point(event),
      node = this.renderer.hitTest(this.store.workspace.GetDescendants(), point),
      additive = event.ctrlKey || event.metaKey || event.shiftKey;
    if (node) {
      if (additive || !this.store.selectedIds.has(node.Id)) this.store.select(node, additive);
      const selected = this.store.selection.filter((item) => item.ClassName === 'Object2D');
      this.drag = {
        point,
        before: this.store.project,
        positions: new Map(selected.map((item) => [item, item.Position])),
      };
    } else {
      if (!additive) this.store.select(undefined);
      this.drag = { marquee: true, start: point, end: point, additive };
    }
    this.canvas.setPointerCapture(event.pointerId);
  }
  pointerMove(event) {
    if (this.downScreen)
      this.moved = Math.hypot(event.clientX - this.downScreen.x, event.clientY - this.downScreen.y);
    if (!this.drag) return;
    if (this.drag.pan)
      this.renderer.camera.Position = this.drag.position.Sub(
        new Vector2(
          (event.clientX - this.drag.screen.x) / this.renderer.camera.Zoom,
          (event.clientY - this.drag.screen.y) / this.renderer.camera.Zoom,
        ),
      );
    else if (this.drag.marquee) this.drag.end = this.point(event);
    else {
      const delta = this.point(event).Sub(this.drag.point);
      for (const [node, position] of this.drag.positions) {
        let next = position.Add(delta);
        if (this.snap)
          next = new Vector2(Math.round(next.X / 25) * 25, Math.round(next.Y / 25) * 25);
        node.Position = next;
      }
    }
  }
  pointerUp(event) {
    if (
      this.dimension === '3D' &&
      event.button === 0 &&
      this.moved < 4 &&
      !this.transform.axis &&
      !this.transform.dragging
    ) {
      const node = this.renderer.hitTest(this.store.workspace.GetDescendants(), this.point(event));
      this.store.select(node, event.ctrlKey || event.metaKey || event.shiftKey);
    }
    if (this.dimension === '3D' && event.button === 2 && this.moved < 4) {
      const point = this.point(event),
        node = this.renderer.hitTest(this.store.workspace.GetDescendants(), point);
      if (node && !this.store.selectedIds.has(node.Id)) this.store.select(node);
      this.onMenu(event.clientX, event.clientY, this.insertPosition(point));
    }
    this.finishDrag();
    this.rightDown = false;
  }
  finishDrag() {
    if (this.drag?.before && this.moved > 2) this.store.record(this.drag.before);
    if (this.drag?.marquee && this.moved > 4) {
      const a = this.drag.start,
        b = this.drag.end;
      this.store.selectMany(
        this.store.workspace
          .GetDescendants()
          .filter(
            (node) =>
              node.ClassName === 'Object2D' &&
              node.Position.X >= Math.min(a.X, b.X) &&
              node.Position.X <= Math.max(a.X, b.X) &&
              node.Position.Y >= Math.min(a.Y, b.Y) &&
              node.Position.Y <= Math.max(a.Y, b.Y),
          ),
        this.drag.additive,
      );
    }
    this.drag = null;
  }
  fly(dt) {
    if (this.dimension !== '3D' || !this.rightDown) return;
    const direction = new THREE.Vector3();
    this.renderer.viewCamera.getWorldDirection(direction);
    const right = new THREE.Vector3()
      .crossVectors(direction, new THREE.Vector3(0, 1, 0))
      .normalize();
    const vector = new THREE.Vector3()
      .addScaledVector(direction, Number(this.keys.has('w')) - Number(this.keys.has('s')))
      .addScaledVector(right, Number(this.keys.has('d')) - Number(this.keys.has('a')));
    vector.y += Number(this.keys.has(' ')) - Number(this.keys.has('control'));
    if (vector.lengthSq()) {
      vector.normalize().multiplyScalar(dt * (this.keys.has('shift') ? 30 : 12));
      this.renderer.viewCamera.position.add(vector);
      this.orbit.target.add(vector);
    }
  }
  frameSelection() {
    if (this.dimension === '3D') {
      const target = this.renderer.frame(this.store.selected);
      this.orbit.target.copy(target);
    } else this.renderer.camera.Position = this.store.selected?.Position || new Vector2();
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.canvasAbort.abort();
    this.orbit?.dispose();
    this.transform?.dispose();
    this.renderer?.dispose?.();
  }
}
