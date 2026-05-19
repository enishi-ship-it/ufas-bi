/**
 * @file pl-dashboard.js
 * @description PL/財務ダッシュボードモジュール。
 *              Excel/CSV ファイルを SheetJS でパースし、Chart.js でグラフ描画する。
 *              LS_KEY_PL に月次PLデータを保存・読み出しする。
 */

import {
  loadFromStorage,
  saveToStorage,
  openModal,
  closeModal,
  showToast,
  openConfirmModal,
  LS_KEY_PL
} from '../script.js';

/* =========================================================
   定数
   ========================================================= */

/**
 * 日本語ヘッダーから内部プロパティへのマッピング。
 * 英語ヘッダーも別途 MAP_EN_COLS で定義する。
 */
const MAP_JP_COLS = {
  '月':    'month',
  '売上':  'revenue',
  '原価':  'cost',
  '粗利':  'grossProfit',
  '販管費': 'sga',
  '営業利益': 'operatingIncome'
};

/** 英語ヘッダーから内部プロパティへのマッピング */
const MAP_EN_COLS = {
  'month':            'month',
  'revenue':          'revenue',
  'cost':             'cost',
  'gross_profit':     'grossProfit',
  'sga':              'sga',
  'operating_income': 'operatingIncome'
};

/**
 * グラフの色設定（ダークテーマ準拠）。
 * アクセントカラー #4f9cf9 を基準にした配色。
 */
const CHART_COLORS = {
  revenue:         '#4f9cf9',
  grossProfit:     '#3fb950',
  operatingIncome: '#d29922',
  cost:            '#f85149',
  sga:             '#a371f7'
};

/** Chart.js グリッド／テキスト色（ダークテーマ） */
const CHART_GRID_COLOR  = '#21262d';
const CHART_TEXT_COLOR  = '#8b949e';

/** 描画済み Chart.js インスタンスを保持する（再描画時に destroy するため） */
let chartTrendInstance  = null;
let chartCostInstance   = null;

/* =========================================================
   公開 API
   ========================================================= */

/**
 * @description PLダッシュボードモジュールを初期化する。
 *              モーダルトリガーの設定など、DOMContentLoaded 後に一度だけ呼ぶ。
 */
export function initPLDashboard() {
  // 特に初期化処理なし（renderPLDashboard が呼ばれるたびにイベントをバインドする）
}

/**
 * @description PLダッシュボードをコンテナ要素に描画する。
 *              PLデータが存在すればグラフ＋テーブルを、なければ空ステートを表示する。
 * @param {HTMLElement} containerEl - 描画先の DOM 要素
 */
export function renderPLDashboard(containerEl) {
  if (!containerEl) return;

  const plData = loadFromStorage(LS_KEY_PL, null);

  if (!plData || !Array.isArray(plData) || plData.length === 0) {
    // データ未登録時は空ステート＋アップロード導線を表示する
    renderEmptyState(containerEl);
    return;
  }

  // データあり: グラフ＋テーブルを描画する
  renderDashboardContent(containerEl, plData);
}

/* =========================================================
   空ステート描画
   ========================================================= */

/**
 * @description PLデータ未登録時の空ステートをコンテナに描画する。
 * @param {HTMLElement} containerEl - 描画先の DOM 要素
 */
function renderEmptyState(containerEl) {
  containerEl.innerHTML = `
    <div class="pl-empty-state">
      <i data-lucide="bar-chart-2" class="pl-empty-icon"></i>
      <p class="pl-empty-title">PLファイルをアップロードしてください</p>
      <p class="pl-empty-desc">Excel (.xlsx) または CSV (.csv) 形式のPLデータをインポートすると、<br>月次推移グラフと数値テーブルがここに表示されます。</p>
      <button class="btn btn--primary" id="pl-btn-upload-empty">
        <i data-lucide="upload" class="btn-icon"></i>PLファイルをインポート
      </button>
    </div>
  `;

  // Lucide アイコンを再描画する
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // アップロードボタンにイベントを設定する
  containerEl.querySelector('#pl-btn-upload-empty')?.addEventListener('click', () => {
    openPLImportModal(containerEl);
  });
}

/* =========================================================
   ダッシュボードコンテンツ描画
   ========================================================= */

/**
 * @description PLデータからグラフ＋テーブルをコンテナに描画する。
 * @param {HTMLElement} containerEl - 描画先の DOM 要素
 * @param {Array<Object>} plData    - 月次PLデータ配列
 */
function renderDashboardContent(containerEl, plData) {
  containerEl.innerHTML = `
    <div class="pl-dashboard-inner">
      <!-- ヘッダー行 -->
      <div class="pl-header">
        <span class="pl-header-title">
          <i data-lucide="bar-chart-2" class="pl-header-icon"></i>PL / 財務サマリー
        </span>
        <div class="pl-header-actions">
          <button class="btn btn--ghost btn-sm" id="pl-btn-reimport">
            <i data-lucide="upload" class="btn-icon"></i>再インポート
          </button>
          <button class="btn btn--ghost btn-sm pl-btn-danger" id="pl-btn-clear">
            <i data-lucide="trash-2" class="btn-icon"></i>データ削除
          </button>
        </div>
      </div>

      <!-- KPI サマリー -->
      <div class="pl-kpi-row" id="pl-kpi-row"></div>

      <!-- グラフ: 売上・粗利・営業利益の月次推移（折れ線） -->
      <div class="pl-chart-container">
        <p class="pl-chart-title">売上・粗利・営業利益の月次推移</p>
        <canvas id="pl-chart-trend"></canvas>
      </div>

      <!-- グラフ: コスト構造の月次推移（積み上げ棒） -->
      <div class="pl-chart-container">
        <p class="pl-chart-title">コスト構造（原価 vs 販管費）の月次推移</p>
        <canvas id="pl-chart-cost"></canvas>
      </div>

      <!-- 数値テーブル -->
      <div class="pl-table-wrapper">
        <p class="pl-chart-title">月次データ一覧</p>
        <div class="table-wrapper">
          <table class="data-table pl-table" id="pl-data-table"></table>
        </div>
      </div>
    </div>
  `;

  // Lucide アイコンを再描画する
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // KPI サマリーを描画する
  renderKpiRow(containerEl.querySelector('#pl-kpi-row'), plData);

  // グラフを描画する（非同期で Chart.js が読み込まれている前提）
  drawTrendChart(plData);
  drawCostChart(plData);

  // テーブルを描画する
  renderTable(containerEl.querySelector('#pl-data-table'), plData);

  // 再インポートボタン
  containerEl.querySelector('#pl-btn-reimport')?.addEventListener('click', () => {
    openPLImportModal(containerEl);
  });

  // データ削除ボタン
  containerEl.querySelector('#pl-btn-clear')?.addEventListener('click', () => {
    handleClearData(containerEl);
  });
}

/* =========================================================
   KPI サマリー描画
   ========================================================= */

/**
 * @description 最新月と累計のKPIカードを描画する。
 * @param {HTMLElement} kpiRow   - KPI行の DOM 要素
 * @param {Array<Object>} plData - 月次PLデータ配列
 */
function renderKpiRow(kpiRow, plData) {
  if (!kpiRow || plData.length === 0) return;

  // 最新月データ
  const latest = plData[plData.length - 1];

  // 累計
  const totalRevenue = plData.reduce((s, r) => s + (r.revenue || 0), 0);
  const totalOI      = plData.reduce((s, r) => s + (r.operatingIncome || 0), 0);

  // 最新月の粗利率
  const grossMargin = latest.revenue > 0
    ? ((latest.grossProfit / latest.revenue) * 100).toFixed(1)
    : '—';

  // 最新月の営業利益率
  const oiMargin = latest.revenue > 0
    ? ((latest.operatingIncome / latest.revenue) * 100).toFixed(1)
    : '—';

  const kpis = [
    { label: '最新月 売上',       value: formatYen(latest.revenue),         sub: latest.month },
    { label: '最新月 粗利率',     value: `${grossMargin}%`,                  sub: `粗利 ${formatYen(latest.grossProfit)}` },
    { label: '最新月 営業利益率', value: `${oiMargin}%`,                     sub: `営業利益 ${formatYen(latest.operatingIncome)}` },
    { label: '累計売上',          value: formatYen(totalRevenue),            sub: `${plData.length}ヶ月分` },
    { label: '累計営業利益',      value: formatYen(totalOI),                 sub: `利益率 ${totalRevenue > 0 ? ((totalOI / totalRevenue) * 100).toFixed(1) : '—'}%` }
  ];

  kpiRow.innerHTML = kpis.map(k => `
    <div class="pl-kpi-card">
      <span class="pl-kpi-label">${k.label}</span>
      <span class="pl-kpi-value">${k.value}</span>
      <span class="pl-kpi-sub">${k.sub}</span>
    </div>
  `).join('');
}

/* =========================================================
   Chart.js グラフ描画
   ========================================================= */

/**
 * @description 売上・粗利・営業利益の月次推移折れ線グラフを描画する。
 *              既存インスタンスがある場合は destroy してから再描画する。
 * @param {Array<Object>} plData - 月次PLデータ配列
 */
function drawTrendChart(plData) {
  const canvas = document.getElementById('pl-chart-trend');
  if (!canvas || !window.Chart) return;

  // 既存インスタンスを破棄して canvas を再利用する
  if (chartTrendInstance) {
    chartTrendInstance.destroy();
    chartTrendInstance = null;
  }

  const labels   = plData.map(r => r.month);
  const baseOpts = buildBaseChartOptions('折れ線（月次推移）');

  chartTrendInstance = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '売上',
          data: plData.map(r => r.revenue),
          borderColor: CHART_COLORS.revenue,
          backgroundColor: CHART_COLORS.revenue + '22',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          fill: false
        },
        {
          label: '粗利',
          data: plData.map(r => r.grossProfit),
          borderColor: CHART_COLORS.grossProfit,
          backgroundColor: CHART_COLORS.grossProfit + '22',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          fill: false
        },
        {
          label: '営業利益',
          data: plData.map(r => r.operatingIncome),
          borderColor: CHART_COLORS.operatingIncome,
          backgroundColor: CHART_COLORS.operatingIncome + '22',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: baseOpts
  });
}

/**
 * @description コスト構造（原価 vs 販管費）の積み上げ棒グラフを描画する。
 *              既存インスタンスがある場合は destroy してから再描画する。
 * @param {Array<Object>} plData - 月次PLデータ配列
 */
function drawCostChart(plData) {
  const canvas = document.getElementById('pl-chart-cost');
  if (!canvas || !window.Chart) return;

  // 既存インスタンスを破棄して canvas を再利用する
  if (chartCostInstance) {
    chartCostInstance.destroy();
    chartCostInstance = null;
  }

  const labels   = plData.map(r => r.month);
  const baseOpts = buildBaseChartOptions('積み上げ棒（コスト構造）');

  // 積み上げ棒グラフ用に y 軸を stacked に設定する
  baseOpts.scales.y.stacked = true;
  baseOpts.scales.x         = {
    stacked: true,
    grid: { color: CHART_GRID_COLOR },
    ticks: {
      color: CHART_TEXT_COLOR,
      font: { size: 11 }
    }
  };

  chartCostInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '原価',
          data: plData.map(r => r.cost),
          backgroundColor: CHART_COLORS.cost + 'cc',
          borderColor: CHART_COLORS.cost,
          borderWidth: 1
        },
        {
          label: '販管費',
          data: plData.map(r => r.sga),
          backgroundColor: CHART_COLORS.sga + 'cc',
          borderColor: CHART_COLORS.sga,
          borderWidth: 1
        }
      ]
    },
    options: baseOpts
  });
}

/**
 * @description Chart.js 共通オプションオブジェクトを生成する。
 *              ダークテーマ用のグリッド・テキスト色を設定する。
 * @param {string} ariaLabel - アクセシビリティ用のラベル文字列
 * @returns {Object} Chart.js options オブジェクト
 */
function buildBaseChartOptions(ariaLabel) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 400 },
    plugins: {
      legend: {
        labels: {
          color: CHART_TEXT_COLOR,
          font: { size: 12 },
          boxWidth: 12,
          padding: 16
        }
      },
      tooltip: {
        callbacks: {
          // 金額をカンマ区切りで表示する
          label: ctx => ` ${ctx.dataset.label}: ${formatYen(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: CHART_GRID_COLOR },
        ticks: {
          color: CHART_TEXT_COLOR,
          font: { size: 11 }
        }
      },
      y: {
        grid: { color: CHART_GRID_COLOR },
        ticks: {
          color: CHART_TEXT_COLOR,
          font: { size: 11 },
          // 金額をカンマ区切りで表示する
          callback: val => formatYenShort(val)
        }
      }
    }
  };
}

/* =========================================================
   数値テーブル描画
   ========================================================= */

/**
 * @description 月次PLデータを表形式でテーブル要素に描画する。
 * @param {HTMLTableElement} tableEl - 描画先の <table> 要素
 * @param {Array<Object>}    plData  - 月次PLデータ配列
 */
function renderTable(tableEl, plData) {
  if (!tableEl) return;

  tableEl.innerHTML = `
    <thead>
      <tr>
        <th>月</th>
        <th class="pl-num">売上</th>
        <th class="pl-num">原価</th>
        <th class="pl-num">粗利</th>
        <th class="pl-num">粗利率</th>
        <th class="pl-num">販管費</th>
        <th class="pl-num">営業利益</th>
        <th class="pl-num">営業利益率</th>
      </tr>
    </thead>
    <tbody>
      ${plData.map(r => {
        const grossMargin = r.revenue > 0 ? ((r.grossProfit / r.revenue) * 100).toFixed(1) : '—';
        const oiMargin    = r.revenue > 0 ? ((r.operatingIncome / r.revenue) * 100).toFixed(1) : '—';
        return `
          <tr>
            <td>${r.month}</td>
            <td class="pl-num">${formatYen(r.revenue)}</td>
            <td class="pl-num">${formatYen(r.cost)}</td>
            <td class="pl-num">${formatYen(r.grossProfit)}</td>
            <td class="pl-num pl-pct">${grossMargin}%</td>
            <td class="pl-num">${formatYen(r.sga)}</td>
            <td class="pl-num ${r.operatingIncome < 0 ? 'pl-negative' : ''}">${formatYen(r.operatingIncome)}</td>
            <td class="pl-num pl-pct ${parseFloat(oiMargin) < 0 ? 'pl-negative' : ''}">${oiMargin}%</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
}

/* =========================================================
   PLファイルインポートモーダル
   ========================================================= */

/**
 * @description PLファイルインポートモーダルを開く。
 *              ファイル選択 → SheetJS パース → プレビュー → インポート の流れを制御する。
 * @param {HTMLElement} dashboardContainer - ダッシュボード再描画に使う親コンテナ
 */
function openPLImportModal(dashboardContainer) {
  // モーダル本体 DOM を構築する
  const bodyEl = document.createElement('div');
  bodyEl.className = 'pl-import-modal';
  bodyEl.innerHTML = `
    <p class="pl-import-desc">
      Excel (.xlsx) または CSV (.csv) 形式のPLファイルをインポートします。<br>
      想定カラム: 月, 売上, 原価, 粗利, 販管費, 営業利益（英語ヘッダーも対応）
    </p>

    <!-- ドロップゾーン -->
    <div class="pl-upload-area" id="pl-drop-zone">
      <label class="file-upload-label" for="pl-file-input">
        <i data-lucide="upload-cloud" class="file-upload-icon"></i>
        <span>クリックまたはドラッグ＆ドロップでファイルを選択</span>
        <span class="file-upload-sub">.xlsx / .csv 対応</span>
        <input
          type="file"
          id="pl-file-input"
          class="file-upload-input"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        >
      </label>
    </div>

    <!-- パース後のプレビューテーブル（初期は非表示） -->
    <div id="pl-preview-area" hidden>
      <p class="pl-preview-title">プレビュー <span id="pl-preview-count"></span></p>
      <div class="table-wrapper pl-preview-table-wrapper">
        <table class="data-table pl-table" id="pl-preview-table"></table>
      </div>
      <div class="pl-import-actions">
        <button class="btn btn--primary" id="pl-btn-confirm-import">
          <i data-lucide="check" class="btn-icon"></i>インポート実行
        </button>
        <button class="btn btn--ghost" id="pl-btn-cancel-import">キャンセル</button>
      </div>
    </div>

    <!-- エラーメッセージ（初期は非表示） -->
    <div id="pl-parse-error" class="pl-parse-error" hidden></div>
  `;

  openModal('PLファイルをインポート', bodyEl);

  // Lucide を再描画する
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // パース済みデータを一時保持する変数
  let parsedData = null;

  /* --- ファイル選択イベント --- */
  const fileInput = bodyEl.querySelector('#pl-file-input');
  fileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file, bodyEl, data => { parsedData = data; });
  });

  /* --- ドラッグ＆ドロップ --- */
  const dropZone = bodyEl.querySelector('#pl-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('pl-upload-area--dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('pl-upload-area--dragover');
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('pl-upload-area--dragover');
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelected(file, bodyEl, data => { parsedData = data; });
    });
  }

  /* --- インポート確定ボタン --- */
  bodyEl.querySelector('#pl-btn-confirm-import')?.addEventListener('click', () => {
    if (!parsedData || parsedData.length === 0) return;

    /**
     * パース済みデータを LocalStorage に保存し、ダッシュボードを再描画するヘルパー関数
     */
    const doImport = () => {
      try {
        saveToStorage(LS_KEY_PL, parsedData);
        showToast(`PLデータをインポートしました（${parsedData.length}件）`, 'success');
        closeModal();
        // ダッシュボードを再描画する
        renderPLDashboard(dashboardContainer);
      } catch (err) {
        if (err.message === 'QUOTA_EXCEEDED') {
          showToast('LocalStorage の容量が不足しています。データ管理画面から不要なデータを削除してください。', 'error', 5000);
        } else {
          showToast('保存中にエラーが発生しました。', 'error');
        }
      }
    };

    // 既存データがある場合は上書き確認する
    const existingData = loadFromStorage(LS_KEY_PL, null);
    if (existingData && Array.isArray(existingData) && existingData.length > 0) {
      closeModal();
      openConfirmModal('既存のPLデータを上書きします。よろしいですか？', doImport);
    } else {
      doImport();
    }
  });

  /* --- キャンセルボタン --- */
  bodyEl.querySelector('#pl-btn-cancel-import')?.addEventListener('click', () => {
    closeModal();
  });
}

/**
 * @description ファイルが選択されたときの処理。
 *              SheetJS でパースしてプレビューテーブルを更新する。
 * @param {File}        file        - 選択されたファイルオブジェクト
 * @param {HTMLElement} modalBodyEl - モーダル本体 DOM 要素
 * @param {Function}    onParsed    - パース成功時のコールバック（引数: parsedData）
 */
function handleFileSelected(file, modalBodyEl, onParsed) {
  const errorEl   = modalBodyEl.querySelector('#pl-parse-error');
  const previewEl = modalBodyEl.querySelector('#pl-preview-area');

  // エラー表示をリセットする
  errorEl.setAttribute('hidden', '');
  errorEl.textContent = '';

  // SheetJS が読み込まれているか確認する
  if (!window.XLSX) {
    showError(errorEl, 'SheetJS が読み込まれていません。ページをリロードしてください。');
    return;
  }

  const reader = new FileReader();

  reader.onload = e => {
    try {
      const arrayBuffer = e.target.result;
      const workbook    = window.XLSX.read(arrayBuffer, { type: 'array' });

      // 最初のシートを使う
      const sheetName   = workbook.SheetNames[0];
      const worksheet   = workbook.Sheets[sheetName];

      // シートを JSON 配列に変換する（ヘッダー行を自動認識）
      const rawRows     = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rawRows.length < 2) {
        showError(errorEl, 'データ行が見つかりません。ヘッダー行と最低1行のデータが必要です。');
        return;
      }

      // ヘッダー行でカラムマッピングを決定する
      const headers    = rawRows[0].map(h => String(h).trim());
      const colMapping = buildColMapping(headers);

      if (!colMapping) {
        showError(errorEl, `必須カラムが見つかりません。\n想定カラム: 月, 売上, 原価, 粗利, 販管費, 営業利益\n（または: month, revenue, cost, gross_profit, sga, operating_income）\n検出されたヘッダー: ${headers.join(', ')}`);
        return;
      }

      // データ行をマッピングに従って変換する
      const parsedData = rawRows
        .slice(1) // ヘッダー行を除く
        .filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''))
        .map(row => mapRow(row, colMapping));

      if (parsedData.length === 0) {
        showError(errorEl, 'データ行が空です。');
        return;
      }

      // プレビューテーブルを更新する
      updatePreview(modalBodyEl, parsedData);
      onParsed(parsedData);

    } catch (err) {
      showError(errorEl, `ファイルの読み込みに失敗しました: ${err.message}`);
    }
  };

  reader.onerror = () => {
    showError(errorEl, 'ファイルの読み込み中にエラーが発生しました。');
  };

  // ArrayBuffer として読み込む（SheetJS の type: 'array' に対応）
  reader.readAsArrayBuffer(file);
}

/**
 * @description ヘッダー配列から内部プロパティへのカラムインデックスマッピングを生成する。
 *              日本語・英語の両方に対応する。
 * @param {string[]} headers - ヘッダー行の配列
 * @returns {Object|null} { month: 0, revenue: 1, ... } 形式のマッピング、または null（必須カラム不足）
 */
function buildColMapping(headers) {
  const mapping = {};

  headers.forEach((header, idx) => {
    const normalized = header.trim();
    // 日本語ヘッダーを優先的にチェックする
    if (MAP_JP_COLS[normalized]) {
      mapping[MAP_JP_COLS[normalized]] = idx;
    } else if (MAP_EN_COLS[normalized.toLowerCase()]) {
      mapping[MAP_EN_COLS[normalized.toLowerCase()]] = idx;
    }
  });

  // 全必須カラムが揃っているか確認する
  const requiredCols = ['month', 'revenue', 'cost', 'grossProfit', 'sga', 'operatingIncome'];
  const hasAll = requiredCols.every(col => mapping[col] !== undefined);

  return hasAll ? mapping : null;
}

/**
 * @description 行データ（配列）をカラムマッピングに従ってオブジェクトに変換する。
 * @param {Array}  row        - シートの1行データ
 * @param {Object} colMapping - カラムインデックスマッピング
 * @returns {Object} 月次PLデータオブジェクト
 */
function mapRow(row, colMapping) {
  /**
   * セル値を数値に変換する。
   * 文字列の場合はカンマを除去してから parseFloat する。
   * @param {*} val - セル値
   * @returns {number} 数値（変換できない場合は 0）
   */
  const toNum = val => {
    if (val === null || val === undefined || val === '') return 0;
    const cleaned = String(val).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  return {
    month:           String(row[colMapping.month] ?? '').trim(),
    revenue:         toNum(row[colMapping.revenue]),
    cost:            toNum(row[colMapping.cost]),
    grossProfit:     toNum(row[colMapping.grossProfit]),
    sga:             toNum(row[colMapping.sga]),
    operatingIncome: toNum(row[colMapping.operatingIncome])
  };
}

/**
 * @description パースされたデータのプレビューテーブルをモーダルに表示する。
 * @param {HTMLElement}  modalBodyEl - モーダル本体 DOM 要素
 * @param {Array<Object>} parsedData - パース済み月次PLデータ
 */
function updatePreview(modalBodyEl, parsedData) {
  const previewArea  = modalBodyEl.querySelector('#pl-preview-area');
  const previewCount = modalBodyEl.querySelector('#pl-preview-count');
  const tableEl      = modalBodyEl.querySelector('#pl-preview-table');

  if (!previewArea || !tableEl) return;

  previewCount.textContent = `（${parsedData.length}件）`;

  tableEl.innerHTML = `
    <thead>
      <tr>
        <th>月</th>
        <th class="pl-num">売上</th>
        <th class="pl-num">原価</th>
        <th class="pl-num">粗利</th>
        <th class="pl-num">販管費</th>
        <th class="pl-num">営業利益</th>
      </tr>
    </thead>
    <tbody>
      ${parsedData.slice(0, 10).map(r => `
        <tr>
          <td>${r.month}</td>
          <td class="pl-num">${formatYen(r.revenue)}</td>
          <td class="pl-num">${formatYen(r.cost)}</td>
          <td class="pl-num">${formatYen(r.grossProfit)}</td>
          <td class="pl-num">${formatYen(r.sga)}</td>
          <td class="pl-num">${formatYen(r.operatingIncome)}</td>
        </tr>
      `).join('')}
      ${parsedData.length > 10 ? `<tr><td colspan="6" class="pl-preview-more">... 他 ${parsedData.length - 10} 件</td></tr>` : ''}
    </tbody>
  `;

  previewArea.removeAttribute('hidden');

  // Lucide アイコンを再描画する（プレビューエリアが表示された後）
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   データ削除
   ========================================================= */

/**
 * @description PLデータを削除する。確認ダイアログを表示してから実行する。
 * @param {HTMLElement} dashboardContainer - ダッシュボード再描画に使う親コンテナ
 */
function handleClearData(dashboardContainer) {
  openConfirmModal(
    'PLデータを削除します。この操作は元に戻せません。よろしいですか？',
    () => {
      // Chart インスタンスを破棄してからデータを削除する
      if (chartTrendInstance) {
        chartTrendInstance.destroy();
        chartTrendInstance = null;
      }
      if (chartCostInstance) {
        chartCostInstance.destroy();
        chartCostInstance = null;
      }

      localStorage.removeItem(LS_KEY_PL);
      showToast('PLデータを削除しました。', 'info');

      // 空ステートに戻す
      renderPLDashboard(dashboardContainer);
    },
    { confirmLabel: '削除する', danger: true }
  );
}

/* =========================================================
   ユーティリティ
   ========================================================= */

/**
 * @description 数値を日本円形式（カンマ区切り）にフォーマットする。
 * @param {number} num - フォーマット対象の数値
 * @returns {string} 例: '1,200,000'
 */
function formatYen(num) {
  if (num === null || num === undefined) return '—';
  return Number(num).toLocaleString('ja-JP');
}

/**
 * @description 大きな数値を短縮形式にフォーマットする（グラフの軸ラベル用）。
 *              100万以上は「万」単位、1億以上は「億」単位で表示する。
 * @param {number} val - フォーマット対象の数値
 * @returns {string} 例: '120万' / '1.2億'
 */
function formatYenShort(val) {
  const abs = Math.abs(val);
  if (abs >= 100000000) return (val / 100000000).toFixed(1) + '億';
  if (abs >= 10000)     return (val / 10000).toFixed(0) + '万';
  return String(val);
}

/**
 * @description モーダル内のエラーメッセージ要素にエラーを表示する。
 * @param {HTMLElement} errorEl - エラー表示用の DOM 要素
 * @param {string}      message - エラーメッセージ
 */
function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.removeAttribute('hidden');
}

/* =========================================================
   サンプルデータ投入（script.js から呼ばれる）
   ========================================================= */

/**
 * @description サンプルPLデータを LocalStorage に投入する。
 *              サンプルデータフラグが立っているときのみ実行される。
 *              script.js の initSampleData から連携する形で呼ぶ。
 * @param {Array<Object>} sampleData - サンプルPLデータ配列
 */
export function initSamplePLData(sampleData) {
  // 既存PLデータがある場合は投入しない
  if (loadFromStorage(LS_KEY_PL, null) !== null) return;
  try {
    saveToStorage(LS_KEY_PL, sampleData);
  } catch {
    // サンプルデータ投入失敗は静かに無視する（容量超過など）
  }
}
