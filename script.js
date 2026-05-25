/**
 * @file script.js
 * @description UFAS 戦略業務BI — メインロジック
 *              ルーター・サイドバー制御・共通ユーティリティ・サンプルデータ初期化を担当する。
 *              各機能モジュール（hearing-memo / company-research / past-proposals / data-manager）を
 *              ES Modules でインポートして統括する。
 */

import { initHearingMemo } from './modules/hearing-memo.js';
import { initCompanyResearch } from './modules/company-research.js';
import { initPastProposals } from './modules/past-proposals.js';
import { initDataManager } from './modules/data-manager.js';
import { initPLDashboard, renderPLDashboard, initSamplePLData } from './modules/pl-dashboard.js';
import { initAIAssistant } from './modules/ai-assistant.js';

/* =========================================================
   定数
   ========================================================= */

/** LocalStorage キー：ヒアリングメモ一覧 */
const LS_KEY_HEARING  = 'ufas_hearing_memos';

/** LocalStorage キー：企業情報一覧 */
const LS_KEY_COMPANY  = 'ufas_companies';

/** LocalStorage キー：アップロード提案書一覧 */
const LS_KEY_PROPOSALS = 'ufas_uploaded_proposals';

/** LocalStorage キー：PL/財務データ */
export const LS_KEY_PL = 'ufas_pl_data';

/** サンプルデータ初回ロード済みフラグのキー */
const LS_KEY_SAMPLE_LOADED = 'ufas_sample_loaded';

/** 過去提案書は静的リスト（LocalStorage 不使用）*/
const PAST_PROPOSALS_LIST = [
  {
    id: 'prop-001',
    title: 'サンプル工業向け IoT導入支援 提案書骨子',
    clientName: '株式会社サンプル工業',
    date: '2026-05-09',
    filePath: '/presentation_0529/outputs/skill1_proposal_skeleton.md',
    category: 'IoT',
    tags: ['IoT', '製造業', '新規事業']
  },
  {
    id: 'prop-002',
    title: 'サンプル工業向け 商談獲得アプローチメール',
    clientName: '株式会社サンプル工業',
    date: '2026-05-09',
    filePath: '/presentation_0529/outputs/skill2_approach_emails.md',
    category: 'アウトバウンド',
    tags: ['メール', '営業', 'アプローチ']
  },
  {
    id: 'prop-003',
    title: 'サンプル工業向け 戦略壁打ち・リスク洗い出し',
    clientName: '株式会社サンプル工業',
    date: '2026-05-09',
    filePath: '/presentation_0529/outputs/skill3_strategy_review.md',
    category: '戦略',
    tags: ['戦略', 'リスク', 'レビュー']
  },
  {
    id: 'prop-004',
    title: 'サンプル工業向け 議事録・TODO管理',
    clientName: '株式会社サンプル工業',
    date: '2026-05-09',
    filePath: '/presentation_0529/outputs/skill4_minutes_todo.md',
    category: '議事録',
    tags: ['議事録', 'TODO', '商談管理']
  }
];

/* =========================================================
   サンプルデータ（初回ロード時のみ LocalStorage に書き込む）
   ※ユーザーはデータ管理ビューから削除可能
   ========================================================= */

/**
 * サンプルPLデータ（2026年1〜5月分）。
 * initSampleData 内で LS_KEY_PL が空のときのみ投入する。
 */
const SAMPLE_PL_DATA = [
  { month: '2026-01', revenue: 1200000, cost: 480000, grossProfit: 720000,  sga: 350000, operatingIncome: 370000 },
  { month: '2026-02', revenue: 1500000, cost: 600000, grossProfit: 900000,  sga: 380000, operatingIncome: 520000 },
  { month: '2026-03', revenue: 1800000, cost: 720000, grossProfit: 1080000, sga: 400000, operatingIncome: 680000 },
  { month: '2026-04', revenue: 2200000, cost: 880000, grossProfit: 1320000, sga: 420000, operatingIncome: 900000 },
  { month: '2026-05', revenue: 2000000, cost: 800000, grossProfit: 1200000, sga: 450000, operatingIncome: 750000 }
];

/** サンプルヒアリングメモ 2件 */
const SAMPLE_HEARING_MEMOS = [
  {
    id: 'hm-sample-001',
    clientName: '株式会社サンプル工業',
    date: '2026-05-14',
    attendees: '田中誠一（先方営業部長）、佐藤（弊社営業）、山本（弊社記録）',
    summary:
      '精密部品メーカー（創業38年・従業員約240名）の新規顧客開拓ヒアリング。\n' +
      '主な課題: ①営業チーム5名で月20〜25社が上限 ②提案書1社あたり平均4時間 ③ターゲット選定が属人化。\n' +
      'EV化で既存発注量が横ばい〜微減傾向にあり、新規開拓強化を急いでいる。',
    nextActions:
      '佐藤: 提案書ドラフト＋ROI試算シートを5/21までに作成。山本: デモ環境を5/21までに用意。',
    isSample: true,
    createdAt: '2026-05-14T10:30:00',
    updatedAt: '2026-05-14T10:30:00'
  },
  {
    id: 'hm-sample-002',
    clientName: '燈（あかり）株式会社',
    date: '2026-05-10',
    attendees: '山田（先方事業開発部）、西（弊社）',
    summary:
      '東京大学発AI×DXスタートアップ。2026年1月に50億円調達済み。\n' +
      '建設・製造業向け新規事業を複数並走中。GTM（市場投入戦略）の支援ニーズあり。\n' +
      '組織急拡大中で、業界別パッケージ化の知見が不足していると感じている様子。',
    nextActions: '業界別GTM事例を2件選んで来週中に共有する。次回日程は5/24以降で調整。',
    isSample: true,
    createdAt: '2026-05-10T14:00:00',
    updatedAt: '2026-05-10T14:00:00'
  }
];

/** サンプル企業情報 3件（research/industrial-iot-candidates_2026-04-30.md より） */
const SAMPLE_COMPANIES = [
  {
    id: 'co-sample-001',
    companyName: '燈（あかり）株式会社',
    industry: 'IT',
    businessType: 'B2B',
    revenue: '非公開（50億円調達済）',
    employeeCount: '100〜200名（推定）',
    phase: '事業立ち上げ中',
    notes:
      '東京大学発。建設・製造業向けAI×DX。2026年1月50億円調達。新規事業複数並走の可能性高い。\n' +
      'IPO準備フェーズの可能性も要確認。300名超なら対象外。',
    researchStatus: '調査中',
    isSample: true,
    createdAt: '2026-04-30T09:00:00',
    updatedAt: '2026-04-30T09:00:00'
  },
  {
    id: 'co-sample-002',
    companyName: 'アットマークテクノ株式会社',
    industry: 'IT',
    businessType: 'B2B',
    revenue: '非公開',
    employeeCount: '50〜100名（推定）',
    phase: '新規事業検討初期',
    notes:
      '産業用IoTゲートウェイ「Armadillo」開発・販売（1999年創業）。\n' +
      'ハード事業からSaaS化・サービス化の動きあり。老舗のため既存業務改善ニーズが主の可能性あり。',
    researchStatus: '未調査',
    isSample: true,
    createdAt: '2026-04-30T09:00:00',
    updatedAt: '2026-04-30T09:00:00'
  },
  {
    id: 'co-sample-003',
    companyName: 'SMITH & FACTORY 株式会社',
    industry: 'コンサル',
    businessType: 'B2B',
    revenue: '非公開',
    employeeCount: '50〜100名（推定）',
    phase: '事業立ち上げ中',
    notes:
      'スマートファクトリー・コンサルティング。東大発AIベンチャー関連。\n' +
      'コンサルが本業のため競合になる可能性あり。パートナリング先候補としても検討。',
    researchStatus: '未調査',
    isSample: true,
    createdAt: '2026-04-30T09:00:00',
    updatedAt: '2026-04-30T09:00:00'
  }
];

/* =========================================================
   初期化
   ========================================================= */

/**
 * @description DOM 読み込み完了後のエントリーポイント。
 *              サンプルデータ投入 → 各モジュール初期化 → ルーター起動 の順で実行する。
 */
document.addEventListener('DOMContentLoaded', () => {
  initSampleData();
  // PLサンプルデータは既存フラグに依存せず独立投入する（Phase 2 追加分）
  initSamplePLData(SAMPLE_PL_DATA);
  setupSidebar();
  setupTopbarDate();
  initHearingMemo();
  initCompanyResearch();
  initPastProposals(PAST_PROPOSALS_LIST);
  initDataManager();
  // AIアシスタントモジュールを初期化する（Phase 3）
  initAIAssistant();
  // PLダッシュボードモジュールを初期化する（グローバル設定など）
  initPLDashboard();
  setupRouter();
  renderDashboard();
});

/**
 * @description サンプルデータが未投入なら LocalStorage に書き込む。
 *              「ufas_sample_loaded」フラグで二重投入を防ぐ。
 *              データ管理ビューの「サンプルデータをクリア」でフラグごと削除されるため、
 *              再ロード後に再投入されることはない。
 */
function initSampleData() {
  if (localStorage.getItem(LS_KEY_SAMPLE_LOADED)) return;

  // ヒアリングメモが空なら投入
  if (!localStorage.getItem(LS_KEY_HEARING)) {
    localStorage.setItem(LS_KEY_HEARING, JSON.stringify(SAMPLE_HEARING_MEMOS));
  }

  // 企業情報が空なら投入
  if (!localStorage.getItem(LS_KEY_COMPANY)) {
    localStorage.setItem(LS_KEY_COMPANY, JSON.stringify(SAMPLE_COMPANIES));
  }

  // PLデータが空なら投入（pl-dashboard.js に委譲して重複チェックも行う）
  initSamplePLData(SAMPLE_PL_DATA);

  localStorage.setItem(LS_KEY_SAMPLE_LOADED, '1');
}

/* =========================================================
   サイドバー
   ========================================================= */

/**
 * @description サイドバーの折りたたみトグル機能を初期化する。
 */
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');

  if (!sidebar || !toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    // 折りたたみアイコンの aria-label を更新
    const isCollapsed = sidebar.classList.contains('collapsed');
    toggleBtn.title = isCollapsed ? 'サイドバーを展開する' : 'サイドバーを折りたたむ';
  });
}

/* =========================================================
   トップバー：日付表示
   ========================================================= */

/**
 * @description トップバーに今日の日付を表示する。
 */
function setupTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;

  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
  el.textContent = now.toLocaleDateString('ja-JP', options);
}

/* =========================================================
   ルーター（SPA 風ハッシュベース）
   ========================================================= */

/**
 * @typedef {Object} RouteConfig
 * @property {string} viewId    - 表示する <section> の id
 * @property {string} title     - トップバーに表示するページタイトル
 */

/** ハッシュ → ビュー設定のマッピング */
const ROUTE_MAP = {
  '#dashboard':        { viewId: 'view-dashboard',        title: 'ダッシュボード' },
  '#hearing-memo':     { viewId: 'view-hearing-memo',     title: 'ヒアリングメモ' },
  '#company-research': { viewId: 'view-company-research', title: '企業情報' },
  '#past-proposals':   { viewId: 'view-past-proposals',   title: '過去提案書' },
  '#ai-feature':       { viewId: 'view-ai-feature',       title: 'AIアシスタント' },
  '#data-manager':     { viewId: 'view-data-manager',     title: 'データ管理' }
};

/** デフォルトルート */
const DEFAULT_HASH = '#dashboard';

/**
 * @description ハッシュに対応するビューを表示し、ナビのアクティブ状態を更新する。
 * @param {string} hash - 表示対象のハッシュ（例: '#hearing-memo'）
 */
function navigate(hash) {
  const route = ROUTE_MAP[hash] || ROUTE_MAP[DEFAULT_HASH];

  // 全ビューを非表示にする
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // 対象ビューを表示する
  const targetView = document.getElementById(route.viewId);
  if (targetView) targetView.classList.add('active');

  // ナビのアクティブ状態を更新する
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === hash.replace('#', ''));
  });

  // ページタイトルを更新する
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = route.title;
}

/**
 * @description ルーターを初期化する。
 *              ハッシュ変化を監視し、ナビリンククリックをハンドルする。
 */
function setupRouter() {
  // 初回表示
  navigate(location.hash || DEFAULT_HASH);

  // ハッシュ変化を監視
  window.addEventListener('hashchange', () => navigate(location.hash));

  // ナビリンクのクリックで navigate を呼ぶ
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const hash = '#' + link.dataset.view;
      history.pushState(null, '', hash);
      navigate(hash);
    });
  });

  // Lucide アイコンを描画する（DOM 構築後に必須）
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   共通ユーティリティ（他モジュールへのエクスポート）
   ========================================================= */

/**
 * @description LocalStorage からJSONデータを取得する。
 * @param {string} key - LocalStorage キー
 * @param {*} [defaultValue=[]] - キーが存在しない場合のデフォルト値
 * @returns {*} パース済みデータ
 */
export function loadFromStorage(key, defaultValue = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    // JSONパース失敗時はデフォルト値を返す
    return defaultValue;
  }
}

/**
 * @description LocalStorage にJSONデータを保存する。
 *              容量超過時は QuotaExceededError を throw するため、呼び出し側で catch すること。
 * @param {string} key   - LocalStorage キー
 * @param {*}      value - 保存するデータ（JSON.stringify 可能なもの）
 * @throws {DOMException} 容量超過時
 */
export function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // QuotaExceededError をわかりやすいメッセージ付きで再 throw する
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw err;
  }
}

/**
 * @description ユニークIDを生成する。
 * @param {string} prefix - IDのプレフィックス（例: 'hm', 'co'）
 * @returns {string} 例: 'hm-20260517-a3f2'
 */
export function generateId(prefix) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${datePart}-${randPart}`;
}

/**
 * @description ISO 日時文字列を日本語形式に変換する。
 * @param {string} isoStr - ISO 8601形式の文字列
 * @returns {string} 例: '2026/05/17 10:30'
 */
export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @description モーダルを開く。
 * @param {string}      title   - モーダルタイトル文字列
 * @param {HTMLElement} bodyEl  - モーダル本文として挿入する DOM 要素
 * @param {Object}      [opts]  - オプション
 * @param {'default'|'wide'} [opts.size='default'] - モーダル幅サイズ
 */
export function openModal(title, bodyEl, opts = {}) {
  const overlay   = document.getElementById('modal-overlay');
  const modalBox  = document.getElementById('modal-box');
  const titleEl   = document.getElementById('modal-title');
  const bodyWrap  = document.getElementById('modal-body');
  const closeBtn  = document.getElementById('modal-close');

  // サイズクラスの切替（前回の wide が残らないようリセット）
  modalBox.classList.remove('modal--wide');
  if (opts.size === 'wide') modalBox.classList.add('modal--wide');

  titleEl.textContent = title;
  bodyWrap.innerHTML = '';
  bodyWrap.appendChild(bodyEl);
  overlay.removeAttribute('hidden');

  // Lucide アイコンを再描画する（モーダル内に lucide アイコンが含まれるため）
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 閉じるボタン
  const handleClose = () => {
    overlay.setAttribute('hidden', '');
    closeBtn.removeEventListener('click', handleClose);
  };
  closeBtn.addEventListener('click', handleClose);

  // オーバーレイクリックで閉じる
  const handleOverlayClick = e => {
    if (e.target === overlay) {
      overlay.setAttribute('hidden', '');
      overlay.removeEventListener('click', handleOverlayClick);
    }
  };
  overlay.addEventListener('click', handleOverlayClick);

  // Escape キーで閉じる
  const handleEsc = e => {
    if (e.key === 'Escape') {
      overlay.setAttribute('hidden', '');
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

/**
 * @description モーダルを閉じる。
 */
export function closeModal() {
  document.getElementById('modal-overlay')?.setAttribute('hidden', '');
}

/**
 * @description トースト通知を表示する。フェードアウトアニメーション付き。
 * @param {string} message          - 通知メッセージ
 * @param {'success'|'error'|'info'} [type='info'] - 通知種別
 * @param {number} [duration=3000]  - 表示時間（ミリ秒）
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // アイコン名を種別に応じて決める
  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<i data-lucide="${iconName}" class="toast-icon"></i><span>${message}</span>`;
  container.appendChild(toast);

  // Lucide アイコン描画
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // フェードアウトしてから DOM 削除する（突然消える問題を解消）
  const fadeOutMs = 250;
  setTimeout(() => {
    toast.classList.add('toast--leaving');
    setTimeout(() => toast.remove(), fadeOutMs);
  }, duration - fadeOutMs);
}

/**
 * @description ダークテーマ準拠の確認ダイアログを表示する。
 *              OS 標準の window.confirm() の代替。
 * @param {string}   message   - 確認メッセージ（HTML可）
 * @param {Function} onConfirm - 「はい」押下時のコールバック
 * @param {Object}   [opts]    - オプション
 * @param {string}   [opts.confirmLabel='実行する'] - 確認ボタンのラベル
 * @param {boolean}  [opts.danger=false] - true なら確認ボタンを赤系にする
 */
export function openConfirmModal(message, onConfirm, opts = {}) {
  const { confirmLabel = '実行する', danger = false } = opts;

  const el = document.createElement('div');
  el.className = 'confirm-dialog';
  el.innerHTML = `
    <p class="confirm-dialog-message">${message}</p>
    <div class="confirm-dialog-actions">
      <button class="btn btn--ghost" id="confirm-cancel">キャンセル</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="confirm-ok">
        ${confirmLabel}
      </button>
    </div>
  `;

  openModal('確認', el);

  el.querySelector('#confirm-ok').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
  el.querySelector('#confirm-cancel').addEventListener('click', () => {
    closeModal();
  });
}

/**
 * @description 統一された空ステート HTML を生成する。
 * @param {string} icon  - Lucide アイコン名（例: 'inbox'）
 * @param {string} title - 空ステートのタイトル
 * @param {string} desc  - 説明テキスト
 * @returns {string} HTML 文字列
 */
export function buildEmptyStateHtml(icon, title, desc) {
  return `
    <div class="empty-state">
      <i data-lucide="${icon}" class="empty-state-icon"></i>
      <p class="empty-state-title">${title}</p>
      <p class="empty-state-desc">${desc}</p>
    </div>
  `;
}

/**
 * @description テキストを指定文字数で切り詰める。
 * @param {string} text   - 元のテキスト
 * @param {number} maxLen - 最大文字数
 * @returns {string} 切り詰めたテキスト（末尾に '...' を付加）
 */
export function truncateText(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

/* =========================================================
   ダッシュボード
   ========================================================= */

/**
 * @description ダッシュボードビューをビジネスコックピットとして描画する。
 *              4セクション構成: パイプラインKPI / 直近アクション / ヒアリングメモ / PL財務
 */
function renderDashboard() {
  const view = document.getElementById('view-dashboard');
  if (!view) return;

  /* --- データ取得 --- */
  const allMemos     = loadFromStorage(LS_KEY_HEARING, []);
  const companies    = loadFromStorage(LS_KEY_COMPANY, []);
  const proposals    = loadFromStorage(LS_KEY_PROPOSALS, []);
  const aiHistory    = loadFromStorage('ufas_ai_history', []);

  // 更新日時の新しい順にソート
  allMemos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  /* --- Section A: パイプラインサマリー KPI --- */
  const kpiItems = [
    { icon: 'mic',           label: 'メモ件数',   count: allMemos.length },
    { icon: 'building-2',    label: '登録企業数',  count: companies.length },
    { icon: 'file-text',     label: '提案書数',    count: proposals.length },
    { icon: 'sparkles',      label: 'AI実行数',    count: aiHistory.length },
  ];
  const kpiHtml = kpiItems.map(k => `
    <div class="dashboard-kpi-card">
      <i data-lucide="${k.icon}" class="dashboard-kpi-icon"></i>
      <span class="dashboard-kpi-count">${k.count}</span>
      <span class="dashboard-kpi-label">${escapeHtml(k.label)}</span>
    </div>
  `).join('');

  /* --- Section B: 直近のアクション（最新5件のメモから nextActions を抽出） --- */
  const actionMemos = allMemos
    .filter(m => m.nextActions && m.nextActions.trim() !== '')
    .slice(0, 5);
  const actionsHtml = actionMemos.length === 0
    ? `<p class="dashboard-empty-memo">直近のアクション項目はありません。</p>`
    : actionMemos.map(m => `
        <a href="#hearing-memo" class="dashboard-action-item" data-memo-action>
          <span class="dashboard-action-client">${escapeHtml(m.clientName)}</span>
          <span class="dashboard-action-text">
            <i data-lucide="circle-check" class="dashboard-action-check-icon"></i>
            ${escapeHtml(truncateText(m.nextActions, 80))}
          </span>
        </a>
      `).join('');

  /* --- Section C: 直近のヒアリングメモ（3件、アクセント付きカード） --- */
  const recentMemos = allMemos.slice(0, 3);
  const memoCardsHtml = recentMemos.length === 0
    ? `<p class="dashboard-empty-memo">ヒアリングメモがまだありません。</p>`
    : recentMemos.map(m => `
        <div class="dashboard-memo-card dashboard-memo-card--accent">
          <div class="dashboard-memo-header">
            <span class="dashboard-memo-client">${escapeHtml(m.clientName)}</span>
            <span class="dashboard-memo-date">${m.date || '—'}</span>
          </div>
          <p class="dashboard-memo-summary">${escapeHtml(truncateText(m.summary, 80))}</p>
          ${m.nextActions ? `<div class="dashboard-memo-action">
            <i data-lucide="arrow-right-circle" class="dashboard-memo-action-icon"></i>
            <span>${escapeHtml(truncateText(m.nextActions, 60))}</span>
          </div>` : ''}
        </div>
      `).join('');

  /* --- HTML 組み立て --- */
  view.innerHTML = `
    <div class="dashboard-grid">

      <!-- Section A: パイプラインサマリー KPI（全幅） -->
      <div class="dashboard-card dashboard-card--full">
        <div class="dashboard-card-header">
          <span class="dashboard-card-title">
            <i data-lucide="bar-chart-3" class="dashboard-card-icon"></i>パイプラインサマリー
          </span>
        </div>
        <div class="dashboard-kpi-row">
          ${kpiHtml}
        </div>
      </div>

      <!-- 2カラム行: アクション + ヒアリングメモ -->
      <div class="dashboard-two-col">

        <!-- Section B: 直近のアクション -->
        <div class="dashboard-card dashboard-actions-card">
          <div class="dashboard-card-header">
            <span class="dashboard-card-title">
              <i data-lucide="list-checks" class="dashboard-card-icon"></i>直近のアクション
            </span>
          </div>
          <div class="dashboard-actions-list">
            ${actionsHtml}
          </div>
        </div>

        <!-- Section C: 直近のヒアリングメモ -->
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <span class="dashboard-card-title">
              <i data-lucide="mic" class="dashboard-card-icon"></i>直近のヒアリングメモ
            </span>
            <div class="dashboard-card-actions">
              <button class="btn btn--primary btn-sm" id="dashboard-btn-new-memo">
                <i data-lucide="plus" class="btn-icon"></i>新規メモ
              </button>
              <a href="#hearing-memo" class="btn btn--ghost btn-sm" id="dashboard-link-all-memo">
                すべて見る
              </a>
            </div>
          </div>
          <div class="dashboard-memo-list" id="dashboard-memo-list">
            ${memoCardsHtml}
          </div>
        </div>

      </div>

      <!-- Section D: PL/財務ダッシュボード（全幅） -->
      <div class="dashboard-card dashboard-card--pl dashboard-card--full" id="dashboard-pl-container">
        <!-- renderPLDashboard が動的に内容を生成する -->
      </div>

    </div>
  `;

  /* --- イベントリスナー --- */

  // 「新規メモ」ボタン — ヒアリングメモビューに遷移してフォームを開く
  view.querySelector('#dashboard-btn-new-memo')?.addEventListener('click', () => {
    history.pushState(null, '', '#hearing-memo');
    navigate('#hearing-memo');
    // ビュー切替後にフォームを開く（navigate は同期なので直後に呼んでよい）
    document.getElementById('btn-add-hearing')?.click();
  });

  // 「すべて見る」リンク — ハッシュルーティング
  view.querySelector('#dashboard-link-all-memo')?.addEventListener('click', e => {
    e.preventDefault();
    history.pushState(null, '', '#hearing-memo');
    navigate('#hearing-memo');
  });

  // アクションアイテムのクリック — ヒアリングメモビューへ遷移
  view.querySelectorAll('[data-memo-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      history.pushState(null, '', '#hearing-memo');
      navigate('#hearing-memo');
    });
  });

  // PL/財務ダッシュボードセクションを描画する
  const plContainer = view.querySelector('#dashboard-pl-container');
  if (plContainer) {
    renderPLDashboard(plContainer);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description HTML特殊文字エスケープ（共有ユーティリティ）。
 * @param {string} str - エスケープ対象
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** LocalStorage キーとユーティリティを外部モジュールから参照できるようにエクスポートする */
export { LS_KEY_HEARING, LS_KEY_COMPANY, LS_KEY_SAMPLE_LOADED, LS_KEY_PROPOSALS, PAST_PROPOSALS_LIST };
