// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";

function parseCsv(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line && !rows.length) continue;
    rows.push(line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')));
  }
  while (rows.length && rows[rows.length - 1].every((c) => !String(c ?? "").trim())) {
    rows.pop();
  }
  if (!rows.length) return [[""]];
  const cols = Math.max(...rows.map((r) => r.length), 1);
  return rows.map((r) => {
    const out = [...r];
    while (out.length < cols) out.push("");
    return out;
  });
}

function escapeCell(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function serializeCsv(rows) {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function CsvSheetEditor({ value = "", onChange }) {
  const parsed = useMemo(() => parseCsv(value), [value]);
  const [rows, setRows] = useState(parsed);

  useEffect(() => {
    setRows(parsed);
  }, [parsed]);

  const updateCell = (ri, ci, next) => {
    setRows((prev) => {
      const copy = prev.map((r) => [...r]);
      while (copy.length <= ri) copy.push(Array(copy[0]?.length ?? 1).fill(""));
      while (copy[ri].length <= ci) copy[ri].push("");
      copy[ri][ci] = next;
      onChange?.(serializeCsv(copy));
      return copy;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      const cols = prev[0]?.length ?? 1;
      const copy = [...prev, Array(cols).fill("")];
      onChange?.(serializeCsv(copy));
      return copy;
    });
  };

  const addColumn = () => {
    setRows((prev) => {
      const copy = prev.map((r) => [...r, ""]);
      onChange?.(serializeCsv(copy));
      return copy;
    });
  };

  return (
    <div className="desk-csv-sheet-editor">
      <div className="desk-csv-sheet-toolbar">
        <button type="button" className="desk-csv-sheet-btn" onClick={addRow}>
          Add row
        </button>
        <button type="button" className="desk-csv-sheet-btn" onClick={addColumn}>
          Add column
        </button>
      </div>
      <div className="desk-file-csv-wrap overflow-auto flex-1 min-h-0">
        <table className="desk-file-csv desk-file-csv-editable">
          <tbody>
            {rows.map((cells, ri) => (
              <tr key={ri}>
                {cells.map((cell, ci) => (
                  <td key={ci}>
                    <input
                      type="text"
                      className="desk-csv-cell-input"
                      value={cell}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
