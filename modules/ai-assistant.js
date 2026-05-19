/**
 * @file ai-assistant.js
 * @description AIアシスタントモジュール（Phase 3）。
 *              Claude Code のスキルと連携し、各種タスクをワンクリックで起動できる統合ハブ。
 *              プロンプト自動生成 → クリップボードコピー → 結果貼り付け → 自動パース＆保存
 *              のフローを提供する。将来的にはバックエンドプロキシ経由の直接API呼び出しにも対応予定。
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

/* =========================================================
   定数
   ========================================================= */

/** AIタスクテンプレート定義。各タスクは Claude Code のスキルに対応する */
const AI_TASKS = [
  {
    id: 'prospect-research',
    icon: 'search',
    title: '企業リサーチ',
    description: 'ターゲット業界の候補企業を調査し、プロスペクトリストを作成する',
    skillName: 'prospect-research',
    promptTemplate: buildProspectPrompt,
    category: '営業'
  },
  {
    id: 'outbound-message',
    icon: 'mail',
    title: 'アウトバウンドメール作成',
    description: '指定企業への初回コンタクトメール（課題直球型・共感型）を生成する',
    skillName: 'outbound-message',
    promptTemplate: buildOutboundPrompt,
    category: '営業'
  },
  {
    id: 'company-deep-dive',
    icon: 'building-2',
    title: '企業詳細調査',
    description: '登録済み企業の詳細情報（財務・経営陣・競合・アプローチ仮説）を調査する',
    skillName: 'prospect-research',
    promptTemplate: buildDeepDivePrompt,
    category: '調査'
  },
  {
    id: 'proposal-draft',
    icon: 'file-text',
    title: '提案書ドラフト',
    description: 'ヒアリングメモを元に提案書の骨子・ドラフトを自動生成する',
    skillName: 'proposal-deck',
    promptTemplate: buildProposalPrompt,
    category: '提案'
  },
  {
    id: 'deal-review',
    icon: 'scale',
    title: '案件レビュー',
    description: '進行中の案件をBANT評価し、受注確度・リスク・次のアクションを整理する',
    skillName: 'deal-review',
    promptTemplate: buildDealReviewPrompt,
    category: '評価'
  },
  {
    id: 'meeting-minutes',
    icon: 'mic',
    title: '議事録生成',
    description: 'ヒアリングメモやメモ書きから、定型フォーマットの議事録を生成する',
    skillName: 'minutes-creator',
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
          <i data-lucide="play" class="btn-icon"></i>実行する
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="ai-hub">
      <!-- ヘッダー -->
      <div class="ai-hub-header">
        <div class="ai-hub-title-row">
          <i data-lucide="bot" class="ai-hub-icon"></i>
          <div>
            <h2 class="ai-hub-title">AIアシスタント</h2>
            <p class="ai-hub-subtitle">Claude Code のスキルと連携して、各種業務を効率化します</p>
          </div>
        </div>
        <div class="ai-hub-notice">
          <i data-lucide="info" style="width:14px;height:14px;flex-shrink:0;"></i>
          <span>プロンプトをコピー → Claude Code に貼り付け → 結果を貼り戻す流れで動作します</span>
        </div>
      </div>

      <!-- タスクカードグリッド -->
      <div class="ai-task-grid">
        ${taskCardsHtml}
      </div>

      <!-- 最近の実行履歴 -->
      <div class="ai-history" id="ai-history-section">
        <h3 class="ai-history-title">
          <i data-lucide="clock" style="width:14px;height:14px;"></i>
          最近の実行履歴
        </h3>
        <div id="ai-history-list"></div>
      </div>
    </div>
  `;

  // ボタンのクリックイベント（カード全体クリックは廃止し、ボタンのみに集約）
  container.querySelectorAll('.ai-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      const task = AI_TASKS.find(t => t.id === taskId);
      if (task) openTaskModal(task);
    });
  });

  // 実行履歴を描画する
  renderHistory();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   タスク実行モーダル
   ========================================================= */

/**
 * @description タスク実行モーダルを開く。
 *              ユーザー入力 → プロンプト生成 → コピー → 結果貼り付け → 保存 のフローを提供する。
 * @param {Object} task - AI_TASKS の要素
 */
function openTaskModal(task) {
  const modalContent = document.createElement('div');
  modalContent.className = 'ai-modal-content';

  // タスク固有の入力フォームを生成する
  const inputFormHtml = task.promptTemplate('form');

  modalContent.innerHTML = `
    <div class="ai-modal-steps">

      <!-- Step 1: 入力 -->
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

      <!-- Step 2: プロンプト確認 & コピー -->
      <div class="ai-modal-step" id="ai-step-prompt" hidden>
        <div class="ai-modal-step-header">
          <span class="ai-modal-step-num">2</span>
          <span class="ai-modal-step-title">プロンプトを Claude Code にコピー</span>
        </div>
        <div class="ai-modal-step-body">
          <textarea class="form-textarea ai-prompt-area" id="ai-generated-prompt" readonly rows="10"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn--primary" id="ai-btn-copy-prompt">
              <i data-lucide="clipboard" class="btn-icon"></i>プロンプトをコピー
            </button>
            <span class="ai-copy-hint">→ Claude Code に貼り付けて実行してください</span>
          </div>
        </div>
      </div>

      <!-- Step 3: 結果貼り付け -->
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
            <button class="btn btn--primary" id="ai-btn-save-result">
              <i data-lucide="save" class="btn-icon"></i>結果を保存
            </button>
          </div>
        </div>
      </div>

    </div>
  `;

  openModal(`${task.title}`, modalContent, { size: 'wide' });

  // Step 1: プロンプト生成
  modalContent.querySelector('#ai-btn-generate')?.addEventListener('click', () => {
    const prompt = task.promptTemplate('generate', modalContent);
    if (!prompt) return; // バリデーション失敗

    modalContent.querySelector('#ai-generated-prompt').value = prompt;
    modalContent.querySelector('#ai-step-prompt').removeAttribute('hidden');
    modalContent.querySelector('#ai-step-result').removeAttribute('hidden');
  });

  // Step 2: コピー
  modalContent.querySelector('#ai-btn-copy-prompt')?.addEventListener('click', () => {
    const promptText = modalContent.querySelector('#ai-generated-prompt').value;
    copyToClipboard(promptText);
  });

  // Step 3: 結果保存
  modalContent.querySelector('#ai-btn-save-result')?.addEventListener('click', () => {
    const result = modalContent.querySelector('#ai-result-paste').value.trim();
    if (!result) {
      showToast('結果が入力されていません。', 'error');
      return;
    }

    // 実行履歴に保存する
    saveHistory(task, result);
    closeModal();
    showToast(`${task.title}の結果を保存しました。`, 'success');
    renderHistory();
  });

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

  return `@maika prospect-research を実行して。

# リサーチ依頼

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
- prospect-list-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md に保存`;
}

/**
 * @description アウトバウンドメール用プロンプトを生成する。
 */
function buildOutboundPrompt(mode, container) {
  if (mode === 'form') {
    // 登録済み企業をプルダウンで選択させる
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

  return `@maika outbound-message を実行して。

# アウトバウンドメール作成依頼

## 送信先
- 企業名: ${companyName}
- 担当者: ${person}
${context ? `\n## 把握している課題・状況\n${context}` : ''}${notesSnippet}

## 要件
- 課題直球型と共感型の2パターンを作成
- 西栄多の口調（PROFILE.md参照）で書くこと
- CTA: 30分のオンライン面談
- outreach/outbound-${companyName.replace(/[\s株式会社（）]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md に保存`;
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

  return `以下の企業について詳細調査をお願いします。

# 企業詳細調査依頼

## 調査対象
企業名: ${companyName}

## 調査項目
1. 企業概要・主力製品/サービス
2. 業界動向・市場規模
3. 競合・差別化ポイント
4. 財務・調達情報（公開情報の範囲）
5. 経営陣・組織体制
6. アプローチ仮説・支援領域
${extra ? `\n## 追加調査項目\n${extra}` : ''}

## 出力形式
Markdown 形式で出力してください。
research/${companyName.replace(/[\s株式会社（）]/g, '_')}_research.md として保存してください。`;
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

  return `@iori proposal-deck を実行して。

# 提案書ドラフト作成依頼

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
- ROI試算を含める
- presentation_0529/outputs/ にMarkdownで保存`;
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

  return `@rino deal-review を実行して。

# 案件レビュー依頼

## 案件情報
- 企業名: ${company}
- 現在のフェーズ: ${phase}

## 把握している情報
${context || '（詳細情報なし — ヒアリングベースで判断してください）'}

## 評価してほしいこと
1. BANT評価（Budget/Authority/Need/Timeline）
2. リスク評価（リソース・技術・関係性・スコープ）
3. アクション判断（Proceed/Nurture/Pass）
4. 次の具体的アクションと期日

## 出力
deal-review-${company.replace(/[\s株式会社（）]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md に保存`;
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

  return `議事録を作成して。

# 議事録作成依頼

## 会議名
${title || '（会議名未指定）'}

## メモ・書き起こし
${raw}

## 要件
- 定型フォーマット（日時・参加者・議題・決定事項・TODO・次回予定）で整理
- 発言者ごとの要約
- TODOは担当者と期日を明記`;
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
    resultPreview: result.substring(0, 200),
    executedAt: new Date().toISOString()
  });

  // 最大20件に制限する（古いものを削除）
  if (history.length > 20) history.length = 20;

  try {
    saveToStorage(LS_KEY_AI_HISTORY, history);
  } catch (_err) {
    // 容量超過時は履歴保存を諦める（メイン機能には影響しない）
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

  listEl.innerHTML = history.map(h => {
    const catColor = CATEGORY_COLORS[h.category] || CATEGORY_COLORS['記録'];
    const date = new Date(h.executedAt);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    return `
      <div class="ai-history-item">
        <span class="ai-history-category" style="
          background:${catColor.bg};color:${catColor.text};
        ">${h.category}</span>
        <span class="ai-history-task">${escapeHtml(h.taskTitle)}</span>
        <span class="ai-history-preview">${escapeHtml(h.resultPreview)}</span>
        <span class="ai-history-date">${dateStr}</span>
      </div>
    `;
  }).join('');
}

/* =========================================================
   ユーティリティ
   ========================================================= */

/**
 * @description テキストをクリップボードにコピーする。
 * @param {string} text - コピーするテキスト
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('プロンプトをコピーしました。Claude Code に貼り付けて実行してください。', 'success', 4000);
  }).catch(() => {
    // HTTP fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('プロンプトをコピーしました。', 'success', 4000);
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
