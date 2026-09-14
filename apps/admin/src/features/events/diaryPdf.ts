import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { DiaryEntry } from './api';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDiaryListHtml(periodLabel: string, entries: DiaryEntry[]): string {
  const rows = entries
    .map(
      (e) => `<tr>
        <td>${e.onDate}</td>
        <td>${escapeHtml(e.title)}</td>
        <td>${e.body ? escapeHtml(e.body) : '&mdash;'}</td>
        <td>${escapeHtml(e.authorName)}</td>
      </tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #2a1414; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #7a6363; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e8dcd6; font-size: 12px; vertical-align: top; }
  th { background: #f5ece6; font-weight: 600; }
</style>
</head>
<body>
  <h1>School diary &mdash; ${escapeHtml(periodLabel)}</h1>
  <div class="subtitle">Generated ${new Date().toLocaleString()} &middot; ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}</div>
  <table>
    <thead><tr><th>Date</th><th>Title</th><th>Notes</th><th>Author</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No diary entries</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

/** Renders the given diary entries to a PDF and opens the system share sheet, same as
 * downloadEventListPdf in eventsPdf.ts — there's no direct "save to Downloads" on either
 * platform without extra permissions, so sharing is the standard Expo path. */
export async function downloadDiaryListPdf(periodLabel: string, entries: DiaryEntry[]): Promise<void> {
  const html = buildDiaryListHtml(periodLabel, entries);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `School diary — ${periodLabel}` });
  }
}
