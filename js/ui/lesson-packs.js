const paths = {
  view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  comment: '<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2z"/>',
};
export const packIcon = name => `<svg class="pack-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
const bindings = new WeakMap();

export function bindLessonPacks(root) {
  bindings.get(root)?.abort();
  const controller = new AbortController();
  const { signal } = controller;
  bindings.set(root, controller);
  const cards = root;
  const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  const properties = ['--pack-rx', '--pack-ry', '--pack-light-x', '--pack-light-y', '--pack-photo-x'];
  let active;
  let bounds;
  let frame;
  
  function reset() {
    cancelAnimationFrame(frame);
    if (active) properties.forEach(name => active.style.removeProperty(name));
    active = null;
  }
  
  cards.addEventListener('pointermove', event => {
    if (!motion.matches || event.pointerType === 'touch') return;
    const tile = event.target.closest('.lesson-pack');
    if (!tile) return reset();
    if (tile !== active) {
      reset();
      active = tile;
      // Keep the hit geometry fixed while the rendered pack tilts.
      bounds = tile.getBoundingClientRect();
    }
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      active.style.setProperty('--pack-rx', `${(0.5 - y) * 8}deg`);
      active.style.setProperty('--pack-ry', `${(x - 0.5) * 10}deg`);
      active.style.setProperty('--pack-light-x', `${x * 100}%`);
      active.style.setProperty('--pack-light-y', `${y * 100}%`);
      active.style.setProperty('--pack-photo-x', `${(x - 0.5) * 6}px`);
    });
  }, { signal });
  cards.addEventListener('pointerout', event => {
    if (active && !active.contains(event.relatedTarget)) reset();
  }, { signal });
  cards.addEventListener('pointercancel', reset, { signal });
  cards.addEventListener('click', reset, { signal });
  window.addEventListener('scroll', reset, { passive: true, signal });
  window.addEventListener('resize', reset, { signal });
  window.addEventListener('blur', reset, { signal });
  motion.addEventListener('change', reset, { signal });
  signal.addEventListener("abort", reset, { once: true });
}
