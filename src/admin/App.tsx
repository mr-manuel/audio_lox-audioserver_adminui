import React from 'react';
import AdminShell from './components/AdminShell';
import Shell from './components/Shell';
import { GlobalAlertProvider } from './components/GlobalAlert';
import { ConfirmProvider } from './components/ConfirmDialog';
import { UpdateCheckProvider } from './components/UpdateCheckContext';
import LoginView from './features/LoginView';
import InterfaceChooserView from './features/InterfaceChooserView';
import WelcomeView from './features/WelcomeView';
import TransitionView from './features/TransitionView';
import { ServerControlProvider } from './components/ServerControl';
import { ADMIN_TABS } from './tabsConfig';
import { fetchAdminSession, getLastAdminUsername, loginAdmin, logoutAdmin, setupAdmin } from './services/auth';
import type { AdminSession } from './services/auth';
import { fetchStatus } from './services/statusApi';
import { restartServer } from './services/setupApi';
import { setApiBase } from './config/apiConfig';
import type { StatusResponse } from './types/api';

type Mode = 'welcome' | 'login' | 'chooser' | 'shell' | 'transition';

const TAB_STORAGE_KEY = 'lox.admin.activeTab';

function readChooserFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('chooser') === '1';
}

function readStoredTab(): string {
  const fallback = ADMIN_TABS[0]?.key ?? '';
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
  if (stored && ADMIN_TABS.some((t) => t.key === stored)) return stored;
  return fallback;
}

type AppRootProps = {
  // Switch to a different audioserver's API base. Bumps the remount key in App so the whole tree
  // re-bootstraps in place against the new server (no full page reload).
  onSwitchServer: (base: string) => void;
};

function AppRoot({ onSwitchServer }: AppRootProps): JSX.Element {
  const [session, setSession] = React.useState<AdminSession | null>(null);
  const [authChecking, setAuthChecking] = React.useState(false);
  const [authSubmitting, setAuthSubmitting] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authNotice, setAuthNotice] = React.useState<string | null>(null);
  const [forceLogin, setForceLogin] = React.useState(false);
  const [apiStatus, setApiStatus] = React.useState<StatusResponse | null>(null);
  // Non-null while the server is bouncing and the interstitial should hold: a
  // config wipe ('reset') or an in-place deployment-mode switch ('switch').
  const [transition, setTransition] = React.useState<'reset' | 'switch' | null>(null);
  const [showChooser, setShowChooser] = React.useState<boolean>(() => readChooserFlag());
  const [tabKey, setTabKey] = React.useState<string>(() => readStoredTab());
  const [tabPulse, setTabPulse] = React.useState(false);

  const isAuthenticated = Boolean(session);
  // Auth is required once a local admin account exists (created at first-run) — not
  // driven by Miniserver pairing. Miniserver credentials are just an alternate login.
  const requiresLogin = forceLogin || apiStatus?.hasAdminUser === true;

  const refreshApiStatus = React.useCallback(async (): Promise<StatusResponse | null> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      const status = await fetchStatus(controller.signal);
      setApiStatus(status);
      if (status.paired === false) setForceLogin(false);
      return status;
    } catch {
      setApiStatus(null);
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  React.useEffect(() => {
    void refreshApiStatus();
  }, [refreshApiStatus]);

  React.useEffect(() => {
    if (apiStatus?.paired !== false) return;
    const interval = window.setInterval(() => {
      void refreshApiStatus();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [apiStatus?.paired, refreshApiStatus]);

  React.useEffect(() => {
    if (!requiresLogin) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    setAuthChecking(true);
    fetchAdminSession()
      .then((next) => {
        if (cancelled) return;
        setSession(next);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requiresLogin]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const resetAuth = () => {
      logoutAdmin().catch(() => undefined);
      setSession(null);
      setAuthError(null);
      setAuthNotice('Reauthentication required after server restart.');
      setForceLogin(true);
    };
    window.addEventListener('lox:auth-reset', resetAuth);
    return () => window.removeEventListener('lox:auth-reset', resetAuth);
  }, []);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TAB_STORAGE_KEY, tabKey);
    }
  }, [tabKey]);

  const chooseAdmin = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('chooser');
      const search = url.searchParams.toString();
      window.history.replaceState(null, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
    }
    setShowChooser(false);
  }, []);

  // First-run: create the local admin account and log straight in, then refresh so
  // the view resolves to the shell. No restart — it just writes config + a session.
  const createAdmin = React.useCallback(
    async (username: string, password: string) => {
      const nextSession = await setupAdmin(username, password);
      setSession(nextSession);
      await refreshApiStatus();
    },
    [refreshApiStatus],
  );

  const resetServer = React.useCallback(async () => {
    // The config was just cleared (SetupView). Bounce the server so the gate
    // re-evaluates against fresh config (Loxone off, unpaired) and show the
    // interstitial until it answers again — then computedMode lands on 'welcome'
    // without a manual browser refresh, and no Miniserver can re-pair meanwhile.
    setTransition('reset');
    try {
      await restartServer();
    } catch {
      // The wipe already landed; a manual restart would still bring it back clean.
    }
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (await refreshApiStatus()) break;
    }
    setTransition(null);
  }, [refreshApiStatus]);

  const handleLogin = React.useCallback(async ({ username, password }: { username: string; password: string }) => {
    setAuthError(null);
    setAuthSubmitting(true);
    const startedAt = Date.now();
    try {
      const nextSession = await loginAdmin(username, password);
      // Keep the validating state visible for at least 700ms so the card-glow
      // and button spinner read as a deliberate confirmation step, even when
      // the API resolves faster than the eye can follow.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 700) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 - elapsed));
      }
      setSession(nextSession);
      setAuthNotice(null);
      setForceLogin(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in. Try again.');
    } finally {
      setAuthSubmitting(false);
    }
  }, []);

  const handleSignOut = React.useCallback(() => {
    logoutAdmin().catch(() => undefined);
    setSession(null);
    setAuthError(null);
    setAuthNotice(null);
    setForceLogin(false);
  }, []);

  const handleTabChange = React.useCallback(
    (next: string) => {
      if (next === tabKey) return;
      setTabKey(next);
      setTabPulse((prev) => !prev);
    },
    [tabKey],
  );

  // Read the workspace flag exactly once so the boot mode is stable across
  // re-renders. Matches what index.html's inline script uses to suppress the
  // intro animation when restoring directly into workspace.
  const wasWorkspace = React.useRef(
    typeof window !== 'undefined' && window.sessionStorage.getItem('lox-admin-workspace') === '1',
  ).current;

  const computedMode: Mode = (() => {
    // A server bounce is in flight (wipe or Loxone connect/disconnect): hold the
    // interstitial over everything (including the transient null status) until it settles.
    if (transition) return 'transition';
    // First-run: the minimal welcome intro until it's dismissed. There is no
    // deployment-mode fork — Loxone is connected later from the Players screen, and
    // its pairing wait lives in that modal (no top-level pairing view).
    if (apiStatus && apiStatus.setupComplete === false) return 'welcome';
    // Boot: apiStatus not yet loaded. Default to login so admin panels don't
    // flash for unauthenticated users on refresh. If we know the previous tick
    // was workspace (sessionStorage flag), assume shell instead so an authed
    // F5 lands quietly.
    if (apiStatus == null) return wasWorkspace ? 'shell' : 'login';
    if (requiresLogin && !isAuthenticated) return 'login';
    if (showChooser) return 'chooser';
    return 'shell';
  })();

  // The view rendered on screen lags the computed mode briefly so the outgoing
  // panel gets a chance to play its leave animation (fade + blur + transform)
  // before unmounting. Body classes follow `computedMode` immediately so the
  // ambient glow and success-pulse react to the new destination right away.
  const [displayedMode, setDisplayedMode] = React.useState<Mode>(computedMode);
  const [isLeaving, setIsLeaving] = React.useState(false);

  React.useEffect(() => {
    if (computedMode === displayedMode) {
      // If a leave timer was running because mode briefly flipped away, clear
      // the leaving flag now that we're back where we started.
      if (isLeaving) setIsLeaving(false);
      return;
    }
    setIsLeaving(true);
    const timer = window.setTimeout(() => {
      setDisplayedMode(computedMode);
      setIsLeaving(false);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [computedMode, displayedMode, isLeaving]);

  // Body class drives the CSS transitions (hero shrink, ambient tint, success
  // pulses) per mode. The is-success class stays on once the user is signed
  // in — workspace is layered on top, matching the mockup's flow so the
  // success-pulse on chooser entry doesn't have to fight the workspace pulse.
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    // Pairing now happens inside the Players Loxone modal (no top-level pairing view).
    body.classList.remove('is-unpaired');
    body.classList.toggle('is-success', computedMode === 'chooser' || computedMode === 'shell');
    body.classList.toggle('is-workspace', computedMode === 'shell');
    try {
      if (computedMode === 'shell') {
        sessionStorage.setItem('lox-admin-workspace', '1');
      } else {
        sessionStorage.removeItem('lox-admin-workspace');
      }
    } catch (_) {
      /* sessionStorage may be unavailable */
    }
  }, [computedMode]);

  // no-intro is a one-way switch for the current page load. We deliberately do
  // not remove it — removing the class would let the animation: ... declarations
  // re-apply and the intro would fire late. A fresh navigation (next page load)
  // is what resets it: if the user is no longer in workspace, the inline script
  // in index.html simply won't add the class.

  const mode = displayedMode;

  let mainContent: JSX.Element;
  const shellTabs = mode === 'shell' ? ADMIN_TABS : undefined;
  const shellActiveTab = mode === 'shell' ? tabKey : undefined;
  const shellOnTabChange = mode === 'shell' ? handleTabChange : undefined;
  const shellOnSignOut = mode === 'shell' && isAuthenticated ? handleSignOut : undefined;

  if (mode === 'transition') {
    mainContent = <TransitionView reason={transition ?? 'reset'} />;
  } else if (mode === 'welcome') {
    mainContent = <WelcomeView onCreateAdmin={createAdmin} isLeaving={isLeaving} />;
  } else if (mode === 'login') {
    mainContent = (
      <LoginView
        initialUsername={getLastAdminUsername()}
        submitting={authSubmitting || authChecking}
        notice={authNotice}
        error={authError}
        onSubmit={handleLogin}
        onSwitchServer={onSwitchServer}
        isLeaving={isLeaving}
      />
    );
  } else if (mode === 'chooser') {
    mainContent = (
      <InterfaceChooserView
        currentUserName={session?.username}
        apiStatus={apiStatus}
        onChooseAdmin={chooseAdmin}
        isLeaving={isLeaving}
      />
    );
  } else {
    mainContent = <AdminShell tabs={ADMIN_TABS} activeTab={tabKey} tabPulse={tabPulse} />;
  }

  return (
    <GlobalAlertProvider>
      <ConfirmProvider>
        <UpdateCheckProvider status={apiStatus} enabled={mode === 'shell'}>
          <ServerControlProvider value={{ resetServer }}>
            <Shell
              apiStatus={apiStatus}
              tabs={shellTabs}
              activeTab={shellActiveTab}
              onTabChange={shellOnTabChange}
              currentUserName={session?.username}
              onSignOut={shellOnSignOut}
              onSwitchServer={onSwitchServer}
            >
              {mainContent}
            </Shell>
          </ServerControlProvider>
        </UpdateCheckProvider>
      </ConfirmProvider>
    </GlobalAlertProvider>
  );
}

export function App(): JSX.Element {
  // Remount key: switching audioserver bumps it so the entire AppRoot tree unmounts and
  // re-bootstraps against the now-active API base — a clean re-init without a browser reload.
  const [serverEpoch, setServerEpoch] = React.useState(0);

  const handleSwitchServer = React.useCallback((base: string) => {
    setApiBase(base);
    setServerEpoch((epoch) => epoch + 1);
  }, []);

  return <AppRoot key={serverEpoch} onSwitchServer={handleSwitchServer} />;
}
