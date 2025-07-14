// Google Chat で：
//   Enter                     → 改行        ※メンション候補中 / 直前が @ のときは確定
//   Alt / Shift / Ctrl / Cmd + Enter
//      └─ オプションで ON なら送信、OFF なら改行

(() => {
  /* ------------------------------------------------------------------ *
   * 1. 送信キー設定のロード（Alt も対象）                               *
   * ------------------------------------------------------------------ */
  const DEFAULT_SEND_KEYS = { Alt: true, Shift: true, Ctrl: true, Meta: true };
  let sendKeys = { ...DEFAULT_SEND_KEYS };

  chrome.storage.sync.get('sendKeys', data => {
    if (data.sendKeys) sendKeys = { ...DEFAULT_SEND_KEYS, ...data.sendKeys };
  });

  /* ------------------------------------------------------------------ *
   * 2. メンション判定ユーティリティ                                    *
   * ------------------------------------------------------------------ */
  function isMentionPopupVisible() {
    const box = document.querySelector('div[role="listbox"]');
    return box && box.offsetParent !== null;
  }

  function isCaretAfterAt(editable) {
    if (editable.tagName === 'TEXTAREA') {
      const pos = editable.selectionStart;
      return pos > 0 && editable.value[pos - 1] === '@';
    }
    const sel = editable.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const { startContainer: node, startOffset: offset } = range;
    return (
      node.nodeType === Node.TEXT_NODE &&
      offset > 0 &&
      node.data[offset - 1] === '@'
    );
  }

  function isMentionActive(editable) {
    return isMentionPopupVisible() || isCaretAfterAt(editable);
  }

  /* ------------------------------------------------------------------ *
   * 3. 入力フィールドユーティリティ                                    *
   * ------------------------------------------------------------------ */
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

  // content-script.js より
  function insertNewLine(target) {
    // 1) <textarea> の場合：直前行のリストマーカーをコピーして挿入
    if (target.tagName === 'TEXTAREA') {
      const { selectionStart: s, selectionEnd: e, value } = target;
      // カーソル前テキストから「* , + , -」等のマーカー行末を拾う
      const before = value.slice(0, s);
      const m = before.match(/(^|\n)([ \t]*([*+\-]\s+))$/);
      const prefix = m ? m[2] : '';
      // 改行＋マーカーを挿入
      target.value = value.slice(0, s) + '\n' + prefix + value.slice(e);
      // カーソル位置を新しい行先頭に移動
      const newPos = s + 1 + prefix.length;
      target.selectionStart = target.selectionEnd = newPos;
    }
    // 2) contenteditable 要素（Google Chat の入力欄など）の場合
    else {
      const doc = target.ownerDocument;
      // 現在カーソルが <ul> の中かを判定
      const inList = doc.queryCommandState('insertUnorderedList');
      if (inList) {
        // リスト内なら標準の段落分割（新しい <li> を生成）
        doc.execCommand('insertParagraph');
      } else {
        // リスト外なら Shift+Enter 相当で <br> を挿入
        doc.execCommand('insertLineBreak');
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 4. 送信処理                                                        *
   * ------------------------------------------------------------------ */
  function sendMessage(active) {
    const selectors = [
      'button[jsname="GBTyxb"]',
      'button[data-id="update"]',
      'button[aria-label="メッセージを送信"]',
    ];

    // フォーカス中要素から親要素を順にたどり、
    // その領域内にマッチするボタンを探す
    let el = active;
    while (el) {
      el = el.parentElement;
      if (!el) break;
      for (const sel of selectors) {
        const btn = el.querySelector(sel);
        if (btn) {
          btn.click();
          return;
        }
      }
    }

    // 見つからなければドキュメント全体からフォールバック検索
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return;
      }
    }

    // それでもなければ Enter キーでフォールバック
    active.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
  }

  /* ------------------------------------------------------------------ *
   * 5. キーハンドラ                                                    *
   * ------------------------------------------------------------------ */
  function onKeydown(e) {
    if (e.isComposing) return; //IME変換中は無視
    if (e.key !== 'Enter') return;

    const editable = getEditableAncestor(e.target);
    if (!editable) return;

    /* --- メンション確定 (修飾なし Enter) ----------------------------- */
    const noMod = !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
    if (noMod && isMentionActive(editable)) return; // ネイティブに任せる

    /* --- 送信 or 改行 ---------------------------------------------- */
    const mod =
      (e.altKey && 'Alt') ||
      (e.shiftKey && 'Shift') ||
      (e.ctrlKey && 'Ctrl') ||
      (e.metaKey && 'Meta') ||
      null;

    const isSend = mod ? sendKeys[mod] : false;

    e.preventDefault();
    e.stopImmediatePropagation();
    if (isSend) {
      sendMessage(editable);
    } else {
      insertNewLine(editable);
    }
  }

  /* ------------------------------------------------------------------ *
   * 6. window への注入                                                 *
   * ------------------------------------------------------------------ */
  function inject(win) {
    try {
      win.document.addEventListener('keydown', onKeydown, {
        capture: true,
        passive: false,
      });
    } catch (_) {
      /* cross-origin iframe は無視 */
    }
  }

  /* 自フレーム + 動的 iframe */
  inject(window);
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
