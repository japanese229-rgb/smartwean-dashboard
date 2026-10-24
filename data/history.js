// Mock 參數歷史數據產生器（原型展示用）
// 以種子亂數產生可重現的軌跡：依預測分數趨勢，過去數值偏向「較差」方向，逐步收斂至目前數值

const { REFERENCE } = require('./patients');

const HISTORY_DAYS = 5;

// 各區塊紀錄頻率（小時）與當日紀錄時間
const SECTIONS = {
  vent_settings: { interval: 4 },
  weaning:       { interval: 4 },
  labs:          { interval: 24, clock: '05:00' },
  io:            { interval: 24, clock: '07:00' },
  nutrition:     { interval: 24, clock: '07:00' },
};

// 設定值為階梯式調整，不加雜訊並取整到調整級距
const STEP = { fio2: 5, peep: 1, ps: 1, pc: 1, set_rr: 1, kcal_target: 1 };

function seededRandom(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function decimals(v) {
  const s = String(v);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

// 數值往哪個方向是「變差」：只有上限→越高越差；只有下限→越低越差；兩者皆有→遠離中點
function worseDirection(ref, v) {
  const hasLow = ref.low !== undefined, hasHigh = ref.high !== undefined;
  if (hasHigh && !hasLow) return 1;
  if (hasLow && !hasHigh) return -1;
  if (hasLow && hasHigh) return v >= (ref.low + ref.high) / 2 ? 1 : -1;
  return 0;
}

function locate(p, key) {
  if (key === 'rass') return { value: p.sedation.rass, ...SECTIONS.weaning };
  for (const [section, cfg] of Object.entries(SECTIONS)) {
    if (typeof p[section][key] === 'number') return { value: p[section][key], ...cfg };
  }
  return null;
}

function buildHistory(p, key) {
  const ref = REFERENCE[key];
  const found = ref && locate(p, key);
  if (!found) return null;

  const { value: current, interval, clock } = found;
  const day = p.updated_at.slice(0, 10);
  const end = new Date(clock ? `${day}T${clock}:00+08:00` : p.updated_at);
  const intubated = new Date(`${p.intubation_date}T12:00:00+08:00`);
  const start = new Date(Math.max(intubated, end - HISTORY_DAYS * 86400000));
  const n = Math.max(1, Math.floor((end - start) / (interval * 3600000)) + 1);

  const trend = p.prediction.trend;
  const improvement = Math.max(-1, Math.min(1, (trend[trend.length - 1] - trend[0]) / 100 * 2.5));
  const floor = { net: 500, rass: 1.5 }[key] ?? 0.5;
  const scale = key === 'ph' ? 0.05 : Math.max(Math.abs(current) * 0.3, floor);
  const offset0 = worseDirection(ref, current) * scale * improvement;
  const noiseAmp = STEP[key] ? 0 : scale * 0.15;
  const rand = seededRandom(`${p.patient_id}:${key}`);
  const round = v => STEP[key]
    ? Math.round(v / STEP[key]) * STEP[key]
    : Number(v.toFixed(decimals(current)));

  const points = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(end - (n - 1 - i) * interval * 3600000);
    const frac = n === 1 ? 1 : i / (n - 1);
    let v;
    if (i === n - 1) v = current;
    else if (key === 'cumulative') v = round(current * (i + 1) / n + (rand() - 0.5) * 200);
    else v = round(current + offset0 * (1 - frac) + (rand() - 0.5) * 2 * noiseAmp);
    points.push({ t: t.toISOString(), v });
  }

  return {
    key, label: ref.label, unit: ref.unit || '', low: ref.low, high: ref.high,
    interval_hours: interval, points,
  };
}

module.exports = { buildHistory };
