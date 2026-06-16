import React, { useState, useCallback, useRef, useEffect, KeyboardEvent } from "react";
import { Save, X, Trash2, Copy, ClipboardPaste, LayoutGrid, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ColumnType = "text" | "number" | "boolean" | "select" | "readonly";

export interface GridColumn<T> {
  key: keyof T & string;
  header: string;
  type: ColumnType;
  width?: string;
  editable?: boolean;
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
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  emptyMessage?: string;
  stickyHeader?: boolean;
}

interface CellEdit {
  id: string;
  rowId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface CellPos { rowId: string; field: string }

export function GridTable<T extends { id: string }>({
  rows,
  columns,
  canEdit = false,
  canDelete = false,
  onSave,
  onDeleteRows,
  selectedIds: externalSelected,
  onSelectionChange,
  emptyMessage = "لا توجد بيانات",
  stickyHeader = true,
}: GridTableProps<T>) {
  const { toast } = useToast();

  const [localData, setLocalData] = useState<T[]>(rows);
  const [edits, setEdits] = useState<Map<string, CellEdit>>(new Map());
  const [activeCell, setActiveCell] = useState<CellPos | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const selectedIds = externalSelected ?? internalSelected;
  const setSelectedIds = onSelectionChange ?? setInternalSelected;

  useEffect(() => { setLocalData(rows); }, [rows]);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const editableColumns = columns.filter((c) => c.editable && c.type !== "readonly");

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
      if (String(newValue) === String(oldValue)) { next.delete(key); }
      else { next.set(key, { id: rowId, rowId, field, oldValue, newValue }); }
      return next;
    });
    setLocalData((prev) => prev.map((r) => r.id === rowId ? { ...r, [field]: newValue } : r));
  };

  const handleSave = async () => {
    if (edits.size === 0 || !onSave) return;
    setIsSaving(true);
    try {
      await onSave(Array.from(edits.values()));
      setEdits(new Map());
      toast({ title: "تم حفظ التغييرات" });
    } catch {
      toast({ variant: "destructive", title: "فشل الحفظ", description: "تحقق من البيانات وأعد المحاولة" });
    } finally { setIsSaving(false); }
  };

  const handleDiscard = () => {
    setLocalData(rows);
    setEdits(new Map());
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

  const handleCopy = () => {
    if (!activeCell) return;
    const value = getCellValue(localData.find((r) => r.id === activeCell.rowId)!, activeCell.field);
    navigator.clipboard.writeText(String(value ?? "")).then(() =>
      toast({ title: "تم النسخ" })
    );
  };

  const handlePaste = async () => {
    if (!activeCell || !canEdit) return;
    const col = columns.find((c) => c.key === activeCell.field);
    if (!col?.editable) return;
    const text = await navigator.clipboard.readText();
    setCellValue(activeCell.rowId, activeCell.field, text.trim());
  };

  const moveFocus = (rowIdx: number, colIdx: number, dRow: number, dCol: number) => {
    const editableCols = columns.filter((c) => c.editable);
    const newCol = colIdx + dCol;
    const newRow = rowIdx + dRow;
    if (newRow >= 0 && newRow < localData.length && newCol >= 0 && newCol < editableCols.length) {
      setActiveCell({ rowId: localData[newRow].id, field: editableCols[newCol].key });
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
    }
  };

  const isEdited = (rowId: string, field: string) => edits.has(`${rowId}::${field}`);
  const hasEdits = edits.size > 0;

  const toggleAll = () => {
    if (selectedIds.size === localData.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(localData.map((r) => r.id)));
  };
  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="flex flex-col">
      {(hasEdits || selectedIds.size > 0) && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex-wrap">
          {hasEdits && (
            <>
              <span className="text-sm text-amber-700 font-bold bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1">
                {edits.size} تغيير غير محفوظ
              </span>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
              </button>
              <button
                onClick={handleDiscard}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />تجاهل
              </button>
              <div className="w-px h-5 bg-slate-300 mx-1" />
            </>
          )}
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm font-bold text-slate-700">تم تحديد {selectedIds.size}</span>
              <button onClick={handleCopy} className="flex items-center gap-1.5 text-sm text-slate-600 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
                <Copy className="w-3.5 h-3.5" />نسخ
              </button>
              {canDelete && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isDeleting ? "جارٍ الحذف..." : "حذف المحدد"}
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-400 hover:underline ms-auto">
                إلغاء التحديد
              </button>
            </>
          )}
          {canEdit && activeCell && !hasEdits && selectedIds.size === 0 && (
            <button onClick={handlePaste} className="flex items-center gap-1.5 text-sm text-slate-600 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <ClipboardPaste className="w-3.5 h-3.5" />لصق
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className={stickyHeader ? "sticky top-0 z-10" : ""}>
            <tr className="bg-muted/60 text-muted-foreground text-xs border-b">
              <th className="w-9 px-3 py-3">
                <input
                  type="checkbox"
                  checked={localData.length > 0 && selectedIds.size === localData.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < localData.length; }}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-3 font-bold whitespace-nowrap ${col.align === "end" ? "text-end" : col.align === "center" ? "text-center" : "text-start"}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-16 text-muted-foreground text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              localData.map((row, rowIdx) => {
                const isSelected = selectedIds.has(row.id);
                const editableCols = columns.filter((c) => c.editable);
                return (
                  <tr
                    key={row.id}
                    className={`border-b transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </td>
                    {columns.map((col, colIdx) => {
                      const isActive = activeCell?.rowId === row.id && activeCell?.field === col.key;
                      const isEditing = editingCell?.rowId === row.id && editingCell?.field === col.key;
                      const cellEdited = isEdited(row.id, col.key);
                      const value = getCellValue(row, col.key);
                      const validationError = col.validate ? col.validate(value, row) : null;
                      const editableColIdx = editableCols.findIndex((c) => c.key === col.key);

                      return (
                        <td
                          key={col.key}
                          tabIndex={col.editable ? 0 : -1}
                          onFocus={() => setActiveCell({ rowId: row.id, field: col.key })}
                          onClick={() => {
                            setActiveCell({ rowId: row.id, field: col.key });
                            if (canEdit && col.editable) setEditingCell({ rowId: row.id, field: col.key });
                          }}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, editableColIdx, col)}
                          className={[
                            "px-3 py-2 relative transition-all outline-none",
                            col.align === "end" ? "text-end" : col.align === "center" ? "text-center" : "text-start",
                            canEdit && col.editable ? "cursor-text" : "cursor-default",
                            isActive ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : "",
                            cellEdited ? "bg-amber-50/60" : "",
                            validationError ? "ring-2 ring-inset ring-destructive/60" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          {isEditing && col.editable && col.type !== "readonly" ? (
                            col.type === "select" && col.options ? (
                              <select
                                ref={(el) => { inputRef.current = el; }}
                                value={String(value ?? "")}
                                onChange={(e) => setCellValue(row.id, col.key, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                className="w-full bg-transparent outline-none text-sm font-inherit"
                                autoFocus
                              >
                                {col.options.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            ) : col.type === "boolean" ? (
                              <input
                                ref={(el) => { inputRef.current = el; }}
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(e) => { setCellValue(row.id, col.key, e.target.checked); setEditingCell(null); }}
                                onBlur={() => setEditingCell(null)}
                                className="w-4 h-4 accent-primary cursor-pointer"
                                autoFocus
                              />
                            ) : (
                              <input
                                ref={(el) => { inputRef.current = el; }}
                                type={col.type === "number" ? "number" : "text"}
                                value={String(value ?? "")}
                                onChange={(e) => setCellValue(row.id, col.key, col.type === "number" ? Number(e.target.value) : e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                className="w-full bg-transparent outline-none text-sm min-w-0"
                                autoFocus
                                dir={col.type === "number" ? "ltr" : "auto"}
                              />
                            )
                          ) : (
                            <div className={`truncate max-w-[240px] ${cellEdited ? "font-semibold text-amber-800" : ""}`}>
                              {col.render
                                ? col.render(value, row)
                                : col.type === "boolean"
                                  ? (value ? <span className="text-xs font-bold text-success">✓</span> : <span className="text-xs text-muted-foreground">—</span>)
                                  : col.type === "select" && col.options
                                    ? col.options.find((o) => o.value === String(value))?.label ?? String(value ?? "—")
                                    : String(value ?? "—")}
                            </div>
                          )}
                          {validationError && (
                            <div className="absolute bottom-0 start-0 end-0 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 truncate">
                              {validationError}
                            </div>
                          )}
                          {cellEdited && !isEditing && (
                            <div className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground flex items-center gap-4">
          <span>انقر للتعديل · Tab/Arrows للتنقل · Enter للتأكيد · Esc للإلغاء</span>
        </div>
      )}
    </div>
  );
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
