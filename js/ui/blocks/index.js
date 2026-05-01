import { attachFocusAffordance } from "../components.js";
import { buildImage } from "./media.js";
import { renderParagraph, renderHeading, renderSubsection, renderQuote, renderTextBox, renderGroup, renderToggle, renderDivider, renderBlockSeparator } from "./text.js";
import { renderCase, renderQuestion, renderConcept, renderCommentBlock } from "./callouts.js";
import { renderFigure, renderMedia } from "./media.js";
import { renderQuizAccordion } from "./quiz.js";

const FULLSCREEN_TYPES = new Set(["단락", "소제목", "절", "인용", "텍스트박스", "사례", "발문", "개념", "이미지곁글", "미디어", "기출문제"]);
const IMG_SELF_HANDLED = new Set(["이미지곁글", "미디어"]);

export function renderBlock(block, blockIdx) {
  const map = {
    단락: renderParagraph,
    소제목: renderHeading,
    절: renderSubsection,
    구분선: renderDivider,
    댓글: renderCommentBlock,
    인용: renderQuote,
    텍스트박스: renderTextBox,
    그룹: renderGroup,
    토글: renderToggle,
    사례: renderCase,
    발문: renderQuestion,
    개념: renderConcept,
    이미지곁글: renderFigure,
    미디어: renderMedia,
    기출문제: renderQuizAccordion,
  };
  const fn = map[block.type];
  if (!fn) { console.warn("Unknown block type:", block.type); return null; }
  const el = fn(block, blockIdx);
  if (el) {
    if (!IMG_SELF_HANDLED.has(block.type)) {
      if (block.image) {
        const img = buildImage(block.image);
        img.style.marginTop = "1rem";
        el.appendChild(img);
      }
      if (block.images) block.images.forEach(src => {
        const img = buildImage(src);
        img.style.marginTop = "1rem";
        el.appendChild(img);
      });
    }
    if (FULLSCREEN_TYPES.has(block.type)) attachFocusAffordance(el);
  }
  return el;
}

export { renderBlockSeparator };
