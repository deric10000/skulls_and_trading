import { useMemo, useState } from "react";
import { CATEGORY_META } from "../../lib/forge/metrics";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  CaretDown,
  CaretUpDown,
  Copy,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "../../lib/icons";
import type { RuleCategory, RuleChip, RuleTag } from "../../types";

// ---------------------------------------------------------------------------
// Tags table modal (per the Figma tag-table designs). One reusable component
// serves every category: Thesis / Technical Setup / Risk Rule / Position /
// Trade / Timeframe Tags. Edits are DRAFTED locally; Cancel discards, Update
// commits the whole tag set for the category back to the strategy.
//
// Columns: TAG · PURPOSE · RULE CHIPS · WEIGHT · SUGGESTED AUTO-APPLY LOGIC ·
// ACTIONS. The built-in "All Active Chips" system tag is duplicate-only.
// Custom tag weights should total 100%. Rows toggle into an edit mode (pencil)
// where label/purpose/weight/auto-apply are inputs and member chips are
// toggleable pills. On mobile the rows reflow into stacked cards.
// ---------------------------------------------------------------------------

type SortKey = "label" | "purpose" | "weightPct" | "autoApply";

let tagIdCounter = 0;
function nextTagId(): string {
  tagIdCounter += 1;
  return `tag-${Date.now()}-${tagIdCounter}`;
}

export function TagsTableModal({
  category,
  tags,
  chips,
  onSave,
  onClose,
}: {
  category: RuleCategory;
  /** The strategy's current tags for this category (draft source). */
  tags: RuleTag[];
  /** The category's rule chips — the pickable tag members. */
  chips: RuleChip[];
  onSave: (tags: RuleTag[]) => void;
  onClose: () => void;
}) {
  const meta = CATEGORY_META[category];
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<RuleTag[]>(() =>
    tags.map((tag) => ({ ...tag, chipIds: [...tag.chipIds] })),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  // Mobile only: rows collapse to a compact one-line summary by default (see
  // components.mdc "Collapsible mobile row standard") — desktop/tablet always
  // show full fields regardless of this state.
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  function toggleRowExpanded(id: string) {
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chipById = useMemo(
    () => new Map(chips.map((chip) => [chip.id, chip])),
    [chips],
  );

  const customTotal = Math.round(
    draft
      .filter((tag) => !tag.system)
      .reduce((sum, tag) => sum + (tag.weightPct || 0), 0),
  );

  const sorted = useMemo(() => {
    // The system tag always leads, like the design.
    const system = draft.filter((tag) => tag.system);
    const custom = draft.filter((tag) => !tag.system);
    if (!sort) return [...system, ...custom];
    const value = (tag: RuleTag): string | number =>
      sort.key === "weightPct" ? tag.weightPct : String(tag[sort.key]).toLowerCase();
    const compare = (a: RuleTag, b: RuleTag) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * sort.dir;
      }
      return String(av).localeCompare(String(bv)) * sort.dir;
    };
    return [...system, ...custom.sort(compare)];
  }, [draft, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : { key, dir: 1 },
    );
  }

  function patchTag(id: string, patch: Partial<RuleTag>) {
    setDraft((current) =>
      current.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)),
    );
  }

  function toggleChipMembership(tagId: string, chipId: string) {
    setDraft((current) =>
      current.map((tag) => {
        if (tag.id !== tagId) return tag;
        const has = tag.chipIds.includes(chipId);
        return {
          ...tag,
          chipIds: has
            ? tag.chipIds.filter((id) => id !== chipId)
            : [...tag.chipIds, chipId],
        };
      }),
    );
  }

  function addTag() {
    const tag: RuleTag = {
      id: nextTagId(),
      label: "New Tag",
      category,
      purpose: "",
      chipIds: [],
      weightPct: 0,
      autoApply: "",
    };
    setDraft((current) => [tag, ...current]);
    setEditingId(tag.id);
  }

  function duplicateTag(id: string) {
    setDraft((current) => {
      const source = current.find((tag) => tag.id === id);
      if (!source) return current;
      const copy: RuleTag = {
        ...source,
        id: nextTagId(),
        label: source.system ? "All Active Chips (Copy)" : `${source.label} (Copy)`,
        chipIds: source.system
          ? chips.map((chip) => chip.id) // materialize the full set
          : [...source.chipIds],
        weightPct: source.system ? 0 : source.weightPct,
        system: false,
      };
      return [copy, ...current];
    });
  }

  function deleteTag(id: string) {
    setDraft((current) => current.filter((tag) => tag.id !== id));
    if (editingId === id) setEditingId(null);
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: "label", label: "Tag" },
    { key: "purpose", label: "Purpose" },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card panel forge-table-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-table-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forge-table-head">
          <h2 id="tag-table-title">{meta.tagModalTitle}</h2>
          <button
            type="button"
            className="forge-table-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>

        <div className="forge-table-intro">
          <p>{meta.tagModalIntro}</p>
          <button type="button" className="btn btn--small" onClick={addTag}>
            <Plus aria-hidden weight="regular" /> Add Tag
          </button>
        </div>

        <div className="forge-table forge-table--tags" role="table" aria-label={meta.tagModalTitle}>
          <div className="forge-table-row forge-table-row--head" role="row">
            {headers.map((header) => (
              <button
                key={header.key}
                type="button"
                role="columnheader"
                className="forge-table-th"
                onClick={() => toggleSort(header.key)}
              >
                {header.label}
                <CaretUpDown aria-hidden weight="regular" />
              </button>
            ))}
            <span className="forge-table-th forge-table-th--static" role="columnheader">
              Rule Chips
            </span>
            <button
              type="button"
              role="columnheader"
              className="forge-table-th"
              onClick={() => toggleSort("weightPct")}
            >
              Weight
              <CaretUpDown aria-hidden weight="regular" />
            </button>
            <span className="forge-table-th forge-table-th--static" role="columnheader">
              Suggested Auto-Apply Logic
            </span>
            <span className="forge-table-th forge-table-th--static" role="columnheader">
              Actions
            </span>
          </div>

          {sorted.map((tag) => {
            const editing = editingId === tag.id && !tag.system;
            const isExpanded = expandedRowIds.has(tag.id);
            const showCompact = isMobile && !isExpanded;
            return (
              <div
                key={tag.id}
                className={
                  showCompact ? "forge-table-row forge-table-row--collapsed" : "forge-table-row"
                }
                role="row"
              >
                {showCompact ? (
                  <button
                    type="button"
                    className="chip-search-option forge-row-summary"
                    onClick={() => toggleRowExpanded(tag.id)}
                    aria-expanded={false}
                  >
                    <span className="chip-search-option-label">{tag.label}</span>
                    <span className="chip-search-option-desc">{tag.purpose}</span>
                    <CaretDown className="forge-row-caret" aria-hidden weight="bold" />
                  </button>
                ) : (
                  <>
                  {isMobile ? (
                    <button
                      type="button"
                      className="chip-search-option forge-row-summary is-expanded"
                      onClick={() => toggleRowExpanded(tag.id)}
                      aria-expanded={true}
                    >
                      <span className="chip-search-option-label">{tag.label}</span>
                      <span className="chip-search-option-desc">{tag.purpose}</span>
                      <CaretDown
                        className="forge-row-caret forge-row-caret--up"
                        aria-hidden
                        weight="bold"
                      />
                    </button>
                  ) : null}
                  <div className="forge-table-cell" role="cell" data-label="Tag">
                    {editing ? (
                      <input
                        className="input forge-cell-input forge-cell-input--pill"
                        value={tag.label}
                        aria-label="Tag label"
                        onChange={(event) => patchTag(tag.id, { label: event.target.value })}
                      />
                    ) : (
                      <span className={tag.system ? "forge-pill forge-pill--muted" : "forge-pill"}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                  <div className="forge-table-cell" role="cell" data-label="Purpose">
                    {editing ? (
                      <textarea
                        className="input forge-cell-input forge-cell-area"
                        rows={2}
                        value={tag.purpose}
                        aria-label="Tag purpose"
                        onChange={(event) => patchTag(tag.id, { purpose: event.target.value })}
                      />
                    ) : (
                      <span className="forge-cell-text">{tag.purpose}</span>
                    )}
                  </div>
                  <div className="forge-table-cell" role="cell" data-label="Rule Chips">
                    {tag.system ? (
                      <span className="forge-cell-text forge-cell-text--muted">
                        All active rule chips
                      </span>
                    ) : editing ? (
                      <span className="forge-tag-picker">
                        {chips.map((chip) => {
                          const on = tag.chipIds.includes(chip.id);
                          return (
                            <button
                              key={chip.id}
                              type="button"
                              className={on ? "forge-pill forge-pill--toggle forge-pill--on" : "forge-pill forge-pill--toggle"}
                              aria-pressed={on}
                              onClick={() => toggleChipMembership(tag.id, chip.id)}
                            >
                              {chip.label}
                            </button>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="forge-pill-stack">
                        {tag.chipIds
                          .map((chipId) => chipById.get(chipId))
                          .filter((chip): chip is RuleChip => Boolean(chip))
                          .map((chip) => (
                            <span key={chip.id} className="forge-pill">
                              {chip.label}
                            </span>
                          ))}
                      </span>
                    )}
                  </div>
                  <div className="forge-table-cell" role="cell" data-label="Weight">
                    {editing ? (
                      <span className="forge-cell-value">
                        <input
                          className="input forge-cell-input forge-cell-input--num forge-cell-input--weight"
                          type="number"
                          min={0}
                          max={100}
                          value={tag.weightPct}
                          aria-label="Tag weight percent"
                          onChange={(event) =>
                            patchTag(tag.id, { weightPct: Number(event.target.value) })
                          }
                        />
                        <span className="forge-cell-unit forge-cell-unit--weight">%</span>
                      </span>
                    ) : (
                      <span className="forge-cell-weight">{tag.weightPct}%</span>
                    )}
                  </div>
                  <div className="forge-table-cell" role="cell" data-label="Suggested Auto-Apply Logic">
                    {editing ? (
                      <textarea
                        className="input forge-cell-input forge-cell-area"
                        rows={2}
                        value={tag.autoApply}
                        aria-label="Suggested auto-apply logic"
                        onChange={(event) => patchTag(tag.id, { autoApply: event.target.value })}
                      />
                    ) : (
                      <span className="forge-cell-text forge-cell-text--muted">{tag.autoApply}</span>
                    )}
                  </div>
                  <div className="forge-table-cell forge-table-cell--actions" role="cell" data-label="Actions">
                    {!tag.system ? (
                      <button
                        type="button"
                        className={editing ? "icon-btn icon-btn--blue icon-btn--active" : "icon-btn icon-btn--blue"}
                        onClick={() => setEditingId(editing ? null : tag.id)}
                        aria-label={editing ? `Done editing ${tag.label}` : `Edit ${tag.label}`}
                        aria-pressed={editing}
                      >
                        <PencilSimple aria-hidden weight="regular" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn icon-btn--blue"
                      onClick={() => duplicateTag(tag.id)}
                      aria-label={`Duplicate ${tag.label}`}
                    >
                      <Copy aria-hidden weight="regular" />
                    </button>
                    {!tag.system ? (
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        onClick={() => deleteTag(tag.id)}
                        aria-label={`Delete ${tag.label}`}
                      >
                        <Trash aria-hidden weight="regular" />
                      </button>
                    ) : null}
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div
          className={
            customTotal === 100
              ? "forge-table-total"
              : "forge-table-total forge-table-total--warn"
          }
        >
          <span>Total</span>
          <span className="forge-table-total-val">{customTotal}%</span>
        </div>
        {customTotal !== 100 ? (
          <p className="forge-table-caution" role="status">
            Tag weights should total 100% — currently {customTotal}%.
          </p>
        ) : null}

        <div className="forge-table-actions">
          <button
            type="button"
            className="btn btn--small btn--link forge-cancel-btn"
            onClick={onClose}
          >
            <X aria-hidden weight="bold" /> Cancel
          </button>
          <button
            type="button"
            className="btn btn--small btn--solid"
            onClick={() => onSave(draft)}
          >
            <Plus aria-hidden weight="regular" /> Update
          </button>
        </div>
      </div>
    </div>
  );
}
