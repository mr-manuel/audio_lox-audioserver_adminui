import React from 'react';

// Server-lifecycle actions that only App can drive (it owns apiStatus and the
// top-level view transitions), exposed to deep children like SetupView and
// ZonesView. Both bounce the server via a soft restart so the deployment-mode
// gate re-evaluates, cover the blip with an interstitial, then let the view
// resolve — no manual browser refresh.
type ServerControlContextValue = {
  // Wipe-driven: after SetupView clears the config, land back on the welcome screen.
  resetServer: () => Promise<void>;
};

const ServerControlContext = React.createContext<ServerControlContextValue | null>(null);

export const ServerControlProvider = ServerControlContext.Provider;

export function useServerControl(): ServerControlContextValue {
  const ctx = React.useContext(ServerControlContext);
  if (!ctx) {
    throw new Error('useServerControl must be used within ServerControlProvider');
  }
  return ctx;
}
