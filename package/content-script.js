// Google Chat で
//   Enter            → 改行
//   Shift+Enter      → 送信
//   Ctrl+Enter       → 送信
//   Cmd(⌘)+Enter     → 送信
//
// Linux / Windows / macOS すべて対応。
// Gmail 連携版 (mail.google.com/chat/*) の iframe 内でも動作します。

(() => {
  /** 対象要素（textarea か contenteditable）を祖先へさかのぼって取得 */
  function getEditableAncestor(el) {
    while (el) {
      if (el.nodeType === 1) {
        if (el.tagName === 'TEXTAREA') return el;
        if (el.getAttribute('contenteditable') === 'true') return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /** 改行をカーソル位置に挿入 */
  function insertNewLine(target) {
    if (target.tagName === 'TEXTAREA') {
      const { selectionStart: s, selectionEnd: e, value } = target;
      target.value = value.slice(0, s) + '\n' + value.slice(e);
      target.selectionStart = target.selectionEnd = s + 1;
    } else {
      document.execCommand('insertLineBreak');
    }
  }

  /** 送信ボタンをクリック。見つからなければ Alt+Enter を擬似送信 */
  function sendMessage(active) {
    const selectors = [
      // 英語 UI
      '[aria-label="Send"]',
      '[aria-label="Send message"]',
      '[data-tooltip*="Send"]',
      // 日本語 UI
      '[aria-label="送信"]',
      '[aria-label="メッセージを送信"]',
      '[data-tooltip*="送信"]',
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return;
      }
    }

    /* フォールバック：
       Chat ネイティブでは Alt+Enter が「送信」扱いなので
       Alt フラグ付きの Enter を投げる */
    active.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        altKey: true,
        bubbles: true,
      })
    );
  }

  /** capture フェーズでキーを横取り */
  function onKeydown(e) {
    if (e.key !== 'Enter' || e.altKey) return; // Alt+Enter は素通し
    const editable = getEditableAncestor(e.target);
    if (!editable) return;

    // ---------- 改行 ----------
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation(); // 他ハンドラも止める
      insertNewLine(editable);
      return;
    }

    // ---------- 送信 ----------
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sendMessage(editable);
    }
  }

  /** 任意の window にリスナーを注入 */
  function inject(win) {
    try {
      win.document.addEventListener('keydown', onKeydown, {
        capture: true, // いちばん外側で取得
        passive: false, // preventDefault() を許可
      });
    } catch (_) {
      /* クロスオリジン iframe などは無視 */
    }
  }

  // ① 自ページ
  inject(window);

  // ② 動的に追加される iframe にも自動で注入
  new MutationObserver(muts => {
    muts.forEach(m =>
      m.addedNodes.forEach(n => {
        if (n.tagName === 'IFRAME') {
          n.addEventListener('load', () => inject(n.contentWindow));
        }
      })
    );
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
