'use client';

import { COUNTRIES } from '@/constants';
import type { Country } from '@/constants';

const COUNTRY_LABELS: Record<Country, string> = {
  india: '🇮🇳 India',
  brazil: '🇧🇷 Brazil',
  south_africa: '🇿🇦 South Africa',
};

interface CountryToggleProps {
  selected: Country;
  onChange: (c: Country) => void;
}

export default function CountryToggle({ selected, onChange }: CountryToggleProps) {
  return (
    <div className="country-toggle" id="country-toggle">
      {COUNTRIES.map((c) => (
        <button
          key={c}
          id={`country-btn-${c}`}
          className={`country-btn${selected === c ? ' active' : ''}`}
          onClick={() => onChange(c)}
        >
          {COUNTRY_LABELS[c]}
        </button>
      ))}
    </div>
  );
}
