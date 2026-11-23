import React from 'react';

export interface Win95NumberInputProps {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}

function roundToPrecision(num: number, step: number): number {
  const decimals = (step.toString().split('.')[1] ?? '').length;
  return Number(num.toFixed(Math.max(0, Math.min(6, decimals))));
}

/**
 * Поле числового вводу у стилі Windows 95 з квадратними опуклими
 * кнопками-спінерами ▲ / ▼ замість нативних браузерних стрілок.
 */
export const Win95NumberInput: React.FC<Win95NumberInputProps> = ({
  id,
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  disabled = false,
  onChange,
  className = '',
  inputClassName = '',
  ariaLabel,
}) => {
  const clamp = (next: number) => {
    const bounded = Math.min(max, Math.max(min, next));
    return roundToPrecision(bounded, step);
  };

  const bump = (direction: 1 | -1) => {
    if (disabled) return;
    const base = Number.isFinite(value) ? value : min;
    onChange(clamp(base + direction * step));
  };

  return (
    <div
      className={`win95-field flex items-stretch bg-win-highlight p-0.5 ${
        disabled ? 'opacity-60' : ''
      } ${className}`}
    >
      <input
        id={id}
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (!Number.isNaN(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          onChange(clamp(Number.isFinite(value) ? value : min));
        }}
        className={`win95-number-raw min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-xs font-bold text-win-ink focus:outline-none ${inputClassName}`}
      />
      <div className="flex w-4 shrink-0 flex-col">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Збільшити значення"
          onClick={() => bump(1)}
          className="win95-button flex flex-1 items-center justify-center p-0 leading-none disabled:cursor-not-allowed"
        >
          <svg width="7" height="4" viewBox="0 0 7 4" fill="none" aria-hidden="true">
            <polygon points="3.5,0 7,4 0,4" fill="#000000" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Зменшити значення"
          onClick={() => bump(-1)}
          className="win95-button flex flex-1 items-center justify-center p-0 leading-none disabled:cursor-not-allowed"
        >
          <svg width="7" height="4" viewBox="0 0 7 4" fill="none" aria-hidden="true">
            <polygon points="0,0 7,0 3.5,4" fill="#000000" />
          </svg>
        </button>
      </div>
    </div>
  );
};
