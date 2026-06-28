import React from 'react';
import { useTranslation } from 'react-i18next';
import './SearchInput.css';

type SearchInputProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  reset?: {
    label?: string;
    onClick: () => void;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
  };
};

export default function SearchInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  reset,
}: SearchInputProps): JSX.Element {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className={['search-input', className ?? ''].filter(Boolean).join(' ')}>
      <div className="search-input__pill">
        <span className="search-input__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18Zm0-13a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11Zm8.65 14.06l-3.2-3.2a1 1 0 0 1 1.42-1.42l3.2 3.2a1 1 0 1 1-1.42 1.42Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          id={id}
          type="search"
          className="search-input__field"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={ariaLabel}
        />
        {value ? (
          <button
            type="button"
            className="search-input__clear"
            onClick={() => {
              onChange('');
              // Keep keyboard flow predictable.
              window.setTimeout(() => inputRef.current?.focus?.(), 0);
            }}
            aria-label={t('searchInput.clearAriaLabel')}
            title={t('searchInput.clearTitle')}
          >
            ×
          </button>
        ) : null}
      </div>
      {reset ? (
        <button
          type="button"
          className="btn btn--secondary btn--compact search-input__reset"
          onClick={reset.onClick}
          disabled={reset.disabled}
          aria-label={reset.ariaLabel ?? reset.label ?? t('searchInput.resetDefault')}
          title={reset.title ?? reset.label ?? t('searchInput.resetDefault')}
        >
          {reset.label ?? t('searchInput.resetDefault')}
        </button>
      ) : null}
    </div>
  );
}
