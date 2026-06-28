import React from 'react';

/**
 * Tracks a value through a fade-out → swap → fade-in transition.
 * Returns the value that should be rendered NOW + whether the old one is leaving.
 *
 * Pattern: when `value` changes, `displayed` keeps the old value for `leaveMs` ms
 * (during which `isLeaving` is true so the panel can play its leave animation),
 * then swaps to the new value.
 */
export function useSubPanelTransition<T>(value: T, leaveMs = 200): {
  displayed: T;
  isLeaving: boolean;
} {
  const [displayed, setDisplayed] = React.useState<T>(value);
  const [isLeaving, setIsLeaving] = React.useState(false);

  React.useEffect(() => {
    if (Object.is(value, displayed)) {
      if (isLeaving) setIsLeaving(false);
      return;
    }
    setIsLeaving(true);
    const id = window.setTimeout(() => {
      setDisplayed(value);
      setIsLeaving(false);
    }, leaveMs);
    return () => window.clearTimeout(id);
  }, [value, displayed, isLeaving, leaveMs]);

  return { displayed, isLeaving };
}

export type SubPanelProps = {
  isLeaving: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * Wrapper that applies the panel-in / panel-leaving animation classes from
 * SubTabs.css. Use together with `useSubPanelTransition` to cross-fade content
 * when the active sub-tab changes.
 */
export function SubPanel({ isLeaving, children, className }: SubPanelProps): JSX.Element {
  return (
    <div className={`sub-panel${isLeaving ? ' is-leaving' : ' is-active'}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export default SubPanel;
