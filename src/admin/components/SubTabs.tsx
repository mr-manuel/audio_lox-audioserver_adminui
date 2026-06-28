import React from 'react';
import './SubTabs.css';

export type SubTabDescriptor<K extends string = string> = {
  key: K;
  label: string;
  badge?: React.ReactNode;
};

export type SubTabsProps<K extends string = string> = {
  tabs: ReadonlyArray<SubTabDescriptor<K>>;
  active: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  className?: string;
};

export default function SubTabs<K extends string = string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  className,
}: SubTabsProps<K>): JSX.Element {
  const navRef = React.useRef<HTMLElement | null>(null);
  const buttonsRef = React.useRef<Map<K, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);

  const measure = React.useCallback((): void => {
    const btn = buttonsRef.current.get(active);
    if (!btn) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [active]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, tabs.length]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = (): void => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  return (
    <nav
      ref={navRef}
      className={`subtabs${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        className={`subtabs__indicator${indicator ? ' is-ready' : ''}`}
        aria-hidden="true"
        style={indicator ? { left: `${indicator.left}px`, width: `${indicator.width}px` } : undefined}
      />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          ref={(el) => {
            if (el) buttonsRef.current.set(tab.key, el);
            else buttonsRef.current.delete(tab.key);
          }}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`subtab${active === tab.key ? ' is-active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.badge != null ? <span className="subtab__badge">{tab.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}
