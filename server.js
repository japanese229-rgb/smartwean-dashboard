const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// 託管 public 資料夾內的靜態檔案 (HTML/JS)
app.use(express.static('public'));

// 模擬核心 API Endpoint
app.get('/api/v1/patients/:id/weaning-dashboard', (req, res) => {
  const patientId = req.params.id;

  // 回傳 Mock 數據
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
        ventilator_days: 5
      },
      prediction: {
        weaning_success_probability: 0.82,
        score_display: 82,
        status_label: "建議評估進行 SBT 試驗",
        summary_text: "目前生理參數極為穩定，脫離成功機率高。"
      },
      shap_factors: [
        { feature_name: "RSBI (淺快呼吸指數)", clinical_note: "近 6h 平均: 38 (理想)", impact_percentage: 18, direction: "positive", bar_width_pct: 36 },
        { feature_name: "24h 累積體液平衡", clinical_note: "淨輸出: -120 mL", impact_percentage: 12, direction: "positive", bar_width_pct: 24 },
        { feature_name: "動態肺順應性 (Cdyn)", clinical_note: "42 mL/cmH2O (提升中)", impact_percentage: 8, direction: "positive", bar_width_pct: 16 },
        { feature_name: "PaCO2 氣體分析", clinical_note: "48 mmHg (輕微 CO2 滯留)", impact_percentage: -8, direction: "negative", bar_width_pct: 16 },
        { feature_name: "RASS 鎮靜評分", clinical_note: "+1 (輕度嗜睡/躁動)", impact_percentage: -5, direction: "negative", bar_width_pct: 10 }
      ],
      clinical_recommendations: [
        "鎮靜藥物調整建議：偵測到 RASS 分數輕微偏高（扣分項 -5%），建議評估調降 Sedatives 劑量，以提升自主呼吸驅動力。",
        "追蹤提醒：病人目前 RSBI 與體液控制極佳（主要加分項 +30%），建議預計於 18:00 執行 30 分鐘 T-piece 或 PSV 模式之 SBT 試驗。"
      ]
    }
  });
});

app.listen(PORT, () => {
  console.log(`SmartWean AI 服務已啟動：http://localhost:${PORT}`);
});