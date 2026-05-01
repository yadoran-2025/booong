export function createBlankLesson() {
  return {
    id: "new-lesson",
    title: "새 수업",
    subtitle: "",
    imageBase: "assets/images/",
    prev: "",
    next: "",
    sections: [createSection(1)],
  };
}

export function createSampleLesson() {
  return {
    id: "sample-lesson",
    title: "샘플 수업",
    subtitle: "폼으로 작성한 수업 예시",
    imageBase: "assets/images/",
    prev: "",
    next: "",
    sections: [
      {
        id: "1-1",
        title: "첫 번째 섹션",
        blocks: [
          { type: "단락", text: "본문은 이곳에 입력합니다. **굵게**와 줄바꿈을 사용할 수 있습니다." },
          { type: "발문", prompts: [{ q: "학생들에게 던질 질문을 적어보세요.", note: "", answer: "" }] },
          { type: "댓글" },
          { type: "개념", title: "핵심 개념", body: "개념 설명을 적습니다.\n- 중요한 항목 1\n- 중요한 항목 2" },
        ],
      },
    ],
  };
}

export function createSection(number) {
  return {
    id: `section-${number}`,
    title: "새 섹션",
    blocks: [createBlock("단락")],
  };
}

export function createBlock(type) {
  switch (type) {
    case "단락":
    case "소제목":
      return { type, text: "" };
    case "사례":
      return { type, title: "사례", body: "", footer: "", answer: "", materials: [] };
    case "발문":
      return { type, prompts: [{ q: "", note: "", answer: "", materials: [] }] };
    case "댓글":
      return { type };
    case "개념":
      return { type, title: "", body: "", materials: [] };
    case "이미지곁글":
      return { type, kind: "concept", image: "", caption: "", title: "", body: "", note: "" };
    case "미디어":
      return { type, layout: "stack", items: [] };
    case "기출문제":
      return { type, items: [] };
    default:
      return { type: "단락", text: "" };
  }
}

export function createArrayItem(kind) {
  if (kind === "prompt") return { q: "", note: "", answer: "" };
  if (kind === "quiz") return { image: "", answer: "" };
  if (kind === "childBlock") return createBlock("단락");
  if (kind === "materialRef") return "";
  if (kind === "materialText") return { kind: "text", title: "", body: "", source: "" };
  return "";
}
