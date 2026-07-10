/**
 * Reusable, client-side data grid.
 *
 * The grid owns display state only. Callers retain ownership of the data and
 * may update it through setRows() or setLoading().
 */
import { Storage } from "../storage.js";

const EMPTY_SORT = { key: null, direction: "desc" };

export class DataGrid {
  constructor({
    columns = [],
    rows = [],
    storageKey = null,
    loading = false,
    loadingMessage = "Loading...",
    emptyMessage = "No data available.",
    onRowClick = null,
  } = {}) {
    this.columns = [...columns];
    this.rows = [...rows];
    this.storageKey = storageKey;
    this.loading = loading;
    this.loadingMessage = loadingMessage;
    this.emptyMessage = emptyMessage;
    this.onRowClick = onRowClick;
    this.sort = this.loadSort();

    this.element = document.createElement("table");
    this.element.className = "tct-data-grid";
    this.render();
  }

  setRows(rows = []) {
    this.rows = [...rows];
    this.render();
  }

  setLoading(loading, message = this.loadingMessage) {
    this.loading = loading;
    this.loadingMessage = message;
    this.render();
  }

  loadSort() {
    const saved = this.storageKey ? Storage.load(this.storageKey, null) : null;

    if (this.isSortableColumn(saved?.key) && this.isDirection(saved.direction)) {
      return saved;
    }

    const defaultColumn =
      this.columns.find((column) => column.defaultSort && this.isSortableColumn(column.key)) ||
      this.columns.find((column) => this.isSortableColumn(column.key));

    return defaultColumn
      ? { key: defaultColumn.key, direction: "desc" }
      : { ...EMPTY_SORT };
  }

  persistSort() {
    if (this.storageKey) {
      Storage.save(this.storageKey, this.sort);
    }
  }

  isSortableColumn(key) {
    return this.columns.some((column) => column.key === key && column.sortable !== false);
  }

  isDirection(direction) {
    return direction === "asc" || direction === "desc";
  }

  setSort(key) {
    if (!this.isSortableColumn(key)) return;

    this.sort = {
      key,
      direction:
        this.sort.key === key && this.sort.direction === "desc" ? "asc" : "desc",
    };
    this.persistSort();
    this.render();
  }

  sortedRows() {
    const column = this.columns.find((candidate) => candidate.key === this.sort.key);
    if (!column) return [...this.rows];

    return this.rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const comparison = this.compareValues(
          this.valueFor(left.row, column),
          this.valueFor(right.row, column),
          column.type,
        );
        const directionalComparison =
          this.sort.direction === "desc" ? -comparison : comparison;

        return directionalComparison || left.index - right.index;
      })
      .map(({ row }) => row);
  }

  valueFor(row, column) {
    return typeof column.value === "function" ? column.value(row) : row[column.key];
  }

  compareValues(left, right, type) {
    const leftEmpty = left === null || left === undefined || left === "";
    const rightEmpty = right === null || right === undefined || right === "";
    if (leftEmpty || rightEmpty) {
      if (leftEmpty && rightEmpty) return 0;
      return leftEmpty ? 1 : -1;
    }

    if (type === "number") {
      const numericComparison = Number(left) - Number(right);
      if (!Number.isNaN(numericComparison)) return numericComparison;
    }

    return String(left).localeCompare(String(right), undefined, { numeric: true });
  }

  render() {
    this.element.replaceChildren(this.createHeader(), this.createBody());
  }

  createHeader() {
    const thead = document.createElement("thead");
    const row = document.createElement("tr");

    this.columns.forEach((column) => {
      const header = document.createElement("th");
      const sortable = column.sortable !== false;

      if (!sortable) {
        header.textContent = column.label;
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tct-data-grid__sort-button";
        button.textContent = column.label;
        header.setAttribute(
          "aria-sort",
          this.sort.key === column.key
            ? this.sort.direction === "desc"
              ? "descending"
              : "ascending"
            : "none",
        );
        button.addEventListener("click", () => this.setSort(column.key));

        if (this.sort.key === column.key) {
          const indicator = document.createElement("span");
          indicator.className = "tct-data-grid__sort-indicator";
          indicator.setAttribute("aria-hidden", "true");
          indicator.textContent = this.sort.direction === "desc" ? "\u25BC" : "\u25B2";
          button.append(" ", indicator);
        }

        header.appendChild(button);
      }

      if (column.type === "number") header.classList.add("tct-data-grid__number");
      row.appendChild(header);
    });

    thead.appendChild(row);
    return thead;
  }

  createBody() {
    const tbody = document.createElement("tbody");

    if (this.loading || this.rows.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.className = "tct-data-grid__state";
      cell.colSpan = Math.max(this.columns.length, 1);
      cell.textContent = this.loading ? this.loadingMessage : this.emptyMessage;
      row.appendChild(cell);
      tbody.appendChild(row);
      return tbody;
    }

    this.sortedRows().forEach((data, index) => {
      const row = document.createElement("tr");

      if (this.onRowClick) {
        row.classList.add("tct-data-grid__row--clickable");
        row.tabIndex = 0;
        row.addEventListener("click", () => this.onRowClick(data, index));
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.onRowClick(data, index);
          }
        });
      }

      this.columns.forEach((column) => {
        const cell = document.createElement("td");
        const value = this.valueFor(data, column);
        const displayValue = column.format ? column.format(value, data) : value;
        cell.textContent = displayValue ?? "";
        if (column.type === "number") cell.classList.add("tct-data-grid__number");
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    return tbody;
  }
}
