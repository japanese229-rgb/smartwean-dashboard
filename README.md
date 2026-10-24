# SmartWean AI - 智慧呼吸器脫離決策支援系統 Prototype

本專案為加護病房（ICU）呼吸器脫離（Weaning）預測系統之 Web 原型，結合可解釋性 AI (SHAP) 歸因分析與莫蘭迪色系臨床 Dashboard。

## 專案目錄結構
- `public/`: 前端 UI 畫面 (`index.html`) 與串接邏輯 (`app.js`)
- `server.js`: 後端 Express 伺服器與 Mock API
  - `GET /api/v1/patients`：ICU 病人清單（含預測分數與燈號）
  - `GET /api/v1/patients/:id/weaning-dashboard`：單一病人個人面板資料
  - `GET /api/v1/patients/:id/history/:key`：單一參數歷史數據（如 `rsbi`、`fio2`、`pf_ratio`）
- `data/patients.js`: Mock 病人資料與檢驗參考範圍
- `data/history.js`: Mock 參數歷史數據產生器（種子亂數，結果可重現）

## 組員快速啟動方式 (Quick Start)
1. 下載套件：bash npm install
2. 啟動服務：bash node server.js
3. 開啟瀏覽器造訪：`http://localhost:3000`
