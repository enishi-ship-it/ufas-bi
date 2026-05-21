/**
 * @file claude-api.js
 * @description Claude API 直接呼び出しモジュール。
 *              ブラウザから Anthropic Messages API をストリーミングで呼び出す。
 *              APIキーは LocalStorage に暗号化せず保存する（チーム内部ツール前提）。
 *              コードにはキーを埋め込まない。
 */

/* =========================================================
   定数
   ========================================================= */

/** LocalStorage キー: APIキー保存先 */
const LS_KEY_API_KEY = 'ufas_claude_api_key';

/** Anthropic Messages API エンドポイント */
const API_URL = 'https://api.anthropic.com/v1/messages';

/** API バージョン */
const API_VERSION = '2023-06-01';

/** 使用モデル（コスト・速度のバランスが良い Sonnet） */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** 最大出力トークン数 */
const MAX_TOKENS = 4096;

/** UFAS アシスタント用システムプロンプト */
const SYSTEM_PROMPT = `あなたはUFAS株式会社 新規事業支援部の戦略AIアシスタントです。

## 役割
新規事業コンサルティングの知見を持ち、以下の業務を高精度に支援します：
- ターゲット企業のリサーチ・分析・プロスペクトリスト作成
- アウトバウンド営業メール（課題直球型・共感型）の作成
- 企業の詳細調査（財務・経営陣・競合・アプローチ仮説）
- 提案書のドラフト作成（骨子・ROI試算）
- 案件のBANT評価・受注確度分析
- 会議の議事録作成

## 出力ルール
- 日本語で回答する
- Markdown形式で構造化して出力する
- 具体的・実践的・数値根拠のある回答を心がける
- 仮説は「仮説」と明記し、事実と区別する`;

/* =========================================================
   APIキー管理
   ========================================================= */

/**
 * @description 保存済みAPIキーを取得する。
 * @returns {string|null} APIキー文字列、未設定なら null
 */
export function getApiKey() {
  try {
    return localStorage.getItem(LS_KEY_API_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * @description APIキーを LocalStorage に保存する。
 * @param {string} key - Anthropic APIキー（sk-ant-... 形式）
 */
export function setApiKey(key) {
  localStorage.setItem(LS_KEY_API_KEY, key.trim());
}

/**
 * @description APIキーが設定済みかどうかを返す。
 * @returns {boolean}
 */
export function hasApiKey() {
  const key = getApiKey();
  return !!key && key.startsWith('sk-');
}

/**
 * @description 保存済みAPIキーを削除する。
 */
export function clearApiKey() {
  localStorage.removeItem(LS_KEY_API_KEY);
}

/* =========================================================
   API 呼び出し（ストリーミング）
   ========================================================= */

/**
 * @description Claude Messages API をストリーミングで呼び出す。
 *              テキストチャンクが届くたびに onChunk コールバックを呼ぶ。
 * @param {string} userMessage - ユーザーメッセージ（プロンプト本文）
 * @param {Object} callbacks - コールバック群
 * @param {function(string): void} callbacks.onChunk  - テキストチャンク受信時
 * @param {function(string): void} callbacks.onDone   - 完了時（全文を引数に渡す）
 * @param {function(Error): void}  callbacks.onError  - エラー時
 * @returns {AbortController} リクエスト中断用の AbortController
 */
export function callClaudeStream(userMessage, { onChunk, onDone, onError }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    onError(new Error('APIキーが設定されていません。'));
    return new AbortController();
  }

  const controller = new AbortController();

  const body = JSON.stringify({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    stream: true,
    messages: [
      { role: 'user', content: userMessage }
    ]
  });

  fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body,
    signal: controller.signal
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => {
          const msg = err?.error?.message || `API エラー (${response.status})`;
          throw new Error(msg);
        });
      }
      return processSSEStream(response.body, onChunk, onDone);
    })
    .catch(err => {
      if (err.name === 'AbortError') return; // ユーザーによる中断
      onError(err);
    });

  return controller;
}

/**
 * @description SSE（Server-Sent Events）ストリームを解析し、テキストデルタを抽出する。
 * @param {ReadableStream} body   - fetch レスポンスの body
 * @param {function} onChunk      - テキストチャンクコールバック
 * @param {function} onDone       - 完了コールバック
 */
async function processSSEStream(body, onChunk, onDone) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE イベントは "\n\n" で区切られる
    const events = buffer.split('\n\n');
    // 最後の要素は不完全な可能性があるのでバッファに残す
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLine = event.split('\n').find(line => line.startsWith('data: '));
      if (!dataLine) continue;

      const jsonStr = dataLine.slice(6); // 'data: ' の後ろ
      if (jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);

        // テキストデルタを抽出する
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          const chunk = parsed.delta.text;
          fullText += chunk;
          onChunk(chunk);
        }
      } catch {
        // JSON パース失敗は無視する（不完全なチャンクの場合がある）
      }
    }
  }

  onDone(fullText);
}

/* =========================================================
   プロンプト整形
   ========================================================= */

/**
 * @description Claude Code 向けプロンプトを直接 API 呼び出し用に整形する。
 *              エージェント指示（@maika, @rino 等）やファイル保存指示を除去する。
 * @param {string} rawPrompt - 元のプロンプト文字列
 * @returns {string} 整形済みプロンプト
 */
export function cleanPromptForApi(rawPrompt) {
  return rawPrompt
    // @agent skill-name を実行して。行を除去する
    .replace(/^@\w+\s+[\w-]+\s+を実行して。\s*/m, '')
    // 「〜に保存」「〜として保存してください」行を除去する
    .replace(/^[-・]\s*.*に保存(して(ください)?)?$/gm, '')
    .replace(/^.*\.md\s*(に|として)\s*保存.*$/gm, '')
    // 先頭・末尾の空行を整理する
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
