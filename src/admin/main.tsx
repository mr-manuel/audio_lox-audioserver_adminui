import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './i18n';
import './styles/theme.css';
import './components/Shell.css';
import './components/Hero.css';
import './components/Tabs.css';
import './components/SectionCard.css';
import './styles/primitives.css';
import './features/LoginView.css';
import './features/InterfaceChooserView.css';
import './features/PairingView.css';

/**
 * Bootstraps the lightweight admin SPA.
 */
const root = document.getElementById('root');

if (!root) {
  throw new Error('Unable to find admin root element');
}

if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = 'dark';
  try {
    window.localStorage.removeItem('lox.admin.theme');
  } catch {
    // ignore
  }
  // Apply the post-login body class synchronously when entering via
  // `?chooser=1`, so the hero starts in its compact state and intro
  // animations don't fight the shrink transition.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('chooser') === '1') {
      document.body.classList.add('is-success');
    }
  } catch {
    // ignore
  }
}

// Admin density: compact-only (historically called `dense`).
if (typeof document !== 'undefined') {
  document.documentElement.dataset.density = 'dense';
  try {
    window.localStorage.removeItem('lox.admin.density');
  } catch {
    // ignore
  }
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
