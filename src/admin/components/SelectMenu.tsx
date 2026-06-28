import React from 'react';
import './SelectMenu.css';

type SelectMenuOption<T extends string> = {
  value: T;
  label: string;
};

type SelectMenuProps<T extends string> = {
  id?: string;
  label: string;
  value: T;
  options: Array<SelectMenuOption<T>>;
  onChange: (next: T) => void;
  disabled?: boolean;
  className?: string;
};

export default function SelectMenu<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SelectMenuProps<T>): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const current = options.find((opt) => opt.value === value) ?? options[0];

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target as Node | null;
      if (!root || !target) return;
      if (root.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus?.();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={['select-menu', className ?? ''].filter(Boolean).join(' ')}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="select-menu__button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="select-menu__value">{current?.label ?? 'Select…'}</span>
        <span className="select-menu__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="select-menu__popover" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`select-menu__option${active ? ' is-active' : ''}`}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  window.setTimeout(() => buttonRef.current?.focus?.(), 0);
                }}
              >
                <span className="select-menu__option-label">{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

