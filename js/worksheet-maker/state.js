export const FULLSCREEN_TYPES = new Set([
  "단락",
  "소제목",
  "절",
  "인용",
  "텍스트박스",
  "사례",
  "발문",
  "개념",
  "이미지곁",
  "미디어",
  "기출문제",
]);


export const root = document.getElementById("worksheet-maker-root");

export const state = {
  mode: "basic",
  lessons: [],
  selectedLessonId: "",
  selectedLesson: null,
  fullscreenUnits: [],
  selectedUnitIds: new Set(),
  lessonsLoading: true,
  lessonLoading: false,
  lessonsError: "",
  lessonError: "",
  title: "새 활동지",
  lesson: "",
  subject: "",
  paper: "A4",
};
