/**
 * 表格渲染扩展
 * - 整个表格渲染为 HTML 表格样式
 * - 光标所在行显示 Markdown 源码可编辑
 * - 其他行保持渲染样式
 */

import { Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

export function tableExtension(): Extension {
  return [tableDecorationPlugin, tableTheme];
}

interface TableInfo {
  lines: TableLineInfo[];
  alignments: ("left" | "center" | "right" | "default")[];
  columnCount: number;
}

interface TableLineInfo {
  lineNumber: number;
  from: number;
  to: number;
  text: string;
  type: "header" | "separator" | "body";
  cells: CellInfo[];
}

interface CellInfo {
  content: string;
  from: number;
  to: number;
  columnIndex: number;
}

function parseAlignment(separator: string): ("left" | "center" | "right" | "default")[] {
  const cells = separator.split("|").filter((c) => c.trim() || c.includes("-"));
  return cells
    .filter((c) => c.includes("-"))
    .map((cell) => {
      const trimmed = cell.trim();
      const hasLeft = trimmed.startsWith(":");
      const hasRight = trimmed.endsWith(":");
      if (hasLeft && hasRight) return "center";
      if (hasLeft) return "left";
      if (hasRight) return "right";
      return "default";
    });
}

function isTableSeparator(text: string): boolean {
  return /^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(text.trim());
}

function isTableRow(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes("|") && /\|.+\|/.test(trimmed);
}

function parseCells(text: string, lineFrom: number): CellInfo[] {
  const cells: CellInfo[] = [];
  let columnIndex = 0;
  let inCell = false;
  let cellStart = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|") {
      if (inCell) {
        const rawContent = text.substring(cellStart, i);
        cells.push({
          content: rawContent.trim(),
          from: lineFrom + cellStart,
          to: lineFrom + i,
          columnIndex: columnIndex,
        });
        columnIndex++;
      }
      inCell = true;
      cellStart = i + 1;
    }
  }

  return cells;
}

function findTables(view: EditorView): TableInfo[] {
  const tables: TableInfo[] = [];
  const { doc } = view.state;
  let currentTable: TableInfo | null = null;
  let tempLines: TableLineInfo[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (isTableRow(text)) {
      if (isTableSeparator(text)) {
        if (tempLines.length > 0) {
          tempLines.push({
            lineNumber: i,
            from: line.from,
            to: line.to,
            text: text,
            type: "separator",
            cells: [],
          });

          currentTable = {
            lines: tempLines,
            alignments: parseAlignment(text),
            columnCount: Math.max(...tempLines.map((l) => l.cells.length), 0),
          };
        }
      } else {
        const cells = parseCells(text, line.from);
        const type = currentTable ? "body" : "header";

        const lineInfo: TableLineInfo = {
          lineNumber: i,
          from: line.from,
          to: line.to,
          text: text,
          type: type,
          cells: cells,
        };

        if (currentTable) {
          currentTable.lines.push(lineInfo);
          currentTable.columnCount = Math.max(currentTable.columnCount, cells.length);
        } else {
          tempLines.push(lineInfo);
        }
      }
    } else {
      if (currentTable && currentTable.lines.length >= 2) {
        tables.push(currentTable);
      }
      currentTable = null;
      tempLines = [];
    }
  }

  if (currentTable && currentTable.lines.length >= 2) {
    tables.push(currentTable);
  }

  return tables;
}

// ============ Widgets ============

/**
 * 分隔行 Widget（完全隐藏）
 */
class SeparatorWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-table-separator-hidden";
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * 渲染行 Widget - 将整行渲染为表格行样式
 */
class TableRowWidget extends WidgetType {
  constructor(
    readonly cells: CellInfo[],
    readonly alignments: ("left" | "center" | "right" | "default")[],
    readonly columnCount: number,
    readonly isHeader: boolean,
    readonly lineFrom: number,
    readonly view: EditorView
  ) {
    super();
  }

  eq(other: TableRowWidget) {
    return (
      this.lineFrom === other.lineFrom &&
      this.cells.length === other.cells.length &&
      this.cells.every((c, i) => c.content === other.cells[i]?.content)
    );
  }

  toDOM() {
    const row = document.createElement("div");
    row.className = "cm-table-row-widget";
    if (this.isHeader) {
      row.classList.add("cm-table-row-header");
    }

    // 创建单元格
    for (let i = 0; i < this.columnCount; i++) {
      const cell = this.cells[i];
      const cellEl = document.createElement("span");
      cellEl.className = "cm-table-cell-widget";

      if (i < this.columnCount - 1) {
        cellEl.classList.add("cm-table-cell-border");
      }

      // 对齐
      const alignment = this.alignments[i] || "default";
      if (alignment === "center") {
        cellEl.style.textAlign = "center";
        cellEl.style.justifyContent = "center";
      } else if (alignment === "right") {
        cellEl.style.textAlign = "right";
        cellEl.style.justifyContent = "flex-end";
      }

      cellEl.textContent = cell?.content || "";

      // 点击单元格定位到该行
      cellEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (cell) {
          const rect = cellEl.getBoundingClientRect();
          const clickX = (e as MouseEvent).clientX - rect.left;
          const text = cell.content;
          const charWidth = text.length > 0 ? rect.width / text.length : rect.width;
          const charIndex = Math.min(Math.max(0, Math.floor(clickX / charWidth)), text.length);
          const targetPos = cell.from + charIndex;
          this.view.dispatch({
            selection: { anchor: targetPos },
          });
        } else {
          this.view.dispatch({
            selection: { anchor: this.lineFrom },
          });
        }
        this.view.focus();
      });

      row.appendChild(cellEl);
    }

    return row;
  }

  ignoreEvent() {
    return false;
  }
}

// ============ Plugin ============

const tableDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    constructor(public view: EditorView) {
      this.buildDecorations();
    }

    buildDecorations() {
      const builder = new RangeSetBuilder<Decoration>();
      const tables = findTables(this.view);
      const decorations: { from: number; to: number; deco: Decoration }[] = [];

      // 获取光标所在行
      const cursorPos = this.view.state.selection.main.head;
      const cursorLine = this.view.state.doc.lineAt(cursorPos);

      for (const table of tables) {
        for (let lineIdx = 0; lineIdx < table.lines.length; lineIdx++) {
          const line = table.lines[lineIdx];
          const isFirstLine = lineIdx === 0;
          const isLastLine = lineIdx === table.lines.length - 1;
          const isCursorLine = cursorLine.from === line.from;

          // ========== 分隔行：完全隐藏 ==========
          if (line.type === "separator") {
            decorations.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({
                attributes: { class: "cm-table-separator-line" },
              }),
            });
            decorations.push({
              from: line.from,
              to: line.to,
              deco: Decoration.replace({ widget: new SeparatorWidget() }),
            });
            continue;
          }

          // ========== 光标所在行：显示源码（只添加行样式，不替换内容）==========
          if (isCursorLine) {
            let lineClass = "cm-table-source-line";
            if (line.type === "header") lineClass += " cm-table-source-header";
            if (isFirstLine) lineClass += " cm-table-first-line";
            if (isLastLine) lineClass += " cm-table-last-line";

            decorations.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({
                attributes: { class: lineClass },
              }),
            });
            // 不替换内容，保持可编辑
            continue;
          }

          // ========== 其他行：渲染为表格样式 ==========
          let lineClass = "cm-table-rendered-line";
          if (line.type === "header") lineClass += " cm-table-rendered-header";
          if (isFirstLine) lineClass += " cm-table-first-line";
          if (isLastLine) lineClass += " cm-table-last-line";

          decorations.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({
              attributes: { class: lineClass },
            }),
          });

          // 用 Widget 替换整行内容
          decorations.push({
            from: line.from,
            to: line.to,
            deco: Decoration.replace({
              widget: new TableRowWidget(
                line.cells,
                table.alignments,
                table.columnCount,
                line.type === "header",
                line.from,
                this.view
              ),
            }),
          });
        }
      }

      // 按位置排序
      decorations.sort((a, b) => a.from - b.from || a.to - b.to);

      for (const { from, to, deco } of decorations) {
        builder.add(from, to, deco);
      }

      this.decorations = builder.finish();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.buildDecorations();
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// ============ Theme ============

const tableTheme = EditorView.baseTheme({
  // 分隔行（完全隐藏 - 包括 cm-line 容器）
  ".cm-line.cm-table-separator-line": {
    display: "none !important",
    height: "0 !important",
    minHeight: "0 !important",
    padding: "0 !important",
    margin: "0 !important",
    lineHeight: "0 !important",
    fontSize: "0 !important",
    overflow: "hidden !important",
  },
  ".cm-table-separator-hidden": {
    display: "none !important",
  },

  // ========== 源码行（光标所在行）==========
  ".cm-line.cm-table-source-line": {
    backgroundColor: "rgba(59, 130, 246, 0.08) !important",
    borderLeft: "1px solid var(--border, #e0e0e0)",
    borderRight: "1px solid var(--border, #e0e0e0)",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: "0.9em",
    padding: "0.2em 0.5em !important",
  },
  ".cm-line.cm-table-source-header": {
    fontWeight: "600",
  },
  ".cm-line.cm-table-source-line.cm-table-first-line": {
    borderTop: "1px solid var(--border, #e0e0e0)",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
    marginTop: "0.5em",
  },
  ".cm-line.cm-table-source-line.cm-table-last-line": {
    borderBottom: "1px solid var(--border, #e0e0e0)",
    borderBottomLeftRadius: "4px",
    borderBottomRightRadius: "4px",
    marginBottom: "0.5em",
  },

  // ========== 渲染行 ==========
  ".cm-line.cm-table-rendered-line": {
    borderLeft: "1px solid var(--border, #e0e0e0)",
    borderRight: "1px solid var(--border, #e0e0e0)",
    borderBottom: "1px solid var(--border, #e0e0e0)",
    padding: "0 !important",
    minHeight: "unset !important",
    height: "auto !important",
    lineHeight: "1.4 !important",
  },
  // 隐藏渲染行中的 widgetBuffer（导致额外高度）
  ".cm-line.cm-table-rendered-line > img.cm-widgetBuffer": {
    display: "none !important",
    height: "0 !important",
    width: "0 !important",
  },
  ".cm-line.cm-table-rendered-header": {
    backgroundColor: "var(--muted, rgba(0,0,0,0.04))",
    borderBottom: "2px solid var(--border, #e0e0e0)",
  },
  ".cm-line.cm-table-rendered-line.cm-table-first-line": {
    borderTop: "1px solid var(--border, #e0e0e0)",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
    marginTop: "0.5em",
  },
  ".cm-line.cm-table-rendered-line.cm-table-last-line": {
    borderBottomLeftRadius: "4px",
    borderBottomRightRadius: "4px",
    marginBottom: "0.5em",
  },

  // ========== 行 Widget ==========
  ".cm-table-row-widget": {
    display: "flex",
    alignItems: "center",
    width: "100%",
    lineHeight: "1.4",
  },
  ".cm-table-row-header": {
    fontWeight: "600",
  },

  // ========== 单元格 Widget ==========
  ".cm-table-cell-widget": {
    display: "inline-flex",
    alignItems: "center",
    flex: "1 1 0",
    padding: "0.2em 0.5em",
    minWidth: "50px",
    cursor: "text",
    lineHeight: "1.4",
  },
  ".cm-table-cell-border": {
    borderRight: "1px solid var(--border, #e0e0e0)",
  },

  // 悬停效果
  ".cm-line.cm-table-rendered-line:not(.cm-table-rendered-header):hover": {
    backgroundColor: "var(--accent, rgba(0,0,0,0.02))",
  },
});
