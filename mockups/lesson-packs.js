const cards = document.querySelector('#cards');
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
  const tile = event.target.closest('.lesson-tile');
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
});
cards.addEventListener('pointerout', event => {
  if (active && !active.contains(event.relatedTarget)) reset();
});
cards.addEventListener('pointercancel', reset);
cards.addEventListener('click', reset);
window.addEventListener('scroll', reset, { passive: true });
window.addEventListener('resize', reset);
window.addEventListener('blur', reset);
motion.addEventListener('change', reset);
