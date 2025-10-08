// Google Chat で：
//   Enter                     → 改行（拡張ルール）
//   Alt / Shift / Ctrl / Cmd + Enter
//      └─ オプションで ON なら送信、OFF なら改行（拡張が常に握る）
// ただし、メンション候補の listbox（role="listbox"）が“可視”のときだけ
// 修飾なし Enter をネイティブ（Chat）に任せる＝候補確定

(() => {
  /* ------------------------------------------------------------------ *
   * 1) 送信キー設定のロード                                            *
   * ------------------------------------------------------------------ */
  const DEFAULT_SEND_KEYS = { Alt: true, Shift: true, Ctrl: true, Meta: true };
  let sendKeys = { ...DEFAULT_SEND_KEYS };

  chrome.storage.sync.get("sendKeys", (data) => {
    if (data && data.sendKeys) sendKeys = { ...DEFAULT_SEND_KEYS, ...data.sendKeys };
  });

  /* ------------------------------------------------------------------ *
   * 2) 共通ユーティリティ                                               *
   * ------------------------------------------------------------------ */
  function getEditableAncestor(el) {
    while (el) {
      if (el.nodeType === 1) {
        if (el.tagName === "TEXTAREA") return el;
        if (el.getAttribute("contenteditable") === "true") return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function insertNewLine(target) {
    if (target.tagName === "TEXTAREA") {
      const { selectionStart: s, selectionEnd: e, value } = target;
      const before = value.slice(0, s);
      const m = before.match(/(^|\n)([ \t]*([*+\-]\s+))$/);
      const prefix = m ? m[2] : "";
      target.value = value.slice(0, s) + "\n" + prefix + value.slice(e);
      const newPos = s + 1 + prefix.length;
      target.selectionStart = target.selectionEnd = newPos;
    } else {
      const doc = target.ownerDocument;
      const inList = doc.queryCommandState("insertUnorderedList");
      if (inList) doc.execCommand("insertParagraph");
      else doc.execCommand("insertLineBreak");
    }
  }

  function sendMessage(active) {
    const selectors = [
      'button[jsname="GBTyxb"]',
      'button[data-id="update"]',
      'button[aria-label="メッセージを送信"]',
    ];

    // 近傍から探索
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
    // 全体フォールバック
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return;
      }
    }
    // 最終フォールバック
    active.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }

  /* ------------------------------------------------------------------ *
   * 3) メンション候補 listbox の“可視”判定（一本化の要）                *
   * ------------------------------------------------------------------ */

  // 要素が実質的に可視かどうか
  function isActuallyVisible(el) {
    if (!el || !el.isConnected) return false;
    const win = el.ownerDocument.defaultView || window;
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 && rect.height <= 0) || (rect.right === 0 && rect.bottom === 0 && rect.left === 0 && rect.top === 0)) {
      return false;
    }
    // position: fixed の場合 offsetParent は null でも可視あり得るので見ない
    // 祖先に hidden/aria-hidden があるケースは getClientRects で概ね除外できる
    return true;
  }

  // Document/ShadowRoot 単位で role=listbox を探し、可視なものがあれば true
  function anyVisibleListboxInRoot(root) {
    const queryAll = root.querySelectorAll ? root.querySelectorAll.bind(root) : () => [];
    const boxes = queryAll('[role="listbox"], div[role="listbox"], ul[role="listbox"]');
    for (const box of boxes) {
      if (isActuallyVisible(box)) return true;
    }
    // 入れ子の shadowRoot も探索
    const all = queryAll("*");
    for (const el of all) {
      if (el.shadowRoot && anyVisibleListboxInRoot(el.shadowRoot)) return true;
    }
    return false;
  }

  // editable の属する document と、同一オリジンの top.document を見る
  function isListboxVisibleAround(editable) {
    try {
      const doc = editable?.ownerDocument || document;
      if (anyVisibleListboxInRoot(doc)) return true;

      // Chat が上位ドキュメントにポップアップを描画するパターン対策
      try {
        const topDoc = doc.defaultView?.top?.document;
        if (topDoc && topDoc !== doc && anyVisibleListboxInRoot(topDoc)) return true;
      } catch (_) { /* cross-origin は無視 */ }

      // 必要なら、同一オリジンの iframe もチェック（控えめに）
      const iframes = doc.querySelectorAll("iframe");
      for (const f of iframes) {
        try {
          const idoc = f.contentDocument;
          if (idoc && anyVisibleListboxInRoot(idoc)) return true;
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 4) Enter キー処理（capture で一本化）                               *
   * ------------------------------------------------------------------ */
  function onKeydownCapture(e) {
    if (e.isComposing) return; // IME 変換中は無視
    if (e.key !== "Enter") return;

    const editable = getEditableAncestor(e.target);
    if (!editable) return;

    // 修飾キー付き Enter は拡張の設定に従う（常に握る）
    const mod =
      (e.altKey && "Alt") ||
      (e.shiftKey && "Shift") ||
      (e.ctrlKey && "Ctrl") ||
      (e.metaKey && "Meta") ||
      null;

    if (mod) {
      const isSend = !!sendKeys[mod];
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isSend) sendMessage(editable);
      else insertNewLine(editable);
      return;
    }

    // 修飾なし Enter：listbox が“可視”ならネイティブ（Chat）に任せる
    if (isListboxVisibleAround(editable)) {
      return; // prevent しない＝Chat が候補確定を処理
    }

    // listbox が見えていなければ拡張の通常ルール（デフォは改行）
    e.preventDefault();
    e.stopImmediatePropagation();
    insertNewLine(editable);
  }

  /* ------------------------------------------------------------------ *
   * 5) イベント注入（自フレーム + 動的 iframe）                         *
   * ------------------------------------------------------------------ */
  function inject(win) {
    try {
      win.document.addEventListener("keydown", onKeydownCapture, {
        capture: true,
        passive: false,
      });
    } catch (_) {
      /* cross-origin iframe は無視 */
    }
  }

  inject(window);

  new MutationObserver((muts) => {
    muts.forEach((m) =>
      m.addedNodes.forEach((n) => {
        if (n.tagName === "IFRAME") {
          n.addEventListener("load", () => inject(n.contentWindow));
        }
      })
    );
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
