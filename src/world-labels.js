/** DOM billboards use the rendered camera and replica poses; walls and distance hide them. */
export class WorldLabels {
  constructor(engine, renderer, network) {
    Object.assign(this, { engine, renderer, network });
    this.labels = [];
  }
  reset() {
    this.labels = [];
  }
  add(node, widget) {
    this.labels.push({ node, widget });
  }
  update() {
    if (!this.renderer.projectWorld) return;
    for (const { node, widget } of this.labels) {
      const target = widget.target;
      if (target.Destroyed || !target.Visible || !this.engine.isInWorkspace(target)) {
        node.hidden = true;
        continue;
      }
      const pose = this.network?.transform(target) || target;
      const position = pose.Position.Add(widget.offset);
      const projected = this.renderer.projectWorld(position);
      let visible = projected.Visible && projected.Distance <= 80;
      if (visible) {
        const delta = position.Sub(projected.Origin);
        const hit = this.engine.raycast(projected.Origin, delta, target);
        if (hit && hit.Distance < delta.Magnitude - 0.1) visible = false;
      }
      node.hidden = !visible;
      if (visible) {
        node.style.left = projected.X + 'px';
        node.style.top = projected.Y + 'px';
        node.style.zIndex = String(Math.max(1, Math.round(1000 - projected.Distance)));
      }
    }
  }
}
