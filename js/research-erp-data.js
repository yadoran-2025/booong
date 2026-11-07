export const CATEGORIES = Object.freeze({ revenue: "매출", other_income: "매출 외 입금", coffee: "커피", meal: "사료(밥)", rent: "연구소 임차료", other_expense: "기타 비용" });
export const EXPENSES = ["coffee", "meal", "rent", "other_expense"];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2000-01-01" && value <= "2099-12-31" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validMonth(value) { return typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value); }
export function seoulDate(now = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function monthBounds(month) {
  if (!validMonth(month)) throw new Error("조회할 월을 선택해주세요.");
  const [year, number] = month.split("-").map(Number);
  return [`${month}-01`, `${year + (number === 12 ? 1 : 0)}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01`];
}
export function validateEntry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("거래 내용을 확인해주세요.");
  if (!validDate(input.date)) throw new Error("거래일은 2000~2099년의 실제 날짜로 입력해주세요.");
  if (!Object.hasOwn(CATEGORIES, input.category)) throw new Error("분류를 선택해주세요.");
  const raw = typeof input.amount === "number" ? String(input.amount) : input.amount;
  if (typeof raw !== "string" || !/^[1-9]\d{0,11}$/.test(raw)) throw new Error("금액은 1원 이상, 1조 원 미만의 정수로 입력해주세요.");
  const amount = Number(raw);
  const text = (name, max, required = false) => {
    if (typeof input[name] !== "string" || input[name].trim().length > max || (required && !input[name].trim())) throw new Error(`${name === "title" ? "내용" : name === "counterparty" ? "거래처" : "메모"}를 확인해주세요. (최대 ${max}자)`);
    return input[name].trim();
  };
  return { date: input.date, category: input.category, amount, title: text("title", 120, true), counterparty: text("counterparty", 120), memo: text("memo", 1000) };
}
export function summarize(entries) {
  const byCategory = Object.fromEntries(Object.keys(CATEGORIES).map(key => [key, 0]));
  for (const entry of entries.filter(item => !item.voided)) byCategory[entry.category] += entry.amount;
  const expenses = EXPENSES.reduce((sum, key) => sum + byCategory[key], 0);
  return { revenue: byCategory.revenue, otherIncome: byCategory.other_income, expenses, difference: byCategory.revenue - expenses, cashChange: byCategory.revenue + byCategory.other_income - expenses, byCategory };
}
export function entriesCsv(entries) {
  const cell = value => `"${String(value ?? "").replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const rows = [["거래일", "분류", "내용", "거래처", "금액(원)", "메모", "상태", "거래 ID", "수정 시각", "수정자"], ...entries.map(e => [e.date, CATEGORIES[e.category], e.title, e.counterparty, e.amount, e.memo, e.voided ? "취소" : "유효", e.id, e.updated_at, e.updated_by])];
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
