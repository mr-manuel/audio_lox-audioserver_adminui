import React from 'react';
import type { ContentFilterKey } from './types';

type FilterItem = {
  key: ContentFilterKey;
  label: string;
};

const FILTERS: FilterItem[] = [
  { key: 'radio', label: 'Radio' },
  { key: 'library', label: 'Library' },
  { key: 'linein', label: 'Line-in' },
  { key: 'spotify', label: 'Spotify' },
  { key: 'custom', label: 'Custom services' },
];

type ContentFilterBarProps = {
  contentFilter: ContentFilterKey;
  onChange: (next: ContentFilterKey) => void;
};

export default function ContentFilterBar({
  contentFilter,
  onChange,
}: ContentFilterBarProps): JSX.Element {
  return (
    <div className="content-filter-bar toolbar">
      <div className="content-filter-actions" role="tablist" aria-label="Content sections">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`chip chip--filter${contentFilter === filter.key ? ' is-active' : ''}`}
            onClick={() => onChange(filter.key)}
            role="tab"
            aria-selected={contentFilter === filter.key}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
