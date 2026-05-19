/**
 * @file hearing-memo.js
 * @description ヒアリングメモ CRUD モジュール。
 *              LocalStorage にデータを保存し、カードリスト形式で表示する。
 *              新規追加・編集・削除はモーダルフォームを使用する。
 *              添付ファイルは FileReader で Base64 エンコードして attachments 配列に保存する。
 */

import {
  loadFromStorage,
  saveToStorage,
  generateId,
  openModal,
  closeModal,
  openConfirmModal,
  showToast,
  truncateText,
  buildEmptyStateHtml,
  LS_KEY_HEARING
} from '../script.js';

/* =========================================================
   定数
   ========================================================= */

/** LocalStorage の使用量が上限に近づく閾値（バイト）。5MB を上限とする */
const LS_SIZE_WARN_BYTES = 5 * 1024 * 1024;

/** テキストとして中身をプレビュー表示できる拡張子 */
const TEXT_PREVIEW_EXTS = ['.txt', '.csv', '.md'];

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
 * @description ヒアリングメモモジュールを初期化する。
 *              ツールバーのイベントリスナーを設定し、初期リストを描画する。
 */
export function initHearingMemo() {
  // 「新規メモ」ボタン
  document.getElementById('btn-add-hearing')?.addEventListener('click', () => {
    openHearingForm(null);
  });

  // 検索インプット（入力のたびにリストを再描画）
  document.getElementById('search-hearing')?.addEventListener('input', e => {
    renderHearingList(e.target.value.trim());
  });

  renderHearingList();
}

/* =========================================================
   描画
   ========================================================= */

/**
 * @description ヒアリングメモのカードリストを描画する。
 * @param {string} [keyword=''] - 検索キーワード（顧客名・要約にあいまい一致）
 */
function renderHearingList(keyword = '') {
  const container = document.getElementById('hearing-memo-list');
  if (!container) return;

  let memos = loadFromStorage(LS_KEY_HEARING, []);

  // キーワードフィルタ（顧客名・要約・次アクションで絞り込む）
  if (keyword) {
    const lower = keyword.toLowerCase();
    memos = memos.filter(m =>
      m.clientName?.toLowerCase().includes(lower) ||
      m.summary?.toLowerCase().includes(lower) ||
      m.nextActions?.toLowerCase().includes(lower)
    );
  }

  // 更新日時の新しい順にソート
  memos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (memos.length === 0) {
    // キーワード検索中は専用メッセージ、通常時は共通の空ステートを使用する
    container.innerHTML = keyword
      ? buildEmptyStateHtml('inbox', `「${keyword}」に一致するメモはありません`, '検索キーワードを変えて再度お試しください')
      : buildEmptyStateHtml('inbox', 'ヒアリングメモがまだありません', '「新規メモ」ボタンから最初のメモを追加しましょう');
    return;
  }

  container.innerHTML = memos.map(m => buildMemoCard(m)).join('');

  // カードのクリックで詳細を展開する
  container.querySelectorAll('.memo-card').forEach(card => {
    card.addEventListener('click', e => {
      // 編集・削除ボタンのクリックは展開トグルを発火させない
      if (e.target.closest('.btn')) return;
      const detail = card.querySelector('.memo-detail');
      if (detail) detail.classList.toggle('open');
    });
  });

  // 編集ボタン
  container.querySelectorAll('.btn-edit-memo').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const memo = loadFromStorage(LS_KEY_HEARING, []).find(m => m.id === id);
      if (memo) openHearingForm(memo);
    });
  });

  // 削除ボタン
  container.querySelectorAll('.btn-delete-memo').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openConfirmModal(
        'このメモを削除しますか？',
        () => {
          deleteMemo(id);
        },
        { confirmLabel: '削除する', danger: true }
      );
    });
  });

  // 添付ファイルのダウンロードボタン
  container.querySelectorAll('.btn-attachment-download').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const memoId = btn.dataset.memoId;
      const attachIdx = parseInt(btn.dataset.attachIdx, 10);
      const memo = loadFromStorage(LS_KEY_HEARING, []).find(m => m.id === memoId);
      const att = memo?.attachments?.[attachIdx];
      if (att) downloadAttachment(att);
    });
  });

  // テキスト系ファイルのプレビューボタン
  container.querySelectorAll('.btn-attachment-preview').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const memoId = btn.dataset.memoId;
      const attachIdx = parseInt(btn.dataset.attachIdx, 10);
      const memo = loadFromStorage(LS_KEY_HEARING, []).find(m => m.id === memoId);
      const att = memo?.attachments?.[attachIdx];
      if (att) openTextPreview(att);
    });
  });

  // Lucide アイコンを再描画する
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description ヒアリングメモ 1件分のカード HTML を生成して返す。
 * @param {Object} memo - ヒアリングメモオブジェクト
 * @returns {string} HTML 文字列
 */
function buildMemoCard(memo) {
  const sampleBadge = memo.isSample
    ? '<span class="badge-sample">サンプル</span>'
    : '';

  return `
    <div class="memo-card" data-id="${memo.id}">
      <div class="memo-card-header">
        <span class="memo-card-title">${escapeHtml(memo.clientName)}${sampleBadge}</span>
        <span class="memo-card-date">${memo.date || '—'}</span>
      </div>
      <p class="memo-card-summary">${escapeHtml(truncateText(memo.summary, 80))}</p>
      ${memo.nextActions ? `
      <div class="memo-card-action">
        <i data-lucide="arrow-right-circle" class="memo-card-action-icon"></i>
        <span>${escapeHtml(truncateText(memo.nextActions, 60))}</span>
      </div>` : ''}

      <!-- 詳細展開エリア（クリックで表示） -->
      <div class="memo-detail">
        <div class="memo-detail-row">
          <div class="memo-detail-label">参加者</div>
          <div class="memo-detail-value">${escapeHtml(memo.attendees || '—')}</div>
        </div>
        <div class="memo-detail-row">
          <div class="memo-detail-label">要約・議論内容</div>
          <div class="memo-detail-value">${escapeHtml(memo.summary || '—')}</div>
        </div>
        <div class="memo-detail-row">
          <div class="memo-detail-label">次のアクション</div>
          <div class="memo-detail-value">${escapeHtml(memo.nextActions || '—')}</div>
        </div>
        ${buildAttachmentList(memo.attachments || [], memo.id)}
        <div class="memo-detail-actions">
          <button class="btn btn--secondary btn-edit-memo" data-id="${memo.id}">
            <i data-lucide="pencil" class="btn-icon"></i>編集
          </button>
          <button class="btn btn--danger btn-delete-memo" data-id="${memo.id}">
            <i data-lucide="trash-2" class="btn-icon"></i>削除
          </button>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   フォーム（新規作成・編集）
   ========================================================= */

/**
 * @description ヒアリングメモ入力フォームをモーダルで開く。
 * @param {Object|null} memo - 編集対象のメモ。null なら新規作成モード。
 */
function openHearingForm(memo) {
  const isEdit = !!memo;
  const form = document.createElement('form');
  form.id = 'hearing-form';

  // 今日の日付をデフォルト値にする
  const todayStr = new Date().toISOString().slice(0, 10);

  // 編集時は既存の添付ファイルを引き継ぐ
  let pendingAttachments = memo?.attachments ? [...memo.attachments] : [];

  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="f-client-name">顧客名 <span style="color:var(--danger)">*</span></label>
      <input type="text" id="f-client-name" class="form-input" placeholder="例: 株式会社サンプル工業" required
             value="${escapeHtml(memo?.clientName || '')}">
    </div>
    <div class="form-group">
      <label class="form-label" for="f-date">面談日 <span style="color:var(--danger)">*</span></label>
      <input type="date" id="f-date" class="form-input" required
             value="${memo?.date || todayStr}">
    </div>
    <div class="form-group">
      <label class="form-label" for="f-attendees">参加者</label>
      <input type="text" id="f-attendees" class="form-input" placeholder="例: 田中部長、佐藤（弊社）"
             value="${escapeHtml(memo?.attendees || '')}">
    </div>
    <div class="form-group">
      <label class="form-label" for="f-summary">要約・議論内容 <span style="color:var(--danger)">*</span></label>
      <textarea id="f-summary" class="form-textarea" rows="5"
                placeholder="ヒアリングで出た課題・ニーズ・背景などを記録してください。" required>${escapeHtml(memo?.summary || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="f-next-actions">次のアクション</label>
      <textarea id="f-next-actions" class="form-textarea" rows="2"
                placeholder="例: 提案書ドラフトを5/21までに送付">${escapeHtml(memo?.nextActions || '')}</textarea>
    </div>

    <!-- ファイル添付エリア -->
    <div class="form-group">
      <label class="form-label">ファイル添付</label>
      <label class="file-upload-label" id="file-upload-label" tabindex="0">
        <i data-lucide="paperclip" class="file-upload-icon"></i>
        <span>ファイルを選択またはドロップ</span>
        <span class="file-upload-sub">.txt .csv .md .xlsx .xls .docx .doc .pptx .pdf</span>
        <!-- accept 属性で受け入れ拡張子を制限する -->
        <input type="file" id="f-attachments" class="file-upload-input"
               accept=".txt,.csv,.md,.xlsx,.xls,.docx,.doc,.pptx,.pdf" multiple>
      </label>
      <!-- 選択済みファイルのプレビューリスト -->
      <div class="pending-attachments" id="pending-attachments"></div>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn--ghost" id="hearing-form-cancel">キャンセル</button>
      <button type="submit" class="btn btn--primary">${isEdit ? '更新する' : '追加する'}</button>
    </div>
  `;

  // キャンセルボタン
  form.querySelector('#hearing-form-cancel').addEventListener('click', closeModal);

  // 既存の添付ファイルをプレビューリストに表示する
  renderPendingAttachments(form, pendingAttachments);

  // Lucide アイコン更新
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // ファイル選択イベント
  form.querySelector('#f-attachments').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      // LocalStorage 容量チェック（追加前に現在使用量を概算する）
      const currentUsage = JSON.stringify(localStorage).length * 2; // UTF-16 換算
      if (currentUsage > LS_SIZE_WARN_BYTES) {
        showToast('LocalStorage の使用量が上限（5MB）に近づいています。古いデータを削除してください。', 'error', 5000);
        break;
      }

      try {
        const attachment = await readFileAsAttachment(file);
        pendingAttachments.push(attachment);
      } catch {
        showToast(`${file.name} の読み込みに失敗しました。`, 'error');
      }
    }

    // input をリセットして同じファイルを再選択できるようにする
    e.target.value = '';
    renderPendingAttachments(form, pendingAttachments);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  // フォーム送信
  form.addEventListener('submit', e => {
    e.preventDefault();
    const now = new Date().toISOString();

    const saved = {
      id:          isEdit ? memo.id : generateId('hm'),
      clientName:  form.querySelector('#f-client-name').value.trim(),
      date:        form.querySelector('#f-date').value,
      attendees:   form.querySelector('#f-attendees').value.trim(),
      summary:     form.querySelector('#f-summary').value.trim(),
      nextActions: form.querySelector('#f-next-actions').value.trim(),
      attachments: pendingAttachments,
      isSample:    false, // 手動入力はサンプルフラグを立てない
      createdAt:   isEdit ? memo.createdAt : now,
      updatedAt:   now
    };

    try {
      saveMemo(saved, isEdit);
      closeModal();
      renderHearingList(document.getElementById('search-hearing')?.value || '');
      showToast(isEdit ? 'メモを更新しました。' : 'メモを追加しました。', 'success');
    } catch (_saveErr) {
      // saveMemo 内で toast 表示済み。モーダルは閉じずに残す
    }
  });

  openModal(isEdit ? 'ヒアリングメモを編集' : '新規ヒアリングメモ', form);
}

/* =========================================================
   CRUD ヘルパー
   ========================================================= */

/**
 * @description メモを保存する（新規追加・更新の両方に対応）。
 * @param {Object}  memo   - 保存するメモオブジェクト
 * @param {boolean} isEdit - true なら既存レコードを上書き、false なら末尾に追加
 */
function saveMemo(memo, isEdit) {
  let memos = loadFromStorage(LS_KEY_HEARING, []);

  if (isEdit) {
    memos = memos.map(m => m.id === memo.id ? memo : m);
  } else {
    memos.unshift(memo); // 先頭に追加（新しい順で表示するため）
  }

  try {
    saveToStorage(LS_KEY_HEARING, memos);
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') {
      showToast(
        'LocalStorage の容量上限（5MB）を超えました。添付ファイルを減らすか、データ管理から不要なデータを削除してください。',
        'error', 6000
      );
    } else {
      showToast(`保存に失敗しました: ${err.message || '不明なエラー'}`, 'error');
    }
    throw err; // 呼び出し元でも検知できるように re-throw する
  }
}

/**
 * @description 指定IDのメモを削除する。
 * @param {string} id - 削除対象のメモID
 */
function deleteMemo(id) {
  let memos = loadFromStorage(LS_KEY_HEARING, []);
  memos = memos.filter(m => m.id !== id);
  saveToStorage(LS_KEY_HEARING, memos);
  renderHearingList(document.getElementById('search-hearing')?.value || '');
  showToast('メモを削除しました。', 'info');
}

/* =========================================================
   ユーティリティ
   ========================================================= */

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
 * @description File オブジェクトを読み込み、attachment オブジェクトを返す Promise。
 * @param {File} file - 読み込む File オブジェクト
 * @returns {Promise<Object>} attachment オブジェクト
 */
function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        // Base64 data URL（'data:xxx;base64,...' 形式）
        data: reader.result
      });
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    // すべてのファイルを Base64 data URL として読み込む
    reader.readAsDataURL(file);
  });
}

/**
 * @description 添付ファイルをダウンロードする。
 * @param {Object} attachment - attachment オブジェクト
 */
function downloadAttachment(attachment) {
  const a = document.createElement('a');
  a.href = attachment.data;
  a.download = attachment.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * @description テキスト系ファイルのプレビューをモーダルで開く。
 * @param {Object} attachment - attachment オブジェクト（.txt / .csv / .md のみ）
 */
function openTextPreview(attachment) {
  // Base64 data URL からテキストをデコードする
  const base64 = attachment.data.split(',')[1] || '';
  let text = '';
  try {
    text = decodeURIComponent(escape(atob(base64)));
  } catch {
    text = atob(base64);
  }

  const container = document.createElement('div');
  container.innerHTML = `
    <pre class="attachment-preview-text">${escapeHtml(text)}</pre>
  `;

  openModal(`プレビュー: ${attachment.name}`, container);
}

/**
 * @description 添付ファイルリストの HTML を生成する（詳細展開エリア用）。
 * @param {Array<Object>} attachments - attachment オブジェクトの配列
 * @param {string} memoId - 親メモの ID
 * @returns {string} HTML 文字列
 */
function buildAttachmentList(attachments, memoId) {
  if (!attachments || attachments.length === 0) return '';

  const items = attachments.map((att, idx) => {
    const ext = getExt(att.name);
    const iconName = FILE_ICON_MAP[ext] || 'file';
    const isText = TEXT_PREVIEW_EXTS.includes(ext);
    const previewBtn = isText
      ? `<button class="btn btn--ghost attachment-btn btn-attachment-preview"
                data-memo-id="${escapeHtml(memoId)}" data-attach-idx="${idx}"
                title="プレビュー">
           <i data-lucide="eye" class="btn-icon"></i>
         </button>`
      : '';

    return `
      <div class="attachment-item">
        <i data-lucide="${iconName}" class="attachment-icon"></i>
        <span class="attachment-name">${escapeHtml(att.name)}</span>
        <span class="attachment-size">${formatFileSize(att.size)}</span>
        ${previewBtn}
        <button class="btn btn--ghost attachment-btn btn-attachment-download"
                data-memo-id="${escapeHtml(memoId)}" data-attach-idx="${idx}"
                title="ダウンロード">
          <i data-lucide="download" class="btn-icon"></i>
        </button>
      </div>
    `;
  }).join('');

  return `
    <div class="memo-detail-row">
      <div class="memo-detail-label">添付ファイル（${attachments.length}件）</div>
      <div class="attachment-list">${items}</div>
    </div>
  `;
}

/**
 * @description フォーム内の「選択済みファイル」プレビューリストを再描画する。
 * @param {HTMLFormElement} form            - フォーム要素
 * @param {Array<Object>}   pendingList     - 追加予定の attachment 配列
 */
function renderPendingAttachments(form, pendingList) {
  const container = form.querySelector('#pending-attachments');
  if (!container) return;

  if (pendingList.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = pendingList.map((att, idx) => {
    const ext = getExt(att.name);
    const iconName = FILE_ICON_MAP[ext] || 'file';
    return `
      <div class="pending-attachment-item">
        <i data-lucide="${iconName}" class="attachment-icon"></i>
        <span class="attachment-name">${escapeHtml(att.name)}</span>
        <span class="attachment-size">${formatFileSize(att.size)}</span>
        <button type="button" class="btn btn--ghost attachment-btn btn-remove-pending" data-idx="${idx}" title="削除">
          <i data-lucide="x" class="btn-icon"></i>
        </button>
      </div>
    `;
  }).join('');

  // 削除ボタンのイベントを設定する
  container.querySelectorAll('.btn-remove-pending').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      pendingList.splice(idx, 1);
      renderPendingAttachments(form, pendingList);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  });
}
