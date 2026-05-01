export const state = {
  source: "media",
  query: "",
  rows: { media: [], exam: [] },
  selected: new Set(),
  loading: true,
  preview: null,
  upload: {
    file: null,
    dataUrl: "",
    key: "",
    busy: false,
    status: "",
    lastKey: "",
    lastUrl: "",
  },
};

export const SOURCE_LABELS = {
  media: "자료 DB",
  exam: "기출문제 DB",
  upload: "새자료 등록",
};

export const root = document.getElementById("asset-search-root");
