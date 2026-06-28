import React from 'react';
import { useTranslation } from 'react-i18next';
import './InlineForm.css';

export type InlineFormProps = {
  open: boolean;
  eyebrow: string;
  title: string;
  description?: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
};

export function InlineForm({
  open,
  eyebrow,
  title,
  description,
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel,
  submitDisabled,
  busy,
  children,
}: InlineFormProps): JSX.Element | null {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="inline-form" role="region" aria-label={title}>
      <header className="inline-form__head">
        <span className="inline-form__eyebrow">{eyebrow}</span>
        <div className="inline-form__title">{title}</div>
        {description ? <p className="inline-form__desc">{description}</p> : null}
      </header>
      <form
        className="inline-form__body"
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled && !busy) onSubmit();
        }}
      >
        <div className="inline-form__fields">{children}</div>
        <footer className="inline-form__foot">
          <button
            type="button"
            className="inline-form__btn"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel ?? t('inlineForm.cancel')}
          </button>
          <button
            type="submit"
            className="inline-form__btn is-primary"
            disabled={submitDisabled || busy}
          >
            {submitLabel ?? t('inlineForm.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}

export type InlineFormFieldProps = {
  label: string;
  optional?: boolean;
  help?: string;
  children: React.ReactNode;
};

export function InlineFormField({ label, optional, help, children }: InlineFormFieldProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="inline-form__field">
      <label className="inline-form__field-label">
        {label}
        {optional ? <span className="inline-form__field-optional">{t('inlineForm.optional')}</span> : null}
      </label>
      {children}
      {help ? <p className="inline-form__help">{help}</p> : null}
    </div>
  );
}

export default InlineForm;
