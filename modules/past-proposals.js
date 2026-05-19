/**
 * @file past-proposals.js
 * @description 過去提案書ビュー モジュール。
 *              静的リスト（script.js から渡される）とユーザーがアップロードした
 *              ファイル（LocalStorage 保存）を統合してカードグリッドで表示する。
 *              「開く」ボタンで静的ファイルは新規タブ表示、アップロードファイルはダウンロード。
 *              「提案書を追加」ボタンでファイルをアップロード・登録できる。
 */

import {
  loadFromStorage,
  saveToStorage,
  generateId,
  openModal,
  closeModal,
  showToast,
  openConfirmModal,
  buildEmptyStateHtml,
  LS_KEY_PROPOSALS
} from '../script.js';

/* =========================================================
   定数
   ========================================================= */

/** LocalStorage の使用量が上限に近づく閾値（バイト）。5MB を上限とする */
const LS_SIZE_WARN_BYTES = 5 * 1024 * 1024;

/** 提案書として受け入れる拡張子 */
const PROPOSAL_ACCEPT_EXTS = '.pptx,.xlsx,.xls,.csv,.pdf,.docx,.txt,.md';

/** ファイルアイコンのマッピング（lucide アイコン名） */
const FILE_ICON_MAP = {
  '.pdf':  'file-text',
  '.xlsx': 'table-2',
  '.xls':  'table-2',
  '.csv':  'table-2',
  '.docx': 'file-type',
  '.doc':  'file-type',
  '.pptx': 'presentation',
  '.ppt':  'presentation',
  '.txt':  'file-text',
  '.md':   'file-text'
};

/* =========================================================
   初期化
   ========================================================= */

/**
 * @description 過去提案書モジュールを初期化する。
 * @param {Array<Object>} proposalsList - 静的提案書データの配列（script.js から渡される）
 */
export function initPastProposals(proposalsList) {
  // 静的リストをモジュールスコープに保持する
  renderProposalsGrid(proposalsList);

  // 「提案書を追加」ボタン（ツールバーに注入）
  injectToolbar(proposalsList);
}

/* =========================================================
   ツールバー注入
   ========================================================= */

/**
 * @description 過去提案書ビューのツールバーに「提案書を追加」ボタンを注入する。
 * @param {Array<Object>} staticList - 静的提案書リスト（再描画時に渡す）
 */
function injectToolbar(staticList) {
  const section = document.getElementById('view-past-proposals');
  if (!section) return;

  // ツールバーが既に存在する場合はスキップする
  if (section.querySelector('.view-toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'view-toolbar';
  toolbar.innerHTML = `
    <button class="btn btn--primary" id="btn-add-proposal">
      <i data-lucide="upload" class="btn-icon"></i>提案書を追加
    </button>
  `;

  // グリッドの前にツールバーを挿入する
  const grid = section.querySelector('#proposals-grid');
  if (grid) section.insertBefore(toolbar, grid);

  toolbar.querySelector('#btn-add-proposal')?.addEventListener('click', () => {
    openProposalUploadForm(staticList);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   描画
   ========================================================= */

/**
 * @description 提案書カードグリッドを描画する。
 *              静的リストとアップロード済みリストを統合して表示する。
 * @param {Array<Object>} staticList - 静的提案書オブジェクトの配列
 */
function renderProposalsGrid(staticList) {
  const grid = document.getElementById('proposals-grid');
  if (!grid) return;

  // アップロード済み提案書を LocalStorage から取得する
  const uploaded = loadFromStorage(LS_KEY_PROPOSALS, []);

  // 統合リスト（アップロード済みを先頭に表示する）
  const allProposals = [
    ...uploaded.map(u => ({ ...u, isUploaded: true })),
    ...staticList.map(s => ({ ...s, isUploaded: false }))
  ];

  if (allProposals.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-secondary);padding:32px 0;text-align:center;">
      過去提案書がまだありません。「提案書を追加」からアップロードしてください。
    </p>`;
    return;
  }

  grid.innerHTML = allProposals.map(p => buildProposalCard(p)).join('');

  // 「開く」ボタンのイベントを設定する
  grid.querySelectorAll('.btn-open-file').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const proposalId = btn.dataset.id;
      const isUploaded = btn.dataset.uploaded === 'true';

      if (isUploaded) {
        // アップロードファイルは Base64 data からダウンロードする
        const uploadedList = loadFromStorage(LS_KEY_PROPOSALS, []);
        const proposal = uploadedList.find(u => u.id === proposalId);
        if (proposal?.fileData) downloadFile(proposal.fileData, proposal.fileName);
      } else {
        // 静的ファイルは新規タブで開く
        const filePath = btn.dataset.filepath;
        if (filePath) window.open(filePath, '_blank', 'noopener');
      }
    });
  });

  // アップロード済みカードの削除ボタン
  grid.querySelectorAll('.btn-delete-proposal').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const proposalId = btn.dataset.id;
      openConfirmModal(
        'この提案書を削除しますか？',
        () => {
          deleteUploadedProposal(proposalId);
          renderProposalsGrid(staticList);
        },
        { confirmLabel: '削除する', danger: true }
      );
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description 提案書 1件分のカード HTML を返す。
 * @param {Object} proposal - 提案書オブジェクト（isUploaded フラグ付き）
 * @returns {string} HTML 文字列
 */
function buildProposalCard(proposal) {
  const tags = (proposal.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  // アップロード済みバッジ
  const uploadedBadge = proposal.isUploaded
    ? `<span class="proposal-uploaded-badge">アップロード済</span>`
    : '';

  // ファイル名表示（アップロード済みのみ）
  const fileNameDisplay = proposal.isUploaded && proposal.fileName
    ? `<div class="proposal-filename">
         <i data-lucide="${getFileIcon(proposal.fileName)}" style="width:12px;height:12px;"></i>
         <span>${escapeHtml(proposal.fileName)}</span>
       </div>`
    : '';

  // 削除ボタン（アップロード済みのみ表示）
  const deleteBtn = proposal.isUploaded
    ? `<button class="btn btn--danger btn-delete-proposal" data-id="${escapeHtml(proposal.id)}"
               style="padding:4px 8px;font-size:12px;">
         <i data-lucide="trash-2" class="btn-icon"></i>削除
       </button>`
    : `<div class="tooltip-wrapper" data-tooltip="Phase 2 で実装予定">
         <button class="btn btn--ghost" disabled>
           <i data-lucide="copy" class="btn-icon"></i>テンプレとして使う
         </button>
       </div>`;

  return `
    <div class="proposal-card" data-id="${escapeHtml(proposal.id)}">
      <div class="proposal-card-title">
        ${escapeHtml(proposal.title)}${uploadedBadge}
      </div>

      <div class="proposal-card-meta">
        <i data-lucide="building-2" style="width:13px;height:13px;"></i>
        <span>${escapeHtml(proposal.clientName)}</span>
        <span style="margin-left:auto;">${escapeHtml(proposal.date)}</span>
      </div>

      <div>
        <span class="category-badge"
              style="background:rgba(63,185,80,0.15);color:var(--success);border-color:rgba(63,185,80,0.3);"
        >${escapeHtml(proposal.category)}</span>
      </div>

      ${tags ? `<div class="proposal-card-tags">${tags}</div>` : ''}
      ${fileNameDisplay}

      <div class="proposal-card-actions">
        <button class="btn btn--secondary btn-open-file"
                data-id="${escapeHtml(proposal.id)}"
                data-filepath="${escapeHtml(proposal.filePath || '')}"
                data-uploaded="${proposal.isUploaded ? 'true' : 'false'}">
          <i data-lucide="external-link" class="btn-icon"></i>開く
        </button>
        ${deleteBtn}
      </div>
    </div>
  `;
}

/* =========================================================
   提案書アップロードフォーム
   ========================================================= */

/**
 * @description 提案書アップロードフォームをモーダルで開く。
 * @param {Array<Object>} staticList - 静的提案書リスト（登録後の再描画に使用）
 */
function openProposalUploadForm(staticList) {
  const form = document.createElement('form');
  form.id = 'proposal-upload-form';

  // 今日の日付をデフォルト値にする
  const todayStr = new Date().toISOString().slice(0, 10);

  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="fp-title">タイトル <span style="color:var(--danger)">*</span></label>
      <input type="text" id="fp-title" class="form-input" placeholder="例: ○○社向け SaaS 導入提案" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="fp-client">顧客名 <span style="color:var(--danger)">*</span></label>
      <input type="text" id="fp-client" class="form-input" placeholder="例: 株式会社サンプル工業" required>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label" for="fp-date">日付</label>
        <input type="date" id="fp-date" class="form-input" value="${todayStr}">
      </div>
      <div class="form-group">
        <label class="form-label" for="fp-category">カテゴリ</label>
        <input type="text" id="fp-category" class="form-input" placeholder="例: IoT / 戦略">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">ファイル <span style="color:var(--danger)">*</span></label>
      <label class="file-upload-label" id="fp-upload-label" tabindex="0">
        <i data-lucide="upload" class="file-upload-icon"></i>
        <span>ファイルを選択またはドロップ</span>
        <span class="file-upload-sub">.pptx .xlsx .xls .csv .pdf .docx .txt .md</span>
        <input type="file" id="fp-file" class="file-upload-input"
               accept="${PROPOSAL_ACCEPT_EXTS}" required>
      </label>
      <div id="fp-file-preview" class="pending-attachments"></div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn--ghost" id="proposal-form-cancel">キャンセル</button>
      <button type="submit" class="btn btn--primary" id="proposal-form-submit">登録する</button>
    </div>
  `;

  form.querySelector('#proposal-form-cancel').addEventListener('click', closeModal);

  // ファイル選択時のプレビュー
  form.querySelector('#fp-file').addEventListener('change', e => {
    const file = e.target.files?.[0];
    const preview = form.querySelector('#fp-file-preview');
    if (!file || !preview) return;

    const ext = getExt(file.name);
    const iconName = FILE_ICON_MAP[ext] || 'file';
    preview.innerHTML = `
      <div class="pending-attachment-item">
        <i data-lucide="${iconName}" class="attachment-icon"></i>
        <span class="attachment-name">${escapeHtml(file.name)}</span>
        <span class="attachment-size">${formatFileSize(file.size)}</span>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  // フォーム送信
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const fileInput = form.querySelector('#fp-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      showToast('ファイルを選択してください。', 'error');
      return;
    }

    // ファイルサイズ事前チェック（Base64 で約1.37倍に膨張するため余裕を見る）
    const estimatedB64Size = Math.ceil(file.size * 1.37);
    const currentUsage = JSON.stringify(localStorage).length * 2;
    const projectedUsage = currentUsage + estimatedB64Size;

    if (projectedUsage > LS_SIZE_WARN_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const usedMB = (currentUsage / (1024 * 1024)).toFixed(1);
      showToast(
        `容量不足: ファイル ${fileSizeMB}MB + 使用済み ${usedMB}MB で上限 5MB を超えます。` +
        `\nデータ管理から不要なデータを削除してください。`,
        'error', 6000
      );
      return;
    }

    const submitBtn = form.querySelector('#proposal-form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '読み込み中...';

    try {
      const fileData = await readFileAsDataUrl(file);
      const now = new Date().toISOString();

      const newProposal = {
        id:         generateId('pr'),
        title:      form.querySelector('#fp-title').value.trim(),
        clientName: form.querySelector('#fp-client').value.trim(),
        date:       form.querySelector('#fp-date').value,
        category:   form.querySelector('#fp-category').value.trim() || '未分類',
        tags:       [],
        fileName:   file.name,
        fileData,
        isUploaded: true,
        createdAt:  now,
        updatedAt:  now
      };

      const uploaded = loadFromStorage(LS_KEY_PROPOSALS, []);
      uploaded.unshift(newProposal);
      saveToStorage(LS_KEY_PROPOSALS, uploaded);

      closeModal();
      renderProposalsGrid(staticList);
      showToast('提案書を登録しました。', 'success');
    } catch (err) {
      // LocalStorage 容量超過エラーのハンドリング
      if (err.message === 'QUOTA_EXCEEDED') {
        showToast(
          'LocalStorage の容量上限（5MB）を超えました。データ管理から不要なデータを削除してください。',
          'error', 6000
        );
      } else {
        showToast(`ファイルの読み込みに失敗しました: ${err.message || '不明なエラー'}`, 'error');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = '登録する';
    }
  });

  openModal('提案書を追加', form);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   CRUD ヘルパー
   ========================================================= */

/**
 * @description アップロード済み提案書を削除する。
 * @param {string} id - 削除対象の提案書 ID
 */
function deleteUploadedProposal(id) {
  let uploaded = loadFromStorage(LS_KEY_PROPOSALS, []);
  uploaded = uploaded.filter(u => u.id !== id);
  saveToStorage(LS_KEY_PROPOSALS, uploaded);
  showToast('提案書を削除しました。', 'info');
}

/* =========================================================
   ユーティリティ
   ========================================================= */

/**
 * @description File オブジェクトを Base64 data URL として読み込む Promise。
 * @param {File} file - 読み込む File オブジェクト
 * @returns {Promise<string>} data URL 文字列
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

/**
 * @description Base64 data URL をダウンロードさせる。
 * @param {string} dataUrl  - data URL
 * @param {string} fileName - ダウンロード時のファイル名
 */
function downloadFile(dataUrl, fileName) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * @description ファイル名から lucide アイコン名を返す。
 * @param {string} name - ファイル名
 * @returns {string} lucide アイコン名
 */
function getFileIcon(name) {
  const ext = getExt(name);
  return FILE_ICON_MAP[ext] || 'file';
}

/**
 * @description ファイル名から拡張子を取得する（小文字）。
 * @param {string} name - ファイル名
 * @returns {string} 拡張子（例: '.xlsx'）
 */
function getExt(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

/**
 * @description バイト数を人が読みやすい文字列に変換する。
 * @param {number} bytes - バイト数
 * @returns {string} 例: '1.2 MB'
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @description HTML 特殊文字をエスケープする（XSS防止）。
 * @param {string} str - エスケープ対象の文字列
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
