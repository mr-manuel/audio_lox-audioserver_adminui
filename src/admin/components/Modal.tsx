import React from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import { lockBodyClass } from '../utils/bodyClassLock';
import { trapFocus } from '../utils/focusTrap';

type ModalCloseReason = 'backdrop' | 'escape';

type ModalProps = {
  open: boolean;
  onClose: (reason: ModalCloseReason) => void;
  children: React.ReactNode;
  backdropClassName?: string;
  dialogClassName?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  bodyClasses?: string[];
  restoreFocus?: boolean;
  scrollToTop?: boolean;
  initialFocusRef?: { current: HTMLElement | null };
  initialFocusSelector?: string;
  zIndex?: number;
};

function findInitialFocusTarget(
  dialog: HTMLElement,
  opts: {
    initialFocusRef?: { current: HTMLElement | null };
    initialFocusSelector?: string;
  },
): HTMLElement | null {
  const refTarget = opts.initialFocusRef?.current ?? null;
  if (refTarget) return refTarget;

  const selector = opts.initialFocusSelector?.trim();
  if (selector) {
    const node = dialog.querySelector<HTMLElement>(selector);
    if (node) return node;
  }

  // Default convention used across the admin UI.
  const autofocus = dialog.querySelector<HTMLElement>('[data-autofocus]');
  if (autofocus) return autofocus;

  // Fall back to the first focusable control.
  const firstFocusable = dialog.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return firstFocusable ?? dialog;
}

export default function Modal({
  open,
  onClose,
  children,
  backdropClassName,
  dialogClassName,
  ariaLabelledBy,
  ariaDescribedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  bodyClasses = ['modal-open'],
  restoreFocus = true,
  scrollToTop = false,
  initialFocusRef,
  initialFocusSelector,
  zIndex,
}: ModalProps): JSX.Element | null {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const lastActiveRef = React.useRef<HTMLElement | null>(null);
  const hasAutofocusedRef = React.useRef(false);
  const bodyClassesKey = (bodyClasses ?? []).join(' ');

  React.useEffect(() => {
    if (!open) {
      hasAutofocusedRef.current = false;
      return;
    }
    if (typeof document === 'undefined') return;

    lastActiveRef.current = document.activeElement as HTMLElement | null;

    // IMPORTANT: callers often pass array literals (e.g. `['modal-open']`), which would otherwise
    // retrigger this effect every render and steal focus back to `[data-autofocus]`.
    const stableBodyClasses = bodyClassesKey.split(' ').filter(Boolean);
    const releases = stableBodyClasses.map((klass) => lockBodyClass(klass));
    if (scrollToTop && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    // Defer focus until after portal render.
    window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (hasAutofocusedRef.current) return;
      const target = findInitialFocusTarget(dialog, { initialFocusRef, initialFocusSelector });
      target?.focus?.();
      hasAutofocusedRef.current = true;
    }, 0);

    return () => {
      releases.forEach((release) => release());
      if (restoreFocus) {
        lastActiveRef.current?.focus?.();
      }
      lastActiveRef.current = null;
    };
  }, [open, bodyClassesKey, restoreFocus, scrollToTop, initialFocusRef, initialFocusSelector]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const portal = (
    <div
      className={['modal-backdrop', backdropClassName ?? ''].filter(Boolean).join(' ')}
      role="presentation"
      onPointerDown={(event) => {
        // Close on backdrop pointer down (not click).
        // Native <select> interactions can generate "retargeted" click events on the backdrop after selection.
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose('backdrop');
        }
      }}
      style={typeof zIndex === 'number' ? { zIndex } : undefined}
    >
      <div
        ref={dialogRef}
        className={['modal-dialog', dialogClassName ?? ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={(event) => {
          const node = dialogRef.current;
          if (!node) return;
          if (event.key === 'Escape' && closeOnEscape) {
            // Let native controls handle Escape (e.g. closing a <select> dropdown) without closing the modal.
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'SELECT' || target.closest('select'))) {
              return;
            }
            event.preventDefault();
            onClose('escape');
            return;
          }
          trapFocus(event.nativeEvent, node);
        }}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(portal, document.body);
}
