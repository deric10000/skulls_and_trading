import { Fragment, useMemo, useState, type ReactNode } from "react";
import { MagnifyingGlass } from "../lib/icons";
import type { RuleChip } from "../types";

export interface ChipSearchOption {
  id: string;
  chip: RuleChip;
  /** Plain-English condition, e.g. "is at least 3%" (see formatChipCondition). */
  description: string;
  /** Small trailing tag, e.g. the source strategy name for a system chip. */
  meta?: string;
}

export interface ChipSearchGroup {
  /** Group header — the underlying data point's label (e.g. "Revenue Growth YoY"). */
  heading: string;
  options: ChipSearchOption[];
}

/**
 * A searchable, grouped, single-select chip list — the "Add Rule" picker's
 * System Defaults / My Chips panes. Unlike `MultiSelect`/`Dropdown` (compact
 * field triggers that open a popover), this renders always-expanded inline
 * content: a search field + a scrollable grouped listbox. Reuses the app's
 * `.input` field styling for the search box and the `MultiSelect` menu's
 * list-item conventions (hover surface, radius-sm rows) for consistency.
 */
export function ChipSearchList({
  id,
  label,
  groups,
  onSelect,
  placeholder = "Search…",
  emptyMessage = "Nothing here yet.",
  renderExtra,
}: {
  id: string;
  /** Accessible name for the search input + listbox. */
  label: string;
  groups: ChipSearchGroup[];
  onSelect: (chip: RuleChip) => void;
  placeholder?: string;
  /** Shown when `groups` has no options at all (not a search-filter result). */
  emptyMessage?: string;
  /** Optional per-option trailing content (e.g. edit/delete icon buttons). */
  renderExtra?: (option: ChipSearchOption) => ReactNode;
}) {
  const [query, setQuery] = useState("");

  const isEmpty = groups.every((group) => group.options.length === 0);

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        heading: group.heading,
        options: group.options.filter((option) =>
          [group.heading, option.chip.label, option.description, option.meta]
            .filter(Boolean)
            .some((text) => text!.toLowerCase().includes(needle)),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  return (
    <div className="chip-search">
      <div className="chip-search-field">
        <MagnifyingGlass className="chip-search-icon" aria-hidden weight="regular" />
        <label className="visually-hidden" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          type="search"
          className="input chip-search-input"
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          disabled={isEmpty}
        />
      </div>

      <ul className="chip-search-list" role="listbox" aria-label={label}>
        {filteredGroups.map((group) => (
          <Fragment key={group.heading}>
            <li className="chip-search-group-head" role="presentation">
              {group.heading}
            </li>
            {group.options.map((option) => (
              <li key={option.id} className="chip-search-row">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="chip-search-option"
                  onClick={() => onSelect(option.chip)}
                >
                  <span className="chip-search-option-label">{option.chip.label}</span>
                  <span className="chip-search-option-desc">{option.description}</span>
                  {option.meta ? (
                    <span className="chip-search-option-meta">{option.meta}</span>
                  ) : null}
                </button>
                {renderExtra ? renderExtra(option) : null}
              </li>
            ))}
          </Fragment>
        ))}
        {filteredGroups.length === 0 ? (
          <li className="chip-search-empty">
            {isEmpty ? emptyMessage : `No chips match "${query.trim()}".`}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
