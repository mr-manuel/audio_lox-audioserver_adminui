import { Suspense, useEffect } from 'react';
import type { TabConfig } from '../tabsConfig';
import { prefetchTabs } from '../tabsConfig';
import { SubPanel, useSubPanelTransition } from './SubPanel';

type AdminShellProps = {
  tabs: readonly TabConfig[];
  activeTab: string;
  tabPulse: boolean;
};

export default function AdminShell({ tabs, activeTab }: AdminShellProps): JSX.Element {
  const { displayed: displayedTab, isLeaving } = useSubPanelTransition(activeTab, 200);
  const active = tabs.find((t) => t.key === displayedTab) ?? tabs[0];
  const ActiveView = active?.component;

  /*
   * Fetch the tabs nobody has opened yet, once the one they did open has settled.
   *
   * Each view sits behind its own `import()` so the first paint does not carry all five (see
   * `tabsConfig`), and the whole cost of that trade lands on the *second* tab someone presses. An idle
   * callback after the first render pays it in advance: the chunks are on disk long before anyone gets
   * there. If the browser never goes idle then it is busy with something the person actually asked for,
   * which is the right thing to lose this race to — hence the timeout, and the plain setTimeout for the
   * browsers without the callback at all.
   */
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(() => prefetchTabs(), { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(prefetchTabs, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="tab-shell">
      <SubPanel key={displayedTab} isLeaving={isLeaving} className="tab-shell__inner">
        {/*
         * Empty, and only tall enough to hold the page still.
         *
         * A view's chunk comes off the same server the page did, so this shows for a handful of
         * milliseconds on the first tab and never again — long enough for a collapsing page to lurch,
         * nowhere near long enough for anything worth reading. So it says nothing and just keeps the
         * height, which is the one job it has.
         */}
        <Suspense fallback={<div className="tab-shell__waiting" aria-hidden="true" />}>
          {ActiveView ? <ActiveView /> : null}
        </Suspense>
      </SubPanel>
    </div>
  );
}
