const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/v1/patients/:id/weaning-dashboard', (req, res) => {
  const patientId = req.params.id;

  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    data: {
      patient_info: {
        patient_id: patientId,
        bed_no: "302",
        name_masked: "張 O 華",
        age: 84,
        gender: "男",
        ventilator_days: 5,
        current_mode: "PSV (Pressure Support)"
      },
      prediction: {
        system_name: "SmartWean RT",
        weaning_success_probability: 0.82,
        score_display: 82,
        status_label: "高脫離成功率 ➔ 建議評估進行 SBT 試驗",
        summary_text: "連續動態參數趨勢穩定，RSBI 及體液負擔控制良好，建議安排自主呼吸試驗。"
      },
      shap_factors: [
        { category: "RCS 呼吸力學", feature_name: "RSBI (淺快呼吸指數)", clinical_note: "近 6 小時動態平均: 38 bpm/L (理想)", impact_percentage: 18, direction: "positive", bar_width_pct: 36 },
        { category: "EMR 臨床檢驗", feature_name: "24h 累積體液平衡", clinical_note: "淨輸出: -120 mL (低肺水腫風險)", impact_percentage: 12, direction: "positive", bar_width_pct: 24 },
        { category: "RCS 呼吸力學", feature_name: "動態肺順應性 (Cdyn)", clinical_note: "42 mL/cmH2O (持續改善)", impact_percentage: 8, direction: "positive", bar_width_pct: 16 },
        { category: "EMR 血液氣體", feature_name: "PaCO2 氣體分析", clinical_note: "48 mmHg (輕微 CO2 滯留)", impact_percentage: -8, direction: "negative", bar_width_pct: 16 },
        { category: "床邊臨床評估", feature_name: "RASS 鎮靜深度評分", clinical_note: "+1 (輕度嗜睡/躁動)", impact_percentage: -5, direction: "negative", bar_width_pct: 10 }
      ],
      clinical_recommendations: [
        { title: "鎮靜藥物劑量調整建議", content: "偵測到 RASS 評分為 +1（扣分項 -5%），建議評估調降 Sedatives 劑量以增強自主呼吸驅動力。" },
        { title: "SBT 執行時間點規劃", content: "患者 RSBI 與 24h 體液控制佳（主要加分項 +30%），建議預計於 18:00 執行 30–120 分鐘 SBT 試驗。" }
      ]
    }
  });
});

app.listen(PORT, () => {
  console.log(`SmartWean RT 服務已啟動：http://localhost:${PORT}`);
});