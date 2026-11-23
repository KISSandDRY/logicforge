import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  maxWidthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Діалогове вікно у класичному стилі Windows 95 (.win95-window)
 * із темно-синім градієнтним заголовком (.win95-titlebar) та рельєфною кнопкою закриття [X].
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-2xl',
  footer,
  children,
}) => {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = (): HTMLElement[] => {
      const container = dialogRef.current;
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0);
    };

    const timer = window.setTimeout(() => {
      const focusable = getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current?.focus();
      }
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusable();
        if (focusable.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;

        if (!activeEl || !dialogRef.current.contains(activeEl) || activeEl === dialogRef.current) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && activeEl === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      const prevEl = previousFocusRef.current;
      if (prevEl && prevEl.isConnected) {
        prevEl.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-win-darker/45 p-3 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={`win95-window flex max-h-[90vh] w-full ${maxWidthClass} flex-col overflow-hidden text-win-ink focus:outline-none`}
      >
        {/* Класичний темно-синій заголовок діалогового вікна Windows 95 */}
        <div className="win95-titlebar flex items-center justify-between gap-2 px-2.5 py-1.5">
          <h2 id={titleId} className="truncate text-xs font-bold tracking-wide text-win-highlight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити діалогове вікно"
            className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 shrink-0 items-center justify-center touch-manipulation text-win-ink focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px]"
          >
            <X className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>

        {subtitle && (
          <div
            id={subtitleId}
            className="win95-statusbar-cell mx-1 mt-1 px-3 py-1.5 text-[11px] text-win-muted"
          >
            {subtitle}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 text-win-ink">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-win-shadow bg-win-bg px-3 py-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
