import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

const MAX_ROWS = 3000;
const MAX_COLS = 80;

function columnName(index) {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function parseCsv(text) {
  const delimiter = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return [{ name: 'CSV', rows: rows.map((cells) => cells.map((value) => ({ value }))), merges: [] }];
}

function argb(color) {
  const value = color?.argb;
  return value && value.length === 8 ? `#${value.slice(2)}` : undefined;
}

async function parseXlsx(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets
    .filter((sheet) => sheet.state !== 'hidden')
    .map((sheet) => {
      const rowCount = Math.min(sheet.rowCount, MAX_ROWS);
      const colCount = Math.min(sheet.columnCount, MAX_COLS);
      const rows = [];
      for (let r = 1; r <= rowCount; r += 1) {
        const row = sheet.getRow(r);
        const cells = [];
        for (let c = 1; c <= colCount; c += 1) {
          const cell = row.getCell(c);
          const style = cell.style || {};
          cells.push({
            value: cell.text ?? '',
            bold: style.font?.bold,
            italic: style.font?.italic,
            color: argb(style.font?.color),
            fill: style.fill?.type === 'pattern' ? argb(style.fill.fgColor) : undefined,
            align: style.alignment?.horizontal,
            numeric: typeof cell.value === 'number',
          });
        }
        rows.push(cells);
      }
      const merges = Object.values(sheet._merges || {}).map((range) => range.model || range);
      const widths = Array.from({ length: colCount }, (_, i) => (sheet.getColumn(i + 1).width || 10) * 7.5);
      return { name: sheet.name, rows, merges, widths, truncated: sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLS };
    });
}

/** Spreadsheet view of .xlsx and .csv: sheet tabs, merged cells, basic formatting. */
export default function SheetViewer({ url, ext }) {
  const { t } = useLocale();
  const [sheets, setSheets] = useState(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = ext === 'csv' ? parseCsv(await res.text()) : await parseXlsx(await res.arrayBuffer());
      if (!cancelled) setSheets(data);
    })().catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [url, ext]);

  if (error) return <div className="viewer-empty"><strong>{t('kb.viewer.sheetError')}</strong><span>{error}</span></div>;
  if (!sheets) return <div className="viewer-loading"><Spin /><span>{t('kb.viewer.loading')}</span></div>;

  const sheet = sheets[active] || { rows: [], merges: [] };
  const covered = new Set();
  const spans = new Map();
  for (const merge of sheet.merges) {
    const { top, left, bottom, right } = merge;
    if (!top) continue;
    spans.set(`${top}:${left}`, { rowSpan: bottom - top + 1, colSpan: right - left + 1 });
    for (let r = top; r <= bottom; r += 1) {
      for (let c = left; c <= right; c += 1) if (r !== top || c !== left) covered.add(`${r}:${c}`);
    }
  }
  const cols = Math.max(0, ...sheet.rows.map((row) => row.length));

  return (
    <div className="sheetv">
      <div className="sheetv-scroll">
        <table className="sheetv-table">
          <thead>
            <tr>
              <th className="sheetv-corner" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} style={{ minWidth: sheet.widths?.[c] || 80 }}>{columnName(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {row.map((cell, c) => {
                  const key = `${r + 1}:${c + 1}`;
                  if (covered.has(key)) return null;
                  const span = spans.get(key);
                  return (
                    <td
                      key={c}
                      rowSpan={span?.rowSpan}
                      colSpan={span?.colSpan}
                      style={{
                        fontWeight: cell.bold ? 700 : undefined,
                        fontStyle: cell.italic ? 'italic' : undefined,
                        color: cell.color,
                        background: cell.fill,
                        textAlign: cell.align || (cell.numeric ? 'right' : undefined),
                      }}
                    >
                      {cell.value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(sheets.length > 1 || sheet.truncated) && (
        <div className="sheetv-tabs">
          {sheets.map((item, index) => (
            <button key={item.name} type="button" className={index === active ? 'is-active' : ''} onClick={() => setActive(index)}>
              {item.name}
            </button>
          ))}
          {sheet.truncated && <span className="sheetv-note">{t('kb.viewer.truncated', { rows: MAX_ROWS })}</span>}
        </div>
      )}
    </div>
  );
}
