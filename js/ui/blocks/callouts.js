import { formatInline } from "../../utils.js";
import { renderBlock } from "./index.js";
import { renderQuote, renderTextBox } from "./text.js";
import { appendMaterials, buildMaterial, resolveMaterial } from "./materials.js";
import { buildImagePair } from "./media.js";
import { buildAnswer } from "./quiz.js";
import { appendAsides, asArray, buildTextElement, hasFlowAnswer, normalizeLayout, renderAsideHtml } from "./shared.js";

const CASE_INLINE_OPTIONS = { accentStyle: "color: var(--text); --accent: var(--text)" };

export function renderCallout(block, defaultStyle) {
  const style = block.style ?? defaultStyle;

  if (style === "news") {
    const tc = buildTextCutout(block);
    tc.classList.add("block");
    return tc;
  }

  const title  = block.title  ?? block.label ?? (defaultStyle === "case" ? "사례" : null);
  const body   = block.body   ?? block.text  ?? null;
  const footer = style === "concept" ? null : block.footer ?? block.sub ?? null;

  const div = document.createElement("div");
  div.className = `block callout ${style}`;

  if (style === "concept") {
    if (title) div.appendChild(buildTextElement("div", "concept__title", title, false));
    if (block.flow?.length) appendFlow(div, block.flow, "concept__body");
    else if (body) div.appendChild(buildTextElement("div", "concept__body", formatInline(body)));
  } else {
    if (title) div.appendChild(buildTextElement("div", "callout__label", title, false));
    if (block.flow?.length) appendFlow(div, block.flow, "case__text", { variant: "case" });
    else if (body) div.appendChild(buildTextElement("div", "case__text", formatCaseInline(body)));
    if (footer) div.appendChild(buildTextElement("div", "case__sub", formatCaseInline(footer)));
  }

  if (!block.flow?.length) {
    appendMaterials(div, block.materials, block.materialsLayout);
    appendAsides(div, block.asides);
  }
  if (block.answer && !hasFlowAnswer(block.flow)) div.appendChild(buildAnswer(block.answer));
  return div;
}

export function renderCase(block) {
  return renderCallout(block, "case");
}

export function renderQuestion(block) {
  const div = document.createElement("div");
  div.className = "block callout question";
  div.innerHTML = `<div class="callout__label">생각해볼 문제</div>`;

  block.prompts.forEach(pr => {
    if (pr.flow?.length) {
      const firstTextIdx = pr.flow.findIndex(item => item.type === "text");
      pr.flow.forEach((item, flowIdx) => {
        if (item.type === "materials") {
          appendMaterials(div, item.items, item.layout);
          return;
        }
        if (item.type === "divider") {
          const divider = document.createElement("hr");
          divider.className = "md-divider";
          div.appendChild(divider);
          return;
        }
        if (item.type === "answer") {
          div.appendChild(buildAnswer(item.answer, "답 보기"));
          return;
        }
        if (item.type === "quote") {
          div.appendChild(renderFlowQuote(item));
          return;
        }
        if (item.type === "textBox") {
          div.appendChild(renderFlowTextBox(item));
          return;
        }
        if (item.type === "group") {
          div.appendChild(buildObjectGroup(item.items, item.layout || "row"));
          return;
        }
        if (item.type === "comment") return;
        const p = document.createElement("div");
        p.className = "question__prompt";
        const prefix = flowIdx === firstTextIdx ? "Q. " : "";
        p.innerHTML = `${prefix}${formatInline(item.text || "")}`;
        if (item.asides?.length) p.innerHTML += renderAsideHtml(item.asides, "question__note");
        div.appendChild(p);
      });
    } else {
      const p = document.createElement("div");
      p.className = "question__prompt";
      p.innerHTML = `Q. ${formatInline(pr.q)}`;
      if (pr.note) p.innerHTML += `<div class="question__note">${formatInline(pr.note)}</div>`;
      if (pr.asides?.length) p.innerHTML += renderAsideHtml(pr.asides, "question__note");
      div.appendChild(p);
      appendMaterials(div, pr.materials, pr.materialsLayout);
    }

    // answer는 항상 { text } 또는 { bullets } 객체
    if (pr.answer && !hasFlowAnswer(pr.flow)) div.appendChild(buildAnswer(pr.answer, "답 보기"));

  });

  if (block.imagePair) div.appendChild(buildImagePair(block.imagePair));
  return div;
}

export function renderConcept(block) {
  return renderCallout(block, "concept");
}

export function appendFlow(parent, flow, textClass, context = {}) {
  flow.forEach(item => {
    if (item.type === "materials") {
      appendMaterials(parent, item.items, item.layout);
      return;
    }
    if (item.type === "divider") {
      const divider = document.createElement("hr");
      divider.className = "md-divider";
      parent.appendChild(divider);
      return;
    }
    if (item.type === "answer") {
      parent.appendChild(buildAnswer(item.answer, "답 보기"));
      return;
    }
    if (item.type === "quote") {
      parent.appendChild(renderFlowQuote(item));
      return;
    }
    if (item.type === "textBox") {
      parent.appendChild(renderFlowTextBox(item));
      return;
    }
    if (item.type === "group") {
      parent.appendChild(buildObjectGroup(item.items, item.layout || "row"));
      return;
    }
    if (item.type === "comment") return;
    const text = document.createElement("div");
    text.className = textClass;
    text.innerHTML = context.variant === "case"
      ? formatCaseInline(item.text || "")
      : formatInline(item.text || "");
    parent.appendChild(text);
    appendAsides(parent, item.asides);
  });
}

function formatCaseInline(text) {
  return formatInline(text, CASE_INLINE_OPTIONS);
}

export function renderFlowQuote(item) {
  const quote = renderQuote({ body: item.body || item.text || "", asides: item.asides });
  quote.classList.remove("block");
  return quote;
}

export function renderFlowTextBox(item) {
  const textBox = renderTextBox({ body: item.body || item.text || "" });
  textBox.classList.remove("block");
  return textBox;
}

export function buildObjectGroup(items, layout = "row", extraClass = "") {
  const wrap = document.createElement("div");
  const normalizedLayout = normalizeLayout(layout);
  wrap.className = `object-group object-group--${normalizedLayout} ${extraClass}`.trim();
  asArray(items).forEach(item => {
    const child = buildObjectGroupItem(item);
    if (child) wrap.appendChild(child);
  });
  applyObjectGroupCompositionClass(wrap, normalizedLayout);
  return wrap;
}

export function applyObjectGroupCompositionClass(wrap, layout) {
  if (layout !== "row" || wrap.children.length !== 2) return;

  const [first, second] = wrap.children;
  const firstIsImage = first.classList.contains("material--image");
  const secondIsImage = second.classList.contains("material--image");
  const firstIsQuote = first.classList.contains("quote-block") || first.classList.contains("text-cutout");
  const secondIsQuote = second.classList.contains("quote-block") || second.classList.contains("text-cutout");

  if (firstIsImage && secondIsQuote) {
    wrap.classList.add("object-group--image-quote");
  } else if (firstIsQuote && secondIsImage) {
    wrap.classList.add("object-group--quote-image");
  }
}

export function buildObjectGroupItem(item) {
  if (typeof item === "string" || item?.ref) {
    const material = resolveMaterial(item);
    return material ? buildMaterial(material) : null;
  }
  if (item?.type === "인용") {
    const quote = renderQuote(item);
    quote.classList.remove("block");
    return quote;
  }
  if (item?.type === "텍스트박스" || item?.type === "textBox") {
    const textBox = renderTextBox(item);
    textBox.classList.remove("block");
    return textBox;
  }
  return renderBlock(item);
}
