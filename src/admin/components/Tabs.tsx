import React from 'react';
import { useTranslation } from 'react-i18next';
import './Tabs.css';

export type TabDescriptor = {
  key: string;
  label: string;
};

interface TabsProps {
  active: string;
  tabs: readonly TabDescriptor[];
  onChange(tab: string): void;
}

export default function Tabs({ active, tabs, onChange }: TabsProps): JSX.Element {
  const { t } = useTranslation();
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);

  const measure = React.useCallback((): void => {
    const idx = tabs.findIndex((t) => t.key === active);
    const btn = tabRefs.current[idx];
    if (!btn) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [active, tabs]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = (): void => measure();
    window.addEventListener('resize', onResize);

    // Active-view mount happens ~130ms after the click (SubPanel lag), which
    // often shifts layout (scrollbar appearing, content reflow). Observe the
    // nav itself so any width/position change re-anchors the indicator.
    let observer: ResizeObserver | null = null;
    const nav = tabRefs.current.find((b) => b)?.parentElement ?? null;
    if (nav && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure());
      observer.observe(nav);
      tabRefs.current.forEach((btn) => {
        if (btn) observer?.observe(btn);
      });
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [measure]);

  return (
    <nav className="ws-tabs" aria-label={t('tabs.ariaLabel')}>
      <span
        className={`ws-tabs__indicator${indicator ? ' is-ready' : ''}`}
        aria-hidden="true"
        style={indicator ? { left: `${indicator.left}px`, width: `${indicator.width}px` } : undefined}
      />
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          type="button"
          className={`ws-tab${active === tab.key ? ' is-active' : ''}`}
          onClick={() => onChange(tab.key)}
          ref={(node) => {
            tabRefs.current[index] = node;
          }}
          aria-current={active === tab.key ? 'page' : undefined}
          onKeyDown={(event) => {
            if (!tabs.length) return;
            const current = tabs.findIndex((t) => t.key === active);
            const moveTo = (next: number) => {
              const target = tabs[next];
              if (!target) return;
              onChange(target.key);
              tabRefs.current[next]?.focus?.();
            };
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              moveTo((current + 1) % tabs.length);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              moveTo((current - 1 + tabs.length) % tabs.length);
            } else if (event.key === 'Home') {
              event.preventDefault();
              moveTo(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              moveTo(tabs.length - 1);
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
