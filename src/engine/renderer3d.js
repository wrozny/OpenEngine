import * as THREE from 'three';
import { Vector2, Vector3 } from './math.js';
import { tileGeometry } from './texture-uv.js';
import { MATERIALS, BUILTIN_SKY } from './materials.js';

/** Scene projection and GPU resources are shared by Studio and exported games. */
export class Renderer3D {
  constructor(canvas, assets = {}) {
    this.canvas = canvas;
    this.assets = assets;
    this.width = 1;
    this.height = 1;
    this.editor = false;
    this.camera = {
      Position: new Vector3(0, 3, 8),
      Yaw: 0,
      Pitch: -0.2,
      Distance: 7,
      FirstPerson: false,
    };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.viewCamera.position.set(12, 10, 16);
    this.viewCamera.lookAt(0, 0, 0);
    this.meshes = new Map();
    this.textures = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.scene.add(new THREE.HemisphereLight('#dbeaff', '#737c64', 2.1));
    const sun = new THREE.DirectionalLight('#fff3d8', 2.5);
    sun.position.set(15, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -45,
      right: 45,
      top: 45,
      bottom: -45,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.selection = new THREE.Group();
    this.scene.add(this.selection);
    this.skyKey = null;
    this.textureVersion = 0;
  }
  resolve(url) {
    return url?.startsWith('asset:') ? this.assets[url.slice(6)]?.data : url;
  }
  texture(url) {
    if (!url) return null;
    if (!this.textures.has(url)) {
      const texture = this.textureLoader.load(url, () => {
        this.textureVersion++;
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      this.textures.set(url, texture);
    }
    return this.textures.get(url);
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.viewCamera.aspect = width / height;
      this.viewCamera.updateProjectionMatrix();
    }
  }
  geometry(node) {
    if (node.Shape === 'Sphere') return new THREE.SphereGeometry(0.5, 32, 20);
    if (node.Shape === 'Cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    return new THREE.BoxGeometry(1, 1, 1);
  }
  draw(nodes, { workspace, selected = [], grid = false } = {}) {
    this.resize();
    const sky = workspace?.Skybox ?? 'builtin:sky';
    const skyKey = sky + '|' + workspace?.BackgroundColor;
    if (skyKey !== this.skyKey) {
      this.skyKey = skyKey;
      if (sky) {
        const texture = this.texture(sky === 'builtin:sky' ? BUILTIN_SKY : this.resolve(sky));
        if (texture) {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.scene.background = texture;
        }
      } else this.scene.background = new THREE.Color(workspace?.BackgroundColor || '#000000');
    }
    const active = new Set();
    for (const node of nodes) {
      if (node.ClassName !== 'Object3D' || node.Destroyed) continue;
      active.add(node.Id);
      const key = JSON.stringify([
        node.Shape,
        node.Texture,
        node.Material,
        node.TextureScale,
        node.Color,
        node.Size,
      ]);
      let entry = this.meshes.get(node.Id);
      if (entry?.key !== key) {
        if (entry) this.removeMesh(node.Id);
        const source = this.resolve(node.Texture) || MATERIALS[node.Material] || '';
        const base = this.texture(source),
          map = base?.clone();
        if (map) {
          map.needsUpdate = true;
          map.repeat.set(1, 1);
        }
        const material = new THREE.MeshStandardMaterial({
          color: node.Color,
          map,
          roughness: node.Material === 'Metal' ? 0.35 : 0.85,
          metalness: node.Material === 'Metal' ? 0.65 : 0,
        });
        const mesh = new THREE.Mesh(tileGeometry(this.geometry(node), node), material);
        mesh.userData.node = node;
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        entry = { mesh, key };
        this.meshes.set(node.Id, entry);
      }
      const mesh = entry.mesh;
      mesh.userData.node = node;
      mesh.visible = node.Visible;
      mesh.position.set(node.Position.X, node.Position.Y, node.Position.Z);
      mesh.rotation.set(node.Rotation.X, node.Rotation.Y, node.Rotation.Z, 'YZX');
      mesh.scale.set(node.Size.X, node.Size.Y, node.Size.Z);
    }
    for (const id of this.meshes.keys()) if (!active.has(id)) this.removeMesh(id);
    if (!this.editor) {
      const { Position: p, Yaw: yaw = 0, Pitch: pitch = 0 } = this.camera;
      const direction = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      if (this.camera.Target && !this.camera.Follow) {
        this.viewCamera.position.set(p.X, p.Y, p.Z);
        const t = this.camera.Target;
        this.viewCamera.lookAt(t.X, t.Y, t.Z);
      } else {
        const distance = this.camera.FirstPerson ? 0 : Math.max(0, this.camera.Distance ?? 7);
        this.viewCamera.position.set(p.X, p.Y, p.Z).addScaledVector(direction, -distance);
        this.viewCamera.lookAt(new THREE.Vector3(p.X, p.Y, p.Z).add(direction));
      }
    }
    // Render idle editors once; texture arrival, transforms and camera movement invalidate the frame.
    const signature = JSON.stringify([
      this.width,
      this.height,
      this.skyKey,
      this.textureVersion,
      this.overlayRevision,
      grid,
      this.viewCamera.position.toArray(),
      this.viewCamera.quaternion.toArray(),
      [...this.meshes.values()].map(({ mesh, key }) => [
        key,
        mesh.visible,
        mesh.position.toArray().map((n) => Number(n.toFixed(5))),
        mesh.rotation.toArray(),
        mesh.scale.toArray(),
      ]),
      (Array.isArray(selected) ? selected : [selected]).map((node) => node?.Id),
    ]);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    while (this.selection.children.length) {
      const box = this.selection.children[0];
      this.selection.remove(box);
      box.geometry.dispose();
      box.material.dispose();
    }
    const selection = Array.isArray(selected) ? selected : [selected];
    for (const node of selection) {
      const mesh = node && this.meshes.get(node.Id)?.mesh;
      if (mesh) {
        mesh.updateMatrixWorld();
        const outline = new THREE.BoxHelper(mesh, '#8cb9ff');
        this.selection.add(outline);
      }
    }
    if (grid && !this.grid) {
      this.grid = new THREE.GridHelper(100, 100, '#677286', '#4a5361');
      this.scene.add(this.grid);
    }
    if (this.grid) this.grid.visible = grid;
    this.renderer.render(this.scene, this.viewCamera);
  }
  hitTest(_nodes, point) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((point.X / this.width) * 2 - 1, (-point.Y / this.height) * 2 + 1),
      this.viewCamera,
    );
    return ray
      .intersectObjects([...this.meshes.values()].map((entry) => entry.mesh))
      .find((hit) => hit.object.visible)?.object.userData.node;
  }
  screenToWorld(x, y) {
    return new Vector2(x, y);
  }
  frame(node) {
    const target =
      node?.ClassName === 'Object3D'
        ? new THREE.Vector3(node.Position.X, node.Position.Y, node.Position.Z)
        : new THREE.Vector3();
    const distance = node
      ? Math.max(5, node.Size?.X || 5, node.Size?.Y || 5, node.Size?.Z || 5) * 1.8
      : 18;
    this.viewCamera.position
      .copy(target)
      .add(new THREE.Vector3(distance * 0.8, distance * 0.65, distance));
    this.viewCamera.lookAt(target);
    return target;
  }
  removeMesh(id) {
    const entry = this.meshes.get(id);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.mesh.material.map?.dispose();
    entry.mesh.material.dispose();
    this.meshes.delete(id);
  }
  dispose() {
    for (const id of this.meshes.keys()) this.removeMesh(id);
    for (const texture of this.textures.values()) texture.dispose();
    this.grid?.geometry.dispose();
    this.grid?.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
