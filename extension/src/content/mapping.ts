export function getPullRequestKey(url: string): string | null {
  // Example PR URL: https://github.com/owner/repo/pull/123
  const m = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return `${m[1]}/${m[2]}#${m[3]}`;
}

export type LineMapping = { lineKey: string; rect: DOMRect }[];

export function mapLineElements(): LineMapping {
  const mappings: LineMapping = [];
  // GitHub PR DOM: code lines often have .js-file-line, but layout changes; we compute keys using data-line-number and file path context.
  const fileWrappers = document.querySelectorAll('[data-file-name]');
  fileWrappers.forEach((fileEl) => {
    const filePath = (fileEl as HTMLElement).getAttribute('data-file-name') || 'unknown';
    const lines = fileEl.querySelectorAll('.js-file-line, tr.js-file-line');
    lines.forEach((lineEl) => {
      const lineNumAttr = (lineEl as HTMLElement).getAttribute('data-line-number') || (lineEl as HTMLElement).id?.replace(/[^\d]/g, '') || '';
      if (!lineNumAttr) return;
      const lineKey = `${filePath}:${lineNumAttr}`;
      const rect = (lineEl as HTMLElement).getBoundingClientRect();
      (lineEl as HTMLElement).setAttribute('data-line-key', lineKey);
      mappings.push({ lineKey, rect });
    });
  });
  return mappings;
}

