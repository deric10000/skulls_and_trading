import { useEffect, useState, type Ref } from "react";
import { MagnifyingGlass, Plus } from "../../lib/icons";

export interface CurrentWatchTickerOption {
  symbol: string;
  name: string;
}

export interface CurrentWatchTickerSearchProps {
  id: string;
  label: string;
  value: string;
  suggestions: CurrentWatchTickerOption[];
  search?: (query: string) => Promise<CurrentWatchTickerOption[]>;
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  onValueChange: (value: string) => void;
  onSelect: (symbol: string) => void;
  onSubmit?: (symbol: string) => void;
  onAction?: (symbol: string) => void;
}

export function CurrentWatchTickerSearch({
  id,
  label,
  value,
  suggestions,
  search,
  inputRef,
  maxLength = 10,
  onValueChange,
  onSelect,
  onSubmit,
  onAction,
}: CurrentWatchTickerSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<CurrentWatchTickerOption[]>(
    [],
  );

  useEffect(() => {
    if (!search || value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void search(value).then((results) => {
        if (!cancelled) setSearchResults(results);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [search, value]);

  const visibleSuggestions = [...suggestions, ...searchResults].filter(
    (option, index, options) =>
      options.findIndex((candidate) => candidate.symbol === option.symbol) ===
      index,
  );

  return (
    <div
      className="portfolio-field portfolio-ticker-lookup"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <div className="chip-search-field">
        <MagnifyingGlass
          className="chip-search-icon"
          aria-hidden
          weight="regular"
        />
        <input
          ref={inputRef}
          id={id}
          className="input chip-search-input"
          placeholder="Search ticker…"
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && visibleSuggestions.length > 0}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onValueChange(event.target.value.toUpperCase());
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setOpen(false);
              onSubmit?.(value);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && visibleSuggestions.length > 0 ? (
        <ul
          className="multiselect-menu portfolio-ticker-suggestions"
          role="listbox"
        >
          {visibleSuggestions.map((hit) => (
            <li key={hit.symbol} className="portfolio-ticker-suggestion">
              <button
                type="button"
                className="multiselect-option"
                role="option"
                aria-selected={hit.symbol === value}
                onClick={() => {
                  setOpen(false);
                  onSelect(hit.symbol);
                }}
              >
                <span className="portfolio-ticker-symbol">{hit.symbol}</span>
                <span className="portfolio-ticker-name">{hit.name}</span>
              </button>
              {onAction ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Add ${hit.symbol}`}
                  onClick={() => {
                    setOpen(false);
                    onAction(hit.symbol);
                  }}
                >
                  <Plus aria-hidden weight="regular" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
