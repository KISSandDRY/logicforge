import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface Win95DropdownOption {
  value: string;
  label: string;
  group?: string;
}

export interface Win95DropdownProps {
  id?: string;
  ariaLabel: string;
  value: string;
  options: Win95DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  testId?: string;
  className?: string;
}

/**
 * Кастомний випадаючий список Windows 95 з 2px 3D-рамками без скруглень,
 * квадратною кнопкою зі стрілкою ▼ та синьою прямокутною смугою виділення (#000080).
 * Використовує portal у document.body, щоб меню ніколи не обрізалося панелями зі скролом.
 */
export const Win95Dropdown: React.FC<Win95DropdownProps> = ({
  id,
  ariaLabel,
  value,
  options,
  placeholder = 'Оберіть...',
  disabled = false,
  onChange,
  testId,
  className = '',
}) => {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(0);
  const [popupPos, setPopupPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxHeight: number;
  }>({ top: 0, left: 0, minWidth: 160, maxHeight: 260 });

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const groupedSections = useMemo(() => {
    const groups: { title: string; items: { opt: Win95DropdownOption; flatIndex: number }[] }[] =
      [];
    options.forEach((opt, idx) => {
      const title = opt.group ?? '';
      let grp = groups.find((g) => g.title === title);
      if (!grp) {
        grp = { title, items: [] };
        groups.push(grp);
      }
      grp.items.push({ opt, flatIndex: idx });
    });
    return groups;
  }, [options]);

  const updatePopupPosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 6;
    const spaceAbove = rect.top - 6;
    const openUp = spaceBelow < 150 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, Math.min(280, openUp ? spaceAbove : spaceBelow));
    const left = Math.max(
      4,
      Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 4),
    );
    setPopupPos({
      top: openUp
        ? Math.max(4, rect.top - Math.min(maxHeight, options.length * 26 + 12))
        : rect.bottom + 1,
      left,
      minWidth: Math.round(rect.width),
      maxHeight,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopupPosition();
  }, [open, updatePopupPosition]);

  useEffect(() => {
    if (!open) return;
    const selIdx = options.findIndex((o) => o.value === value);
    setHighlightedIdx(selIdx >= 0 ? selIdx : 0);

    const onPointerDownOutside = (ev: PointerEvent) => {
      const target = ev.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!popupRef.current || !popupRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false);
      }
    };
    const onScrollOrResize = () => updatePopupPosition();

    window.addEventListener('pointerdown', onPointerDownOutside);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDownOutside);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, options, updatePopupPosition, value]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (options.length > 0) {
        setHighlightedIdx((idx) => (idx + 1) % options.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (options.length > 0) {
        setHighlightedIdx((idx) => (idx - 1 + options.length) % options.length);
      }
    } else if (e.key === 'Enter' && open && options[highlightedIdx]) {
      e.preventDefault();
      onChange(options[highlightedIdx].value);
      setOpen(false);
    }
  };

  const listboxContent = (
    <div
      ref={popupRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: `${popupPos.top}px`,
        left: `${popupPos.left}px`,
        minWidth: `${popupPos.minWidth}px`,
        maxHeight: `${popupPos.maxHeight}px`,
        borderRadius: '0px',
      }}
      className="win95-window z-[120] max-w-[min(92vw,360px)] overflow-y-auto bg-win-highlight p-0.5 border border-win-darker"
    >
      {groupedSections.map((group) => (
        <div key={group.title || '_default'} className="mb-0.5 last:mb-0">
          {group.title && (
            <div className="border-b border-win-shadow bg-win-bg px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-win-ink">
              {group.title}
            </div>
          )}
          {group.items.map(({ opt, flatIndex }) => {
            const isSelected = opt.value === value;
            const isActive = flatIndex === highlightedIdx;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-value={opt.value}
                onMouseEnter={() => setHighlightedIdx(flatIndex)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{ borderRadius: '0px' }}
                className={`block w-full truncate px-2 py-1 text-left text-xs ${
                  isSelected || isActive
                    ? 'bg-win-navy font-bold text-win-highlight'
                    : 'bg-win-highlight font-normal text-win-ink hover:bg-win-navy hover:text-win-highlight'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        style={{ borderRadius: '0px' }}
        className="win95-field flex min-h-7 coarse:min-h-9 w-full items-center justify-between gap-1.5 bg-win-highlight pl-2 pr-0.5 py-0.5 text-left text-xs font-bold text-win-ink disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black"
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? placeholder}</span>
        <span
          aria-hidden="true"
          className="win95-outset inline-flex h-5 w-5 shrink-0 items-center justify-center bg-win-bg"
        >
          <svg width="9" height="6" viewBox="0 0 9 6" fill="none">
            <polygon points="0,0 9,0 4.5,5.5" fill="#000000" />
          </svg>
        </span>
      </button>

      {open &&
        (typeof document !== 'undefined'
          ? createPortal(listboxContent, document.body)
          : listboxContent)}
    </div>
  );
};
