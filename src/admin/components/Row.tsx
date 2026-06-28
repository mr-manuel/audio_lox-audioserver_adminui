import React from 'react';

type RowProps<T extends React.ElementType> = {
  as?: T;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
};

type PolymorphicProps<T extends React.ElementType> = RowProps<T> &
  Omit<React.ComponentPropsWithoutRef<T>, keyof RowProps<T> | 'children'>;

export default function Row<T extends React.ElementType = 'div'>({
  as,
  leading,
  title,
  subtitle,
  meta,
  actions,
  compact = false,
  className,
  ...rest
}: PolymorphicProps<T>): JSX.Element {
  const Component = (as ?? 'div') as React.ElementType;

  return (
    <Component className={['row', compact ? 'row--compact' : '', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {leading ? <div className="row__leading">{leading}</div> : null}
      <div className="row__main">
        <div className="row__title">{title}</div>
        {subtitle ? <div className="row__subtitle">{subtitle}</div> : null}
        {meta ? <div className="row__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="row__actions">{actions}</div> : null}
    </Component>
  );
}

