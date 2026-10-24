const RISK = {
  green:  { label: '高成功率 ➔ 建議評估 SBT', short: '高成功率', range: '≥75%' },
  yellow: { label: '條件觀察中 ➔ 謹慎評估', short: '條件觀察', range: '50–74%' },
  red:    { label: '高拔管風險 ➔ 暫緩脫離', short: '高風險', range: '<50%' },
};

let listCache = null;
let sortKey = 'bed';
let currentPatient = null;   // 個人面板目前病人（歷史視窗用）
const historyCache = {};

function switchTab(tabName) {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(btn => btn.classList.remove('active'));
  contents.forEach(content => content.classList.remove('active'));

  if (tabName === 'dashboard') {
    tabs[0].classList.add('active');
    document.getElementById('tab-dashboard').classList.add('active');
  } else {
    tabs[1].classList.add('active');
    document.getElementById('tab-proposal').classList.add('active');
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function deltaText(delta) {
  if (delta === 0) return '<span class="delta muted">→ 持平</span>';
  return `<span class="delta ${delta > 0 ? 'c-green' : 'c-red'}">${delta > 0 ? '↑' : '↓'}${Math.abs(delta)} 較昨日</span>`;
}

function actionTag(level, label, title = '') {
  return `<span class="action-tag tag-${level}" title="${esc(title)}">${esc(label)}</span>`;
}

const NEW_BADGE = '<span class="new-badge">★ 今日新達標</span>';

// 預測分數趨勢小圖（每日一點）
function sparkline(values, level, width = 90, height = 28) {
  if (!values || values.length < 2) return '';
  const pad = 3;
  const step = (width - pad * 2) / (values.length - 1);
  // y 範圍依數據自動縮放，並保留 75% 閾值線在可視範圍內
  const lo = Math.max(0, Math.min(...values, 75) - 5);
  const hi = Math.min(100, Math.max(...values, 75) + 5);
  const y = v => height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2);
  const pts = values.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const color = `var(--morandi-${level})`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <line x1="${pad}" x2="${width - pad}" y1="${y(75)}" y2="${y(75)}" stroke="#DCDFE6" stroke-dasharray="2 2"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${width - pad}" cy="${y(last)}" r="3" fill="${color}"/>
  </svg>`;
}

/* ---------- 路由 ---------- */

function router() {
  const match = location.hash.match(/^#\/patients\/([^/]+)$/);
  switchTab('dashboard');
  window.scrollTo(0, 0);
  if (match) renderDetail(decodeURIComponent(match[1]));
  else renderList();
}

/* ---------- 病人清單 ---------- */

async function renderList() {
  const view = document.getElementById('view');
  try {
    if (!listCache) {
      view.innerHTML = '<div class="loading">載入病人清單中...</div>';
      const res = await fetch('/api/v1/patients');
      if (!res.ok) throw new Error('API 回傳失敗');
      listCache = await res.json();
    }
    const { unit, data } = listCache;
    document.getElementById('unit-info').innerHTML = `${esc(unit)}｜呼吸器使用中 <strong>${data.length}</strong> 床`;

    const counts = { green: 0, yellow: 0, red: 0 };
    data.forEach(p => counts[p.risk_level]++);
    const newCount = data.filter(p => p.newly_eligible).length;

    const sorted = [...data].sort((a, b) =>
      sortKey === 'score' ? b.score - a.score :
      sortKey === 'days' ? b.ventilator_days - a.ventilator_days :
      a.bed_no.localeCompare(b.bed_no));

    view.innerHTML = `
      <section class="card">
        <div class="list-toolbar">
          <div class="summary-chips">
            ${['green', 'yellow', 'red'].map(k => `
              <div class="chip"><i class="dot dot-${k}"></i>${RISK[k].short} (${RISK[k].range})<strong class="c-${k}">${counts[k]}</strong></div>
            `).join('')}
            ${newCount ? `<div class="chip chip-new">★ 今日新達標<strong>${newCount}</strong></div>` : ''}
          </div>
          <div class="sort-group">
            <span class="muted">排序：</span>
            ${[['bed', '床號'], ['score', '預測成功率'], ['days', '呼吸器天數']].map(([k, label]) =>
              `<button class="sort-btn ${sortKey === k ? 'active' : ''}" data-sort="${k}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="table-wrap">
          <table class="patient-table">
            <thead>
              <tr>
                <th>床號</th><th>病人</th><th>預測拔管成功率 / 系統建議</th><th>近日趨勢</th><th>主診斷</th>
                <th>呼吸器天數</th><th>模式 / FiO₂ / PEEP</th><th>RSBI</th><th>RASS</th><th>升壓劑</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(p => `
                <tr tabindex="0" data-id="${esc(p.patient_id)}">
                  <td><div class="bed"><i class="dot dot-${p.risk_level}"></i>${esc(p.bed_no)}</div></td>
                  <td>
                    <div style="font-weight:600; white-space:nowrap;">${esc(p.name_masked)}</div>
                    <div class="muted" style="font-size:12px; white-space:nowrap;">${p.age} 歲 / ${esc(p.gender)}・${esc(p.patient_id)}</div>
                  </td>
                  <td>
                    <div class="score-cell">
                      <span class="score-num c-${p.risk_level}">${p.score}%</span>
                      ${actionTag(p.risk_level, p.action_label, p.decision)}
                      ${p.newly_eligible ? NEW_BADGE : ''}
                    </div>
                  </td>
                  <td>
                    <div class="trend-cell">${sparkline(p.trend, p.risk_level)}${deltaText(p.trend_delta)}</div>
                  </td>
                  <td class="diag">${esc(p.diagnosis)}</td>
                  <td class="num">第 ${p.ventilator_days} 天</td>
                  <td class="num">${esc(p.mode)} / <span class="${p.fio2 > 40 ? 'abn' : ''}">${p.fio2}%</span> / <span class="${p.peep > 8 ? 'abn' : ''}">${p.peep}</span></td>
                  <td class="num ${p.rsbi > 105 ? 'abn' : ''}">${p.rsbi}</td>
                  <td class="num">${signed(p.rass)}</td>
                  <td>${p.on_vasopressor ? '<span class="badge badge-warn">使用中</span>' : '<span class="muted">—</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="muted" style="font-size:12px; margin-top:12px;">點選任一病人進入個人面板（滑鼠移至建議標籤可看完整建議）。趨勢圖為近日每日預測分數，虛線為 75% 建議 SBT 閾值；★ 為昨日未達、今日首次 ≥75% 之病人。</p>
      </section>
    `;

    view.querySelectorAll('.sort-btn').forEach(btn => btn.addEventListener('click', () => {
      sortKey = btn.dataset.sort;
      renderList();
    }));
    view.querySelectorAll('tbody tr').forEach(tr => {
      const open = () => { location.hash = `#/patients/${encodeURIComponent(tr.dataset.id)}`; };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    });
  } catch (error) {
    console.error('載入失敗：', error);
    view.innerHTML = '<div class="card loading">病人清單載入失敗，請檢查後端 server.js</div>';
  }
}

/* ---------- 個人面板 ---------- */

// 進入 SHAP Top 5 的參數標記，與右側影響因子對應
function aiTag(impact) {
  if (impact === undefined) return '';
  return `<span class="ai-tag ${impact > 0 ? 'pos' : 'neg'}" title="SHAP Top 5 關鍵因子">AI ${signed(impact)}%</span>`;
}

function kvRows(items, tags = {}) {
  return items.map(it => `
    <div class="kv ${typeof it.value === 'number' ? 'kv-link' : ''}" ${typeof it.value === 'number' ? `data-key="${esc(it.key)}" tabindex="0" title="點選查看歷史趨勢"` : ''}>
      <span>${esc(it.label)}${aiTag(tags[it.key])}</span>
      <span class="v ${it.abnormal ? 'abn' : ''}">${esc(it.value)}<span class="u">${esc(it.unit)}</span></span>
    </div>
  `).join('');
}

// 可查歷史的數值型參數
function histKeys(items) {
  return items.filter(it => typeof it.value === 'number').map(it => it.key);
}

// 雙向條形圖列；scale 為每 1% 對應的寬度百分比（單側上限 50%）
function shapBar(impact, scale) {
  const isPos = impact > 0;
  return `
    <div class="bar-bg">
      <div class="bar-center"></div>
      <div class="bar-fill ${isPos ? 'pos' : 'neg'}" style="width:${Math.min(Math.abs(impact) * scale, 50)}%;"></div>
    </div>
    <div style="font-weight:700; text-align:right;" class="${isPos ? 'c-green' : 'c-red'}">${signed(impact)}%</div>`;
}

function dataCard(title, body, extra = '', keys = []) {
  const btn = keys.length
    ? `<button class="hist-btn" data-keys="${keys.join(',')}" title="查看歷史數據與趨勢圖">📈 歷史</button>`
    : '';
  return `<section class="card data-card"><div class="card-title"><span>${title}</span><span class="card-title-extra">${extra}${btn}</span></div>${body}</section>`;
}

async function renderDetail(id) {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="loading">載入病人資料中...</div>';
  try {
    const res = await fetch(`/api/v1/patients/${encodeURIComponent(id)}/weaning-dashboard`);
    if (res.status === 404) {
      view.innerHTML = `<button class="back-btn" onclick="location.hash='#/patients'">← 返回病人清單</button><div class="card loading">查無此病人</div>`;
      return;
    }
    if (!res.ok) throw new Error('API 回傳失敗');
    const d = (await res.json()).data;
    const info = d.patient_info;
    const pred = d.prediction;
    const rec = d.recommendation;

    document.getElementById('unit-info').innerHTML = `資料更新：${fmtTime(info.updated_at)}`;
    const allItems = [...d.vent_settings, ...d.weaning, ...d.labs.items, ...d.io, ...d.nutrition.items];
    currentPatient = {
      id: info.patient_id,
      labels: { ...Object.fromEntries(allItems.map(it => [it.key, it.label])), rass: 'RASS' },
    };

    // 上：基本資料
    const infoHtml = `
      <section class="card info-card">
        <div class="info-bed">${esc(info.bed_no)}<small>床號</small></div>
        <div>
          <div class="info-name">${esc(info.name_masked)}</div>
          <div class="muted" style="font-size:13px;">${info.age} 歲 / ${esc(info.gender)}・${esc(info.patient_id)}</div>
        </div>
        <dl class="info-grid">
          <div><dt>主診斷</dt><dd>${esc(info.diagnosis)}</dd></div>
          <div><dt>入 ICU 日期</dt><dd>${esc(info.admit_date)}（第 ${info.icu_days} 天）</dd></div>
          <div><dt>插管日期</dt><dd>${esc(info.intubation_date)}</dd></div>
          <div><dt>主治醫師</dt><dd>${esc(info.attending)}</dd></div>
          <div><dt>身高 / 體重</dt><dd>${info.height_cm} cm / ${info.weight_kg} kg</dd></div>
          <div><dt>氣管內管</dt><dd>${esc(info.ett)}</dd></div>
        </dl>
      </section>`;

    // 中左：各項當前數據
    const sed = d.sedation;
    const drugs = list => list.length
      ? list.map(x => `<div class="drug"><span>${esc(x.name)}</span><strong>${esc(x.dose)}</strong></div>`).join('')
      : '<div class="muted" style="font-size:13px; padding:4px 0;">無</div>';

    const tags = Object.fromEntries(pred.shap_factors.filter(f => f.key).map(f => [f.key, f.impact]));
    const nutPct = d.nutrition.kcal_pct;
    const leftHtml = `
      <div class="data-grid">
        ${dataCard('🫁 目前呼吸器設定', kvRows(d.vent_settings, tags), '', histKeys(d.vent_settings))}
        ${dataCard('📊 Weaning Parameters', kvRows(d.weaning, tags), '', histKeys(d.weaning))}
        ${dataCard('🩸 抽血數值', kvRows(d.labs.items, tags), `<span class="muted" style="font-size:11px; font-weight:400;">${esc(d.labs.time)}</span>`, histKeys(d.labs.items))}
        <div style="display:flex; flex-direction:column; gap:16px;">
          ${dataCard('📅 呼吸器使用天數', `
            <div class="big-stat">${info.ventilator_days}<span style="font-size:16px; font-weight:600;"> 天</span></div>
            <div class="muted" style="font-size:12px;">自 ${esc(info.intubation_date)} 插管・ICU 第 ${info.icu_days} 天</div>
          `)}
          ${dataCard('😴 Sedation', `
            <div class="kv kv-link" data-key="rass" tabindex="0" title="點選查看歷史趨勢"><span>RASS${aiTag(tags.rass)}</span><span class="v ${Math.abs(sed.rass) >= 2 ? 'abn' : ''}">${signed(sed.rass)}</span></div>
            <div class="kv"><span>CAM-ICU</span><span class="v">${esc(sed.cam_icu)}</span></div>
            ${drugs(sed.drugs)}
          `, '', ['rass'])}
          ${dataCard('💉 升壓劑 / 強心劑', drugs(d.vasopressors), aiTag(tags.vasopressor))}
        </div>
        ${dataCard('💧 I/O 體液平衡', kvRows(d.io, tags), '', histKeys(d.io))}
        ${dataCard('🍽️ Nutrition', `
          ${kvRows(d.nutrition.items, tags)}
          <div style="font-size:12px; margin-top:8px;" class="muted">熱量達成率 <strong class="${nutPct < 70 ? 'abn' : ''}">${nutPct}%</strong></div>
          <div class="progress"><div style="width:${Math.min(nutPct, 100)}%; ${nutPct < 70 ? 'background:var(--morandi-red);' : ''}"></div></div>
        `, '', histKeys(d.nutrition.items))}
      </div>`;

    // 置頂摘要列：結論先行
    const checklist = d.sbt_checklist;
    const passed = checklist.filter(c => c.pass).length;
    const failed = checklist.filter(c => !c.pass);
    const isGreen = pred.risk_level === 'green';
    const agreement =
      !failed.length && isGreen ? '標準條件全數符合，與 AI 預測一致' :
      !failed.length ? '標準條件全數符合，但 AI 預測仍有風險，請參考關鍵影響因子' :
      isGreen ? 'AI 預測良好，但仍有標準條件未符合，請臨床確認' :
      `未符合：${failed.map(c => c.label).join('、')}`;

    const summaryHtml = `
      <section class="card summary-strip strip-${pred.risk_level}">
        <div class="strip-score">
          <div class="muted" style="font-size:12px;">SBT 後 48h 拔管成功率</div>
          <div class="strip-score-row">
            <span class="strip-val c-${pred.risk_level}">${pred.score}%</span>
            <div>
              ${actionTag(pred.risk_level, rec.action_label)}
              <div style="margin-top:4px;">${deltaText(pred.trend_delta)}</div>
            </div>
          </div>
          ${pred.newly_eligible ? NEW_BADGE : ''}
          <div class="strip-trend">
            ${sparkline(pred.trend, pred.risk_level, 240, 56)}
            <div class="muted">近 ${pred.trend.length} 日：${pred.trend.map(v => `${v}%`).join(' → ')}</div>
          </div>
          <div class="traffic-lights">
            ${['green', 'yellow', 'red'].map(k =>
              `<span class="${k === pred.risk_level ? 'on' : ''}"><i class="dot dot-${k}"></i>${RISK[k].range}</span>`).join('')}
          </div>
        </div>
        <div class="strip-decision">
          <div class="muted" style="font-size:12px;">判斷結果</div>
          <div class="strip-title">${esc(rec.decision)}</div>
          <div style="font-size:13px; margin-top:4px;"><span class="muted">建議脫離方式：</span><strong>${esc(rec.method)}</strong></div>
          <p class="muted" style="font-size:13px; margin-top:8px;">${esc(pred.summary)}</p>
        </div>
        <div class="strip-check">
          <div class="muted" style="font-size:12px;">SBT 標準條件</div>
          <div class="strip-title"><span class="${failed.length ? 'c-red' : 'c-green'}">${passed}</span> / ${checklist.length} 符合</div>
          <div class="progress"><div style="width:${passed / checklist.length * 100}%; background:var(--morandi-${failed.length ? 'yellow' : 'green'});"></div></div>
          <div class="muted" style="font-size:12px; margin-top:4px;">${esc(agreement)}</div>
        </div>
      </section>`;

    // 中右：SBT 檢核 + SHAP
    const rightHtml = `
      <div class="right-col">
        <section class="card">
          <div class="card-title"><span>✅ SBT 準備度檢核</span><span class="muted" style="font-size:12px; font-weight:400;">${passed} / ${checklist.length} 符合</span></div>
          ${checklist.map(c => `
            <div class="check-row ${c.pass ? '' : 'fail'}">
              <span class="check-icon">${c.pass ? '✓' : '✗'}</span>
              <span>${esc(c.label)}</span>
              <span class="check-val">${esc(c.value)}</span>
            </div>`).join('')}
          <div class="check-note">${esc(agreement)}</div>
        </section>

        <section class="card">
          <div class="card-title">
            <span>關鍵影響因子 (SHAP)</span>
            <span class="muted" style="font-size:12px; font-weight:400;">🟢 正向推力｜🔴 負向阻力</span>
          </div>
          <div class="sub-title">Top 5 個別因子</div>
          ${[...pred.shap_factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).map(f => `
            <div class="shap-row">
              <div>
                <div style="font-weight:600;"><span class="badge" style="margin-right:4px;">${esc(f.category)}</span>${esc(f.feature)}</div>
                <div class="muted" style="font-size:11px; margin-top:2px;">${esc(f.note)}</div>
              </div>
              ${shapBar(f.impact, 2.5)}
            </div>`).join('')}

          <div class="sub-title" style="margin-top:18px;">依類別彙總（含所有特徵）</div>
          ${[...pred.domain_contributions].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).map(c => `
            <div class="shap-row">
              <div style="font-weight:600;">${esc(c.label)}</div>
              ${shapBar(c.impact, 1.6)}
            </div>`).join('')}
          <div class="shap-sum">
            基準值 <strong>${pred.shap_base}%</strong>
            ${pred.domain_contributions.map(c => `<span class="${c.impact > 0 ? 'c-green' : 'c-red'}">${signed(c.impact)}</span>`).join(' ')}
            = 預測 <strong class="c-${pred.risk_level}">${pred.score}%</strong>
          </div>
          <p class="muted" style="font-size:11px; margin-top:6px;">基準值為模型於全體 ICU 族群之平均預測；SHAP 貢獻以百分點近似呈現。左側面板標示「AI」者為 Top 5 因子。</p>
        </section>
      </div>`;

    // 下：處置建議（判斷結果與脫離方式已置頂）
    const recHtml = `
      <section class="card rec-card">
        <div class="card-title">💡 處置建議與拔管後規劃</div>
        <div class="rec-box"><h4>拔管後支持</h4><p>${esc(rec.post_extubation)}</p></div>
        ${rec.actions.map(a => `<div class="action-item"><strong>${esc(a.title)}：</strong>${esc(a.content)}</div>`).join('')}
      </section>`;

    view.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/patients'">← 返回病人清單</button>
      ${infoHtml}
      ${summaryHtml}
      <div class="detail-main">${leftHtml}${rightHtml}</div>
      ${recHtml}
    `;
  } catch (error) {
    console.error('載入失敗：', error);
    view.innerHTML = '<div class="card loading">病人資料載入失敗，請檢查後端 server.js</div>';
  }
}

/* ---------- 參數歷史數據視窗 ---------- */

let histKeysOpen = [];
let histOpener = null;

function openHistory(keys, key, opener) {
  histKeysOpen = keys;
  histOpener = opener;
  const modal = document.getElementById('hist-modal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.modal-close').focus();
  showHistoryKey(key);
}

function closeHistory() {
  document.getElementById('hist-modal').hidden = true;
  document.body.style.overflow = '';
  if (histOpener) histOpener.focus();
}

async function showHistoryKey(key) {
  const modal = document.getElementById('hist-modal');
  modal.querySelector('.hist-chips').innerHTML = histKeysOpen.map(k =>
    `<button class="sort-btn ${k === key ? 'active' : ''}" data-hist-key="${esc(k)}">${esc(currentPatient.labels[k] || k)}</button>`).join('');
  const body = modal.querySelector('.hist-body');
  body.innerHTML = '<div class="loading">載入歷史數據中...</div>';

  const cacheKey = `${currentPatient.id}:${key}`;
  try {
    if (!historyCache[cacheKey]) {
      const res = await fetch(`/api/v1/patients/${encodeURIComponent(currentPatient.id)}/history/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('API 回傳失敗');
      historyCache[cacheKey] = (await res.json()).data;
    }
    renderHistory(historyCache[cacheKey]);
  } catch (error) {
    console.error('歷史數據載入失敗：', error);
    body.innerHTML = '<div class="loading">歷史數據載入失敗</div>';
  }
}

function isAbnormal(h, v) {
  return (h.low !== undefined && v < h.low) || (h.high !== undefined && v > h.high);
}

function fmtVal(h, v) {
  return h.key === 'rass' ? signed(v) : String(v);
}

function rangeText(h) {
  if (h.low !== undefined && h.high !== undefined) return `${h.low} – ${h.high}`;
  if (h.high !== undefined) return `≤ ${h.high}`;
  if (h.low !== undefined) return `≥ ${h.low}`;
  return '—';
}

function niceStep(span, count) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
}

function renderHistory(h) {
  const body = document.querySelector('#hist-modal .hist-body');
  const pts = h.points;
  const values = pts.map(p => p.v);
  const first = values[0], last = values[values.length - 1];
  const change = Number((last - first).toFixed(4));
  const unit = h.unit ? ` ${h.unit}` : '';

  body.innerHTML = `
    <div class="hist-head">
      <div>
        <div class="hist-param">${esc(h.label)}</div>
        <div class="muted" style="font-size:12px;">正常範圍 ${esc(rangeText(h))}${esc(unit)}・每 ${h.interval_hours} 小時紀錄・共 ${pts.length} 筆</div>
      </div>
    </div>
    <div class="hist-stats">
      <div><span class="muted">最新</span><strong class="${isAbnormal(h, last) ? 'abn' : ''}">${fmtVal(h, last)}</strong><small>${esc(h.unit)}</small></div>
      <div><span class="muted">最高</span><strong>${fmtVal(h, Math.max(...values))}</strong><small>${esc(h.unit)}</small></div>
      <div><span class="muted">最低</span><strong>${fmtVal(h, Math.min(...values))}</strong><small>${esc(h.unit)}</small></div>
      <div><span class="muted">期間變化</span><strong>${signed(change)}</strong><small>${esc(h.unit)}</small></div>
    </div>
    <div class="hist-chart" aria-label="${esc(h.label)} 歷史趨勢圖"></div>
    <div class="hist-legend muted">
      <span><i class="lg-line"></i>${esc(h.label)}</span>
      <span><i class="lg-band"></i>正常範圍</span>
      <span><i class="lg-abn"></i>超出範圍</span>
    </div>
    <div class="hist-table-wrap">
      <table class="hist-table">
        <thead><tr><th>時間</th><th>數值${esc(unit)}</th></tr></thead>
        <tbody>
          ${[...pts].reverse().map(p => `
            <tr><td>${fmtTime(p.t)}</td><td class="${isAbnormal(h, p.v) ? 'abn' : ''}">${fmtVal(h, p.v)}${isAbnormal(h, p.v) ? ' ⚠' : ''}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  drawHistoryChart(body.querySelector('.hist-chart'), h);
}

function drawHistoryChart(el, h) {
  const pts = h.points.map(p => ({ t: new Date(p.t).getTime(), v: p.v, raw: p }));
  const W = Math.max(el.clientWidth, 300), H = 240;
  const m = { l: 48, r: 44, t: 14, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  // y 範圍以數據為主；正常範圍邊界只在接近數據時納入，避免把數據壓扁
  const vals = pts.map(p => p.v);
  const dMin = Math.min(...vals), dMax = Math.max(...vals);
  const span = dMax - dMin || Math.abs(dMax) * 0.1 || 1;
  const near = b => b !== undefined && b >= dMin - span * 1.5 && b <= dMax + span * 1.5;
  const bounds = [...vals, ...[h.low, h.high].filter(near)];
  let yMin = Math.min(...bounds), yMax = Math.max(...bounds);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const step = niceStep(yMax - yMin, 4);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  const tMin = pts[0].t, tMax = pts[pts.length - 1].t;
  const x = t => m.l + (tMax === tMin ? iw / 2 : (t - tMin) / (tMax - tMin) * iw);
  const y = v => m.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

  // 正常範圍帶
  const bandTop = y(Math.min(h.high ?? yMax, yMax));
  const bandBottom = y(Math.max(h.low ?? yMin, yMin));
  const band = (h.low !== undefined || h.high !== undefined)
    ? `<rect x="${m.l}" y="${bandTop}" width="${iw}" height="${Math.max(bandBottom - bandTop, 0)}" fill="var(--band)"/>`
    : '';

  const yTicks = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) yTicks.push(Number(v.toFixed(4)));

  // x 軸：每日 00:00
  const xTicks = [];
  const d0 = new Date(tMin); d0.setHours(0, 0, 0, 0);
  for (let d = d0.getTime() + 86400000; d <= tMax; d += 86400000) xTicks.push(d);

  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  // 點數少時每點都畫；點數多時只標出異常點與最新值
  const showAllDots = pts.length <= 15;
  const lastP = pts[pts.length - 1];
  const dotPts = pts.filter(p => showAllDots || p === lastP || isAbnormal(h, p.v));

  el.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
      ${band}
      ${yTicks.map(v => `
        <line x1="${m.l}" x2="${m.l + iw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/>
        <text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" class="axis-text">${fmtVal(h, v)}</text>`).join('')}
      ${xTicks.map(t => {
        const d = new Date(t);
        return `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--grid)" stroke-dasharray="2 3"/>
          <text x="${x(t)}" y="${H - 8}" text-anchor="middle" class="axis-text">${d.getMonth() + 1}/${d.getDate()}</text>`;
      }).join('')}
      <path d="${path}" fill="none" stroke="var(--morandi-blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dotPts.map(p => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${isAbnormal(h, p.v) ? 4 : 3}" fill="${isAbnormal(h, p.v) ? 'var(--morandi-red)' : 'var(--morandi-blue)'}" stroke="var(--bg-card)" stroke-width="2"/>`).join('')}
      <text x="${x(lastP.t) + 8}" y="${y(lastP.v) + 4}" class="axis-text" style="font-weight:700; fill:var(--text-main);">${fmtVal(h, lastP.v)}</text>
      <g class="hover-layer" style="display:none;">
        <line class="hover-line" y1="${m.t}" y2="${m.t + ih}" stroke="var(--text-muted)" stroke-width="1"/>
        <circle class="hover-dot" r="5" fill="var(--morandi-blue)" stroke="var(--bg-card)" stroke-width="2"/>
      </g>
      <rect class="hover-target" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg>
    <div class="chart-tip" hidden></div>`;

  // 滑鼠十字線 + 提示框
  const svg = el.querySelector('svg');
  const layer = svg.querySelector('.hover-layer');
  const tip = el.querySelector('.chart-tip');
  const target = svg.querySelector('.hover-target');
  target.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const nearest = pts.reduce((a, b) => Math.abs(x(b.t) - mx) < Math.abs(x(a.t) - mx) ? b : a);
    const px = x(nearest.t), py = y(nearest.v);
    layer.style.display = '';
    layer.querySelector('.hover-line').setAttribute('x1', px);
    layer.querySelector('.hover-line').setAttribute('x2', px);
    const dot = layer.querySelector('.hover-dot');
    dot.setAttribute('cx', px); dot.setAttribute('cy', py);
    dot.setAttribute('fill', isAbnormal(h, nearest.v) ? 'var(--morandi-red)' : 'var(--morandi-blue)');
    tip.hidden = false;
    tip.innerHTML = `<div class="muted">${fmtTime(nearest.raw.t)}</div><strong class="${isAbnormal(h, nearest.v) ? 'abn' : ''}">${fmtVal(h, nearest.v)}</strong> ${esc(h.unit)}`;
    const left = px + 12 + tip.offsetWidth > W ? px - 12 - tip.offsetWidth : px + 12;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(py - 40, 0)}px`;
  });
  target.addEventListener('mouseleave', () => { layer.style.display = 'none'; tip.hidden = true; });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.hist-btn');
  if (btn) {
    const keys = btn.dataset.keys.split(',');
    return openHistory(keys, keys[0], btn);
  }
  const row = e.target.closest('.kv-link');
  if (row) {
    const cardBtn = row.closest('.data-card')?.querySelector('.hist-btn');
    const keys = cardBtn ? cardBtn.dataset.keys.split(',') : [row.dataset.key];
    return openHistory(keys, row.dataset.key, row);
  }
  const chip = e.target.closest('[data-hist-key]');
  if (chip) return showHistoryKey(chip.dataset.histKey);
  if (e.target.matches('#hist-modal, .modal-close')) closeHistory();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('hist-modal').hidden) closeHistory();
  if (e.key === 'Enter' && e.target.matches('.kv-link')) e.target.click();
});

window.addEventListener('hashchange', () => {
  if (!document.getElementById('hist-modal').hidden) closeHistory();
});

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) history.replaceState(null, '', '#/patients');
  router();
});
