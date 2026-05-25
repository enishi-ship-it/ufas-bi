/**
 * @file ai-assistant.js
 * @description AIアシスタントモジュール。
 *              Claude API を直接ブラウザから呼び出し、結果をUI上にストリーミング表示する。
 *              APIキー未設定時はクリップボード経由の手動フローにフォールバックする。
 */

import {
  loadFromStorage,
  saveToStorage,
  openModal,
  closeModal,
  showToast,
  LS_KEY_HEARING,
  LS_KEY_COMPANY
} from '../script.js';

import {
  hasApiKey,
  getApiKey,
  setApiKey,
  clearApiKey,
  callClaudeStream,
  cleanPromptForApi
} from './claude-api.js';

/* =========================================================
   定数
   ========================================================= */

/** AIタスクテンプレート定義。各タスクは業務スキルに対応する */
const AI_TASKS = [
  {
    id: 'prospect-research',
    icon: 'search',
    title: '企業リサーチ',
    description: 'ターゲット業界の候補企業を調査し、プロスペクトリストを作成する',
    promptTemplate: buildProspectPrompt,
    category: '営業'
  },
  {
    id: 'outbound-message',
    icon: 'mail',
    title: 'アウトバウンドメール作成',
    description: '指定企業への初回コンタクトメール（課題直球型・共感型）を生成する',
    promptTemplate: buildOutboundPrompt,
    category: '営業'
  },
  {
    id: 'company-deep-dive',
    icon: 'building-2',
    title: '企業詳細調査',
    description: '登録済み企業の詳細情報（財務・経営陣・競合・アプローチ仮説）を調査する',
    promptTemplate: buildDeepDivePrompt,
    category: '調査'
  },
  {
    id: 'proposal-draft',
    icon: 'file-text',
    title: '提案書ドラフト',
    description: 'ヒアリングメモを元に提案書の骨子・ドラフトを自動生成する',
    promptTemplate: buildProposalPrompt,
    category: '提案'
  },
  {
    id: 'deal-review',
    icon: 'scale',
    title: '案件レビュー',
    description: '進行中の案件をBANT評価し、受注確度・リスク・次のアクションを整理する',
    promptTemplate: buildDealReviewPrompt,
    category: '評価'
  },
  {
    id: 'meeting-minutes',
    icon: 'mic',
    title: '議事録生成',
    description: 'ヒアリングメモやメモ書きから、定型フォーマットの議事録を生成する',
    promptTemplate: buildMinutesPrompt,
    category: '記録'
  }
];

/** カテゴリごとの色設定 */
const CATEGORY_COLORS = {
  '営業': { bg: 'rgba(79,156,249,0.12)', border: 'rgba(79,156,249,0.3)', text: '#4f9cf9' },
  '調査': { bg: 'rgba(163,113,247,0.12)', border: 'rgba(163,113,247,0.3)', text: '#a371f7' },
  '提案': { bg: 'rgba(63,185,80,0.12)', border: 'rgba(63,185,80,0.3)', text: '#3fb950' },
  '評価': { bg: 'rgba(210,153,34,0.12)', border: 'rgba(210,153,34,0.3)', text: '#d29922' },
  '記録': { bg: 'rgba(139,148,158,0.12)', border: 'rgba(139,148,158,0.3)', text: '#8b949e' }
};

/** 実行中の AbortController を保持する（中断用） */
let activeController = null;

/* =========================================================
   公開 API
   ========================================================= */

/**
 * @description AIアシスタントモジュールを初期化し、ビューを描画する。
 */
export function initAIAssistant() {
  const container = document.getElementById('ai-feature-content');
  if (!container) return;
  renderAIHub(container);
}

/* =========================================================
   メインUI描画
   ========================================================= */

/**
 * @description AIアシスタントのメインハブ画面を描画する。
 * @param {HTMLElement} container - 描画先の DOM 要素
 */
function renderAIHub(container) {
  const apiConnected = hasApiKey();

  const taskCardsHtml = AI_TASKS.map(task => {
    const catColor = CATEGORY_COLORS[task.category] || CATEGORY_COLORS['記録'];
    return `
      <div class="ai-task-card" data-task-id="${task.id}">
        <div class="ai-task-card-header">
          <div class="ai-task-icon">
            <i data-lucide="${task.icon}"></i>
          </div>
          <span class="ai-task-category" style="
            background:${catColor.bg};
            border:1px solid ${catColor.border};
            color:${catColor.text};
          ">${task.category}</span>
        </div>
        <h3 class="ai-task-title">${task.title}</h3>
        <p class="ai-task-desc">${task.description}</p>
        <button class="btn btn--primary btn-sm ai-task-btn" data-task-id="${task.id}">
          <i data-lucide="${apiConnected ? 'zap' : 'play'}" class="btn-icon"></i>${apiConnected ? 'AI実行' : '実行する'}
        </button>
      </div>
    `;
  }).join('');

  // API接続状態に応じたステータスバナー
  const statusBanner = apiConnected
    ? `<div class="ai-hub-notice ai-hub-notice--connected">
        <i data-lucide="check-circle" style="width:14px;height:14px;flex-shrink:0;color:#3fb950;"></i>
        <span>Claude API 接続済み — ワンクリックでAI実行できます</span>
        <button class="btn btn--ghost btn-xs" id="ai-btn-api-settings">
          <i data-lucide="settings" class="btn-icon"></i>API設定
        </button>
      </div>`
    : `<div class="ai-hub-notice ai-hub-notice--disconnected">
        <i data-lucide="key" style="width:14px;height:14px;flex-shrink:0;color:#d29922;"></i>
        <span>APIキーを設定するとワンクリックでAI実行できます</span>
        <button class="btn btn--primary btn-xs" id="ai-btn-api-settings">
          <i data-lucide="settings" class="btn-icon"></i>APIキーを設定
        </button>
      </div>`;

  container.innerHTML = `
    <div class="ai-hub">
      <!-- ヘッダー -->
      <div class="ai-hub-header">
        <div class="ai-hub-title-row">
          <i data-lucide="bot" class="ai-hub-icon"></i>
          <div>
            <h2 class="ai-hub-title">AIアシスタント</h2>
            <p class="ai-hub-subtitle">Claude API と連携して、各種業務を効率化します</p>
          </div>
        </div>
        ${statusBanner}
      </div>

      <!-- タスクカードグリッド -->
      <div class="ai-task-grid">
        ${taskCardsHtml}
      </div>

      <!-- 最近の実行履歴 -->
      <div class="ai-history" id="ai-history-section">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h3 class="ai-history-title">
            <i data-lucide="clock" style="width:14px;height:14px;"></i>
            最近の実行履歴
          </h3>
          <button class="btn btn--ghost btn-xs" id="ai-btn-export-history" title="履歴をエクスポート">
            <i data-lucide="download" class="btn-icon"></i>エクスポート
          </button>
        </div>
        <div id="ai-history-list"></div>
      </div>
    </div>
  `;

  // タスクカードボタンのクリックイベント
  container.querySelectorAll('.ai-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      const task = AI_TASKS.find(t => t.id === taskId);
      if (task) openTaskModal(task);
    });
  });

  // API設定ボタン
  container.querySelector('#ai-btn-api-settings')?.addEventListener('click', () => {
    openApiKeyModal(container);
  });

  // 履歴エクスポートボタン
  container.querySelector('#ai-btn-export-history')?.addEventListener('click', () => {
    exportAIHistory();
  });

  // 実行履歴を描画する
  renderHistory();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   APIキー設定モーダル
   ========================================================= */

/**
 * @description APIキー設定モーダルを開く。
 * @param {HTMLElement} hubContainer - ハブ再描画用の親コンテナ
 */
function openApiKeyModal(hubContainer) {
  const currentKey = getApiKey();
  const masked = currentKey ? currentKey.slice(0, 10) + '...' + currentKey.slice(-4) : '';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'ai-apikey-modal';
  bodyEl.innerHTML = `
    <p class="ai-apikey-desc">
      Anthropic の APIキーを設定すると、AI機能をブラウザから直接実行できます。<br>
      キーはこのブラウザの LocalStorage にのみ保存され、外部には送信されません。
    </p>

    <div class="form-group">
      <label class="form-label">APIキー</label>
      <input type="password" class="form-input" id="ai-apikey-input"
             placeholder="sk-ant-api03-..."
             value="${currentKey || ''}">
      <p class="form-hint">
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">
          Anthropic Console → API Keys
        </a> から取得できます
      </p>
    </div>

    ${currentKey ? `
      <p class="ai-apikey-current">
        現在のキー: <code>${escapeHtml(masked)}</code>
      </p>
    ` : ''}

    <div class="ai-apikey-actions">
      <button class="btn btn--primary" id="ai-apikey-save">
        <i data-lucide="check" class="btn-icon"></i>保存
      </button>
      ${currentKey ? `
        <button class="btn btn--ghost ai-apikey-clear" id="ai-apikey-clear">
          <i data-lucide="trash-2" class="btn-icon"></i>キーを削除
        </button>
      ` : ''}
    </div>
  `;

  openModal('API設定', bodyEl);

  // 保存ボタン
  bodyEl.querySelector('#ai-apikey-save')?.addEventListener('click', () => {
    const key = bodyEl.querySelector('#ai-apikey-input').value.trim();
    if (!key) {
      showToast('APIキーを入力してください。', 'error');
      return;
    }
    if (!key.startsWith('sk-')) {
      showToast('APIキーの形式が正しくありません（sk-... で始まる必要があります）。', 'error');
      return;
    }
    setApiKey(key);
    closeModal();
    showToast('APIキーを保存しました。', 'success');
    renderAIHub(hubContainer);
  });

  // 削除ボタン
  bodyEl.querySelector('#ai-apikey-clear')?.addEventListener('click', () => {
    clearApiKey();
    closeModal();
    showToast('APIキーを削除しました。', 'info');
    renderAIHub(hubContainer);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   タスク実行モーダル
   ========================================================= */

/**
 * @description タスク実行モーダルを開く。
 *              APIキーがあれば直接実行モード、なければ手動コピーモードで動作する。
 * @param {Object} task - AI_TASKS の要素
 */
function openTaskModal(task) {
  const apiMode = hasApiKey();
  const modalContent = document.createElement('div');
  modalContent.className = 'ai-modal-content';

  // タスク固有の入力フォームを生成する
  const inputFormHtml = task.promptTemplate('form');

  if (apiMode) {
    // ===== API直接実行モード =====
    modalContent.innerHTML = `
      <div class="ai-modal-api">
        <!-- 入力フォーム -->
        <div class="ai-modal-input-section">
          ${inputFormHtml}
          <div class="ai-modal-execute-row">
            <button class="btn btn--primary" id="ai-btn-execute">
              <i data-lucide="zap" class="btn-icon"></i>AI実行
            </button>
            <span class="ai-execute-hint">Claude API で直接実行します</span>
          </div>
        </div>

        <!-- 結果表示エリア（初期は非表示） -->
        <div class="ai-result-section" id="ai-result-section" hidden>
          <div class="ai-result-header">
            <span class="ai-result-label">
              <i data-lucide="sparkles" style="width:14px;height:14px;"></i>
              実行結果
            </span>
            <div class="ai-result-actions">
              <button class="btn btn--ghost btn-xs" id="ai-btn-copy-result" title="結果をコピー">
                <i data-lucide="clipboard" class="btn-icon"></i>コピー
              </button>
              <button class="btn btn--ghost btn-xs" id="ai-btn-stop" title="実行を中断" hidden>
                <i data-lucide="square" class="btn-icon"></i>中断
              </button>
            </div>
          </div>
          <div class="ai-result-body" id="ai-result-body">
            <!-- ストリーミング結果がここに表示される -->
          </div>
          <div class="ai-result-footer" id="ai-result-footer" hidden>
            <button class="btn btn--primary" id="ai-btn-save-result">
              <i data-lucide="save" class="btn-icon"></i>履歴に保存
            </button>
            <button class="btn btn--ghost" id="ai-btn-retry">
              <i data-lucide="refresh-cw" class="btn-icon"></i>再実行
            </button>
          </div>
        </div>
      </div>
    `;

    setupApiModeEvents(modalContent, task);

  } else {
    // ===== 手動コピーモード（フォールバック） =====
    modalContent.innerHTML = `
      <div class="ai-modal-steps">
        <div class="ai-modal-step" id="ai-step-input">
          <div class="ai-modal-step-header">
            <span class="ai-modal-step-num">1</span>
            <span class="ai-modal-step-title">情報を入力</span>
          </div>
          <div class="ai-modal-step-body">
            ${inputFormHtml}
          </div>
          <div style="text-align:right;margin-top:12px;">
            <button class="btn btn--primary" id="ai-btn-generate">
              <i data-lucide="sparkles" class="btn-icon"></i>プロンプトを生成
            </button>
          </div>
        </div>

        <div class="ai-modal-step" id="ai-step-prompt" hidden>
          <div class="ai-modal-step-header">
            <span class="ai-modal-step-num">2</span>
            <span class="ai-modal-step-title">プロンプトを Claude Code にコピー</span>
          </div>
          <div class="ai-modal-step-body">
            <textarea class="form-textarea ai-prompt-area" id="ai-generated-prompt" readonly rows="10"></textarea>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="btn btn--primary" id="ai-btn-copy-prompt">
                <i data-lucide="clipboard" class="btn-icon"></i>コピー
              </button>
              <span class="ai-copy-hint">→ Claude Code に貼り付けて実行してください</span>
            </div>
          </div>
        </div>

        <div class="ai-modal-step" id="ai-step-result" hidden>
          <div class="ai-modal-step-header">
            <span class="ai-modal-step-num">3</span>
            <span class="ai-modal-step-title">実行結果を貼り付け</span>
          </div>
          <div class="ai-modal-step-body">
            <textarea class="form-textarea" id="ai-result-paste"
                      placeholder="Claude Code の実行結果をここに貼り付けてください..."
                      rows="8"></textarea>
            <div style="text-align:right;margin-top:8px;">
              <button class="btn btn--primary" id="ai-btn-save-result-manual">
                <i data-lucide="save" class="btn-icon"></i>結果を保存
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    setupManualModeEvents(modalContent, task);
  }

  openModal(`${task.title}`, modalContent, { size: 'wide' });

  // アウトバウンドフォーム: 「手入力する」選択時にカスタム入力欄を表示する
  const companySelect = modalContent.querySelector('#ai-outbound-company');
  const customInput = modalContent.querySelector('#ai-outbound-company-custom');
  if (companySelect && customInput) {
    companySelect.addEventListener('change', () => {
      customInput.style.display = companySelect.value === '__custom__' ? 'block' : 'none';
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description API直接実行モードのイベントをセットアップする。
 * @param {HTMLElement} modalContent - モーダルコンテンツ要素
 * @param {Object} task - タスク定義
 */
function setupApiModeEvents(modalContent, task) {
  let currentResult = '';

  // 実行ボタン
  modalContent.querySelector('#ai-btn-execute')?.addEventListener('click', () => {
    const rawPrompt = task.promptTemplate('generate', modalContent);
    if (!rawPrompt) return; // バリデーション失敗

    const prompt = cleanPromptForApi(rawPrompt);
    executeApiCall(modalContent, task, prompt);
  });

  // 結果コピー
  modalContent.querySelector('#ai-btn-copy-result')?.addEventListener('click', () => {
    const resultBody = modalContent.querySelector('#ai-result-body');
    // innerText でプレーンテキストとしてコピーする
    const text = resultBody?.innerText || '';
    copyToClipboard(text, '結果をコピーしました。');
  });

  // 中断ボタン
  modalContent.querySelector('#ai-btn-stop')?.addEventListener('click', () => {
    if (activeController) {
      activeController.abort();
      activeController = null;
      showToast('実行を中断しました。', 'info');
      const footer = modalContent.querySelector('#ai-result-footer');
      const stopBtn = modalContent.querySelector('#ai-btn-stop');
      if (footer) footer.removeAttribute('hidden');
      if (stopBtn) stopBtn.setAttribute('hidden', '');
    }
  });

  // 保存ボタン
  modalContent.querySelector('#ai-btn-save-result')?.addEventListener('click', () => {
    const resultBody = modalContent.querySelector('#ai-result-body');
    const text = resultBody?.innerText || '';
    if (!text.trim()) return;
    saveHistory(task, text);
    closeModal();
    showToast(`${task.title}の結果を保存しました。`, 'success');
    renderHistory();
  });

  // 再実行ボタン
  modalContent.querySelector('#ai-btn-retry')?.addEventListener('click', () => {
    const rawPrompt = task.promptTemplate('generate', modalContent);
    if (!rawPrompt) return;
    const prompt = cleanPromptForApi(rawPrompt);
    executeApiCall(modalContent, task, prompt);
  });
}

/**
 * @description Claude API を呼び出し、結果をストリーミング表示する。
 * @param {HTMLElement} modalContent - モーダルコンテンツ要素
 * @param {Object} task - タスク定義
 * @param {string} prompt - 整形済みプロンプト
 */
function executeApiCall(modalContent, task, prompt) {
  const resultSection = modalContent.querySelector('#ai-result-section');
  const resultBody = modalContent.querySelector('#ai-result-body');
  const resultFooter = modalContent.querySelector('#ai-result-footer');
  const stopBtn = modalContent.querySelector('#ai-btn-stop');
  const executeBtn = modalContent.querySelector('#ai-btn-execute');

  // UI をローディング状態にする
  resultSection.removeAttribute('hidden');
  resultFooter.setAttribute('hidden', '');
  stopBtn.removeAttribute('hidden');
  executeBtn.disabled = true;
  executeBtn.innerHTML = '<i data-lucide="loader" class="btn-icon ai-spin"></i>実行中...';

  // ローディングアニメーション
  resultBody.innerHTML = `
    <div class="ai-result-loading">
      <div class="ai-typing-indicator">
        <span></span><span></span><span></span>
      </div>
      <p>Claude が回答を生成しています...</p>
    </div>
  `;

  let fullText = '';

  activeController = callClaudeStream(prompt, {
    onChunk: (chunk) => {
      // 最初のチャンクでローディングを消す
      if (!fullText) {
        resultBody.innerHTML = '';
      }
      fullText += chunk;
      // marked.js で Markdown をレンダリングする
      resultBody.innerHTML = renderMarkdown(fullText);
      // 自動スクロール
      resultBody.scrollTop = resultBody.scrollHeight;
    },

    onDone: (_text) => {
      activeController = null;
      stopBtn.setAttribute('hidden', '');
      resultFooter.removeAttribute('hidden');
      executeBtn.disabled = false;
      executeBtn.innerHTML = '<i data-lucide="zap" class="btn-icon"></i>AI実行';

      // 自動保存する
      saveHistory(task, fullText);
      renderHistory();

      // 保存ボタンを「保存済み」ラベルに変更する
      const saveBtn = modalContent.querySelector('#ai-btn-save-result');
      if (saveBtn) {
        saveBtn.innerHTML = '<i data-lucide="check-circle" class="btn-icon"></i>保存済み';
        saveBtn.disabled = true;
        saveBtn.classList.remove('btn--primary');
        saveBtn.classList.add('btn--ghost');
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    onError: (err) => {
      activeController = null;
      stopBtn.setAttribute('hidden', '');
      executeBtn.disabled = false;
      executeBtn.innerHTML = '<i data-lucide="zap" class="btn-icon"></i>AI実行';

      resultBody.innerHTML = `
        <div class="ai-result-error">
          <i data-lucide="alert-triangle" style="width:20px;height:20px;color:#f85149;"></i>
          <div>
            <p class="ai-error-title">エラーが発生しました</p>
            <p class="ai-error-message">${escapeHtml(err.message)}</p>
          </div>
        </div>
      `;
      resultFooter.removeAttribute('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description 手動コピーモードのイベントをセットアップする（フォールバック）。
 * @param {HTMLElement} modalContent - モーダルコンテンツ要素
 * @param {Object} task - タスク定義
 */
function setupManualModeEvents(modalContent, task) {
  // プロンプト生成
  modalContent.querySelector('#ai-btn-generate')?.addEventListener('click', () => {
    const prompt = task.promptTemplate('generate', modalContent);
    if (!prompt) return;
    modalContent.querySelector('#ai-generated-prompt').value = prompt;
    modalContent.querySelector('#ai-step-prompt').removeAttribute('hidden');
    modalContent.querySelector('#ai-step-result').removeAttribute('hidden');
  });

  // コピー
  modalContent.querySelector('#ai-btn-copy-prompt')?.addEventListener('click', () => {
    const promptText = modalContent.querySelector('#ai-generated-prompt').value;
    copyToClipboard(promptText, 'プロンプトをコピーしました。Claude Code に貼り付けて実行してください。');
  });

  // 結果保存
  modalContent.querySelector('#ai-btn-save-result-manual')?.addEventListener('click', () => {
    const result = modalContent.querySelector('#ai-result-paste').value.trim();
    if (!result) {
      showToast('結果が入力されていません。', 'error');
      return;
    }
    saveHistory(task, result);
    closeModal();
    showToast(`${task.title}の結果を保存しました。`, 'success');
    renderHistory();
  });
}

/* =========================================================
   プロンプトテンプレート関数
   ========================================================= */

/**
 * @description 企業リサーチ用プロンプトを生成する。
 * @param {'form'|'generate'} mode - 'form' なら入力HTML、'generate' ならプロンプト文字列を返す
 * @param {HTMLElement} [container] - モーダル内コンテナ（generate 時に参照）
 * @returns {string} HTML文字列 or プロンプト文字列
 */
function buildProspectPrompt(mode, container) {
  if (mode === 'form') {
    return `
      <div class="form-group">
        <label class="form-label">調査したい業界・テーマ</label>
        <input type="text" class="form-input" id="ai-prospect-industry"
               placeholder="例: ヘルステック / 建設テック / ロボティクス">
      </div>
      <div class="form-group">
        <label class="form-label">ターゲット条件（任意で補足）</label>
        <textarea class="form-textarea" id="ai-prospect-criteria" rows="3"
                  placeholder="例: 従業員50〜300名、新規事業立ち上げ中のフェーズ">従業員50〜300名のベンチャー/中堅企業。新規事業を検討中または立ち上げ中。</textarea>
      </div>
    `;
  }

  const industry = container?.querySelector('#ai-prospect-industry')?.value.trim();
  if (!industry) {
    showToast('業界・テーマを入力してください。', 'error');
    return null;
  }
  const criteria = container?.querySelector('#ai-prospect-criteria')?.value.trim() || '';

  return `# 企業リサーチ依頼

## 調査軸
${industry}

## ターゲット条件
${criteria || '従業員50〜300名のベンチャー/中堅企業。新規事業を検討中または立ち上げ中。'}

## 除外条件
- 従業員300名超の大企業
- コンサル同業（競合）
- 新規事業ニーズが見えない企業

## 出力
- 各軸から3〜5社を選定
- 優先度（A/B/C）付き
- 各社の概要・アプローチ仮説を記載
- 表形式でわかりやすくまとめる`;
}

/**
 * @description アウトバウンドメール用プロンプトを生成する。
 */
function buildOutboundPrompt(mode, container) {
  if (mode === 'form') {
    const companies = loadFromStorage(LS_KEY_COMPANY, []);
    const options = companies.map(c =>
      `<option value="${escapeHtml(c.companyName)}">${escapeHtml(c.companyName)}</option>`
    ).join('');

    return `
      <div class="form-group">
        <label class="form-label">送信先企業</label>
        <select class="form-select" id="ai-outbound-company">
          <option value="">企業を選択してください</option>
          ${options}
          <option value="__custom__">手入力する</option>
        </select>
        <input type="text" class="form-input" id="ai-outbound-company-custom"
               placeholder="企業名を入力" style="margin-top:6px;display:none;">
      </div>
      <div class="form-group">
        <label class="form-label">送信先担当者名（わかれば）</label>
        <input type="text" class="form-input" id="ai-outbound-person"
               placeholder="例: 田中部長">
      </div>
      <div class="form-group">
        <label class="form-label">ヒアリングで把握している課題・状況</label>
        <textarea class="form-textarea" id="ai-outbound-context" rows="3"
                  placeholder="例: 営業チーム5名で新規開拓が追いつかない状況"></textarea>
      </div>
    `;
  }

  const select = container?.querySelector('#ai-outbound-company');
  let companyName = select?.value || '';
  if (companyName === '__custom__') {
    companyName = container?.querySelector('#ai-outbound-company-custom')?.value.trim() || '';
  }
  if (!companyName) {
    showToast('企業名を選択または入力してください。', 'error');
    return null;
  }

  const person = container?.querySelector('#ai-outbound-person')?.value.trim() || '担当者';
  const context = container?.querySelector('#ai-outbound-context')?.value.trim() || '';

  // 企業情報がLocalStorageにあれば補足する
  const companies = loadFromStorage(LS_KEY_COMPANY, []);
  const match = companies.find(c => c.companyName === companyName);
  const notesSnippet = match?.notes ? `\n\n## 既知の情報\n${match.notes}` : '';

  return `# アウトバウンドメール作成依頼

## 送信先
- 企業名: ${companyName}
- 担当者: ${person}
${context ? `\n## 把握している課題・状況\n${context}` : ''}${notesSnippet}

## 要件
- 課題直球型と共感型の2パターンを作成
- 送信者は西栄多（UFAS 新規事業支援部）
- 簡潔で誠実なトーン、押し付けがましくない
- CTA: 30分のオンライン面談
- 件名も各パターンそれぞれ作成`;
}

/**
 * @description 企業詳細調査用プロンプトを生成する。
 */
function buildDeepDivePrompt(mode, container) {
  if (mode === 'form') {
    const companies = loadFromStorage(LS_KEY_COMPANY, []);
    const options = companies.map(c =>
      `<option value="${escapeHtml(c.companyName)}">${escapeHtml(c.companyName)}（${escapeHtml(c.industry || '業種不明')}）</option>`
    ).join('');

    return `
      <div class="form-group">
        <label class="form-label">調査対象企業</label>
        <select class="form-select" id="ai-deepdive-company">
          <option value="">企業を選択してください</option>
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">追加で知りたいこと（任意）</label>
        <textarea class="form-textarea" id="ai-deepdive-extra" rows="2"
                  placeholder="例: 最近の資金調達状況、経営陣の経歴"></textarea>
      </div>
    `;
  }

  const companyName = container?.querySelector('#ai-deepdive-company')?.value;
  if (!companyName) {
    showToast('企業を選択してください。', 'error');
    return null;
  }
  const extra = container?.querySelector('#ai-deepdive-extra')?.value.trim() || '';

  return `# 企業詳細調査依頼

## 調査対象
企業名: ${companyName}

## 調査項目
1. 企業概要・主力製品/サービス
2. 業界動向・市場規模
3. 競合・差別化ポイント
4. 財務・調達情報（公開情報の範囲）
5. 経営陣・組織体制
6. 新規事業支援のアプローチ仮説
${extra ? `\n## 追加調査項目\n${extra}` : ''}

## 出力形式
Markdown 形式で構造化して出力してください。`;
}

/**
 * @description 提案書ドラフト用プロンプトを生成する。
 */
function buildProposalPrompt(mode, container) {
  if (mode === 'form') {
    const memos = loadFromStorage(LS_KEY_HEARING, []);
    const options = memos.map(m =>
      `<option value="${escapeHtml(m.id)}">${escapeHtml(m.clientName)} — ${m.date || '日付なし'}</option>`
    ).join('');

    return `
      <div class="form-group">
        <label class="form-label">元にするヒアリングメモ</label>
        <select class="form-select" id="ai-proposal-memo">
          <option value="">ヒアリングメモを選択</option>
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">提案の方向性（任意）</label>
        <textarea class="form-textarea" id="ai-proposal-direction" rows="2"
                  placeholder="例: IoT導入支援・月額コンサル提案"></textarea>
      </div>
    `;
  }

  const memoId = container?.querySelector('#ai-proposal-memo')?.value;
  if (!memoId) {
    showToast('ヒアリングメモを選択してください。', 'error');
    return null;
  }
  const memos = loadFromStorage(LS_KEY_HEARING, []);
  const memo = memos.find(m => m.id === memoId);
  if (!memo) {
    showToast('メモが見つかりません。', 'error');
    return null;
  }
  const direction = container?.querySelector('#ai-proposal-direction')?.value.trim() || '';

  return `# 提案書ドラフト作成依頼

## ヒアリング情報
- 顧客名: ${memo.clientName}
- 面談日: ${memo.date}
- 参加者: ${memo.attendees || '不明'}

## ヒアリング内容
${memo.summary}

## 次のアクション
${memo.nextActions || '未定'}
${direction ? `\n## 提案の方向性\n${direction}` : ''}

## 要件
- 提案書骨子（5〜8ページ相当の構成案）を作成
- 各ページの見出し・キーメッセージ・掲載データ案を記載
- ROI試算を含める
- スケジュール案・体制案も含める`;
}

/**
 * @description 案件レビュー用プロンプトを生成する。
 */
function buildDealReviewPrompt(mode, container) {
  if (mode === 'form') {
    return `
      <div class="form-group">
        <label class="form-label">企業名</label>
        <input type="text" class="form-input" id="ai-deal-company"
               placeholder="例: 株式会社サンプル工業">
      </div>
      <div class="form-group">
        <label class="form-label">現在のステータス</label>
        <select class="form-select" id="ai-deal-phase">
          <option value="初回接触">初回接触</option>
          <option value="課題ヒアリング">課題ヒアリング</option>
          <option value="提案済み">提案済み</option>
          <option value="条件交渉">条件交渉</option>
          <option value="クロージング">クロージング</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">現状の情報（金額感・競合・課題など）</label>
        <textarea class="form-textarea" id="ai-deal-context" rows="4"
                  placeholder="把握している情報をできるだけ詳しく記入してください"></textarea>
      </div>
    `;
  }

  const company = container?.querySelector('#ai-deal-company')?.value.trim();
  if (!company) {
    showToast('企業名を入力してください。', 'error');
    return null;
  }
  const phase = container?.querySelector('#ai-deal-phase')?.value || '';
  const context = container?.querySelector('#ai-deal-context')?.value.trim() || '';

  return `# 案件レビュー依頼

## 案件情報
- 企業名: ${company}
- 現在のフェーズ: ${phase}

## 把握している情報
${context || '（詳細情報なし — 一般的なフレームワークで評価してください）'}

## 評価してほしいこと
1. BANT評価（Budget/Authority/Need/Timeline）
2. リスク評価（リソース・技術・関係性・スコープ）
3. アクション判断（Proceed/Nurture/Pass）
4. 次の具体的アクションと期日
5. 総合スコア（10点満点）`;
}

/**
 * @description 議事録生成用プロンプトを生成する。
 */
function buildMinutesPrompt(mode, container) {
  if (mode === 'form') {
    return `
      <div class="form-group">
        <label class="form-label">会議名・顧客名</label>
        <input type="text" class="form-input" id="ai-minutes-title"
               placeholder="例: サンプル工業 第2回ヒアリング">
      </div>
      <div class="form-group">
        <label class="form-label">メモ・書き起こし</label>
        <textarea class="form-textarea" id="ai-minutes-raw" rows="8"
                  placeholder="会議のメモや書き起こしテキストを貼り付けてください"></textarea>
      </div>
    `;
  }

  const title = container?.querySelector('#ai-minutes-title')?.value.trim();
  const raw = container?.querySelector('#ai-minutes-raw')?.value.trim();
  if (!raw) {
    showToast('メモ・書き起こしを入力してください。', 'error');
    return null;
  }

  return `# 議事録作成依頼

## 会議名
${title || '（会議名未指定）'}

## メモ・書き起こし
${raw}

## 要件
- 定型フォーマット（日時・参加者・議題・決定事項・TODO・次回予定）で整理
- 発言者ごとの要約
- TODOは担当者と期日を明記
- 曖昧な発言は「要確認」と注記`;
}

/* =========================================================
   Markdown レンダリング
   ========================================================= */

/**
 * @description Markdown テキストを安全にHTMLに変換する。
 *              marked.js が利用可能ならそれを使い、なければ基本的な変換を行う。
 * @param {string} md - Markdown テキスト
 * @returns {string} HTML 文字列
 */
function renderMarkdown(md) {
  if (typeof window.marked !== 'undefined') {
    // marked.js でレンダリングする
    try {
      return window.marked.parse(md);
    } catch {
      // パースエラー時はフォールバック
    }
  }

  // フォールバック: 基本的なMarkdown→HTML変換
  return escapeHtml(md)
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>');
}

/* =========================================================
   実行履歴
   ========================================================= */

/** LocalStorage キー: AI実行履歴 */
const LS_KEY_AI_HISTORY = 'ufas_ai_history';

/**
 * @description 実行履歴を保存する。最大20件まで保持する。
 * @param {Object} task   - 実行したタスク定義
 * @param {string} result - 実行結果テキスト
 */
function saveHistory(task, result) {
  const history = loadFromStorage(LS_KEY_AI_HISTORY, []);
  history.unshift({
    taskId: task.id,
    taskTitle: task.title,
    category: task.category,
    result: result,
    resultPreview: result.substring(0, 200),
    executedAt: new Date().toISOString()
  });

  // 最大20件に制限する（古いものを削除）
  if (history.length > 20) history.length = 20;

  try {
    saveToStorage(LS_KEY_AI_HISTORY, history);
  } catch (_err) {
    // 容量超過時は履歴保存を諦める
  }
}

/**
 * @description 実行履歴リストを描画する。
 */
function renderHistory() {
  const listEl = document.getElementById('ai-history-list');
  if (!listEl) return;

  const history = loadFromStorage(LS_KEY_AI_HISTORY, []);

  if (history.length === 0) {
    listEl.innerHTML = `<p class="ai-history-empty">まだ実行履歴がありません。上のタスクカードから始めてみてください。</p>`;
    return;
  }

  listEl.innerHTML = history.map((h, idx) => {
    const catColor = CATEGORY_COLORS[h.category] || CATEGORY_COLORS['記録'];
    const date = new Date(h.executedAt);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    return `
      <div class="ai-history-item" data-history-idx="${idx}">
        <span class="ai-history-category" style="
          background:${catColor.bg};color:${catColor.text};
        ">${h.category}</span>
        <span class="ai-history-task">${escapeHtml(h.taskTitle)}</span>
        <span class="ai-history-preview">${escapeHtml(h.resultPreview)}</span>
        <span class="ai-history-date">${dateStr}</span>
        ${h.result ? `<button class="btn btn--ghost btn-xs ai-history-view-btn" data-idx="${idx}" title="結果を表示">
          <i data-lucide="eye" style="width:12px;height:12px;"></i>
        </button>` : ''}
      </div>
    `;
  }).join('');

  // 履歴の「結果を表示」ボタン
  listEl.querySelectorAll('.ai-history-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const item = history[idx];
      if (item?.result) openHistoryDetailModal(item);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description AI実行履歴をJSONファイルとしてエクスポートする。
 *              履歴が空の場合はトーストで通知する。
 */
function exportAIHistory() {
  const history = loadFromStorage(LS_KEY_AI_HISTORY, []);
  if (history.length === 0) {
    showToast('エクスポートする履歴がありません。', 'info');
    return;
  }
  const json = JSON.stringify(history, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `ufas-ai-history-${dateStr}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('AI履歴をエクスポートしました。', 'success');
}

/**
 * @description 履歴詳細モーダルを開く。
 * @param {Object} historyItem - 履歴アイテム
 */
function openHistoryDetailModal(historyItem) {
  const bodyEl = document.createElement('div');
  bodyEl.className = 'ai-history-detail';
  bodyEl.innerHTML = `
    <div class="ai-result-body">
      ${renderMarkdown(historyItem.result)}
    </div>
    <div style="text-align:right;margin-top:12px;">
      <button class="btn btn--ghost" id="ai-history-copy">
        <i data-lucide="clipboard" class="btn-icon"></i>コピー
      </button>
    </div>
  `;

  const date = new Date(historyItem.executedAt);
  const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  openModal(`${historyItem.taskTitle}（${dateStr}）`, bodyEl, { size: 'wide' });

  bodyEl.querySelector('#ai-history-copy')?.addEventListener('click', () => {
    copyToClipboard(historyItem.result, '結果をコピーしました。');
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   ユーティリティ
   ========================================================= */

/**
 * @description テキストをクリップボードにコピーする。
 * @param {string} text    - コピーするテキスト
 * @param {string} [message] - 成功時のトーストメッセージ
 */
function copyToClipboard(text, message) {
  const msg = message || 'コピーしました。';
  navigator.clipboard.writeText(text).then(() => {
    showToast(msg, 'success', 3000);
  }).catch(() => {
    // HTTP 環境用のフォールバック
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(msg, 'success', 3000);
  });
}

/**
 * @description HTML特殊文字をエスケープする。
 * @param {string} str - エスケープ対象
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
