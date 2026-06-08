import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import ExcelJS from "exceljs";

// 10 MB cap for spreadsheet uploads.
const MAX_XLSX_BYTES = 10 * 1024 * 1024;

// xlsx uploads come through memory storage (parsed, never persisted to disk).
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_XLSX_BYTES },
});

// Express middleware that accepts a single "file" field and maps multer
// failures to a structured 400 JSON instead of the generic error handler.
export function handleXlsxUpload(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  xlsxUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "حجم الملف يتجاوز الحد المسموح (10 ميجابايت)"
          : "تعذّر رفع الملف";
      res.status(400).json({ error: msg });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

// Normalizes an exceljs cell into a trimmed string (handles rich-text, dates).
export function cellStr(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v)
    return String((v as { text: unknown }).text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

// Normalizes an exceljs cell into a finite number (strips thousands commas).
export function cellNum(v: ExcelJS.CellValue): number {
  const n = Number(cellStr(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface ExcelColumn<Row> {
  // Header label written to row 1 AND expected when importing.
  header: string;
  // Cell value for a given row when exporting.
  value: (row: Row) => string | number | null;
  width?: number;
}

// Builds a single-sheet workbook from rows and streams it as an .xlsx download.
export async function exportWorkbook<Row>(
  res: Response,
  opts: {
    sheetName: string;
    fileName: string; // without extension
    columns: ExcelColumn<Row>[];
    rows: Row[];
  },
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName);
  ws.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: c.width ?? 18,
  }));
  ws.getRow(1).font = { bold: true };
  for (const row of opts.rows) {
    ws.addRow(opts.columns.map((c) => c.value(row) ?? ""));
  }
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${opts.fileName}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx"`,
  );
  await wb.xlsx.write(res);
  res.end();
}

export interface ParsedSheet {
  // 1-based column index per header label found in row 1.
  colIndex: Record<string, number>;
  // Data rows (row 2..end) as exceljs Row objects with their sheet row number.
  rows: { rowNo: number; row: ExcelJS.Row }[];
  has: (header: string) => boolean;
  // Reads a string cell from a data row by header label.
  str: (row: ExcelJS.Row, header: string) => string;
  // Reads a numeric cell from a data row by header label.
  num: (row: ExcelJS.Row, header: string) => number;
}

// Loads the first worksheet of an uploaded buffer and returns a header-indexed
// accessor. Returns null when the file has no worksheet / no header row.
export async function parseSheet(
  buffer: Buffer,
): Promise<ParsedSheet | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return null;
  const headerRow = ws.getRow(1);
  const colIndex: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const key = cellStr(cell.value);
    if (key) colIndex[key] = col;
  });
  if (Object.keys(colIndex).length === 0) return null;

  const rows: { rowNo: number; row: ExcelJS.Row }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    rows.push({ rowNo: r, row: ws.getRow(r) });
  }
  const has = (header: string) => (colIndex[header] ?? 0) > 0;
  const str = (row: ExcelJS.Row, header: string) =>
    has(header) ? cellStr(row.getCell(colIndex[header]!).value) : "";
  const num = (row: ExcelJS.Row, header: string) =>
    has(header) ? cellNum(row.getCell(colIndex[header]!).value) : 0;
  return { colIndex, rows, has, str, num };
}
