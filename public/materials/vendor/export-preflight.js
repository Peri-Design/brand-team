'use strict';
(function (root) {
  function summarize(rows) {
    const affected = rows.filter(row => row.issues.length || row.warnings.length);
    return { rows: affected, total: rows.length,
      blocked: affected.filter(row => row.issues.length).length,
      warned: affected.filter(row => row.warnings.length).length };
  }
  function review(report, locate) {
    if (!report.rows.length) return Promise.resolve(true);
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const dialog = document.createElement('dialog');
      dialog.className = 'export-review';
      dialog.setAttribute('aria-labelledby', 'export-review-title');
      dialog.setAttribute('aria-describedby', 'export-review-intro');
      const heading = document.createElement('h2');
      heading.id = 'export-review-title';
      heading.tabIndex = -1;
      heading.textContent = report.blocked ? '请先处理这些问题' : '部分图片可能不够清晰';
      const intro = document.createElement('p');
      intro.id = 'export-review-intro';
      intro.className = 'export-review-intro';
      intro.textContent = report.blocked
        ? `已检查所选 ${report.total} 张图片，其中 ${report.blocked} 张需要修改后才能下载。`
        : `已检查所选 ${report.total} 张图片，其中 ${report.warned} 张使用的原图分辨率偏低。建议更换更大图片，也可确认后继续下载。`;
      const list = document.createElement('div');
      list.className = 'export-review-list';
      let target = null, accepted = false;
      for (const row of report.rows) {
        const section = document.createElement('section');
        const header = document.createElement('div');
        header.className = 'export-review-row';
        const title = document.createElement('h3');
        title.textContent = row.label;
        header.append(title);
        if (row.key) {
          const jump = document.createElement('button');
          jump.type = 'button';
          jump.className = 'quiet';
          jump.textContent = '去调整';
          jump.setAttribute('aria-label', `调整 ${row.label}`);
          jump.onclick = () => { target = row.key; dialog.close(); };
          header.append(jump);
        }
        section.append(header);
        for (const [messages, level] of [[row.issues, 'error'], [row.warnings, 'warning']]) {
          if (!messages.length) continue;
          const label = document.createElement('p');
          label.className = `export-review-level ${level}`;
          label.textContent = level === 'error' ? '需要修改' : '清晰度提醒';
          const items = document.createElement('ul');
          for (const message of messages) {
            const item = document.createElement('li');
            item.textContent = message;
            items.append(item);
          }
          section.append(label, items);
        }
        list.append(section);
      }
      const footer = document.createElement('div');
      footer.className = 'export-review-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = report.blocked ? '返回编辑' : '暂不下载';
      cancel.onclick = () => dialog.close();
      footer.append(cancel);
      if (!report.blocked) {
        const proceed = document.createElement('button');
        proceed.type = 'button';
        proceed.className = 'primary';
        proceed.textContent = '仍然下载';
        proceed.onclick = () => { accepted = true; dialog.close(); };
        footer.append(proceed);
      }
      dialog.append(heading, intro, list, footer);
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (target) locate(target);
        else previousFocus?.focus();
        resolve(accepted);
      }, { once: true });
      document.body.append(dialog);
      dialog.showModal();
      heading.focus();
    });
  }
  const api = { summarize, review };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExportPreflight = api;
})(typeof window !== 'undefined' ? window : globalThis);
