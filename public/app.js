async function loadDashboardData() {
  try {
    const response = await fetch('/api/v1/patients/P1234567/weaning-dashboard');
    const result = await response.json();
    const data = result.data;

    // 1. 渲染病患資料
    const info = data.patient_info;
    document.getElementById('patient-info').innerHTML = `
      <div>床號：<strong>${info.bed_no} 床</strong></div>
      <div>姓名：<strong>${info.name_masked}</strong></div>
      <div>年齡/性別：<strong>${info.age} 歲 / ${info.gender}</strong></div>
      <div>呼吸器使用天數：<strong>${info.ventilator_days} 天</strong></div>
    `;

    // 2. 渲染預測指數
    document.getElementById('score-val').innerText = `${data.prediction.score_display}%`;
    document.getElementById('score-desc').innerText = data.prediction.summary_text;

    // 3. 動態渲染 SHAP 圖表
    const shapContainer = document.getElementById('shap-list');
    shapContainer.innerHTML = data.shap_factors.map(f => {
      const isPos = f.direction === 'positive';
      const fillClass = isPos ? 'pos' : 'neg';
      const colorClass = isPos ? 'color: var(--morandi-green);' : 'color: var(--morandi-red);';
      const sign = isPos ? '+' : '';
      
      return `
        <div class="shap-row">
          <div>
            <div style="font-weight:600;">${f.feature_name}</div>
            <div style="font-size:11px; color:var(--text-muted);">${f.clinical_note}</div>
          </div>
          <div class="bar-bg">
            <div class="bar-center"></div>
            <div class="bar-fill ${fillClass}" style="width: ${f.bar_width_pct}%;"></div>
          </div>
          <div style="font-weight:bold; text-align:right; ${colorClass}">${sign}${f.impact_percentage}%</div>
        </div>
      `;
    }).join('');

    // 4. 渲染臨床建議
    const actionContainer = document.getElementById('action-list');
    actionContainer.innerHTML = data.clinical_recommendations.map(rec => `
      <div class="action-item">💡 ${rec}</div>
    `).join('');

  } catch (error) {
    console.error('無法載入 Dashboard 資料：', error);
  }
}

window.addEventListener('DOMContentLoaded', loadDashboardData);