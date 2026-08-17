'use client';

import { COUNTRIES } from '@/constants';
import type { Country } from '@/constants';

const COUNTRY_CONFIG: Record<Country, { label: string; flag: string; region: string }> = {
  india: { label: 'India', flag: '🇮🇳', region: 'Uttar Pradesh / Lucknow' },
  brazil: { label: 'Brazil', flag: '🇧🇷', region: 'SUS / São Paulo & DF' },
  south_africa: { label: 'South Africa', flag: '🇿🇦', region: 'NHI / Gauteng & Western Cape' },
};

interface CountryToggleProps {
  selected: Country;
  onChange: (c: Country) => void;
}

export default function CountryToggle({ selected, onChange }: CountryToggleProps) {
  return (
    <div className="country-toggle-group" id="country-toggle">
      {COUNTRIES.map((c) => {
        const item = COUNTRY_CONFIG[c];
        const isSelected = selected === c;
        return (
          <button
            key={c}
            id={`country-btn-${c}`}
            className={`country-select-btn ${isSelected ? 'active' : ''}`}
            onClick={() => onChange(c)}
            title={`Switch dataset to ${item.label} (${item.region})`}
          >
            <span className="country-flag">{item.flag}</span>
            <span className="country-name">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
