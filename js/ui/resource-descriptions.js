const observers = new WeakMap();

export function bindResourceDescriptions(root) {
  observers.get(root)?.disconnect();
  const fullTexts = new Map();
  const update = container => {
    const description = container.querySelector("p");
    const button = container.querySelector("button");
    const expanded = button.getAttribute("aria-expanded") === "true";
    const text = fullTexts.get(container);
    const maxHeight = Number.parseFloat(getComputedStyle(container).lineHeight) * 3 + 1;
    description.textContent = text;
    button.hidden = true;
    if (container.scrollHeight <= maxHeight) return;
    button.hidden = false;
    if (expanded) return;

    const characters = Array.from(text);
    let low = 0, high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      description.textContent = `${characters.slice(0, middle).join("").trimEnd()}…`;
      if (container.scrollHeight <= maxHeight) low = middle;
      else high = middle - 1;
    }
    description.textContent = `${characters.slice(0, low).join("").trimEnd()}…`;
  };
  const observer = new ResizeObserver(entries => entries.forEach(entry => update(entry.target)));
  observers.set(root, observer);
  root.querySelectorAll("[data-resource-description]").forEach((container, index) => {
    const description = container.querySelector("p");
    const button = container.querySelector("button");
    fullTexts.set(container, description.textContent);
    description.id = `resource-description-${index}`;
    button.setAttribute("aria-controls", description.id);
    button.setAttribute("aria-label", button.textContent);
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      button.textContent = expanded ? "접기" : "더 보기";
      button.setAttribute("aria-label", button.textContent);
      update(container);
    });
    update(container);
    observer.observe(container);
  });
  document.fonts.ready.then(() => {
    if (observers.get(root) === observer) root.querySelectorAll("[data-resource-description]").forEach(update);
  });
}
