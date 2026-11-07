import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { escapeHtml as esc } from "./utils.js";
import { CATEGORIES, EXPENSES, validateEntry, summarize, entriesCsv, seoulDate, validMonth } from "./research-erp-data.js";

const root = document.querySelector("#admin-root");
const categoryOptions = () => [false, true].map(expense => `<optgroup label="${expense ? "지출" : "수입"}">${Object.entries(CATEGORIES).filter(([key]) => EXPENSES.includes(key) === expense).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</optgroup>`).join("");
const won = value => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
async function start() {
  if (!await requireAdmin(root)) return;
  const account = adminAccountId();
  let month = seoulDate().slice(0, 7), entries = [], loaded = false, busy = false, editing = null, draftId = crypto.randomUUID(), sequence = 0;
  root.innerHTML = `<div class="admin-shell erp">
    <nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="admin.html">BOOONG <small>OPERATIONS</small></a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav>
    <header class="admin-home__hero"><div><p class="analytics__eyebrow">커피 한 잔부터, 연구소 한 달까지</p><h1>연구소 ERP<span>.</span></h1><p>들어온 돈과 연구를 이어가는 비용을 기록합니다.</p></div><label class="field erp-month"><span class="field__label">조회할 월 · 한국 시간 기준</span><input class="field__input" type="month" min="2000-01" max="2099-12" value="${month}" data-month></label></header>
    <p class="erp-status" data-load-status role="status" aria-live="polite"></p>
    <section class="erp-summary" aria-label="월별 요약" data-summary></section>
    <p class="erp-note">실제 입출금이 끝난 거래를 기록해요. 매출 외 입금은 분리하며, 차액은 이 장부의 기록 기준입니다. 통장 잔액이나 세무상 손익과 다를 수 있어요.</p>
    <div class="erp-workspace">
      <section class="erp-ledger" aria-labelledby="ledger-title">
        <header class="erp-section-heading"><div><h2 id="ledger-title">이달의 장부</h2><p data-count>불러오는 중</p></div><button class="btn btn--secondary" type="button" data-export disabled>CSV 내보내기</button></header>
        <div class="erp-filters"><label class="field"><span class="field__label">수입·지출</span><select class="field__input" data-direction><option value="all">전체 거래</option><option value="in">수입</option><option value="out">지출</option></select></label><label class="field"><span class="field__label">분류</span><select class="field__input" data-filter><option value="all">전체 분류</option>${categoryOptions()}</select></label><label class="field"><span class="field__label">내용·거래처 찾기</span><input class="field__input" type="search" data-search placeholder="검색어 입력"></label><label class="erp-checkbox"><input type="checkbox" data-voided> 취소 내역 포함</label></div>
        <div data-ledger></div>
        <section class="erp-breakdown" aria-labelledby="expense-title"><h3 id="expense-title">연구소를 움직인 비용</h3><div data-breakdown></div></section>
      </section>
      <section class="erp-editor" aria-labelledby="editor-title">
        <header class="erp-section-heading"><h2 id="editor-title">새 거래 기록</h2><button class="btn btn--ghost" type="button" data-new>새로 입력</button></header>
        <form data-form>
          <fieldset class="erp-presets"><legend>자주 쓰는 분류</legend>${Object.keys(CATEGORIES).map(key => `<button class="btn btn--secondary" type="button" data-preset="${key}">${CATEGORIES[key]}</button>`).join("")}</fieldset>
          <div class="erp-field-pair"><label class="field"><span class="field__label">거래일</span><input class="field__input" type="date" name="date" min="2000-01-01" max="2099-12-31" required></label><label class="field"><span class="field__label">분류</span><select class="field__input" name="category">${categoryOptions()}</select></label></div>
          <p class="erp-field-hint" data-kind-hint>강의·자료 판매 등 연구소 활동으로 받은 돈을 기록해요.</p>
          <label class="field"><span class="field__label">금액 · 원</span><input class="field__input erp-amount" name="amount" type="text" inputmode="numeric" pattern="([1-9][0-9]{0,11}|[1-9][0-9]{0,2}(,[0-9]{3}){1,3})" maxlength="15" required placeholder="0" aria-describedby="amount-hint"><span class="erp-field-hint" id="amount-hint">원 단위 정수로 입력해요. 4,500처럼 쉼표를 넣어도 돼요.</span></label>
          <label class="field"><span class="field__label">내용</span><input class="field__input" name="title" maxlength="120" required placeholder="예: 11월 강의료, 연구 모임 점심"></label>
          <label class="field"><span class="field__label">거래처 <small>선택</small></span><input class="field__input" name="counterparty" maxlength="120" placeholder="입금한 곳 또는 결제한 곳"></label>
          <label class="field"><span class="field__label">메모 <small>선택</small></span><textarea class="field__input" name="memo" maxlength="1000" rows="3" placeholder="참석 인원, 영수증 보관 위치 등"></textarea></label>
          <label class="erp-checkbox erp-duplicate" hidden data-duplicate><input type="checkbox" data-duplicate-confirm> 같은 날짜·분류·금액·내용이 있어요. 별도 거래임을 확인했습니다.</label>
          <p class="erp-status" data-save-status role="status" aria-live="polite"></p>
          <button class="btn btn--primary" type="submit" data-save>거래 저장</button>
          <button class="btn btn--ghost" type="button" data-cancel-edit hidden>수정 취소</button>
        </form>
      </section>
    </div><footer class="admin-footer">사회교육공동체 BOOONG <span>연구소 운영 장부 · KRW</span></footer>
  </div>`;
  const $ = selector => root.querySelector(selector);
  const form = $("[data-form]"), status = $("[data-save-status]"), loadStatus = $("[data-load-status]");
  function lock(value) {
    busy = value;
    root.querySelectorAll("button,input,select,textarea").forEach(el => { el.disabled = value || adminAccountId() !== account; });
    $("[data-export]").disabled ||= !loaded;
    $("[data-save]").disabled ||= !loaded || (editing?.voided ?? false);
  }
  onAdminAccountChange(id => {
    if (id === account) return;
    ++sequence;
    entries = []; loaded = false;
    $("[data-summary]").innerHTML = ""; $("[data-ledger]").innerHTML = ""; $("[data-breakdown]").innerHTML = "";
    $("[data-count]").textContent = "";
    form.reset(); lock(false);
    loadStatus.textContent = "로그인 계정이 변경되어 장부를 닫았습니다. 새로고침 후 권한을 다시 확인해주세요.";
  });
  function hint() {
    const category = form.elements.category.value;
    $("[data-kind-hint]").textContent = category === "revenue" ? "강의·자료 판매 등 연구소 활동으로 받은 돈을 기록해요."
      : category === "other_income" ? "차입금·운영자 입금·보증금 반환 등 매출이 아닌 입금은 여기 기록해요."
      : "실제로 지출한 비용을 기록해요. 보증금 등 자산 거래는 비용으로 기록하기 전에 확인해주세요.";
  }
  function reset() {
    editing = null; draftId = crypto.randomUUID(); form.reset();
    form.elements.date.value = month === seoulDate().slice(0, 7) ? seoulDate() : `${month}-01`;
    $("#editor-title").textContent = "새 거래 기록"; $("[data-save]").textContent = "거래 저장";
    $("[data-cancel-edit]").hidden = true; $("[data-duplicate]").hidden = true; hint(); lock(false);
  }
  function render() {
    const total = summarize(entries);
    $("[data-summary]").innerHTML = [["매출", total.revenue, "연구소 활동 수입"], ["비용", total.expenses, "커피 · 밥 · 임차료 · 기타"], ["매출 − 비용", total.difference, "매출 외 입금 제외"], ["입출금 차액", total.cashChange, `매출 외 입금 ${won(total.otherIncome)} 포함`]].map(([label, value, detail]) => `<article><p>${label}</p><strong>${won(value)}</strong><small>${detail}</small></article>`).join("");
    const category = $("[data-filter]").value, query = $("[data-search]").value.trim().toLowerCase(), showVoided = $("[data-voided]").checked;
    const direction = $("[data-direction]").value;
    const filtered = entries.filter(e => (direction === "all" || (EXPENSES.includes(e.category) ? "out" : "in") === direction) && (showVoided || !e.voided) && (category === "all" || e.category === category) && `${e.title} ${e.counterparty}`.toLowerCase().includes(query));
    $("[data-count]").textContent = `${month.replace("-", "년 ")}월 · 유효 ${entries.filter(e => !e.voided).length}건 · 표시 ${filtered.length}건`;
    $("[data-ledger]").innerHTML = filtered.length ? `<div class="erp-table-scroll"><table class="erp-table"><caption class="sr-only">선택한 월의 거래 내역</caption><thead><tr><th scope="col">거래일 / 분류</th><th scope="col">내용 / 거래처</th><th scope="col">금액</th><th scope="col">관리</th></tr></thead><tbody>${filtered.map(e => `<tr${e.voided ? ' class="is-voided"' : ""}><td><time datetime="${esc(e.date)}">${esc(e.date.slice(5).replace("-", "."))}</time><small>${esc(CATEGORIES[e.category])}${e.voided ? " · 취소" : ""}</small></td><td><strong>${esc(e.title)}</strong><small>${esc(e.counterparty || "거래처 미기재")}</small>${e.memo ? `<details><summary>메모</summary><p>${esc(e.memo)}</p></details>` : ""}<small class="erp-audit">${esc(e.updated_by)} · ${esc(new Date(e.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</small></td><td class="erp-number">${EXPENSES.includes(e.category) ? "−" : "+"}${won(e.amount)}</td><td><button class="btn btn--ghost" type="button" data-edit="${esc(e.id)}" aria-label="${esc(e.title)} ${e.voided ? "보기" : "수정"}">${e.voided ? "보기" : "수정"}</button><button class="btn btn--ghost" type="button" data-void="${esc(e.id)}" aria-label="${esc(e.title)} ${e.voided ? "복원" : "취소"}">${e.voided ? "복원" : "취소"}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="erp-empty"><strong>${entries.length ? "조건에 맞는 거래가 없어요." : "이달의 첫 거래를 기록해보세요."}</strong><p>${entries.length ? "분류나 검색어를 바꾸면 다른 내역을 볼 수 있어요." : "들어온 돈은 매출로, 커피와 밥은 비용으로 차곡차곡."}</p></div>`;
    $("[data-breakdown]").innerHTML = EXPENSES.map(key => `<div class="erp-cost"><span>${CATEGORIES[key]}</span><progress max="${Math.max(1, total.expenses)}" value="${total.byCategory[key]}" aria-label="${CATEGORIES[key]} 비용 비중"></progress><strong>${won(total.byCategory[key])}</strong></div>`).join("");
    lock(busy);
  }
  async function load() {
    const current = ++sequence; loaded = false; entries = []; render(); lock(true);
    loadStatus.textContent = "장부를 불러오고 있습니다…";
    try {
      const response = await adminFetch(`/api/research-erp?month=${month}`);
      const body = await response.json();
      if (current !== sequence || adminAccountId() !== account) return;
      if (!response.ok || !Array.isArray(body.entries)) throw new Error([401,403].includes(response.status) ? "운영자 권한을 다시 확인해주세요." : response.status === 409 ? "조회 중 장부가 바뀌었습니다. 다시 불러와주세요." : body.reason === "sheets_not_configured" ? "Google 시트 연결 설정을 확인해주세요. 연결 전에는 거래를 저장할 수 없어요." : body.reason === "ledger_busy" ? "다른 작업의 저장 결과를 확인하고 있습니다. 잠시 후 다시 불러와주세요. 문제가 계속되면 관리자에게 문의해주세요." : body.reason === "ledger_invalid" ? "시트에 확인이 필요한 행이나 열이 있습니다. 원장 구조와 거래 ID를 확인해주세요." : response.status === 422 ? "월 거래가 5,000건을 넘었습니다. 관리자에게 조회 범위 확장을 요청해주세요." : "장부를 불러오지 못했습니다. 저장소 설정과 연결을 확인한 뒤 다시 불러와주세요.");
      entries = body.entries; loaded = true; render();
      loadStatus.textContent = `${body.storage === "google_sheets" ? "Google 시트 연결됨 · " : ""}선택한 월 전체 기준 · 취소 거래는 합계에서 제외합니다.`;
    } catch (error) {
      if (current !== sequence) return;
      $("[data-summary]").innerHTML = ""; $("[data-ledger]").innerHTML = '<button class="btn btn--secondary" type="button" data-retry>다시 불러오기</button>';
      $("[data-breakdown]").innerHTML = ""; $("[data-count]").textContent = "조회 실패"; loadStatus.textContent = error.message;
    } finally { if (current === sequence) lock(false); }
  }
  function failure(response, reason) {
    return reason === "ledger_busy" ? "다른 작업의 저장 결과를 확인하고 있습니다. 잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의해주세요."
      : reason === "month_too_large" ? "이달 거래가 5,000건에 도달했습니다. 조회 범위 확장을 요청해주세요."
      : response.status === 409 ? "다른 곳에서 수정한 거래입니다. 입력 내용을 보관한 뒤 장부를 다시 불러와 확인해주세요."
      : [401,403].includes(response.status) ? "운영자 권한을 다시 확인해주세요."
      : "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 등록을 막고 결과를 확인합니다. 수정 중이었다면 장부를 다시 불러와 확인해주세요.";
  }
  async function save(value, existing = null) {
    if (busy || !loaded || adminAccountId() !== account) return;
    lock(true); status.textContent = "저장하고 있습니다…";
    try {
      const response = await adminFetch("/api/research-erp", { method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...value, id: existing?.id || draftId, ...(existing ? { revision: existing.revision } : {}) }) });
      const result = await response.json();
      if (adminAccountId() !== account) return;
      if (!response.ok || !result.entry?.id) throw new Error(failure(response, result.reason));
      const saved = result.entry;
      entries = entries.filter(e => e.id !== saved.id);
      if (saved.date.startsWith(month)) entries.push(saved);
      entries.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      reset(); render();
      status.textContent = saved.date.startsWith(month) ? "저장했습니다." : `${saved.date.slice(0, 7)}월 장부에 저장했습니다. 조회할 월을 바꿔 확인해주세요.`;
    } catch (error) { if (adminAccountId() === account) status.textContent = error.message; }
    finally { lock(false); }
  }
  $("[data-month]").addEventListener("change", async event => {
    if (!validMonth(event.target.value)) { event.target.value = month; return; }
    if (["title", "amount", "memo", "counterparty"].some(key => form.elements[key].value) && !confirm("입력 중인 내용이 사라집니다. 조회할 월을 바꿀까요?")) { event.target.value = month; return; }
    month = event.target.value; reset(); await load();
  });
  for (const selector of ["[data-filter]", "[data-direction]", "[data-voided]"]) $(selector).addEventListener("change", render);
  $("[data-search]").addEventListener("input", render);
  form.elements.category.addEventListener("change", hint);
  form.addEventListener("input", event => { if (event.target.matches("[data-duplicate-confirm]")) return; $("[data-duplicate]").hidden = true; $("[data-duplicate-confirm]").checked = false; });
  root.addEventListener("click", event => {
    if (busy || adminAccountId() !== account) return;
    const preset = event.target.closest("[data-preset]");
    if (preset) { form.elements.category.value = preset.dataset.preset; hint(); $("[data-duplicate-confirm]").checked = false; form.elements.amount.focus(); }
    if (event.target.closest("[data-retry]")) load();
    if (event.target.closest("[data-new], [data-cancel-edit]")) {
      if (["title", "amount", "memo", "counterparty"].some(key => form.elements[key].value) && !confirm("입력 중인 내용을 비우고 새로 입력할까요?")) return;
      reset(); status.textContent = ""; form.elements.amount.focus();
    }
    const edit = event.target.closest("[data-edit]"), voidButton = event.target.closest("[data-void]");
    const entry = entries.find(e => e.id === (edit?.dataset.edit || voidButton?.dataset.void));
    if (!entry) return;
    if (voidButton) {
      if (confirm(`${["title", "amount", "memo", "counterparty"].some(key => form.elements[key].value) ? "입력 중인 내용은 비워집니다.\n" : ""}${entry.title} · ${won(entry.amount)}\n이 거래를 ${entry.voided ? "복원할까요?" : "취소할까요? 기록은 보관되며 합계에서 제외됩니다."}`)) save({ ...entry, voided: !entry.voided }, entry);
      return;
    }
    if (["title", "amount", "memo", "counterparty"].some(key => form.elements[key].value) && !confirm("입력 중인 내용을 비우고 이 거래를 열까요?")) return;
    editing = entry;
    for (const key of ["date", "category", "amount", "title", "counterparty", "memo"]) form.elements[key].value = entry[key];
    $("#editor-title").textContent = entry.voided ? "취소한 거래" : "거래 수정"; $("[data-save]").textContent = "수정 내용 저장"; $("[data-cancel-edit]").hidden = false;
    $("[data-duplicate]").hidden = true; hint(); lock(false);
    status.textContent = entry.voided ? "장부에서 복원한 뒤 수정할 수 있어요." : "저장하면 월별 합계에도 반영됩니다.";
    form.elements.title.focus();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      const input = Object.fromEntries(new FormData(form));
      input.amount = input.amount.replaceAll(",", "");
      const value = validateEntry(input);
      const duplicate = entries.some(e => e.id !== editing?.id && !e.voided && ["date", "category", "amount", "title"].every(key => e[key] === value[key]));
      if (duplicate && !$("[data-duplicate-confirm]").checked) { $("[data-duplicate]").hidden = false; status.textContent = "같은 거래가 이미 있는지 확인해주세요."; return; }
      save({ ...value, voided: editing?.voided || false }, editing);
    } catch (error) { status.textContent = error.message; }
  });
  $("[data-export]").addEventListener("click", () => {
    if (!loaded || adminAccountId() !== account) return;
    const url = URL.createObjectURL(new Blob([entriesCsv(entries)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `BOOONG-연구소-${month}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  reset(); await load();
}
start().catch(() => { root.innerHTML = '<p class="analytics__empty" role="alert">연구소 장부를 열지 못했습니다. 새로고침 후 다시 시도해주세요.</p>'; });
