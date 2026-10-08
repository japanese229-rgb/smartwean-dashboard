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

async function loadSmartWeanDashboard() {
  try {
    const response = await fetch('/api/v1/patients/P1234567/weaning-dashboard');
    if (!response.ok) throw new Error('API 回傳失敗');
    
    const result = await response.json();
    const data = result.data;

    // 1. 病患資訊
    const info = data.patient_info;
    document.getElementById('patient-info').innerHTML = `
      <div>床號：<strong>${info.bed_no} 床</strong></div>
      <div>病患：<strong>${info.name_masked} (${info.patient_id})</strong></div>
      <div>年齡/性別：<strong>${info.age} 歲 / ${info.gender}</strong></div>
      <div>呼吸器天數：<strong>${info.ventilator_days} 天</strong></div>
    `;

    // 2. 指數與標籤
    const pred = data.prediction;
    document.getElementById('score-val').innerText = `${pred.score_display}%`;
    document.getElementById('status-label').innerText = pred.status_label;
    document.getElementById('score-desc').innerText = pred.summary_text;

    // 3. SHAP 數據
    const shapContainer = document.getElementById('shap-list');
    shapContainer.innerHTML = data.shap_factors.map(f => {
      const isPos = f.direction === 'positive';
      const fillClass = isPos ? 'pos' : 'neg';
      const colorStyle = isPos ? 'color: var(--morandi-green);' : 'color: var(--morandi-red);';
      const sign = isPos ? '+' : '';
      
      return `
        <div class="shap-row">
          <div>
            <div style="font-weight:600;">
              <span style="font-size:10px; background:#EAECEE; padding:2px 6px; border-radius:4px; color:#566573; margin-right:4px;">${f.category}</span>
              ${f.feature_name}
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${f.clinical_note}</div>
          </div>
          <div class="bar-bg">
            <div class="bar-center"></div>
            <div class="bar-fill ${fillClass}" style="width: ${f.bar_width_pct}%;"></div>
          </div>
          <div style="font-weight:bold; text-align:right; ${colorStyle}">${sign}${f.impact_percentage}%</div>
        </div>
      `;
    }).join('');

    // 4. 臨床建議
    const actionContainer = document.getElementById('action-list');
    actionContainer.innerHTML = data.clinical_recommendations.map(rec => `
      <div style="margin-top:10px; padding:12px; background:var(--bg-main); border-radius:6px;">
        <strong style="color: var(--morandi-blue);">💡 ${rec.title}：</strong>
        <span>${rec.content}</span>
      </div>
    `).join('');

  } catch (error) {
    console.error('載入失敗：', error);
    document.getElementById('patient-info').innerText = '資料載入失敗，請檢查後端 server.js';
  }
}

window.addEventListener('DOMContentLoaded', loadSmartWeanDashboard);