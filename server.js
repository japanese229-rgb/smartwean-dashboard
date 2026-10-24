const express = require('express');
const cors = require('cors');
const { REFERENCE, patients } = require('./data/patients');
const { buildHistory } = require('./data/history');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// SHAP 基準值：模型於全體 ICU 族群之平均預測（%）；基準值 + 各類別貢獻 = 預測分數
const SHAP_BASE = 65;
const DOMAINS = {
  resp:  '呼吸力學',
  gas:   '氧合與氣體交換',
  fluid: '體液與腎功能',
  neuro: '意識與氣道保護',
  hemo:  '血行動力學',
  other: '病史與其他',
};

// 三色燈號：綠 ≥75、黃 50–74、紅 <50
function riskLevel(score) {
  if (score >= 75) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

// 較昨日變化，與是否今日新達 SBT 閾值（昨日 <75、今日 ≥75）
function trendInfo(trend) {
  const today = trend[trend.length - 1];
  const yesterday = trend.length > 1 ? trend[trend.length - 2] : today;
  return { trend_delta: today - yesterday, newly_eligible: yesterday < 75 && today >= 75 };
}

// GCS 字串如 'E4VTM6'：睜眼 ≥3 且運動 M6 視為可遵從指令
function followsCommands(gcs) {
  const m = /E(\d).*M(\d)/.exec(gcs);
  return !!m && Number(m[1]) >= 3 && Number(m[2]) === 6;
}

// SBT 準備度標準條件檢核
function sbtChecklist(p) {
  const v = p.vent_settings, w = p.weaning, s = p.sedation;
  return [
    { label: 'FiO₂ ≤ 40%', value: `${v.fio2}%`, pass: v.fio2 <= 40 },
    { label: 'PEEP ≤ 8 cmH₂O', value: `${v.peep}`, pass: v.peep <= 8 },
    { label: 'P/F ratio ≥ 150', value: `${p.labs.pf_ratio}`, pass: p.labs.pf_ratio >= 150 },
    { label: 'pH ≥ 7.30', value: `${p.labs.ph}`, pass: p.labs.ph >= 7.30 },
    { label: 'RSBI < 105', value: `${w.rsbi}`, pass: w.rsbi < 105 },
    { label: 'RASS -1 ～ +1', value: s.rass > 0 ? `+${s.rass}` : `${s.rass}`, pass: s.rass >= -1 && s.rass <= 1 },
    { label: '未使用升壓劑 / 強心劑', value: p.vasopressors.length ? p.vasopressors.map(x => x.name).join('、') : '無', pass: p.vasopressors.length === 0 },
    { label: '咳嗽有力', value: w.cough, pass: w.cough !== '弱' },
    { label: '意識清醒可遵從指令', value: w.gcs, pass: followsCommands(w.gcs) },
  ];
}

// 將 { key: value } 轉為 [{ key, label, value, unit, abnormal }]
function toItems(section) {
  return Object.entries(section)
    .filter(([key]) => REFERENCE[key])
    .map(([key, value]) => {
      const ref = REFERENCE[key];
      const abnormal = typeof value === 'number' &&
        ((ref.low !== undefined && value < ref.low) || (ref.high !== undefined && value > ref.high));
      return { key, label: ref.label, value, unit: ref.unit || '', abnormal };
    });
}

app.get('/api/v1/patients', (req, res) => {
  const data = patients.map(p => ({
    patient_id: p.patient_id,
    bed_no: p.bed_no,
    name_masked: p.name_masked,
    age: p.age,
    gender: p.gender,
    diagnosis: p.diagnosis,
    ventilator_days: p.ventilator_days,
    mode: p.vent_settings.mode,
    fio2: p.vent_settings.fio2,
    peep: p.vent_settings.peep,
    rsbi: p.weaning.rsbi,
    rass: p.sedation.rass,
    on_vasopressor: p.vasopressors.length > 0,
    score: p.prediction.score,
    trend: p.prediction.trend,
    ...trendInfo(p.prediction.trend),
    risk_level: riskLevel(p.prediction.score),
    action_label: p.recommendation.action_label,
    decision: p.recommendation.decision,
    updated_at: p.updated_at,
  }));
  res.json({ status: 'success', timestamp: new Date().toISOString(), unit: 'MICU 內科加護病房', data });
});

app.get('/api/v1/patients/:id/weaning-dashboard', (req, res) => {
  const p = patients.find(x => x.patient_id === req.params.id);
  if (!p) return res.status(404).json({ status: 'error', message: '查無此病人' });

  const { time: labTime, ...labs } = p.labs;
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    data: {
      patient_info: {
        patient_id: p.patient_id, bed_no: p.bed_no, name_masked: p.name_masked, age: p.age, gender: p.gender,
        diagnosis: p.diagnosis, admit_date: p.admit_date, intubation_date: p.intubation_date,
        ventilator_days: p.ventilator_days, icu_days: p.icu_days, attending: p.attending,
        height_cm: p.height_cm, weight_kg: p.weight_kg, ett: p.ett, updated_at: p.updated_at,
      },
      vent_settings: toItems(p.vent_settings),
      labs: { time: labTime, items: toItems(labs) },
      weaning: toItems(p.weaning),
      sedation: p.sedation,
      io: toItems(p.io),
      nutrition: {
        items: toItems(p.nutrition),
        kcal_pct: p.nutrition.kcal_target ? Math.round(p.nutrition.kcal_actual / p.nutrition.kcal_target * 100) : 0,
      },
      vasopressors: p.vasopressors,
      prediction: {
        system_name: 'SmartWean RT',
        score: p.prediction.score,
        trend: p.prediction.trend,
        ...trendInfo(p.prediction.trend),
        risk_level: riskLevel(p.prediction.score),
        summary: p.prediction.summary,
        shap_factors: p.prediction.shap_factors,
        shap_base: SHAP_BASE,
        domain_contributions: Object.entries(p.prediction.domains)
          .map(([key, impact]) => ({ key, label: DOMAINS[key], impact })),
      },
      sbt_checklist: sbtChecklist(p),
      recommendation: p.recommendation,
    },
  });
});

app.get('/api/v1/patients/:id/history/:key', (req, res) => {
  const p = patients.find(x => x.patient_id === req.params.id);
  if (!p) return res.status(404).json({ status: 'error', message: '查無此病人' });
  const data = buildHistory(p, req.params.key);
  if (!data) return res.status(404).json({ status: 'error', message: '此參數無歷史數據' });
  res.json({ status: 'success', data });
});

app.listen(PORT, () => {
  console.log(`SmartWean RT 服務已啟動：http://localhost:${PORT}`);
});
