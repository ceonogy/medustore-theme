import { useEffect, useId, useRef, useState } from "react";

export interface ThemeSelectOption {
  value: string;
  label: string;
}

interface ThemeSelectProps {
  value: string;
  placeholder: string;
  options: ThemeSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Stable hook for tests / automation. */
  testId?: string;
}

/**
 * A themed, minimalist replacement for the native <select>.
 *
 * Paper panel, hairline border, muted chevron with breathing room on
 * the right, pointer cursors on both trigger and rows. Matches the
 * design-system tokens (ink/paper/fog/line) so it can be dropped into
 * any section — checkout, filters, lookbook — without restyling.
 *
 * Keyboard: Enter/Space/ArrowDown open, ArrowUp/Down move the
 * highlight, Enter/Space pick, Escape closes and returns focus.
 */
export const ThemeSelect = ({
  value,
  placeholder,
  options,
  onChange,
  disabled,
  invalid,
  testId,
}: ThemeSelectProps) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? (value || "");

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const row = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return; // handled globally
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (activeIndex >= 0) pick(options[activeIndex].value);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`relative flex w-full cursor-pointer items-center justify-between rounded-lg border bg-paper py-3 pl-4 pr-11 text-left text-sm transition-colors ${
          invalid ? "border-sale" : "border-line"
        } ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-muted hover:bg-fog"
        }`}
      >
        <span className={`truncate ${label ? "text-ink" : "text-muted"}`}>
          {label || placeholder}
        </span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`absolute right-4 h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-lg border border-line bg-paper py-1 shadow-[0_16px_40px_rgba(17,17,17,0.12)]"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setActiveIndex(i)}
              onClick={() => pick(o.value)}
              className={`cursor-pointer px-4 py-2.5 text-sm transition-colors ${
                i === activeIndex ? "bg-fog" : ""
              } ${o.value === value ? "text-ink" : "text-ink/80"}`}
            >
              {o.label}
            </li>
          ))}
          {!options.length && (
            <li className="px-4 py-2.5 text-sm text-muted">{placeholder}</li>
          )}
        </ul>
      )}
    </div>
  );
};
