import React from 'react';

type HeroStat = {
  label: string;
  value: string | number | null;
  loading?: boolean;
};

type ContentHeroProps = {
  heroStats: HeroStat[];
  renderHeroStatValue: (value: HeroStat['value'], loading?: boolean) => React.ReactNode;
};

export default function ContentHero({
  heroStats,
  renderHeroStatValue,
}: ContentHeroProps): JSX.Element {
  return (
    <div className="content-hero panel">
      <div className="content-hero__copy">
        <p className="page-hero__eyebrow">AudioServer sources</p>
        <h1 className="page-hero__title">Content</h1>
        <p className="page-hero__subtitle">
          A consolidated view of AudioServer content: built-in Loxone services, external bridges, and custom streams for your installation.
        </p>
      </div>
      <ul className="content-hero__stats data-rows" aria-label="Content summary">
        {heroStats.map((stat) => (
          <li key={stat.label} className="content-hero__stat data-row">
            <span className="data-row__label">{stat.label}</span>
            <span className="data-row__divider" aria-hidden="true" />
            <span className="data-row__value">{renderHeroStatValue(stat.value, stat.loading)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
