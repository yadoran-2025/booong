import { createIntroRoute } from '../js/ui/intro-scooter.js';
import { escapeHtml as esc } from '../js/utils.js';

const { camera, curve } = createIntroRoute();
const STOPS = [.12, .48, .86];

export function pickJourneyLessons(items) {
  const units = new Map();
  for (const item of items) {
    const key = `${item.subject}::${item.unit}`;
    if (!units.has(key) || (!units.get(key).hasScreenshot && item.hasScreenshot)) units.set(key, item);
  }
  const choices = [...units.values()];
  return choices.length <= 3 ? choices : [choices[0], choices[Math.floor(choices.length / 2)], choices.at(-1)];
}

export function projectJourneyStop(progress, width, height, verticalPosition = 1) {
  const point = curve.getPointAt(Math.max(0, Math.min(1, progress))).project(camera);
  const fit = Math.max(width / 1586, height / 992);
  return {
    x: (point.x + 1) * 1586 * fit / 2 + (width - 1586 * fit) / 2,
    y: (1 - point.y) * 992 * fit / 2 + (height - 992 * fit) * verticalPosition,
  };
}

export function createLessonJourney(host) {
  const art = host.parentElement.querySelector('.home-intro__art');
  const stops = host.querySelector('.journey-stops');
  const preview = host.querySelector('.journey-preview');
  let lessons = [];
  let active = -1;
  let signature = '';
  let manual = false;

  function connect(stop) {
    const card = preview.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    const x = Number.parseFloat(stop.style.left), y = Number.parseFloat(stop.style.top);
    const endX = card.left - origin.left + 20, endY = card.bottom - origin.top - 24;
    const middle = (x + endX) / 2;
    host.querySelector('.journey-connection path').setAttribute('d', `M${x} ${y}C${middle} ${y} ${middle} ${endY} ${endX} ${endY}`);
  }

  function show(index) {
    if (!lessons[index]) return;
    stops.querySelectorAll('button').forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    const stop = stops.children[index];
    host.style.setProperty('--light-x', stop.style.left);
    host.style.setProperty('--light-y', stop.style.top);
    if (active === index) { connect(stop); return; }
    active = index;
    const item = lessons[index];
    preview.innerHTML = `<button type="button" class="journey-preview-card" data-lesson="${esc(item.id)}" aria-haspopup="dialog" aria-label="${esc(item.title)} 수업 소개"><img class="journey-cover" src="${esc(item.cover)}" alt=""><span class="journey-card-body"><span class="journey-meta">${esc(item.subject)} · ${esc(item.unit)}</span><span class="journey-title">${esc(item.title)}</span><span class="journey-open">수업 소개 <span aria-hidden="true">→</span></span></span></button>`;
    connect(stop);
  }

  function followRide() {
    if (!lessons.length || manual || document.querySelector('dialog[open]')) return;
    const progress = Number(art.dataset.renderedProgress || 0);
    const index = lessons.reduce((nearest, _, i) => Math.abs(progress - STOPS[i]) < Math.abs(progress - STOPS[nearest]) ? i : nearest, 0);
    show(index);
  }

  function placeStops() {
    if (host.hidden) return;
    const bounds = art.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    const objectY = Number.parseFloat(getComputedStyle(art.querySelector('img')).objectPosition.split(' ')[1]) / 100;
    host.style.setProperty('--art-top', `${bounds.top - origin.top}px`);
    stops.querySelectorAll('button').forEach((button, i) => {
      const point = projectJourneyStop(STOPS[i], bounds.width, bounds.height, objectY);
      button.style.left = `${bounds.left - origin.left + point.x}px`;
      button.style.top = `${bounds.top - origin.top + point.y}px`;
    });
    if (active >= 0) show(active);
  }

  for (const event of ['pointerover', 'focusin']) stops.addEventListener(event, e => {
    const button = e.target.closest('[data-station]');
    if (button) { manual = true; show(Number(button.dataset.station)); }
  });
  preview.addEventListener('pointerenter', () => { manual = true; });
  for (const event of ['wheel', 'touchmove']) window.addEventListener(event, () => { manual = false; }, { passive: true });
  const observer = new MutationObserver(followRide);
  observer.observe(art, { attributes: true, attributeFilter: ['data-rendered-progress'] });
  const resize = new ResizeObserver(placeStops);
  resize.observe(art);

  return {
    update(items) {
      const next = pickJourneyLessons(items);
      const nextSignature = JSON.stringify(next);
      if (signature === nextSignature) return;
      signature = nextSignature;
      lessons = next;
      active = -1;
      manual = false;
      host.hidden = !lessons.length;
      stops.innerHTML = lessons.map((item, i) => `<button type="button" class="journey-beacon" data-station="${i}" data-lesson="${esc(item.id)}" aria-haspopup="dialog" aria-label="${esc(item.unit)} · ${esc(item.title)} 수업 소개"><span>${String(i + 1).padStart(2, '0')}</span></button>`).join('');
      preview.replaceChildren();
      placeStops();
      followRide();
    },
  };
}
