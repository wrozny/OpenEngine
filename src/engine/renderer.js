import { Vector2 } from './math.js';

/** Canvas renderer deliberately has no dependency on editor or scripting state. */
export class Renderer {
  constructor(canvas, assets = {}) {
    this.assets = assets;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.camera = { Position: new Vector2(), Zoom: 1 };
    this.images = new Map();
    this.width = 1;
    this.height = 1;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.round(rect.width * dpr) ||
      this.canvas.height !== Math.round(rect.height * dpr)
    ) {
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  screenToWorld(x, y) {
    return new Vector2(
      (x - this.width / 2) / this.camera.Zoom + this.camera.Position.X,
      (y - this.height / 2) / this.camera.Zoom + this.camera.Position.Y,
    );
  }
  worldToScreen(position) {
    return new Vector2(
      (position.X - this.camera.Position.X) * this.camera.Zoom + this.width / 2,
      (position.Y - this.camera.Position.Y) * this.camera.Zoom + this.height / 2,
    );
  }
  draw(nodes, options = {}) {
    this.resize();
    const ctx = this.context;
    const zoom = Math.max(0.1, Math.min(4, this.camera.Zoom));
    ctx.fillStyle = '#101b1b';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camera.Position.X, -this.camera.Position.Y);
    const topLeft = this.screenToWorld(0, 0),
      bottomRight = this.screenToWorld(this.width, this.height);
    const spacing = options.grid ? 50 : 100;
    ctx.strokeStyle = options.grid ? '#233334' : '#192727';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = Math.floor(topLeft.X / spacing) * spacing; x < bottomRight.X; x += spacing) {
      ctx.moveTo(x, topLeft.Y);
      ctx.lineTo(x, bottomRight.Y);
    }
    for (let y = Math.floor(topLeft.Y / spacing) * spacing; y < bottomRight.Y; y += spacing) {
      ctx.moveTo(topLeft.X, y);
      ctx.lineTo(bottomRight.X, y);
    }
    ctx.stroke();
    const objects = [...nodes]
      .filter((n) => n.ClassName === 'Object2D' && n.Visible && !n.Destroyed)
      .sort((a, b) => a.Layer - b.Layer);
    for (const node of objects) {
      const { X: x, Y: y } = node.Position;
      if (
        x + node.Size.X < topLeft.X ||
        x - node.Size.X > bottomRight.X ||
        y + node.Size.Y < topLeft.Y ||
        y - node.Size.Y > bottomRight.Y
      )
        continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(node.Rotation || 0);
      ctx.fillStyle = node.Color;
      ctx.shadowColor = '#0007';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      ctx.beginPath();
      if (node.Shape === 'Circle') ctx.arc(0, 0, node.Size.X / 2, 0, Math.PI * 2);
      else
        ctx.roundRect(
          -node.Size.X / 2,
          -node.Size.Y / 2,
          node.Size.X,
          node.Size.Y,
          Math.min(5, node.Size.X / 4),
        );
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = '#ffffff18';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      const texture = node.Texture?.startsWith('asset:')
        ? this.assets[node.Texture.slice(6)]?.data
        : node.Texture;
      if (texture && typeof Image !== 'undefined') {
        if (!this.images.has(texture)) {
          const image = new Image();
          image.src = texture;
          this.images.set(texture, image);
        }
        const image = this.images.get(texture);
        if (image.complete && image.naturalWidth) {
          ctx.save();
          ctx.drawImage(image, -node.Size.X / 2, -node.Size.Y / 2, node.Size.X, node.Size.Y);
          ctx.restore();
        }
      }
      if (node.ShowHealthBar) {
        const health = node.GetAttribute('Health'),
          max = node.GetAttribute('MaxHealth');
        if (typeof health === 'number' && max > 0 && health < max) {
          ctx.fillStyle = '#14211b';
          ctx.fillRect(-16, -node.Size.Y / 2 - 10, 32, 3);
          ctx.fillStyle = '#b4d16c';
          ctx.fillRect(-16, -node.Size.Y / 2 - 10, Math.max(0, health / max) * 32, 3);
        }
      }
      ctx.restore();
    }
    for (const node of Array.isArray(options.selected) ? options.selected : [options.selected])
      if (node?.ClassName === 'Object2D') this.drawSelection(ctx, node, zoom);
    ctx.restore();
  }
  drawSelection(ctx, node, zoom) {
    const pad = 6 / zoom,
      halfW = node.Size.X / 2 + pad,
      halfH = node.Size.Y / 2 + pad;
    ctx.save();
    ctx.translate(node.Position.X, node.Position.Y);
    ctx.rotate(node.Rotation || 0);
    ctx.strokeStyle = '#8bdcd0';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
    ctx.fillStyle = '#8bdcd0';
    for (const x of [-halfW, halfW])
      for (const y of [-halfH, halfH]) ctx.fillRect(x - 3 / zoom, y - 3 / zoom, 6 / zoom, 6 / zoom);
    ctx.restore();
  }
  hitTest(nodes, point) {
    return [...nodes]
      .filter((n) => n.ClassName === 'Object2D' && n.Visible)
      .sort((a, b) => b.Layer - a.Layer)
      .find((n) => {
        const dx = point.X - n.Position.X,
          dy = point.Y - n.Position.Y,
          c = Math.cos(n.Rotation),
          s = Math.sin(n.Rotation);
        const x = dx * c + dy * s,
          y = -dx * s + dy * c;
        return n.Shape === 'Circle'
          ? Math.hypot(x, y) <= n.Size.X / 2
          : Math.abs(x) <= n.Size.X / 2 && Math.abs(y) <= n.Size.Y / 2;
      });
  }
}
