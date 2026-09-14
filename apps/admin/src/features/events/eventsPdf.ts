import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { EventSummary } from './api';
import { eventStatus } from './eventStatus';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildEventListHtml(periodLabel: string, events: EventSummary[]): string {
  const rows = events
    .map((e) => {
      const status = eventStatus(e);
      const dates = e.endsOn && e.endsOn !== e.startsOn ? `${e.startsOn} &rarr; ${e.endsOn}` : e.startsOn;
      const responsible = e.responsible.map((r) => escapeHtml(r.fullName)).join(', ') || '&mdash;';
      const category = e.category ? escapeHtml(e.category) : '&mdash;';
      const statusCell = status
        ? `<span class="status ${status.tone === 'success' ? 'status-completed' : 'status-pending'}">${status.label}</span>`
        : '&mdash;';
      return `<tr>
        <td>${escapeHtml(e.title)}</td>
        <td>${dates}</td>
        <td>${category}</td>
        <td>${responsible}</td>
        <td>${statusCell}</td>
      </tr>`;
    })
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
  .status-completed { color: #146b44; font-weight: 600; }
  .status-pending { color: #a9823c; font-weight: 600; }
</style>
</head>
<body>
  <h1>Events &mdash; ${escapeHtml(periodLabel)}</h1>
  <div class="subtitle">Generated ${new Date().toLocaleString()} &middot; ${events.length} event${events.length === 1 ? '' : 's'}</div>
  <table>
    <thead><tr><th>Title</th><th>Dates</th><th>Category</th><th>Responsible</th><th>Status</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No events</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

/** Renders the given event list to a PDF and opens the system share sheet so the
 * user can save it or send it on — there's no direct "save to Downloads" on
 * either platform without extra permissions, so sharing is the standard Expo path. */
export async function downloadEventListPdf(periodLabel: string, events: EventSummary[]): Promise<void> {
  const html = buildEventListHtml(periodLabel, events);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Events — ${periodLabel}` });
  }
}
