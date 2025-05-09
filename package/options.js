const DEFAULTS = { Alt: true, Shift: true, Ctrl: true, Meta: true };

document.addEventListener('DOMContentLoaded', () => {
  // ロード
  chrome.storage.sync.get('sendKeys', data => {
    const cfg = { ...DEFAULTS, ...data.sendKeys };
    ['Alt', 'Shift', 'Ctrl', 'Meta'].forEach(k => {
      document.getElementById(k).checked = !!cfg[k];
    });
  });

  // 保存
  document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();
    const cfg = {
      Alt: document.getElementById('Alt').checked,
      Shift: document.getElementById('Shift').checked,
      Ctrl: document.getElementById('Ctrl').checked,
      Meta: document.getElementById('Meta').checked,
    };
    chrome.storage.sync.set({ sendKeys: cfg }, () => {
      const status = document.getElementById('status');
      status.textContent = '保存しました';
      setTimeout(() => (status.textContent = ''), 1500);
    });
  });
});
