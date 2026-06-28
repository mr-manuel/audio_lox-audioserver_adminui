import React from 'react';
import { useTranslation } from 'react-i18next';
import './ConfirmDialog.css';
import Modal from './Modal';

type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

type PendingConfirm = ConfirmOptions & { id: number };

export function ConfirmProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const id = Date.now();
      resolverRef.current = resolve;
      setPending({ id, ...options });
    });
  }, []);

  const close = React.useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPending(null);
    resolve?.(value);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      <Modal
        open={Boolean(pending)}
        onClose={() => close(false)}
        backdropClassName="confirm-backdrop"
        dialogClassName="confirm-dialog"
        ariaLabelledBy="confirm-title"
        ariaDescribedBy="confirm-message"
        closeOnBackdrop
        closeOnEscape
        bodyClasses={['modal-open']}
      >
        {pending ? (
          <div className={`confirm-dialog__inner${pending.tone === 'danger' ? ' is-danger' : ''}`}>
            <header className="confirm-dialog__head">
              <span className="confirm-dialog__eyebrow">
                {pending.tone === 'danger' ? t('confirm.eyebrowDanger') : t('confirm.eyebrow')}
              </span>
              <h3 id="confirm-title" className="confirm-dialog__title">
                {pending.title}
              </h3>
            </header>
            <div className="confirm-dialog__body">
              <p id="confirm-message" className="confirm-dialog__message">
                {pending.message}
              </p>
            </div>
            <footer className="confirm-dialog__foot">
              <button
                type="button"
                className="confirm-dialog__btn"
                onClick={() => close(false)}
                data-autofocus
              >
                {pending.cancelLabel ?? t('confirm.cancel')}
              </button>
              <button
                type="button"
                className={`confirm-dialog__btn${pending.tone === 'danger' ? ' is-danger' : ' is-primary'}`}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? t('confirm.confirm')}
              </button>
            </footer>
          </div>
        ) : null}
      </Modal>
      {children}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
