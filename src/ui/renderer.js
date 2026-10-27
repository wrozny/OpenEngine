import { computeUILayout } from './layout.js';
const fonts = {
  System: 'system-ui, sans-serif',
  Serif: 'Georgia, serif',
  Monospace: 'ui-monospace, monospace',
};
const alpha = (color, opacity) =>
  /^#[a-f\d]{6}$/i.test(color)
    ? color +
      Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0')
    : color;
const entryFrames = {
  Fade: [{ opacity: 0 }, { opacity: 1 }],
  SlideUp: [
    { opacity: 0, transform: 'translateY(16px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ],
  Pop: [
    { opacity: 0, transform: 'scale(.88)' },
    { opacity: 1, transform: 'scale(1)' },
  ],
};
/** Incremental native DOM controls preserve focus/caret and share authored layout with Studio. */
export class UIRenderer {
  constructor(host, { editing = false, assets = {}, onSelect, onDrop } = {}) {
    Object.assign(this, { host, editing, assets, onSelect, onDrop });
    this.entries = new Map();
    host.classList.add('authored-ui');
  }
  element(node) {
    const wrapper = document.createElement(node.ClassName === 'TextButton' ? 'button' : 'div');
    wrapper.className = 'ui-element';
    wrapper.dataset.uiId = node.Id;
    wrapper.dataset.uiClass = node.ClassName;
    if (node.ClassName === 'ScreenGui') wrapper.classList.add('ui-screen');
    const content = document.createElement(
      node.ClassName === 'ImageLabel' ? 'img' : node.ClassName === 'TextInput' ? 'input' : 'span',
    );
    content.className = 'ui-content';
    wrapper.append(content);
    if (wrapper.tagName === 'BUTTON') wrapper.type = 'button';
    const entry = { wrapper, content, node, visible: false };
    wrapper.addEventListener('pointerenter', () => {
      if (this.editing || entry.node.Disabled) return;
      wrapper.dataset.hover = 'true';
      entry.node.OnHoverStart?.Fire();
    });
    wrapper.addEventListener('pointerleave', () => {
      delete wrapper.dataset.hover;
      if (!this.editing) entry.node.OnHoverEnd?.Fire();
    });
    wrapper.addEventListener('click', (event) => {
      if (this.editing) {
        event.preventDefault();
        event.stopPropagation();
        this.onSelect?.(entry.node, event);
        return;
      }
      if (entry.node.Disabled) return;
      event.stopPropagation();
      entry.node.OnClick?.Fire();
      const effect = entry.node.ClickEffect;
      if (effect && effect !== 'None')
        wrapper.animate(
          [
            { transform: 'scale(1)' },
            { transform: effect === 'Press' ? 'scale(.96)' : 'scale(1.05)' },
            { transform: 'scale(1)' },
          ],
          { duration: 180, easing: 'ease-out' },
        );
    });
    if (content.tagName === 'INPUT')
      content.addEventListener('input', () => {
        if (this.editing) return;
        entry.node.Text = content.value;
        entry.lastText = content.value;
        entry.node.OnValueChanged.Fire(content.value);
      });
    return entry;
  }
  render(service, width, height, options = {}) {
    if (!this.editing && this.viewportKey !== `${width},${height}`) {
      this.viewportKey = `${width},${height}`;
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      this.host.append(probe);
      const style = getComputedStyle(probe);
      this.insets = {
        top: parseFloat(style.paddingTop) || 0,
        right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0,
        left: parseFloat(style.paddingLeft) || 0,
      };
      probe.remove();
    }
    this.layout = computeUILayout(service, width, height, {
      ...options,
      editing: this.editing,
      insets: options.insets || this.insets,
    });
    const alive = new Set(),
      previous = new Map();
    for (const [id, rect] of this.layout) {
      const node = rect.node;
      alive.add(id);
      let entry = this.entries.get(id);
      if (!entry) {
        entry = this.element(node);
        this.entries.set(id, entry);
      }
      entry.node = node;
      const { wrapper, content } = entry,
        parent = rect.parentId ? this.entries.get(rect.parentId)?.wrapper : this.host;
      const prior =
        previous.get(parent) || (parent === this.host ? null : parent.firstElementChild);
      if (wrapper.parentElement !== parent || wrapper.previousElementSibling !== prior)
        parent.insertBefore(wrapper, prior ? prior.nextElementSibling : parent.firstElementChild);
      previous.set(parent, wrapper);
      wrapper.style.left = rect.left + 'px';
      wrapper.style.top = rect.top + 'px';
      wrapper.style.width = rect.width + 'px';
      wrapper.style.height = rect.height + 'px';
      wrapper.hidden = !rect.visible;
      wrapper.style.zIndex = String(
        node.ClassName === 'ScreenGui' ? node.DisplayOrder : node.ZIndex,
      );
      wrapper.style.pointerEvents =
        this.editing ||
        node.Interactable ||
        node.OnClick?.listeners.size ||
        node.OnHoverStart?.listeners.size ||
        node.OnHoverEnd?.listeners.size
          ? 'auto'
          : 'none';
      if (node.ClassName === 'ScreenGui') {
        content.hidden = true;
        wrapper.style.pointerEvents = 'none';
        continue;
      }
      wrapper.style.opacity = String(node.Opacity);
      wrapper.style.backgroundColor = alpha(node.BackgroundColor, node.BackgroundOpacity);
      wrapper.style.border = `${node.BorderWidth * rect.scale}px solid ${node.BorderColor}`;
      wrapper.style.borderRadius =
        (node.GetChildren().find((n) => n.ClassName === 'UICorner')?.Radius ?? node.CornerRadius) *
          rect.scale +
        'px';
      wrapper.style.overflow = node.ClipChildren ? 'hidden' : 'visible';
      wrapper.dataset.hoverEffect = node.HoverEffect;
      wrapper.disabled = !!node.Disabled;
      wrapper.setAttribute('aria-label', node.Name);
      if (content.tagName === 'IMG') {
        const image = node.Image.startsWith('asset:')
          ? this.assets[node.Image.slice(6)]?.data
          : node.Image;
        if (image !== entry.image) {
          if (image) content.src = image;
          else content.removeAttribute('src');
          entry.image = image;
        }
        content.alt = node.Name;
        content.style.objectFit = { Contain: 'contain', Cover: 'cover', Stretch: 'fill' }[
          node.ImageFit
        ];
      } else {
        if (content.tagName === 'INPUT') {
          if (entry.lastText !== node.Text) {
            content.value = node.Text;
            entry.lastText = node.Text;
          }
          content.placeholder = node.Placeholder;
          content.maxLength = node.MaxLength;
          content.disabled = this.editing || node.Disabled || !node.Interactable;
          content.style.pointerEvents = content.disabled ? 'none' : 'auto';
        } else if (content.textContent !== node.Text) content.textContent = node.Text || '';
        content.style.color = node.TextColor || '';
        content.style.fontSize = (node.TextSize || 16) * rect.scale + 'px';
        content.style.fontWeight = String(node.FontWeight || 400);
        content.style.fontFamily = fonts[node.FontFamily] || fonts.System;
        content.style.textAlign = (node.TextAlign || 'Left').toLowerCase();
        content.style.justifyContent =
          { Left: 'flex-start', Center: 'center', Right: 'flex-end' }[node.TextAlign] ||
          'flex-start';
        content.style.alignItems =
          { Top: 'flex-start', Center: 'center', Bottom: 'flex-end' }[node.TextVAlign] || 'center';
        content.style.whiteSpace = node.TextWrapped ? 'pre-wrap' : 'pre';
        content.style.overflowWrap = 'anywhere';
      }
      if (rect.visible && !entry.visible && !this.editing && entryFrames[node.EnterEffect])
        wrapper.animate(entryFrames[node.EnterEffect], { duration: 250, easing: 'ease-out' });
      entry.visible = rect.visible;
    }
    for (const [id, entry] of this.entries)
      if (!alive.has(id)) {
        entry.wrapper.getAnimations().forEach((a) => a.cancel());
        entry.wrapper.remove();
        this.entries.delete(id);
      }
    return this.layout;
  }
  dispose() {
    for (const entry of this.entries.values()) {
      entry.wrapper.getAnimations().forEach((a) => a.cancel());
      entry.wrapper.remove();
    }
    this.entries.clear();
  }
}
