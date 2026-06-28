import type { TabConfig } from '../tabsConfig';
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
  return (
    <div className="tab-shell">
      <SubPanel key={displayedTab} isLeaving={isLeaving} className="tab-shell__inner">
        {ActiveView ? <ActiveView /> : null}
      </SubPanel>
    </div>
  );
}
