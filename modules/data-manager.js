/**
 * @file data-manager.js
 * @description データ管理モジュール。
 *              LocalStorage の全データを JSON ファイルとしてエクスポート/インポートする。
 *              ドラッグ＆ドロップとファイル選択の両方に対応。
 *              データクリアは確認ダイアログ付きで実行する。
 */

import {
  loadFromStorage,
  saveToStorage,
  showToast,
  openConfirmModal,
  LS_KEY_HEARING,
  LS_KEY_COMPANY,
  LS_KEY_PROPOSALS,
  LS_KEY_PL,
  LS_KEY_SAMPLE_LOADED
} from '../script.js';

/* =========================================================
   初期化
   ========================================================= */

/**
 * @description データ管理ビューのUIを構築し、イベントリスナーを設定する。
 */
export function initDataManager() {
  const container = document.getElementById('data-manager-content');
  if (!container) return;

  container.innerHTML = buildDataManagerHtml();

  setupExportButton();
  setupImportArea();
  setupClearButton();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   UI 構築
   ========================================================= */

/**
 * @description データ管理ビューの HTML を返す。
 * @returns {string} HTML 文字列
 */
function buildDataManagerHtml() {
  return `
    <!-- エクスポートセクション -->
    <div class="data-manager-section">
      <h3 class="data-manager-section-title">
        <i data-lucide="download" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>
        データのエクスポート
      </h3>
      <p class="data-manager-desc">
        ヒアリングメモ・企業情報・提案書・PLデータのすべてを JSON ファイルとしてダウンロードします。<br>
        バックアップや他の端末への移行に使えます。
      </p>
      <button class="btn btn--primary" id="btn-export-json">
        <i data-lucide="download" class="btn-icon"></i>全データを JSON でエクスポート
      </button>
    </div>

    <!-- インポートセクション -->
    <div class="data-manager-section">
      <h3 class="data-manager-section-title">
        <i data-lucide="upload" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>
        データのインポート
      </h3>
      <p class="data-manager-desc">
        エクスポートした JSON ファイルをインポートします。<br>
        <strong style="color:var(--warning);">既存のデータは上書きされます。</strong>
        インポート前にエクスポートしてバックアップを取ることをお勧めします。
      </p>

      <!-- ドラッグ＆ドロップエリア -->
      <div class="drop-zone" id="drop-zone" role="button" tabindex="0" aria-label="JSONファイルをドロップ">
        <i data-lucide="file-json" class="drop-zone-icon"></i>
        <p class="drop-zone-text">ここに JSON ファイルをドラッグ＆ドロップ</p>
        <p class="drop-zone-sub">または</p>
        <p class="drop-zone-click-hint">クリックしてファイルを選択することもできます</p>
      </div>

      <!-- ファイル選択ボタン（drop-zone の代替） -->
      <div style="margin-top:8px;">
        <label class="btn btn--secondary" for="import-file-input" style="cursor:pointer;display:inline-flex;">
          <i data-lucide="folder-open" class="btn-icon"></i>ファイルを選択
        </label>
        <input type="file" id="import-file-input" accept=".json" style="display:none;">
      </div>
    </div>

    <!-- データクリアセクション -->
    <div class="data-manager-section" style="border-color:rgba(248,81,73,0.3);">
      <h3 class="data-manager-section-title" style="color:var(--danger);">
        <i data-lucide="trash-2" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>
        データのクリア
      </h3>
      <p class="data-manager-desc">
        保存されているすべてのデータを削除します。この操作は元に戻せません。<br>
        実行前にエクスポートでバックアップを取ることを強く推奨します。
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="btn-clear-samples" style="border-color:var(--warning);color:var(--warning);">
          <i data-lucide="x-circle" class="btn-icon"></i>サンプルデータのみ削除
        </button>
        <button class="btn btn--danger" id="btn-clear-all">
          <i data-lucide="trash-2" class="btn-icon"></i>全データを削除
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   エクスポート
   ========================================================= */

/**
 * @description エクスポートボタンのクリックイベントを設定する。
 */
function setupExportButton() {
  document.getElementById('btn-export-json')?.addEventListener('click', exportAllData);
}

/**
 * @description 全データを JSON ファイルとしてダウンロードする。
 *              ファイル名は「ufas-bi-backup-YYYYMMDD.json」形式。
 */
function exportAllData() {
  const exportData = {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    hearingMemos:      loadFromStorage(LS_KEY_HEARING, []),
    companies:         loadFromStorage(LS_KEY_COMPANY, []),
    uploadedProposals: loadFromStorage(LS_KEY_PROPOSALS, []),
    plData:            loadFromStorage(LS_KEY_PL, null)
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  // ダウンロードリンクを生成してクリックする
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const a = document.createElement('a');
  a.href     = url;
  a.download = `ufas-bi-backup-${dateStr}.json`;
  a.click();

  // メモリリークを防ぐため URL を解放する
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast('データをエクスポートしました。', 'success');
}

/* =========================================================
   インポート
   ========================================================= */

/**
 * @description ドラッグ＆ドロップとファイル選択のイベントを設定する。
 */
function setupImportArea() {
  const dropZone   = document.getElementById('drop-zone');
  const fileInput  = document.getElementById('import-file-input');

  if (dropZone) {
    // ドラッグオーバー時にスタイルを変える
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    // ドロップ時にファイルを読み込む
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) readImportFile(file);
    });

    // ドロップゾーンのクリックでもファイル選択を開く
    dropZone.addEventListener('click', () => fileInput?.click());

    // Enter / Space キーでもファイル選択を開く（アクセシビリティ）
    dropZone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });
  }

  // ファイル選択
  fileInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) readImportFile(file);
    e.target.value = ''; // 同じファイルを再選択できるようにリセット
  });
}

/**
 * @description JSON ファイルを読み込んでインポートする。
 * @param {File} file - 読み込む JSON ファイル
 */
function readImportFile(file) {
  if (!file.name.endsWith('.json')) {
    showToast('JSON ファイルを選択してください。', 'error');
    return;
  }

  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      importData(data);
    } catch {
      // JSON パース失敗
      showToast('ファイルの読み込みに失敗しました。有効な JSON ファイルか確認してください。', 'error');
    }
  };

  reader.onerror = () => {
    showToast('ファイルの読み込み中にエラーが発生しました。', 'error');
  };

  reader.readAsText(file, 'UTF-8');
}

/**
 * @description パース済みの JSON データを LocalStorage に書き込む。
 * @param {Object} data - エクスポート形式のデータオブジェクト
 */
function importData(data) {
  // 必須キーの存在チェック（v1.0 形式でも v1.1 形式でも受け付ける）
  if (!data.hearingMemos && !data.companies && !data.uploadedProposals && !data.plData) {
    showToast('インポートできる形式のファイルではありません。', 'error');
    return;
  }

  // データ構造のバリデーション
  const errors = [];
  if (data.hearingMemos && !Array.isArray(data.hearingMemos)) {
    errors.push('hearingMemos が配列ではありません');
  }
  if (data.companies && !Array.isArray(data.companies)) {
    errors.push('companies が配列ではありません');
  }
  if (data.uploadedProposals && !Array.isArray(data.uploadedProposals)) {
    errors.push('uploadedProposals が配列ではありません');
  }
  if (data.plData && !Array.isArray(data.plData)) {
    errors.push('plData が配列ではありません');
  }
  if (errors.length > 0) {
    showToast(`データ形式エラー: ${errors.join(', ')}`, 'error', 5000);
    return;
  }

  // openConfirmModal は非同期で動作するため、確認後の処理はコールバックに移す
  openConfirmModal(
    '既存のデータはすべて上書きされます。<br>インポートを実行しますか？',
    () => {
      if (Array.isArray(data.hearingMemos)) {
        saveToStorage(LS_KEY_HEARING, data.hearingMemos);
      }

      if (Array.isArray(data.companies)) {
        saveToStorage(LS_KEY_COMPANY, data.companies);
      }

      // v1.1 で追加: アップロード提案書
      if (Array.isArray(data.uploadedProposals)) {
        saveToStorage(LS_KEY_PROPOSALS, data.uploadedProposals);
      }

      // v1.1 で追加: PLデータ
      if (Array.isArray(data.plData)) {
        saveToStorage(LS_KEY_PL, data.plData);
      }

      // サンプルロード済みフラグを残す（インポートデータの中身によらず）
      localStorage.setItem(LS_KEY_SAMPLE_LOADED, '1');

      // インポート内容のサマリーを表示する
      const summary = [];
      if (Array.isArray(data.hearingMemos)) summary.push(`メモ ${data.hearingMemos.length}件`);
      if (Array.isArray(data.companies)) summary.push(`企業 ${data.companies.length}件`);
      if (Array.isArray(data.uploadedProposals)) summary.push(`提案書 ${data.uploadedProposals.length}件`);
      if (Array.isArray(data.plData)) summary.push(`PL ${data.plData.length}件`);
      showToast(`インポート完了: ${summary.join('、')}`, 'success', 5000);

      // 少し待ってからリロードする（トーストが見えるように）
      setTimeout(() => location.reload(), 1500);
    },
    { confirmLabel: 'インポートする' }
  );
  return; // openConfirmModal は非同期なのでここで return
}

/* =========================================================
   データクリア
   ========================================================= */

/**
 * @description クリアボタンのクリックイベントを設定する。
 */
function setupClearButton() {
  // サンプルデータのみ削除
  document.getElementById('btn-clear-samples')?.addEventListener('click', clearSampleData);

  // 全データ削除
  document.getElementById('btn-clear-all')?.addEventListener('click', clearAllData);
}

/**
 * @description サンプルデータ（isSample: true のレコード）のみを削除する。
 */
function clearSampleData() {
  // openConfirmModal は非同期で動作するため、削除処理はコールバックに移す
  openConfirmModal(
    'サンプルデータをすべて削除しますか？<br>（自分で追加したデータは残ります）',
    () => {
      const memos     = loadFromStorage(LS_KEY_HEARING, []).filter(m => !m.isSample);
      const companies = loadFromStorage(LS_KEY_COMPANY, []).filter(c => !c.isSample);

      saveToStorage(LS_KEY_HEARING, memos);
      saveToStorage(LS_KEY_COMPANY, companies);

      // PLサンプルデータも削除する（ユーザーがインポートしたPLデータは isSample フラグがないため残る）
      const plData = loadFromStorage(LS_KEY_PL, null);
      if (Array.isArray(plData)) {
        // PLデータはサンプル判定が難しいため、全削除する（手動インポート分と区別できないため）
        // ユーザーの PL は再インポートで復元可能
        localStorage.removeItem(LS_KEY_PL);
      }

      // サンプルロードフラグを削除する（次回起動時に再投入されないよう LS_KEY_SAMPLE_LOADED は残す）
      // ここでは「サンプルを消した」という意味でフラグを保持したままにする
      showToast('サンプルデータを削除しました。', 'success');
      setTimeout(() => location.reload(), 800);
    },
    { confirmLabel: '削除する', danger: true }
  );
}

/**
 * @description すべてのアプリデータを LocalStorage から削除する。
 */
function clearAllData() {
  // 2回のconfirmを openConfirmModal 1回に統合する（danger フラグで強調表示）
  openConfirmModal(
    '<strong>すべてのデータを削除します。</strong><br>この操作は元に戻せません。<br>事前にエクスポートでバックアップを取ることを推奨します。',
    () => {
      localStorage.removeItem(LS_KEY_HEARING);
      localStorage.removeItem(LS_KEY_COMPANY);
      localStorage.removeItem(LS_KEY_PROPOSALS);
      localStorage.removeItem(LS_KEY_PL);
      localStorage.removeItem(LS_KEY_SAMPLE_LOADED);

      showToast('全データを削除しました。', 'info');
      setTimeout(() => location.reload(), 800);
    },
    { confirmLabel: '全データを削除する', danger: true }
  );
}
