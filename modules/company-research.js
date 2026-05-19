/**
 * @file company-research.js
 * @description 企業情報台帳 CRUD モジュール。
 *              LocalStorage にデータを保存し、テーブル形式で表示する。
 *              行クリックで詳細パネルを展開し、「Claude Codeで調査依頼」ボタンは
 *              prospect-research skill の起動プロンプトをクリップボードにコピーする。
 */

import {
  loadFromStorage,
  saveToStorage,
  generateId,
  openModal,
  closeModal,
  openConfirmModal,
  showToast,
  buildEmptyStateHtml,
  LS_KEY_COMPANY
} from '../script.js';

/* =========================================================
   定数
   ========================================================= */

/** 調査ステータスの選択肢 */
const RESEARCH_STATUS_OPTIONS = ['未調査', '調査中', '調査済'];

/* =========================================================
   初期化
   ========================================================= */

/**
 * @description 企業情報モジュールを初期化する。
 *              ツールバーのイベントリスナーを設定し、テーブルを初期描画する。
 */
export function initCompanyResearch() {
  // 「企業登録」ボタン
  document.getElementById('btn-add-company')?.addEventListener('click', () => {
    openCompanyForm(null);
  });

  // 「企業を検索して追加」ボタン
  document.getElementById('btn-search-add-company')?.addEventListener('click', () => {
    openSearchAddCompanyModal();
  });

  // 検索インプット
  document.getElementById('search-company')?.addEventListener('input', () => {
    renderCompanyTable();
  });

  // 業種フィルタ
  document.getElementById('filter-industry')?.addEventListener('change', () => {
    renderCompanyTable();
  });

  // フェーズフィルタ
  document.getElementById('filter-phase')?.addEventListener('change', () => {
    renderCompanyTable();
  });

  renderCompanyTable();
}

/* =========================================================
   描画
   ========================================================= */

/**
 * @description 企業情報テーブルを描画する。
 *              検索ワード・業種フィルタ・フェーズフィルタを適用する。
 */
function renderCompanyTable() {
  const tbody = document.getElementById('company-table-body');
  if (!tbody) return;

  let companies = loadFromStorage(LS_KEY_COMPANY, []);

  // 検索フィルタ
  const keyword = document.getElementById('search-company')?.value.trim().toLowerCase() || '';
  if (keyword) {
    companies = companies.filter(c =>
      c.companyName?.toLowerCase().includes(keyword) ||
      c.industry?.toLowerCase().includes(keyword)
    );
  }

  // 業種フィルタ
  const industryFilter = document.getElementById('filter-industry')?.value || '';
  if (industryFilter) {
    companies = companies.filter(c => c.industry?.includes(industryFilter));
  }

  // フェーズフィルタ
  const phaseFilter = document.getElementById('filter-phase')?.value || '';
  if (phaseFilter) {
    companies = companies.filter(c => c.phase === phaseFilter);
  }

  // 更新日時の新しい順
  companies.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  if (companies.length === 0) {
    // フィルタ適用中とデータ未登録で空ステートのメッセージを切り替える
    const emptyHtml = keyword || industryFilter || phaseFilter
      ? buildEmptyStateHtml('search', '条件に一致する企業はありません', '検索条件やフィルタを変えてお試しください')
      : buildEmptyStateHtml('building-2', '企業情報が登録されていません', '「企業登録」ボタンから最初の企業を追加しましょう');
    tbody.innerHTML = `<tr><td colspan="7">${emptyHtml}</td></tr>`;
    // 詳細パネルを閉じる
    document.getElementById('company-detail-panel')?.setAttribute('hidden', '');
    return;
  }

  tbody.innerHTML = companies.map(c => buildCompanyRow(c)).join('');

  // 行クリックで詳細パネル展開
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.btn')) return;

      // 選択行のハイライト
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');

      const id = row.dataset.id;
      const company = loadFromStorage(LS_KEY_COMPANY, []).find(c => c.id === id);
      if (company) {
        renderCompanyDetail(company);
        // 詳細パネルが画面外に隠れている場合にスムーズスクロールで表示する
        const panel = document.getElementById('company-detail-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });

  // 編集ボタン
  tbody.querySelectorAll('.btn-edit-company').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const company = loadFromStorage(LS_KEY_COMPANY, []).find(c => c.id === id);
      if (company) openCompanyForm(company);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * @description 企業情報 1行分の <tr> HTML を返す。
 * @param {Object} company - 企業オブジェクト
 * @returns {string} HTML 文字列
 */
function buildCompanyRow(company) {
  const sampleBadge = company.isSample
    ? '<span class="badge-sample">サンプル</span>'
    : '';
  const statusClass = `status-badge status-badge--${company.researchStatus || '未調査'}`;

  return `
    <tr data-id="${company.id}">
      <td><span style="font-weight:500">${escapeHtml(company.companyName)}${sampleBadge}</span></td>
      <td>${escapeHtml(company.industry || '—')}</td>
      <td>${escapeHtml(company.revenue || '—')}</td>
      <td>${escapeHtml(String(company.employeeCount || '—'))}</td>
      <td>${escapeHtml(company.phase || '—')}</td>
      <td><span class="${statusClass}">${escapeHtml(company.researchStatus || '未調査')}</span></td>
      <td>
        <button class="btn btn--ghost btn--table-action btn-edit-company" data-id="${company.id}">
          <i data-lucide="pencil" class="btn-icon"></i>編集
        </button>
      </td>
    </tr>
  `;
}

/**
 * @description 企業詳細パネルを描画して表示する。
 * @param {Object} company - 表示する企業オブジェクト
 */
function renderCompanyDetail(company) {
  const panel = document.getElementById('company-detail-panel');
  const inner = document.getElementById('company-detail-inner');
  if (!panel || !inner) return;

  const sampleBadge = company.isSample
    ? '<span class="badge-sample">サンプルデータ</span>'
    : '';

  inner.innerHTML = `
    <h3 style="font-size:15px;font-weight:600;margin-bottom:14px;">
      ${escapeHtml(company.companyName)}${sampleBadge}
    </h3>
    <div class="detail-panel-grid">
      <div>
        <div class="detail-field-label">業種</div>
        <div class="detail-field-value">${escapeHtml(company.industry || '—')}</div>
      </div>
      <div>
        <div class="detail-field-label">事業形態</div>
        <div class="detail-field-value">${escapeHtml(company.businessType || '—')}</div>
      </div>
      <div>
        <div class="detail-field-label">売上高</div>
        <div class="detail-field-value">${escapeHtml(company.revenue || '—')}</div>
      </div>
      <div>
        <div class="detail-field-label">従業員数</div>
        <div class="detail-field-value">${escapeHtml(String(company.employeeCount || '—'))}</div>
      </div>
      <div>
        <div class="detail-field-label">新規事業フェーズ</div>
        <div class="detail-field-value">${escapeHtml(company.phase || '—')}</div>
      </div>
      <div>
        <div class="detail-field-label">調査ステータス</div>
        <div class="detail-field-value">
          <span class="status-badge status-badge--${company.researchStatus || '未調査'}">
            ${escapeHtml(company.researchStatus || '未調査')}
          </span>
        </div>
      </div>
    </div>

    ${company.notes ? `
    <div class="detail-notes">
      <div class="detail-field-label" style="margin-bottom:6px;">メモ・調査ノート</div>
      <div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap;line-height:1.7;">${escapeHtml(company.notes)}</div>
    </div>` : ''}

    <div class="detail-actions">
      <button class="btn btn--secondary" id="btn-edit-detail-company" data-id="${company.id}">
        <i data-lucide="pencil" class="btn-icon"></i>編集
      </button>
      <button class="btn btn--ghost" id="btn-copy-research-prompt"
              data-name="${escapeHtml(company.companyName)}"
              data-industry="${escapeHtml(company.industry || '')}"
              data-id="${escapeHtml(company.id)}">
        <i data-lucide="bot" class="btn-icon"></i>Claude Codeで調査依頼
      </button>
      <button class="btn btn--danger" id="btn-delete-company" data-id="${company.id}" style="margin-left:auto;">
        <i data-lucide="trash-2" class="btn-icon"></i>削除
      </button>
    </div>
  `;

  panel.removeAttribute('hidden');

  // 詳細パネル内の編集ボタン
  inner.querySelector('#btn-edit-detail-company')?.addEventListener('click', () => {
    const c = loadFromStorage(LS_KEY_COMPANY, []).find(x => x.id === company.id);
    if (c) openCompanyForm(c);
  });

  // 「Claude Codeで調査依頼」— 調査依頼モーダルを開く
  inner.querySelector('#btn-copy-research-prompt')?.addEventListener('click', e => {
    const name     = e.currentTarget.dataset.name;
    const industry = e.currentTarget.dataset.industry;
    const id       = e.currentTarget.dataset.id;
    openResearchModal(name, industry, id);
  });

  // 削除ボタン
  inner.querySelector('#btn-delete-company')?.addEventListener('click', () => {
    openConfirmModal(
      `「${company.companyName}」を削除しますか？`,
      () => {
        deleteCompany(company.id);
        panel.setAttribute('hidden', '');
      },
      { confirmLabel: '削除する', danger: true }
    );
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* =========================================================
   企業検索追加モーダル（未登録企業をWeb調査して新規登録）
   ========================================================= */

/**
 * @description 企業を検索して新規登録するモーダルを開く。
 *              4ステップ構成:
 *              Step1: 企業名入力 → Step2: 調査プロンプト生成&コピー →
 *              Step3: Claude Code の結果を貼り付けてパース →
 *              Step4: 内容確認&登録
 */
function openSearchAddCompanyModal() {
  const container = document.createElement('div');
  container.id = 'search-add-modal-content';

  container.innerHTML = `
    <div class="search-add-steps">

      <!-- Step 1: 企業名入力 -->
      <div class="search-add-step" id="sas-step1">
        <p class="search-add-step-desc">調査したい企業名を入力して、プロンプトを生成してください。</p>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label" for="search-company-name">企業名</label>
          <input type="text" id="search-company-name" class="form-input"
                 placeholder="例: 燈株式会社">
        </div>
        <button class="btn btn--primary" id="btn-generate-search-prompt">
          <i data-lucide="wand-2" class="btn-icon"></i>調査プロンプトを生成
        </button>
      </div>

      <!-- Step 2: プロンプト表示 & コピー（初期は非表示） -->
      <div class="search-add-step" id="sas-step2" hidden>
        <div class="search-add-prompt-header">
          <p class="search-add-step-desc" style="margin-bottom:0;">
            以下のプロンプトをコピーして Claude Code に貼り付けてください。
          </p>
          <button class="btn btn--primary btn-sm" id="btn-copy-search-prompt">
            <i data-lucide="clipboard" class="btn-icon"></i>コピー
          </button>
        </div>
        <textarea class="form-textarea search-add-prompt-area" id="search-prompt-preview"
                  readonly rows="14"></textarea>
      </div>

      <!-- Step 3: 結果貼り付け & パース（初期は非表示） -->
      <div class="search-add-step" id="sas-step3" hidden>
        <p class="search-add-step-desc">
          Claude Code から返ってきた調査結果をそのまま貼り付けてください。<br>
          JSON 部分を自動で抽出して企業情報に変換します。
        </p>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label" for="search-result-paste">Claude Code の出力結果</label>
          <textarea class="form-textarea" id="search-result-paste" rows="8"
                    placeholder="Claude Code の調査結果をここに貼り付けてください..."></textarea>
        </div>
        <button class="btn btn--secondary" id="btn-parse-result">
          <i data-lucide="file-json" class="btn-icon"></i>結果を取り込む
        </button>
      </div>

      <!-- Step 4: 確認 & 登録（初期は非表示） -->
      <div class="search-add-step" id="sas-step4" hidden>
        <p class="search-add-step-desc">取り込んだ内容を確認して登録してください。</p>
        <!-- パース結果のプレビューはJSで動的に生成 -->
        <div id="sas-parsed-preview"></div>
        <div class="search-add-final-actions">
          <button class="btn btn--primary" id="btn-register-parsed">
            <i data-lucide="check" class="btn-icon"></i>この内容で企業を登録する
          </button>
          <button class="btn btn--secondary" id="btn-edit-parsed">
            <i data-lucide="pencil" class="btn-icon"></i>編集してから登録する
          </button>
        </div>
      </div>

    </div>
  `;

  openModal('企業を検索して追加', container, { size: 'wide' });
  if (typeof lucide !== 'undefined') lucide.createIcons();

  /**
   * @description 入力企業名を元に Claude Code 向け調査プロンプトを生成して
   *              textarea に反映し、Step2 を表示する。
   */
  container.querySelector('#btn-generate-search-prompt')?.addEventListener('click', () => {
    const companyName = container.querySelector('#search-company-name').value.trim();
    if (!companyName) {
      showToast('企業名を入力してください。', 'error');
      return;
    }

    // プロンプトテンプレート: JSON 出力形式を明示して Claude に渡す
    const prompt =
      `# 企業情報調査依頼\n\n` +
      `以下の企業について調査し、**必ず下記のJSON形式**で結果を返してください。\n\n` +
      `## 調査対象\n企業名: ${companyName}\n\n` +
      `## 調査項目\n` +
      `1. 企業概要・主力製品/サービス\n` +
      `2. 業種分類\n` +
      `3. 事業形態（B2B/B2C/B2B2C）\n` +
      `4. 売上高（公開情報のみ）\n` +
      `5. 従業員数\n` +
      `6. 新規事業フェーズ（新規事業検討初期/事業立ち上げ中/成長期/成熟期）\n` +
      `7. 事業の特徴・課題感・アプローチ仮説\n\n` +
      `## 出力形式（このJSONをそのまま返してください）\n` +
      `\`\`\`json\n` +
      `{\n` +
      `  "companyName": "正式社名",\n` +
      `  "industry": "業種",\n` +
      `  "businessType": "B2B",\n` +
      `  "revenue": "売上高（不明なら「非公開」）",\n` +
      `  "employeeCount": "従業員数",\n` +
      `  "phase": "新規事業検討初期",\n` +
      `  "notes": "調査メモ（特徴・課題感・アプローチ仮説を含む）"\n` +
      `}\n` +
      `\`\`\``;

    container.querySelector('#search-prompt-preview').value = prompt;
    container.querySelector('#sas-step2').removeAttribute('hidden');
    container.querySelector('#sas-step3').removeAttribute('hidden');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  /**
   * @description 生成したプロンプトをクリップボードにコピーする。
   */
  container.querySelector('#btn-copy-search-prompt')?.addEventListener('click', () => {
    const promptText = container.querySelector('#search-prompt-preview').value;
    copyToClipboard(
      promptText,
      'プロンプトをコピーしました。Claude Code に貼り付けて実行してください。'
    );
  });

  /**
   * @description 貼り付けられた Claude Code の出力から JSON を抽出・パースして
   *              Step4 のプレビューに反映する。
   *              parseState はモジュールスコープ外に漏らさないよう関数内変数として保持する。
   */
  // パース済みデータの一時保持（Step4 で参照する）
  let parsedData = null;

  container.querySelector('#btn-parse-result')?.addEventListener('click', () => {
    const rawText = container.querySelector('#search-result-paste').value.trim();
    if (!rawText) {
      showToast('調査結果が入力されていません。', 'error');
      return;
    }

    // JSON ブロックを正規表現で抽出する
    // ```json ... ``` 形式と、裸の { ... } 形式の両方に対応する
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ||
                      rawText.match(/(\{[\s\S]*?"companyName"[\s\S]*?\})/);

    if (!jsonMatch) {
      showToast('JSON 形式のデータが見つかりませんでした。Claude Code の出力を確認してください。', 'error', 5000);
      return;
    }

    let parsed;
    try {
      // コードフェンスあり形式の場合は capture group 1、裸形式も同様
      parsed = JSON.parse(jsonMatch[1]);
    } catch (err) {
      showToast(`JSON のパースに失敗しました: ${err.message}`, 'error', 5000);
      return;
    }

    // 必須フィールド companyName が存在するか検証する
    if (!parsed.companyName) {
      showToast('companyName フィールドが見つかりません。出力形式を確認してください。', 'error', 5000);
      return;
    }

    parsedData = parsed;

    // Step4 プレビューを構築する
    const preview = container.querySelector('#sas-parsed-preview');
    preview.innerHTML = `
      <div class="parsed-company-preview">
        <p><strong>社名:</strong> ${escapeHtml(parsed.companyName || '—')}</p>
        <p><strong>業種:</strong> ${escapeHtml(parsed.industry || '—')}</p>
        <p><strong>事業形態:</strong> ${escapeHtml(parsed.businessType || '—')}</p>
        <p><strong>売上高:</strong> ${escapeHtml(parsed.revenue || '—')}</p>
        <p><strong>従業員数:</strong> ${escapeHtml(String(parsed.employeeCount || '—'))}</p>
        <p><strong>フェーズ:</strong> ${escapeHtml(parsed.phase || '—')}</p>
        <p><strong>調査メモ:</strong> ${escapeHtml(parsed.notes || '—')}</p>
      </div>
    `;

    container.querySelector('#sas-step4').removeAttribute('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    showToast('企業情報を取り込みました。内容を確認して登録してください。', 'success');
  });

  /**
   * @description パース結果をそのまま保存する。
   *              saveToStorage の容量超過エラーは catch して通知する。
   */
  container.querySelector('#btn-register-parsed')?.addEventListener('click', () => {
    if (!parsedData) {
      showToast('取り込まれたデータがありません。', 'error');
      return;
    }

    const now = new Date().toISOString();
    const newCompany = {
      id:             generateId('co'),
      companyName:    parsedData.companyName || '',
      industry:       parsedData.industry || '',
      businessType:   parsedData.businessType || 'B2B',
      revenue:        parsedData.revenue || '',
      employeeCount:  String(parsedData.employeeCount || ''),
      phase:          parsedData.phase || '',
      notes:          parsedData.notes || '',
      researchStatus: '調査済',
      isSample:       false,
      createdAt:      now,
      updatedAt:      now
    };

    try {
      saveCompany(newCompany, false);
    } catch (err) {
      if (err.message === 'QUOTA_EXCEEDED') {
        showToast('ストレージ容量が不足しています。データ管理から不要なデータを削除してください。', 'error', 6000);
      } else {
        showToast(`保存中にエラーが発生しました: ${err.message}`, 'error', 5000);
      }
      return;
    }

    closeModal();
    renderCompanyTable();
    showToast(`「${newCompany.companyName}」を登録しました。`, 'success');
  });

  /**
   * @description パース結果をプリセットした状態で企業編集フォームを開く。
   *              openCompanyForm は company オブジェクトを渡すと isEdit=true になるため、
   *              id を含まないオブジェクトを渡して新規作成モードにする。
   */
  container.querySelector('#btn-edit-parsed')?.addEventListener('click', () => {
    if (!parsedData) {
      showToast('取り込まれたデータがありません。', 'error');
      return;
    }

    // id を持たせないことで openCompanyForm が新規作成モードで動作する
    const preset = {
      companyName:    parsedData.companyName || '',
      industry:       parsedData.industry || '',
      businessType:   parsedData.businessType || 'B2B',
      revenue:        parsedData.revenue || '',
      employeeCount:  String(parsedData.employeeCount || ''),
      phase:          parsedData.phase || '',
      notes:          parsedData.notes || '',
      researchStatus: '調査済'
    };

    // 先にモーダルを閉じてから企業フォームを開く
    // （openModal は既存モーダルを上書きするが、closeModal を先に挟むことで
    //   アニメーションのズレを防ぐ）
    closeModal();
    // 次のマイクロタスクで開くことで DOM のクリーンアップを待つ
    setTimeout(() => openCompanyForm(preset), 50);
  });
}

/* =========================================================
   Claude Code 調査依頼モーダル（FB2 Phase 1.1 対応）
   ========================================================= */

/**
 * @description 調査依頼モーダルを開く。
 *              チェックリストで調査観点を選択し、プロンプトを生成してコピーする。
 *              調査結果をテキストエリアに貼り付けて企業情報のメモに保存できる。
 * @param {string} companyName - 企業名
 * @param {string} industry    - 業種
 * @param {string} companyId   - 企業 ID（調査結果保存に使用）
 */
function openResearchModal(companyName, industry, companyId) {
  /** 調査観点の選択肢リスト */
  const RESEARCH_TOPICS = [
    { id: 'overview',    label: '企業概要・主力製品/サービス',       defaultChecked: true },
    { id: 'industry',    label: '業界動向・市場規模',                defaultChecked: true },
    { id: 'competitor',  label: '競合・差別化ポイント',              defaultChecked: false },
    { id: 'finance',     label: '財務・調達情報（公開情報の範囲）',  defaultChecked: false },
    { id: 'leadership',  label: '経営陣・組織体制',                  defaultChecked: false },
    { id: 'approach',    label: 'アプローチ仮説・支援領域',          defaultChecked: true }
  ];

  const container = document.createElement('div');
  container.id = 'research-modal-content';

  const checkboxesHtml = RESEARCH_TOPICS.map(t => `
    <label class="research-topic-item">
      <input type="checkbox" class="research-topic-check" value="${t.id}"
             ${t.defaultChecked ? 'checked' : ''}>
      <span>${escapeHtml(t.label)}</span>
    </label>
  `).join('');

  container.innerHTML = `
    <!-- ステップ1: 調査観点の選択 -->
    <div class="research-section">
      <p class="research-section-title">調査観点を選択してください</p>
      <div class="research-topics">${checkboxesHtml}</div>
    </div>

    <!-- 生成されるプロンプト -->
    <div class="research-section">
      <div class="research-prompt-header">
        <p class="research-section-title">生成されたプロンプト</p>
        <button class="btn btn--primary btn-sm" id="btn-copy-prompt">
          <i data-lucide="clipboard" class="btn-icon"></i>プロンプトをコピー
        </button>
      </div>
      <textarea class="form-textarea research-prompt-area" id="research-prompt-preview"
                readonly rows="8"></textarea>
    </div>

    <!-- ステップガイド -->
    <div class="research-steps">
      <p class="research-section-title">Claude Code への貼り付け手順</p>
      <ol class="research-step-list">
        <li>上の「プロンプトをコピー」をクリックしてコピーする</li>
        <li>Claude Code のチャット入力欄に貼り付けて送信する</li>
        <li>調査結果が返ってきたら、下の欄に貼り付けて保存する</li>
      </ol>
    </div>

    <!-- 調査結果の貼り付け -->
    <div class="research-section">
      <p class="research-section-title">調査結果を貼り付け（任意）</p>
      <textarea class="form-textarea" id="research-result-paste"
                placeholder="Claude Code から返ってきた調査結果をここに貼り付けてください。企業情報のメモ欄に追記されます。"
                rows="5"></textarea>
      <div style="margin-top:8px;text-align:right;">
        <button class="btn btn--secondary" id="btn-save-research-result">
          <i data-lucide="save" class="btn-icon"></i>メモに保存
        </button>
      </div>
    </div>
  `;

  /**
   * @description 選択された調査観点に応じたプロンプトを生成して textarea に反映する。
   */
  function updatePrompt() {
    const checked = [...container.querySelectorAll('.research-topic-check:checked')]
      .map(cb => RESEARCH_TOPICS.find(t => t.id === cb.value)?.label)
      .filter(Boolean);

    const topicsText = checked.map((l, i) => `${i + 1}. ${l}`).join('\n');

    container.querySelector('#research-prompt-preview').value =
      `# 企業調査依頼\n\n` +
      `以下の企業について、新規事業支援の観点から情報調査をお願いします。\n\n` +
      `## 調査対象\n- 企業名: ${companyName}\n- 業種: ${industry || '不明'}\n\n` +
      `## 調査観点\n${topicsText}\n\n` +
      `## 出力形式\nMarkdown 形式で出力してください。\n` +
      `research ディレクトリ以下に ${companyName.replace(/\s/g, '_')}_research.md として保存してください。`;
  }

  // 初期プロンプト生成
  updatePrompt();

  // チェックボックス変更でプロンプトを再生成する
  container.querySelectorAll('.research-topic-check').forEach(cb => {
    cb.addEventListener('change', updatePrompt);
  });

  openModal(`${companyName} — 調査依頼`, container);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 「プロンプトをコピー」ボタン
  container.querySelector('#btn-copy-prompt')?.addEventListener('click', () => {
    const promptText = container.querySelector('#research-prompt-preview').value;
    copyToClipboard(promptText, 'プロンプトをクリップボードにコピーしました。Claude Code に貼り付けて実行してください。');
  });

  // 「メモに保存」ボタン
  container.querySelector('#btn-save-research-result')?.addEventListener('click', () => {
    const result = container.querySelector('#research-result-paste').value.trim();
    if (!result) {
      showToast('調査結果が入力されていません。', 'error');
      return;
    }

    let companies = loadFromStorage(LS_KEY_COMPANY, []);
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx < 0) {
      showToast('企業情報が見つかりません。', 'error');
      return;
    }

    const now = new Date().toISOString();
    const dateStr = now.slice(0, 10);
    const existing = companies[idx].notes || '';
    // 既存メモに調査結果を追記する（区切り線付き）
    companies[idx].notes = existing
      ? `${existing}\n\n--- 調査結果 (${dateStr}) ---\n${result}`
      : `--- 調査結果 (${dateStr}) ---\n${result}`;
    companies[idx].researchStatus = '調査済';
    companies[idx].updatedAt = now;

    saveToStorage(LS_KEY_COMPANY, companies);
    closeModal();
    renderCompanyTable();

    // 詳細パネルも更新する
    const panel = document.getElementById('company-detail-panel');
    if (panel && !panel.hidden) renderCompanyDetail(companies[idx]);

    showToast('調査結果をメモに保存し、ステータスを「調査済」にしました。', 'success', 4000);
  });
}

/**
 * @description テキストをクリップボードにコピーする（HTTPS / HTTP 両対応）。
 * @param {string} text    - コピーするテキスト
 * @param {string} message - 成功時のトースト文言
 */
function copyToClipboard(text, message) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(message, 'success', 4000);
  }).catch(() => {
    // HTTP 環境での fallback（document.execCommand）
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(message, 'success', 4000);
  });
}

/* =========================================================
   フォーム（新規作成・編集）
   ========================================================= */

/**
 * @description 企業情報入力フォームをモーダルで開く。
 * @param {Object|null} company - 編集対象の企業。null なら新規作成モード。
 */
function openCompanyForm(company) {
  // company が truthy でも id を持たなければ新規作成モード（検索追加のプリセット対応）
  const isEdit = !!(company && company.id);
  const form = document.createElement('form');
  form.id = 'company-form';

  // ステータス選択肢を生成する
  const statusOptions = RESEARCH_STATUS_OPTIONS.map(s =>
    `<option value="${s}" ${company?.researchStatus === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="fc-name">社名 <span style="color:var(--danger)">*</span></label>
      <input type="text" id="fc-name" class="form-input" placeholder="例: 株式会社サンプル工業" required
             value="${escapeHtml(company?.companyName || '')}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label" for="fc-industry">業種</label>
        <input type="text" id="fc-industry" class="form-input" placeholder="例: 製造業（精密機械）"
               value="${escapeHtml(company?.industry || '')}">
      </div>
      <div class="form-group">
        <label class="form-label" for="fc-business-type">事業形態</label>
        <select id="fc-business-type" class="form-select">
          <option value="B2B"  ${company?.businessType === 'B2B'  ? 'selected' : ''}>B2B</option>
          <option value="B2C"  ${company?.businessType === 'B2C'  ? 'selected' : ''}>B2C</option>
          <option value="B2B2C" ${company?.businessType === 'B2B2C' ? 'selected' : ''}>B2B2C</option>
          <option value="その他" ${company?.businessType === 'その他' ? 'selected' : ''}>その他</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label" for="fc-revenue">売上高</label>
        <input type="text" id="fc-revenue" class="form-input" placeholder="例: 50億円"
               value="${escapeHtml(company?.revenue || '')}">
      </div>
      <div class="form-group">
        <label class="form-label" for="fc-employee">従業員数</label>
        <input type="text" id="fc-employee" class="form-input" placeholder="例: 120名"
               value="${escapeHtml(String(company?.employeeCount || ''))}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label" for="fc-phase">新規事業フェーズ</label>
        <select id="fc-phase" class="form-select">
          <option value="">選択してください</option>
          <option value="新規事業検討初期"  ${company?.phase === '新規事業検討初期'  ? 'selected' : ''}>新規事業検討初期</option>
          <option value="事業立ち上げ中"    ${company?.phase === '事業立ち上げ中'    ? 'selected' : ''}>事業立ち上げ中</option>
          <option value="成長期"            ${company?.phase === '成長期'            ? 'selected' : ''}>成長期</option>
          <option value="成熟期"            ${company?.phase === '成熟期'            ? 'selected' : ''}>成熟期</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="fc-status">調査ステータス</label>
        <select id="fc-status" class="form-select">
          ${statusOptions}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="fc-notes">メモ・調査ノート</label>
      <textarea id="fc-notes" class="form-textarea" rows="4"
                placeholder="課題感・アプローチ仮説・懸念点など自由に記録してください。">${escapeHtml(company?.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn--ghost" id="company-form-cancel">キャンセル</button>
      <button type="submit" class="btn btn--primary">${isEdit ? '更新する' : '登録する'}</button>
    </div>
  `;

  form.querySelector('#company-form-cancel').addEventListener('click', closeModal);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const now = new Date().toISOString();

    const saved = {
      id:             isEdit ? company.id : generateId('co'),
      companyName:    form.querySelector('#fc-name').value.trim(),
      industry:       form.querySelector('#fc-industry').value.trim(),
      businessType:   form.querySelector('#fc-business-type').value,
      revenue:        form.querySelector('#fc-revenue').value.trim(),
      employeeCount:  form.querySelector('#fc-employee').value.trim(),
      phase:          form.querySelector('#fc-phase').value,
      notes:          form.querySelector('#fc-notes').value.trim(),
      researchStatus: form.querySelector('#fc-status').value,
      isSample:       false,
      createdAt:      isEdit ? company.createdAt : now,
      updatedAt:      now
    };

    saveCompany(saved, isEdit);
    closeModal();
    renderCompanyTable();

    // 詳細パネルも更新する
    const panel = document.getElementById('company-detail-panel');
    if (panel && !panel.hidden) renderCompanyDetail(saved);

    showToast(isEdit ? '企業情報を更新しました。' : '企業を登録しました。', 'success');
  });

  openModal(isEdit ? '企業情報を編集' : '企業情報を登録', form);
}

/* =========================================================
   CRUD ヘルパー
   ========================================================= */

/**
 * @description 企業情報を保存する（新規追加・更新の両方に対応）。
 * @param {Object}  company - 保存する企業オブジェクト
 * @param {boolean} isEdit  - true なら既存レコードを上書き
 */
function saveCompany(company, isEdit) {
  let companies = loadFromStorage(LS_KEY_COMPANY, []);

  if (isEdit) {
    companies = companies.map(c => c.id === company.id ? company : c);
  } else {
    companies.unshift(company);
  }

  saveToStorage(LS_KEY_COMPANY, companies);
}

/**
 * @description 指定IDの企業情報を削除する。
 * @param {string} id - 削除対象の企業ID
 */
function deleteCompany(id) {
  let companies = loadFromStorage(LS_KEY_COMPANY, []);
  companies = companies.filter(c => c.id !== id);
  saveToStorage(LS_KEY_COMPANY, companies);
  renderCompanyTable();
  showToast('企業情報を削除しました。', 'info');
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
