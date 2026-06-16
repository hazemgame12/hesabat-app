import React, { useState, useCallback, useRef, useEffect, useMemo, KeyboardEvent } from "react";
import {
  Save, X, Trash2, Copy, LayoutGrid, List,
  Plus, Filter, Eye, ChevronUp, ChevronDown, ArrowUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ColumnType = "text" | "number" | "boolean" | "select" | "readonly";

export interface GridColumn<T> {
  key: keyof T & string;
  header: string;
  type: ColumnType;
  width?: string;
  editable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  options?: { value: string; label: string }[];
  validate?: (value: unknown, row: T) => string | null;
  render?: (value: unknown, row: T) => React.ReactNode;
  align?: "start" | "end" | "center";
}

export interface GridTableProps<T extends { id: string }> {
  rows: T[];
  columns: GridColumn<T>[];
  canEdit?: boolean;
  canDelete?: boolean;
  onSave?: (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => Promise<void>;
  onDeleteRows?: (ids: string[]) => Promise<void>;
  onCreateRows?: (rows: Partial<T>[]) => Promise<void>;
  newRowTemplate?: () => Partial<T>;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  emptyMessage?: string;
  stickyHeader?: boolean;
  stickyFirstCol?: boolean;
  rowClassName?: (row: T) => string;
  defaultHiddenColumns?: (keyof T & string)[];
}

interface CellEdit {
  id: string;
  rowId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface NewRow { _tempId: string; [key: string]: unknown }
interface CellPos { rowId: string; field: string }

export function GridTable<T extends { id: string }>({
  rows,
  columns,
  canEdit = false,
  canDelete = false,
  onSave,
  onDeleteRows,
  onCreateRows,
  newRowTemplate,
  selectedIds: externalSelected,
  onSelectionChange,
  emptyMessage = "لا توجد بيانات",
  stickyHeader = true,
  stickyFirstCol = false,
  rowClassName,
  defaultHiddenColumns = [],
}: GridTableProps<T>) {
  const { toast } = useToast();

  const [localData, setLocalData] = useState<T[]>(rows);
  const [edits, setEdits] = useState<Map<string, CellEdit>>(new Map());
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [activeCell, setActiveCell] = useState<CellPos | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Phase 2: column resize
  const [colWidths, setColWidths] = useState<Map<string, number>>(new Map());
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Phase 3: sort / filter / column visibility
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [filters, setFilters] = useState<Map<string, string>>(new Map());
  const [showFilters, setShowFilters] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(defaultHiddenColumns));
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Phase 3: range selection
  const [rangeStart, setRangeStart] = useState<CellPos | null>(null);
  const [rangeEnd, setRangeEnd] = useState<CellPos | null>(null);

  const selectedIds = externalSelected ?? internalSelected;
  const setSelectedIds = onSelectionChange ?? setInternalSelected;

  // Sync rows from server (only when IDs or count change to avoid resetting on re-render)
  const rowsKey = rows.map((r) => r.id).join(",");
  useEffect(() => { setLocalData(rows); }, [rowsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  // Close column panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node))
        setShowColPanel(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Column resize mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const isRTL = document.documentElement.dir === "rtl";
      const delta = e.clientX - resizingRef.current.startX;
      const newW = Math.max(60, resizingRef.current.startWidth + (isRTL ? -delta : delta));
      setColWidths((prev) => new Map(prev).set(resizingRef.current!.key, newW));
    };
    const onUp = () => { resizingRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenCols.has(c.key)),
    [columns, hiddenCols]
  );

  // Filtered + sorted display data
  const displayData = useMemo(() => {
    let data = [...localData];
    filters.forEach((val, key) => {
      if (!val.trim()) return;
      const lower = val.toLowerCase();
      const col = columns.find((c) => c.key === key);
      data = data.filter((row) => {
        const raw = row[key as keyof T];
        if (col?.options) {
          const label = col.options.find((o) => o.value === String(raw))?.label ?? String(raw ?? "");
          return label.toLowerCase().includes(lower);
        }
        return String(raw ?? "").toLowerCase().includes(lower);
      });
    });
    if (sortConfig) {
      data.sort((a, b) => {
        const av = String(a[sortConfig.key as keyof T] ?? "");
        const bv = String(b[sortConfig.key as keyof T] ?? "");
        const cmp = av.localeCompare(bv, "ar");
        return sortConfig.dir === "asc" ? cmp : -cmp;
      });
    }
    return data;
  }, [localData, filters, sortConfig, columns]);

  const getCellValue = (row: T, field: string): unknown => {
    const edit = edits.get(`${row.id}::${field}`);
    return edit ? edit.newValue : row[field as keyof T];
  };

  const setCellValue = (rowId: string, field: string, newValue: unknown) => {
    const row = localData.find((r) => r.id === rowId);
    if (!row) return;
    const oldValue = row[field as keyof T];
    const key = `${rowId}::${field}`;
    setEdits((prev) => {
      const next = new Map(prev);
      if (String(newValue) === String(oldValue)) next.delete(key);
      else next.set(key, { id: rowId, rowId, field, oldValue, newValue });
      return next;
    });
    setLocalData((prev) => prev.map((r) => r.id === rowId ? { ...r, [field]: newValue } : r));
  };

  const setNewRowCell = (tempId: string, field: string, value: unknown) =>
    setNewRows((prev) => prev.map((r) => r._tempId === tempId ? { ...r, [field]: value } : r));

  const handleSave = async () => {
    const hasEdits = edits.size > 0;
    const hasNew = newRows.length > 0;
    if (!hasEdits && !hasNew) return;
    setIsSaving(true);
    try {
      if (hasEdits && onSave) {
        await onSave(Array.from(edits.values()));
        setEdits(new Map());
      }
      if (hasNew && onCreateRows) {
        await onCreateRows(newRows.map(({ _tempId, ...rest }) => rest as Partial<T>));
        setNewRows([]);
      }
      toast({ title: "تم حفظ التغييرات" });
    } catch {
      toast({ variant: "destructive", title: "فشل الحفظ", description: "تحقق من البيانات وأعد المحاولة" });
    } finally { setIsSaving(false); }
  };

  const handleDiscard = () => {
    setLocalData(rows);
    setEdits(new Map());
    setNewRows([]);
    setEditingCell(null);
    setActiveCell(null);
  };

  const handleDeleteSelected = async () => {
    if (!onDeleteRows || selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      await onDeleteRows(Array.from(selectedIds));
      setSelectedIds(new Set());
      toast({ title: `تم حذف ${selectedIds.size} صف` });
    } catch {
      toast({ variant: "destructive", title: "فشل الحذف" });
    } finally { setIsDeleting(false); }
  };

  const handleCopy = useCallback(async () => {
    if (rangeStart && rangeEnd) {
      const r0 = displayData.findIndex((r) => r.id === rangeStart.rowId);
      const r1 = displayData.findIndex((r) => r.id === rangeEnd.rowId);
      const c0 = visibleColumns.findIndex((c) => c.key === rangeStart.field);
      const c1 = visibleColumns.findIndex((c) => c.key === rangeEnd.field);
      const rMin = Math.min(r0, r1), rMax = Math.max(r0, r1);
      const cMin = Math.min(c0, c1), cMax = Math.max(c0, c1);
      const tsv = displayData.slice(rMin, rMax + 1).map((row) =>
        visibleColumns.slice(cMin, cMax + 1).map((col) => String(getCellValue(row, col.key) ?? "")).join("\t")
      ).join("\n");
      await navigator.clipboard.writeText(tsv);
      toast({ title: `نسخ ${rMax - rMin + 1} × ${cMax - cMin + 1} خلايا` });
      return;
    }
    if (!activeCell) return;
    const row = displayData.find((r) => r.id === activeCell.rowId);
    if (!row) return;
    await navigator.clipboard.writeText(String(getCellValue(row, activeCell.field) ?? ""));
    toast({ title: "تم النسخ" });
  }, [rangeStart, rangeEnd, activeCell, displayData, visibleColumns, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaste = useCallback(async () => {
    if (!activeCell || !canEdit) return;
    const col = columns.find((c) => c.key === activeCell.field);
    if (!col?.editable) return;
    const text = await navigator.clipboard.readText();
    const lines = text.split("\n").filter(Boolean);
    if (lines.length > 1 || lines[0]?.includes("\t")) {
      const startR = displayData.findIndex((r) => r.id === activeCell.rowId);
      const startC = visibleColumns.findIndex((c) => c.key === activeCell.field);
      lines.forEach((line, ri) => {
        line.split("\t").forEach((cell, ci) => {
          const row = displayData[startR + ri];
          const tc = visibleColumns[startC + ci];
          if (row && tc?.editable) setCellValue(row.id, tc.key, cell.trim());
        });
      });
    } else {
      setCellValue(activeCell.rowId, activeCell.field, text.trim());
    }
  }, [activeCell, canEdit, columns, displayData, visibleColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveFocus = (rowIdx: number, colIdx: number, dRow: number, dCol: number) => {
    const editableCols = visibleColumns.filter((c) => c.editable);
    const allRowIds = [...displayData.map((r) => r.id), ...newRows.map((r) => r._tempId)];
    const nr = rowIdx + dRow, nc = colIdx + dCol;
    if (nr >= 0 && nr < allRowIds.length && nc >= 0 && nc < editableCols.length) {
      setActiveCell({ rowId: allRowIds[nr], field: editableCols[nc].key });
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableCellElement>, rowIdx: number, colIdx: number, col: GridColumn<T>) => {
    if (!activeCell) return;
    switch (e.key) {
      case "Enter":
        if (editingCell) { setEditingCell(null); moveFocus(rowIdx, colIdx, 1, 0); }
        else if (canEdit && col.editable) setEditingCell(activeCell);
        e.preventDefault(); break;
      case "Escape": setEditingCell(null); e.preventDefault(); break;
      case "Tab": moveFocus(rowIdx, colIdx, 0, e.shiftKey ? -1 : 1); e.preventDefault(); break;
      case "ArrowUp": if (!editingCell) { moveFocus(rowIdx, colIdx, -1, 0); e.preventDefault(); } break;
      case "ArrowDown": if (!editingCell) { moveFocus(rowIdx, colIdx, 1, 0); e.preventDefault(); } break;
      case "ArrowLeft": if (!editingCell) { moveFocus(rowIdx, colIdx, 0, -1); e.preventDefault(); } break;
      case "ArrowRight": if (!editingCell) { moveFocus(rowIdx, colIdx, 0, 1); e.preventDefault(); } break;
      case "Delete": case "Backspace":
        if (!editingCell && canEdit && col.editable) setCellValue(activeCell.rowId, activeCell.field, "");
        break;
      case "c":
        if ((e.ctrlKey || e.metaKey) && !editingCell) { void handleCopy(); e.preventDefault(); } break;
      case "v":
        if ((e.ctrlKey || e.metaKey) && !editingCell) { void handlePaste(); e.preventDefault(); } break;
    }
  };

  const addNewRow = () => {
    const tmpl = newRowTemplate?.() ?? {};
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNewRows((prev) => [...prev, { _tempId: tempId, ...tmpl }]);
    const firstEditable = visibleColumns.find((c) => c.editable);
    if (firstEditable) setTimeout(() => setEditingCell({ rowId: tempId, field: firstEditable.key }), 30);
  };

  const isEdited = (rowId: string, field: string) => edits.has(`${rowId}::${field}`);
  const hasEdits = edits.size > 0;
  const hasNew = newRows.length > 0;

  const isInRange = (rowId: string, field: string) => {
    if (!rangeStart || !rangeEnd) return false;
    const r0 = displayData.findIndex((r) => r.id === rangeStart.rowId);
    const r1 = displayData.findIndex((r) => r.id === rangeEnd.rowId);
    const c0 = visibleColumns.findIndex((c) => c.key === rangeStart.field);
    const c1 = visibleColumns.findIndex((c) => c.key === rangeEnd.field);
    const ri = displayData.findIndex((r) => r.id === rowId);
    const ci = visibleColumns.findIndex((c) => c.key === field);
    return ri >= Math.min(r0, r1) && ri <= Math.max(r0, r1)
        && ci >= Math.min(c0, c1) && ci <= Math.max(c0, c1);
  };

  const toggleAll = () => {
    if (selectedIds.size === localData.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(localData.map((r) => r.id)));
  };
  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleCellMouseDown = (e: React.MouseEvent, rowId: string, field: string) => {
    if (e.shiftKey && rangeStart) setRangeEnd({ rowId, field });
    else { setRangeStart({ rowId, field }); setRangeEnd(null); }
  };

  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault(); e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startWidth = th?.offsetWidth ?? 100;
    resizingRef.current = { key, startX: e.clientX, startWidth };
  };

  const getColW = (col: GridColumn<T>) => colWidths.get(col.key) ?? (col.width ? parseInt(col.width) : undefined);

  const activeFilters = Array.from(filters.values()).some(Boolean);

  // Render cell content (shared between existing + new rows)
  const renderCellInput = (
    rowId: string,
    col: GridColumn<T>,
    value: unknown,
    isEditing: boolean,
    onChange: (v: unknown) => void,
    isNew = false,
  ) => {
    if (!isEditing || !col.editable || col.type === "readonly") {
      const edited = isEdited(rowId, col.key);
      return (
        <div className={`truncate max-w-[240px] ${edited ? "font-semibold text-amber-800" : ""} ${isNew && !value ? "text-muted-foreground italic text-xs" : ""}`}>
          {col.render
            ? col.render(value, {} as T)
            : col.type === "boolean"
              ? (value ? <span className="text-xs font-bold text-green-600">✓</span> : <span className="text-xs text-muted-foreground">—</span>)
              : col.type === "select" && col.options
                ? (col.options.find((o) => o.value === String(value))?.label ?? (value ? String(value) : (isNew ? `${col.header}...` : "—")))
                : (value ? String(value) : (isNew ? `${col.header}...` : "—"))}
        </div>
      );
    }
    if (col.type === "select" && col.options) return (
      <select
        ref={(el) => { inputRef.current = el; }}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditingCell(null)}
        className="w-full bg-transparent outline-none text-sm"
        autoFocus
      >
        {isNew && <option value="">اختر...</option>}
        {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    if (col.type === "boolean") return (
      <input
        ref={(el) => { inputRef.current = el; }}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => { onChange(e.target.checked); setEditingCell(null); }}
        onBlur={() => setEditingCell(null)}
        className="w-4 h-4 accent-primary cursor-pointer"
        autoFocus
      />
    );
    return (
      <input
        ref={(el) => { inputRef.current = el; }}
        type={col.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => onChange(col.type === "number" ? Number(e.target.value) : e.target.value)}
        onBlur={() => setEditingCell(null)}
        className="w-full bg-transparent outline-none text-sm min-w-0"
        placeholder={isNew ? col.header : undefined}
        autoFocus
        dir={col.type === "number" ? "ltr" : "auto"}
      />
    );
  };

  const stickyCheckboxCls = stickyFirstCol ? "sticky start-0 z-20 bg-inherit" : "";

  return (
    <div className="flex flex-col">
      {/* Edit / selection toolbar */}
      {(hasEdits || hasNew || selectedIds.size > 0) && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50/60 border-b border-amber-200 flex-wrap">
          {(hasEdits || hasNew) && (
            <>
              <span className="text-sm text-amber-700 font-bold bg-amber-100 border border-amber-200 rounded-md px-2.5 py-1">
                {[hasEdits && `${edits.size} تغيير`, hasNew && `${newRows.length} صف جديد`].filter(Boolean).join(" + ")} غير محفوظ
              </span>
              <button onClick={handleSave} disabled={isSaving}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" />{isSaving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
              <button onClick={handleDiscard}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-amber-100">
                <X className="w-3.5 h-3.5" />تجاهل
              </button>
              {selectedIds.size === 0 && <div className="w-px h-5 bg-amber-300 mx-1" />}
            </>
          )}
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm font-bold text-slate-700">تم تحديد {selectedIds.size}</span>
              <button onClick={handleCopy}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-200">
                <Copy className="w-3.5 h-3.5" />نسخ
              </button>
              {canDelete && (
                <button onClick={handleDeleteSelected} disabled={isDeleting}
                  className="flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />{isDeleting ? "جارٍ الحذف..." : "حذف المحدد"}
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-400 hover:underline ms-auto">إلغاء</button>
            </>
          )}
        </div>
      )}

      {/* Secondary toolbar: add row / filter / columns */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/10 flex-wrap">
        {canEdit && onCreateRows && (
          <button onClick={addNewRow}
            className="flex items-center gap-1.5 text-sm text-primary font-bold hover:bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/30 transition-colors">
            <Plus className="w-3.5 h-3.5" />إضافة صف
          </button>
        )}
        <button onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors ${showFilters || activeFilters ? "bg-primary text-primary-foreground border-primary" : "text-slate-600 border-slate-200 hover:bg-slate-100"}`}>
          <Filter className="w-3.5 h-3.5" />فلتر{activeFilters ? ` (${Array.from(filters.values()).filter(Boolean).length})` : ""}
        </button>
        {sortConfig && (
          <button onClick={() => setSortConfig(null)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">
            <X className="w-3 h-3" />إلغاء الترتيب
          </button>
        )}
        {activeFilters && (
          <button onClick={() => setFilters(new Map())}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">
            <X className="w-3 h-3" />إلغاء الفلتر
          </button>
        )}

        <div className="relative ms-auto" ref={colPanelRef}>
          <button onClick={() => setShowColPanel((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
            <Eye className="w-3.5 h-3.5" />الأعمدة
            {hiddenCols.size > 0 && (
              <span className="ms-1 bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center">{hiddenCols.size}</span>
            )}
          </button>
          {showColPanel && (
            <div className="absolute top-full end-0 mt-1 bg-card border rounded-xl shadow-lg p-3 z-50 min-w-[180px]">
              <p className="text-xs font-bold text-muted-foreground mb-2 px-1">إظهار / إخفاء الأعمدة</p>
              {columns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-1.5 px-1 cursor-pointer hover:bg-muted/30 rounded select-none">
                  <input type="checkbox" checked={!hiddenCols.has(col.key)}
                    onChange={() => setHiddenCols((prev) => { const n = new Set(prev); n.has(col.key) ? n.delete(col.key) : n.add(col.key); return n; })}
                    className="w-3.5 h-3.5 accent-primary" />
                  <span className="text-sm">{col.header}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm border-collapse">
          <thead className={stickyHeader ? "sticky top-0 z-10" : ""}>
            {/* Column headers */}
            <tr className="bg-muted/60 text-muted-foreground text-xs border-b">
              <th className={`w-9 px-3 py-3 ${stickyFirstCol ? "sticky start-0 z-20 bg-muted/60" : ""}`}>
                <input type="checkbox"
                  checked={localData.length > 0 && selectedIds.size === localData.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < localData.length; }}
                  onChange={toggleAll} className="w-4 h-4 accent-primary cursor-pointer" />
              </th>
              {visibleColumns.map((col) => {
                const w = getColW(col);
                const sorted = sortConfig?.key === col.key;
                return (
                  <th key={col.key}
                    className={[
                      "px-3 py-3 font-bold whitespace-nowrap relative group select-none",
                      col.align === "end" ? "text-end" : col.align === "center" ? "text-center" : "text-start",
                      col.sortable !== false ? "cursor-pointer hover:bg-muted/80" : "",
                    ].join(" ")}
                    style={w ? { width: w, minWidth: w } : undefined}
                    onClick={() => { if (col.sortable !== false) setSortConfig((p) => p?.key !== col.key ? { key: col.key, dir: "asc" } : p.dir === "asc" ? { key: col.key, dir: "desc" } : null); }}
                  >
                    <span className="flex items-center gap-1">
                      {col.header}
                      {sorted
                        ? (sortConfig!.dir === "asc" ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />)
                        : col.sortable !== false && <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />}
                    </span>
                    {/* Resize handle */}
                    <div
                      className="absolute top-0 end-0 h-full w-2 cursor-col-resize opacity-0 group-hover:opacity-100 flex items-center justify-center"
                      onMouseDown={(e) => startResize(e, col.key)}
                    >
                      <div className="w-0.5 h-4 bg-slate-400 rounded-full" />
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* Filter row */}
            {showFilters && (
              <tr className="bg-muted/30 border-b">
                <th className={`px-2 py-1 ${stickyFirstCol ? "sticky start-0 z-20 bg-muted/30" : ""}`} />
                {visibleColumns.map((col) => (
                  <th key={col.key} className="px-2 py-1 font-normal">
                    {col.filterable !== false ? (
                      <input
                        type="text"
                        placeholder={`${col.header}...`}
                        value={filters.get(col.key) ?? ""}
                        onChange={(e) => setFilters((prev) => { const n = new Map(prev); e.target.value ? n.set(col.key, e.target.value) : n.delete(col.key); return n; })}
                        className="w-full text-xs px-2 py-1 rounded border border-input bg-background outline-none focus:ring-1 ring-primary/50"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {displayData.length === 0 && newRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="text-center py-16 text-muted-foreground text-sm">{emptyMessage}</td>
              </tr>
            ) : (
              <>
                {displayData.map((row, rowIdx) => {
                  const isSelected = selectedIds.has(row.id);
                  const extraCls = rowClassName ? rowClassName(row) : "";
                  const editableCols = visibleColumns.filter((c) => c.editable);
                  return (
                    <tr key={row.id}
                      className={`border-b transition-colors ${isSelected ? "bg-primary/5" : `hover:bg-muted/30 ${extraCls}`}`}>
                      <td className={`px-3 py-2.5 ${stickyCheckboxCls}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)} className="w-4 h-4 accent-primary cursor-pointer" />
                      </td>
                      {visibleColumns.map((col, colIdx) => {
                        const isActive = activeCell?.rowId === row.id && activeCell?.field === col.key;
                        const isEditing = editingCell?.rowId === row.id && editingCell?.field === col.key;
                        const cellEdited = isEdited(row.id, col.key);
                        const inRange = isInRange(row.id, col.key);
                        const value = getCellValue(row, col.key);
                        const validErr = col.validate ? col.validate(value, row) : null;
                        const editableColIdx = editableCols.findIndex((c) => c.key === col.key);
                        return (
                          <td key={col.key}
                            tabIndex={col.editable ? 0 : -1}
                            onFocus={() => setActiveCell({ rowId: row.id, field: col.key })}
                            onMouseDown={(e) => handleCellMouseDown(e, row.id, col.key)}
                            onClick={() => { setActiveCell({ rowId: row.id, field: col.key }); if (canEdit && col.editable) setEditingCell({ rowId: row.id, field: col.key }); }}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, editableColIdx, col)}
                            className={[
                              "px-3 py-2 relative transition-all outline-none",
                              col.align === "end" ? "text-end" : col.align === "center" ? "text-center" : "text-start",
                              canEdit && col.editable ? "cursor-text" : "cursor-default",
                              isActive ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : "",
                              cellEdited && !isActive ? "bg-amber-50/60" : "",
                              inRange && !isActive ? "bg-primary/10" : "",
                              validErr ? "ring-2 ring-inset ring-destructive/60" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            {renderCellInput(row.id, col, value, isEditing, (v) => setCellValue(row.id, col.key, v))}
                            {validErr && <div className="absolute bottom-0 start-0 end-0 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 truncate">{validErr}</div>}
                            {cellEdited && !isEditing && <div className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-amber-500" />}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* New (unsaved) rows */}
                {newRows.map((row, ni) => {
                  const rowId = row._tempId;
                  const editableCols = visibleColumns.filter((c) => c.editable);
                  return (
                    <tr key={rowId} className="border-b bg-emerald-50/50 hover:bg-emerald-50/70 transition-colors">
                      <td className={`px-3 py-2.5 ${stickyCheckboxCls}`}>
                        <button onClick={() => setNewRows((p) => p.filter((r) => r._tempId !== rowId))}
                          className="text-muted-foreground hover:text-destructive transition-colors" title="إزالة">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                      {visibleColumns.map((col, colIdx) => {
                        const isActive = activeCell?.rowId === rowId && activeCell?.field === col.key;
                        const isEditing = editingCell?.rowId === rowId && editingCell?.field === col.key;
                        const value = row[col.key] ?? "";
                        const validErr = col.validate ? col.validate(value, row as unknown as T) : null;
                        const editableColIdx = editableCols.findIndex((c) => c.key === col.key);
                        return (
                          <td key={col.key}
                            tabIndex={col.editable ? 0 : -1}
                            onFocus={() => setActiveCell({ rowId, field: col.key })}
                            onClick={() => { setActiveCell({ rowId, field: col.key }); if (col.editable) setEditingCell({ rowId, field: col.key }); }}
                            onKeyDown={(e) => handleKeyDown(e, displayData.length + ni, editableColIdx, col)}
                            className={[
                              "px-3 py-2 relative transition-all outline-none",
                              col.align === "end" ? "text-end" : col.align === "center" ? "text-center" : "text-start",
                              col.editable ? "cursor-text" : "cursor-default",
                              isActive ? "ring-2 ring-inset ring-emerald-500/60 bg-emerald-50" : "",
                              validErr ? "ring-2 ring-inset ring-destructive/60" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            {renderCellInput(rowId, col, value, isEditing, (v) => setNewRowCell(rowId, col.key, v), true)}
                            {validErr && <div className="absolute bottom-0 start-0 end-0 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 truncate">{validErr}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
        <span>
          {displayData.length !== localData.length
            ? `${displayData.length} من ${localData.length} صف`
            : `${localData.length} صف`}
          {newRows.length > 0 && ` · ${newRows.length} جديد`}
        </span>
        {canEdit && (
          <span className="ms-auto opacity-60">
            انقر للتعديل · Tab للتنقل · Enter للتأكيد · Ctrl+C/V للنسخ
          </span>
        )}
      </div>
    </div>
  );
}

/** Persists grid-view preference across navigation via localStorage */
export function useGridView(storageKey: string): [boolean, () => void] {
  const [isGrid, setIsGrid] = useState<boolean>(() => {
    try { return localStorage.getItem(`gridView:${storageKey}`) === "true"; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setIsGrid((v) => {
      const next = !v;
      try { localStorage.setItem(`gridView:${storageKey}`, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);
  return [isGrid, toggle];
}

export function GridToggle({ isGrid, onToggle }: { isGrid: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={isGrid ? "عرض قائمة" : "عرض شبكة"}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-input hover:bg-accent transition-colors"
    >
      {isGrid ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
      <span className="hidden sm:inline">{isGrid ? "قائمة" : "شبكة"}</span>
    </button>
  );
}
