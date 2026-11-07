// ═══════════════════════════════════════
//  MATERIAL DEFAULTS
// ═══════════════════════════════════════
const MATERIAL_DEFAULTS = [
  { id: 'red_brick', name: '빨간 벽돌', emoji: '🧱', missionNeed: 2 },
  { id: 'iron', name: '철근', emoji: '🔩', missionNeed: 1 },
  { id: 'blue_brick', name: '파란 벽돌', emoji: '🔷', missionNeed: 0 },
  { id: 'cement', name: '시멘트', emoji: '🪨', missionNeed: 1 },
  { id: 'urethane', name: '우레탄', emoji: '🟡', missionNeed: 0 },
  { id: 'plywood', name: '나무합판', emoji: '🪵', missionNeed: 1 },
];

// 팀 수 → 권장 카드 수량 (확정 규칙)
// 빨간 벽돌 : 팀수 × 2 + 1
// 철근      : 팀수 + 1
// 파란 벽돌 : 항상 1장 (고정)
// 시멘트    : 팀수
// 우레탄    : 항상 20장 (고정)
// 나무합판  : 팀수 - 1
function calcRecommendedStock(n) {
  return {
    red_brick: n * 2 + 1,
    iron: n + 1,
    blue_brick: 1,
    cement: n,
    urethane: 20,
    plywood: Math.max(1, n - 1),
  };
}

// ═══════════════════════════════════════
//  RUNTIME STATE
// ═══════════════════════════════════════
let currentSlotName = null;
let teams = [];
let materials = [];
let curIdx = 0;
let curBid = 1;
let logs = [];
let saleHistory = [];       // { matId, price, teamName }
let chartMatId = 'red_brick';
let currentQty = 1;

// ═══════════════════════════════════════
//  TAB
// ═══════════════════════════════════════
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  if (id === 'auction') refreshAuctionUI();
  if (id === 'score') renderScore();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ═══════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════
function buildSetupForm() {
  const n = parseInt(document.getElementById('teamCount').value);
  const rec = calcRecommendedStock(n);

  // 팀 이름
  let html = '';
  for (let i = 1; i <= n; i++) {
    html += `<div style="margin-bottom:0.45rem;">
      <label>팀 ${i} 이름</label>
      <input type="text" id="tname${i}" value="${i}팀">
    </div>`;
  }
  document.getElementById('teamNameInputs').innerHTML = html;

  // 재료 수량 (자동 계산값 표시, 직접 수정 가능)
  document.getElementById('stockInputs').innerHTML = MATERIAL_DEFAULTS.map((m, i) => {
    const auto = rec[m.id];
    // 이제 모든 재료를 수정 가능하게 변경 (fixed 조건 제거)
    return `<div class="stock-row">
      <span class="stock-name">${m.emoji} ${m.name}</span>
      <span class="stock-auto" id="auto${i}">권장 ${auto}장</span>
      <div class="stock-input-wrap">
        <input type="number" id="mstock${i}" value="${auto}" min="1" max="99" class="auto-set"
          oninput="onStockInput(${i})">
      </div>
    </div>`;
  }).join('');
}

function onTeamCountChange() {
  const n = parseInt(document.getElementById('teamCount').value);
  const rec = calcRecommendedStock(n);
  MATERIAL_DEFAULTS.forEach((m, i) => {
    const inp = document.getElementById('mstock' + i);
    const autoEl = document.getElementById('auto' + i);
    if (!inp) return;
    const auto = rec[m.id];
    inp.value = auto;
    inp.classList.add('auto-set');
    if (autoEl) autoEl.textContent = `권장 ${auto}장`;
  });
  // 팀 이름 입력란도 갱신
  buildSetupForm();
}

function onStockInput(idx) {
  const inp = document.getElementById('mstock' + idx);
  if (inp) inp.classList.remove('auto-set');
}

function applySetup() {
  const slotInput = document.getElementById('slotNameInput');
  currentSlotName = (slotInput && slotInput.value.trim()) ? slotInput.value.trim() : '기본슬롯';

  const n = parseInt(document.getElementById('teamCount').value);
  teams = [];
  for (let i = 1; i <= n; i++) {
    const el = document.getElementById('tname' + i);
    teams.push({ name: el ? (el.value.trim() || `${i}팀`) : `${i}팀`, money: 20, items: {} });
  }
  materials = MATERIAL_DEFAULTS.map((m, i) => {
    const stockEl = document.getElementById('mstock' + i);
    const stock = stockEl ? (parseInt(stockEl.value) || 1) : 1;
    return { ...m, stock, soldCount: 0 };
  });
  curIdx = 0; curBid = 1; logs = []; saleHistory = [];
  saveProgress();
  toast('설정 완료! 경매를 시작하세요 🎉');
  setTimeout(() => switchTab('auction'), 700);
}

// ═══════════════════════════════════════
//  AUCTION UI
// ═══════════════════════════════════════
function refreshAuctionUI() {
  const empty = teams.length === 0;
  document.getElementById('auction-empty').style.display = empty ? 'block' : 'none';
  document.getElementById('auction-main').style.display = empty ? 'none' : 'block';
  if (empty) return;
  updateStage(); updateTeamGrid(); updateQueue();
  renderChartTabs(); renderChart();
}

function updateStage() {
  const m = materials[curIdx];
  const remaining = m.stock - m.soldCount;
  const pct = m.stock > 0 ? (remaining / m.stock * 100) : 0;
  document.getElementById('stageEmoji').textContent = m.emoji;
  document.getElementById('stageName').textContent = m.name;
  document.getElementById('stageStock').textContent = `남은 ${remaining}장 / 전체 ${m.stock}장`;
  const bar = document.getElementById('stockBarFill');
  bar.style.width = pct + '%';
  bar.style.background = pct <= 25 ? '#ff4444' : pct <= 50 ? 'var(--yellow)' : 'var(--red-light)';
  document.getElementById('bidNum').textContent = curBid;
  updateTeamBidBtns();

  currentQty = 1;
  const qtyEl = document.getElementById('qtyNum');
  if (qtyEl) qtyEl.textContent = currentQty;
}

function updateTeamBidBtns() {
  const wrap = document.getElementById('teamBidBtns');
  if (!wrap) return;
  const m = materials[curIdx];
  const remaining = m ? (m.stock - m.soldCount) : 0;
  
  wrap.innerHTML = teams.map((t, i) => {
    const canAfford = t.money >= curBid && remaining >= currentQty;
    return `<button class="team-bid-btn${canAfford ? '' : ' no-money'}"
      onclick="${canAfford ? `sellTo(${i})` : ''}"
      ${canAfford ? '' : 'disabled title="잔액 부족 또는 재고 없음"'}>
      ${t.name}
      <span class="tb-money">${t.money}어스 보유</span>
    </button>`;
  }).join('');
}

function updateTeamGrid() {
  document.getElementById('teamGrid').innerHTML = teams.map(t => `
    <div class="team-chip">
      <div class="tc-name">${t.name}</div>
      <div class="tc-money">${t.money}<span class="tc-unit"> 어스</span></div>
    </div>`).join('');
}

function updateQueue() {
  document.getElementById('queueList').innerHTML = materials.map((m, i) => {
    const done = m.soldCount >= m.stock;
    const cur = i === curIdx && !done;
    const cls = cur ? 'cur' : done ? 'done' : '';
    const onclick = (!done && !cur) ? `onclick="jumpToItem(${i})"` : '';
    const remaining = m.stock - m.soldCount;
    return `<div class="queue-row ${cls}" ${onclick}>
      <div class="qnum">${i + 1}</div>
      <span>${m.emoji} ${m.name}</span>
      <span class="qcount">${done ? '매진' : `${remaining}/${m.stock}`}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
//  BID
// ═══════════════════════════════════════
function changeBid(delta) {
  curBid = Math.max(1, curBid + delta);
  document.getElementById('bidNum').textContent = curBid;
  updateTeamBidBtns();
}

function changeQty(delta) {
  if (materials.length === 0) return;
  const m = materials[curIdx];
  const remaining = m.stock - m.soldCount;
  currentQty = Math.max(1, Math.min(remaining, currentQty + delta));
  const qtyEl = document.getElementById('qtyNum');
  if (qtyEl) qtyEl.textContent = currentQty;
}

function raiseBid() {
  curBid++;
  document.getElementById('bidNum').textContent = curBid;
  updateTeamBidBtns();
  addLog(`📢 ${materials[curIdx].name} — ${curBid}어스 호가`);
}

// 팀 버튼 직접 클릭 → 즉시 낙찰
function sellTo(ti) {
  const team = teams[ti];
  const mat = materials[curIdx];
  const remaining = mat.stock - mat.soldCount;
  
  if (remaining < currentQty) { toast(`❌ 남은 재고가 부족합니다!`); return; }
  if (curBid > team.money) { toast(`❌ ${team.name} 잔액 부족!`); return; }

  team.money -= curBid;
  team.items[mat.id] = (team.items[mat.id] || 0) + currentQty;
  mat.soldCount += currentQty;
  saleHistory.push({ matId: mat.id, price: curBid, teamName: team.name, qty: currentQty });

  addLog(`🏷 [낙찰] ${team.name} ← ${mat.name} ${currentQty}장 (${curBid}어스)`, true);
  toast(`✅ ${team.name} ${currentQty}장 낙찰 완료!`);

  if (mat.soldCount >= mat.stock) {
    addLog(`📦 ${mat.name} 매진!`);
    moveToNext();
  } else {
    curBid = 1;
    updateStage(); updateQueue();
  }
  updateTeamGrid();
  renderChartTabs(); renderChart();
  saveProgress();
}

function undoLastSale() {
  if (saleHistory.length === 0) {
    toast('취소할 낙찰 내역이 없습니다.');
    return;
  }
  const lastSale = saleHistory.pop();
  
  // 팀 복구
  const team = teams.find(t => t.name === lastSale.teamName);
  if (team) {
    team.money += lastSale.price;
    team.items[lastSale.matId] = Math.max(0, (team.items[lastSale.matId] || 0) - (lastSale.qty || 1));
  }
  
  // 재료 복구
  const matIdx = materials.findIndex(m => m.id === lastSale.matId);
  if (matIdx !== -1) {
    materials[matIdx].soldCount = Math.max(0, materials[matIdx].soldCount - (lastSale.qty || 1));
    curIdx = matIdx; // 해당 재료 화면으로 이동
  }
  
  // 로그 복구
  const winIdx = logs.findIndex(l => l.isWin);
  if (winIdx !== -1) logs.splice(winIdx, 1);
  const soldOutIdx = logs.findIndex(l => l.text.includes('매진'));
  if (soldOutIdx === 0 || soldOutIdx === 1) logs.splice(soldOutIdx, 1);
  
  curBid = 1;
  updateStage(); 
  updateQueue();
  updateTeamGrid();
  renderChartTabs(); 
  renderChart();
  saveProgress();
  
  toast('↩️ 직전 낙찰이 취소되었습니다.');
  
  const box = document.getElementById('logBox');
  if (box) {
    box.innerHTML = logs.map(l =>
      `<div class="log-row ${l.isWin ? 'win' : ''}"><span class="lt">${l.ts}</span><span class="lm">${l.text}</span></div>`
    ).join('');
  }
}

function skipItem() {
  addLog(`⏭ ${materials[curIdx].name} 건너뜀`);
  moveToNext();
  saveProgress();
}

function jumpToItem(i) {
  curIdx = i; curBid = 1;
  updateStage(); updateQueue();
}

function moveToNext() {
  let next = curIdx + 1;
  while (next < materials.length && materials[next].soldCount >= materials[next].stock) next++;
  if (next < materials.length) curIdx = next;
  curBid = 1;
  updateStage(); updateQueue();
}

// ═══════════════════════════════════════
//  PRICE CHART
// ═══════════════════════════════════════
function renderChartTabs() {
  const el = document.getElementById('chartTabs');
  if (!el) return;
  el.innerHTML = MATERIAL_DEFAULTS.map(m => {
    const cnt = saleHistory.filter(s => s.matId === m.id).length;
    const on = m.id === chartMatId ? 'on' : '';
    return `<button class="chart-tab ${on}" onclick="setChartMat('${m.id}')">${m.emoji} ${m.name}${cnt > 0 ? ` <b style="color:var(--red)">${cnt}</b>` : ''}</button>`;
  }).join('');
}

function setChartMat(id) {
  chartMatId = id; renderChartTabs(); renderChart();
}

function renderChart() {
  const area = document.getElementById('chartArea');
  if (!area) return;
  area.innerHTML = renderPriceChart(chartMatId);
}

function renderPriceChart(matId, emptyText = '이 재료의 낙찰 기록이 없습니다.') {
  const sales = saleHistory.filter(s => s.matId === matId);
  if (sales.length === 0) {
    return `<div class="no-data-msg">${emptyText}</div>`;
  }

  // 전체 평균 단가 계산 (총액 합계 / 총 수량 합계)
  const totalMoney = sales.reduce((sum, s) => sum + s.price, 0);
  const totalQty = sales.reduce((sum, s) => sum + (s.qty || 1), 0);
  const overallAvg = (totalMoney / totalQty).toFixed(1);

  // 차트 데이터용 단가 배열 (각 낙찰 시점의 1장당 가격)
  const unitPrices = sales.map(s => s.price / (s.qty || 1));

  const W = 320, H = 130, PL = 34, PR = 8, PT = 24, PB = 26; // PT(Top Padding) 늘림
  const minP = Math.max(0, Math.min(...unitPrices) - 1);
  const maxP = Math.max(...unitPrices) + 1;
  const range = maxP - minP || 1;
  const toX = i => PL + i * (W - PL - PR) / Math.max(sales.length - 1, 1);
  const toY = p => PT + (1 - (p - minP) / range) * (H - PT - PB);

  const pts = sales.map((s, i) => `${toX(i).toFixed(1)},${toY(unitPrices[i]).toFixed(1)}`).join(' ');

  // Y축 눈금 3개
  const yVals = [minP, (minP + maxP) / 2, maxP];
  const yGrid = yVals.map(v => {
    const y = toY(v).toFixed(1);
    return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#eee" stroke-width="1"/>
            <text x="${PL - 3}" y="${(parseFloat(y) + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#bbb">${v.toFixed(unitPrices.some(p => p % 1 !== 0) ? 1 : 0)}</text>`;
  }).join('');

  // 평균선 (Horizontal Dashed Line)
  const avgY = toY(totalMoney / totalQty).toFixed(1);
  const avgLine = `
    <line x1="${PL}" y1="${avgY}" x2="${W - PR}" y2="${avgY}" stroke="var(--red)" stroke-width="1" stroke-dasharray="4,2" opacity="0.4"/>
    <text x="${W - PR}" y="${parseFloat(avgY) - 4}" text-anchor="end" font-size="8" fill="var(--red)" font-weight="700" opacity="0.6">평균: ${overallAvg}</text>
  `;

  // 면적 채우기
  const areaPath = `${PL},${toY(unitPrices[0]).toFixed(1)} ${pts} ${toX(sales.length - 1).toFixed(1)},${H - PB} ${PL},${H - PB}`;

  // 점 + 라벨 + X축(팀명)
  const dots = sales.map((s, i) => {
    const up = unitPrices[i];
    const x = toX(i).toFixed(1), y = toY(up).toFixed(1);
    const labelY = parseFloat(y) < PT + 13 ? (parseFloat(y) + 13).toFixed(1) : (parseFloat(y) - 4).toFixed(1);
    const shortName = s.teamName.length > 3 ? s.teamName.slice(0, 3) : s.teamName;
    const upDisplay = up % 1 === 0 ? up : up.toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="4" fill="var(--red)" stroke="white" stroke-width="1.5"/>
            <text x="${x}" y="${labelY}" text-anchor="middle" font-size="9" fill="#333" font-weight="700">${upDisplay}</text>
            <text x="${x}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#999">${shortName}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
    ${yGrid}
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="#ddd" stroke-width="1"/>
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="#ddd" stroke-width="1"/>
    <polyline points="${areaPath}" fill="var(--red)" fill-opacity="0.07" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${avgLine}
    ${dots}
  </svg>`;
}

// ═══════════════════════════════════════
//  LOG
// ═══════════════════════════════════════
function addLog(text, isWin = false) {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  logs.unshift({ ts, text, isWin });
  const box = document.getElementById('logBox');
  if (!box) return;
  box.innerHTML = logs.map(l =>
    `<div class="log-row ${l.isWin ? 'win' : ''}"><span class="lt">${l.ts}</span><span class="lm">${l.text}</span></div>`
  ).join('');
}



// ═══════════════════════════════════════
//  SCORE
// ═══════════════════════════════════════
function renderTeamPurchaseHistory(teamName) {
  const purchases = saleHistory.filter(s => s.teamName === teamName);
  if (!purchases.length) {
    return '<div class="purchase-empty">낙찰 없음</div>';
  }

  const rows = purchases.map(s => {
    const mat = MATERIAL_DEFAULTS.find(m => m.id === s.matId) || { emoji: '📦', name: '재료' };
    const qty = s.qty || 1;
    return `<span class="purchase-chip">${mat.emoji} ${qty > 1 ? `${qty}장 ` : ''}${s.price}어스</span>`;
  }).join('');

  return `<div class="purchase-list">${rows}</div>`;
}

function renderTeamInventory(t) {
  const chips = MATERIAL_DEFAULTS
    .filter(m => (t.items[m.id] || 0) > 0)
    .map(m => `<span class="inventory-chip">${m.emoji} ${t.items[m.id]}</span>`);

  if (!chips.length) return '<div class="inventory-empty">확보 재료 없음</div>';
  return `<div class="inventory-list">${chips.join('')}</div>`;
}

function renderAllPriceCharts() {
  const scoreChartMaterials = MATERIAL_DEFAULTS.filter(m => !['blue_brick', 'urethane'].includes(m.id));
  const charts = scoreChartMaterials.map(m => {
    const sales = saleHistory.filter(s => s.matId === m.id);
    return `<div class="score-chart-card">
      <div class="score-chart-title">
        <span>${m.emoji} ${m.name}</span>
        <span>${sales.length}회</span>
      </div>
      <div class="score-chart-area">${renderPriceChart(m.id, '낙찰 없음')}</div>
    </div>`;
  }).join('');

  return `<div class="score-chart-section">
    <div class="score-chart-heading">재화별 가격 차트</div>
    <div class="score-chart-grid">${charts}</div>
  </div>`;
}

function renderScore() {
  const card = document.getElementById('scoreCard');
  if (!teams.length) {
    card.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);">설정 후 경매를 진행하면 결과가 표시됩니다.</div>';
    return;
  }
  const MISSION = {};
  MATERIAL_DEFAULTS.forEach(m => { if (m.missionNeed > 0) MISSION[m.id] = m.missionNeed; });
  let bestTeam = null, bestCost = Infinity;

  const sortedTeams = [...teams].map(t => {
    const spent = 20 - t.money;
    const ok = Object.entries(MISSION).every(([k, n]) => (t.items[k] || 0) >= n);
    return { ...t, spent, ok };
  });

  // 정렬: 1순위 미션 성공 여부, 2순위 지출 비용 오름차순 (돈 많이 남긴 순)
  sortedTeams.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return a.spent - b.spent; 
  });

  if (sortedTeams.length > 0 && sortedTeams[0].ok) {
    bestTeam = sortedTeams[0].name;
    bestCost = sortedTeams[0].spent;
  }

  // 등수 계산 (동점자 처리 포함)
  let rankList = [];
  let currentRank = 1;
  for(let i=0; i<sortedTeams.length; i++) {
     if (!sortedTeams[i].ok) {
         rankList.push(null);
         continue;
     }
     if (i > 0 && sortedTeams[i-1].ok && sortedTeams[i].spent === sortedTeams[i-1].spent) {
         rankList.push(rankList[i-1]);
     } else {
         currentRank = i + 1;
         rankList.push(currentRank);
     }
  }

  const topTeams = [];
  const otherTeams = [];

  sortedTeams.forEach((t, i) => {
    const isSuccess = t.ok;
    const teamRank = rankList[i];
    
    let rankHtml = '';
    let rankClass = '';
    if (isSuccess && teamRank) {
       if (teamRank === 1) { rankHtml = `<span class="rank-badge r1">🥇 1등</span>`; rankClass = 'card-r1'; }
       else if (teamRank === 2) { rankHtml = `<span class="rank-badge r2">🥈 2등</span>`; rankClass = 'card-r2'; }
       else if (teamRank === 3) { rankHtml = `<span class="rank-badge r3">🥉 3등</span>`; rankClass = 'card-r3'; }
       else { rankHtml = `<span class="rank-badge">👏 ${teamRank}등</span>`; }
    }
    
    const missing = [];
    Object.entries(MISSION).forEach(([k, n]) => {
      const has = t.items[k] || 0;
      if (has < n) {
         const mat = MATERIAL_DEFAULTS.find(m => m.id === k);
         missing.push(`<span class="mat-chip">${mat.emoji} ${mat.name} -${n - has}</span>`);
      }
    });

    const extra = [];
    ['blue_brick', 'urethane'].forEach(k => {
      const has = t.items[k] || 0;
      if (has > 0) {
         const mat = MATERIAL_DEFAULTS.find(m => m.id === k);
         extra.push(`<span class="mat-chip extra">${mat.emoji} ${mat.name} +${has}</span>`);
      }
    });

    const missingHtml = isSuccess 
      ? `<div style="font-size:0.8rem;color:var(--muted);margin-top:0.5rem;">🎉 모든 필수 재료 보유</div>`
      : `<div style="font-size:0.8rem;color:var(--red);margin-top:0.5rem;font-weight:700;">부족한 필수 재료:</div>
         <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${missing.join('')}</div>`;

    const extraHtml = extra.length > 0 
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${extra.join('')}</div>`
      : '';

    const purchasesHtml = renderTeamPurchaseHistory(t.name);

    const cardHtml = `
      <div class="score-card ${isSuccess ? 'success' : ''} ${rankClass}">
        <div class="score-card-header">
          <div class="team-name">${t.name} ${rankHtml}</div>
          <div class="team-status">${isSuccess ? '✅ 성공' : '❌ 미달'}</div>
        </div>
        <div class="score-card-body">
          <div class="money-stat">
            <span class="money-lbl">남은 돈</span>
            <span class="money-val">${t.money}</span>
          </div>
          <div class="inventory-stat">
            <span class="money-lbl">확보 재료</span>
            ${renderTeamInventory(t)}
          </div>
        </div>
        <div class="score-card-footer">
          ${missingHtml}
          ${extraHtml}
          <div class="purchase-section">
            <div class="purchase-title">입찰가</div>
            ${purchasesHtml}
          </div>
        </div>
      </div>
    `;

    
    if (isSuccess && teamRank && teamRank <= 3 && topTeams.length < 3) {
        topTeams.push(cardHtml);
    } else {
        otherTeams.push(cardHtml);
    }
  });

  let podiumHtml = '';
  if (topTeams.length > 0) {
      const p1 = topTeams[0] ? `<div class="podium-slot p1">${topTeams[0]}</div>` : '';
      const p2 = topTeams[1] ? `<div class="podium-slot p2">${topTeams[1]}</div>` : '';
      const p3 = topTeams[2] ? `<div class="podium-slot p3">${topTeams[2]}</div>` : '';
      
      podiumHtml = `
        <div class="podium-wrap">
           ${p2}
           ${p1}
           ${p3}
        </div>
      `;
  }

  const winnerHtml = bestTeam
    ? `<div class="winner-box"><div style="font-size:2rem;">🏆</div>
       <div style="font-family:'Black Han Sans',sans-serif;font-size:1.5rem;color:var(--green);margin:0.3rem 0;">${bestTeam} 우승!</div>
       <div style="color:var(--muted);font-size:0.85rem;">최저 지출 ${bestCost}어스로 미션 성공! (가장 돈을 많이 남김)</div></div>` : '';
       
  card.innerHTML = `${winnerHtml} ${podiumHtml} <div class="score-grid">${otherTeams.join('')}</div>${renderAllPriceCharts()}`;
}

// ═══════════════════════════════════════
//  저장 / 복구 (localStorage 다중 슬롯)
// ═══════════════════════════════════════
const SAVE_PREFIX = 'auction_class_save_';

function saveProgress() {
  if (!currentSlotName) return;
  try {
    localStorage.setItem(SAVE_PREFIX + currentSlotName, JSON.stringify({
      slotName: currentSlotName, teams, materials, curIdx, curBid, logs, saleHistory, savedAt: new Date().toISOString()
    }));
    showSaveStatus();
  } catch (e) { }
}

function showSaveStatus() {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  el.textContent = `💾 [${currentSlotName}] ${t} 자동저장 완료`;
  el.style.color = 'var(--green)';
  setTimeout(() => { el.style.color = 'var(--muted)'; }, 2000);
}

function checkSavedSessions() {
  let saves = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(SAVE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.teams) saves.push({ key, data });
      } catch (e) { }
    }
  }

  if (saves.length > 0) {
    saves.sort((a, b) => new Date(b.data.savedAt) - new Date(a.data.savedAt) || (a.data.slotName || '').localeCompare(b.data.slotName || '', 'ko'));
    document.getElementById('restoreModal').classList.add('open');
    const listEl = document.getElementById('restoreSlotList');
    listEl.innerHTML = saves.map(s => {
      const savedAt = new Date(s.data.savedAt);
      const timeStr = `${savedAt.getMonth() + 1}/${savedAt.getDate()} ${String(savedAt.getHours()).padStart(2, '0')}:${String(savedAt.getMinutes()).padStart(2, '0')}`;
      return `<div class="slot-row" id="row-${s.key}">
        <div class="slot-info">
          <span class="slot-name">📁 ${s.data.slotName || '이름 없음'}</span>
          <span class="slot-time">최근 기록: ${timeStr} </span>
        </div>
        <div class="slot-btns">
          <button class="btn btn-red" style="font-size:0.85rem;padding:0.6rem 1.2rem;min-width:80px;" onclick="doRestore('${s.key}')">이어하기</button>
          <button class="btn btn-ghost" style="font-size:0.85rem;padding:0.6rem 1.2rem;min-width:80px;" onclick="deleteSlot('${s.key}')">삭제</button>
        </div>
      </div>`;
    }).join('');
  }
}

function doRestore(key) {
  const data = JSON.parse(localStorage.getItem(key));
  currentSlotName = data.slotName || key.replace(SAVE_PREFIX, '');
  teams = data.teams;
  materials = data.materials;
  curIdx = data.curIdx;
  curBid = data.curBid;
  logs = data.logs || [];
  saleHistory = data.saleHistory || [];

  const setupNameInput = document.getElementById('slotNameInput');
  if (setupNameInput) setupNameInput.value = currentSlotName;
  const teamCountSelect = document.getElementById('teamCount');
  if (teamCountSelect) {
    teamCountSelect.value = teams.length;
    buildSetupForm();
    teams.forEach((team, index) => { document.getElementById('tname' + (index + 1)).value = team.name; });
    const recommended = calcRecommendedStock(teams.length);
    materials.forEach((material, index) => {
      const input = document.getElementById('mstock' + index);
      input.value = material.stock;
      input.classList.toggle('auto-set', material.stock === recommended[material.id]);
    });
  }

  switchTab('auction');

  const box = document.getElementById('logBox');
  if (box && logs.length) {
    box.innerHTML = logs.map(l =>
      `<div class="log-row ${l.isWin ? 'win' : ''}"><span class="lt">${l.ts}</span><span class="lm">${l.text}</span></div>`
    ).join('');
  }

  closeRestoreModal();
  toast(`✅ [${currentSlotName}] 이어서 진행합니다.`);
}

function deleteSlot(key) {
  if (confirm('이 진행 상황 기록을 정말 삭제하시겠습니까?')) {
    localStorage.removeItem(key);
    const row = document.getElementById('row-' + key);
    if (row) row.remove();
    const listEl = document.getElementById('restoreSlotList');
    if (!listEl || listEl.innerHTML.trim() === '') closeRestoreModal();
    toast('🗑 기록이 삭제되었습니다.');
  }
}

function closeRestoreModal() {
  const modal = document.getElementById('restoreModal');
  if (modal) modal.classList.remove('open');
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
buildSetupForm();
try { seedDemoSessions(localStorage); }
catch { toast('예시 수업을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'); }
checkSavedSessions();
