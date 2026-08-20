'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Facility, Medicine } from '@/types';
import type { Country } from '@/constants';

interface CitizenCheckResult {
  status: 'available' | 'low' | 'unavailable';
  freshnessText: string;
}

interface CitizenCheckerProps {
  country: Country;
  preselectedFacilityId?: string | null;
  preselectedMedicineId?: string | null;
}

const STATUS_ICONS: Record<string, string> = {
  available: '✓',
  low: '⚠️',
  unavailable: '✕',
};

const STATUS_TITLES: Record<string, string> = {
  available: 'Stock Available',
  low: 'Low Stock Alert (Critical Replenishment Window)',
  unavailable: 'Currently Unavailable / Stockout',
};

export default function CitizenChecker({
  country,
  preselectedFacilityId,
  preselectedMedicineId,
}: CitizenCheckerProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>('');

  const [searchFacilityText, setSearchFacilityText] = useState('');
  const [result, setResult] = useState<CitizenCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch facilities for current country
  useEffect(() => {
    fetch(`/api/facilities?country=${country}`)
      .then((r) => r.json())
      .then((data: Facility[]) => {
        setFacilities(data);
        if (preselectedFacilityId && data.some((f) => f.id === preselectedFacilityId)) {
          setSelectedFacilityId(preselectedFacilityId);
        } else if (data.length > 0) {
          setSelectedFacilityId(data[0].id);
        }
      })
      .catch(() => setFacilities([]));
  }, [country, preselectedFacilityId]);

  // Fetch medicines
  useEffect(() => {
    fetch('/api/medicines')
      .then((r) => r.json())
      .then((data: Medicine[]) => {
        setMedicines(data);
        if (preselectedMedicineId && data.some((m) => m.id === preselectedMedicineId)) {
          setSelectedMedicineId(preselectedMedicineId);
        } else if (data.length > 0) {
          setSelectedMedicineId(data[0].id);
        }
      })
      .catch(() => setMedicines([]));
  }, [preselectedMedicineId]);

  // Query availability whenever facility or medicine changes
  useEffect(() => {
    // Guard: do not call setResult(null) synchronously — early return keeps state
    if (!selectedFacilityId || !selectedMedicineId) return;

    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    fetch(`/api/citizen-check?facilityId=${selectedFacilityId}&medicineId=${selectedMedicineId}`)
      .then((r) => r.json())
      .then((d: CitizenCheckResult) => {
        if (!cancelled) {
          setResult(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [selectedFacilityId, selectedMedicineId]);

  const filteredFacilities = useMemo(() => {
    if (!searchFacilityText.trim()) return facilities;
    return facilities.filter(
      (f) =>
        f.name.toLowerCase().includes(searchFacilityText.toLowerCase()) ||
        f.district.toLowerCase().includes(searchFacilityText.toLowerCase()) ||
        f.type.toLowerCase().includes(searchFacilityText.toLowerCase()),
    );
  }, [facilities, searchFacilityText]);

  const activeFacility = facilities.find((f) => f.id === selectedFacilityId);
  const activeMedicine = medicines.find((m) => m.id === selectedMedicineId);

  return (
    <div className="glass-card citizen-checker-card animate-in" id="citizen-checker-view">
      <div className="card-header">
        <div>
          <span className="card-title">🏥 Public Medicine & Facility Availability Portal</span>
          <div className="card-subhead">
            Real-time verified dispensary inventory for citizens and triage staff
          </div>
        </div>
        <span className="card-badge badge-info">Public Transparency</span>
      </div>

      <div className="citizen-form-grid">
        {/* Facility Search & Selection */}
        <div className="citizen-field">
          <label className="field-label">1. Select Health Facility ({country.toUpperCase()})</label>
          <input
            type="text"
            className="pg-input mb-sm"
            placeholder="Search facility name or district..."
            value={searchFacilityText}
            onChange={(e) => setSearchFacilityText(e.target.value)}
            id="citizen-facility-search"
          />
          <select
            className="pg-select w-full"
            id="citizen-facility-select"
            value={selectedFacilityId}
            onChange={(e) => setSelectedFacilityId(e.target.value)}
          >
            {filteredFacilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.type} · {f.district})
              </option>
            ))}
          </select>
        </div>

        {/* Medicine Selection */}
        <div className="citizen-field">
          <label className="field-label">2. Select Essential Medicine</label>
          <select
            className="pg-select w-full"
            id="citizen-medicine-select"
            value={selectedMedicineId}
            onChange={(e) => setSelectedMedicineId(e.target.value)}
            style={{ marginTop: 38 }}
          >
            {medicines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit}) — {m.category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Result Display */}
      <div className="citizen-result-container">
        {loading ? (
          <div className="shimmer" style={{ height: 120, borderRadius: 12 }} />
        ) : result && activeFacility && activeMedicine ? (
          <div className={`citizen-status-card status-${result.status}`} id="citizen-status-result">
            <div className="status-icon-circle">{STATUS_ICONS[result.status]}</div>
            <div className="status-details">
              <div className="status-title-row">
                <span className="status-main-title">{STATUS_TITLES[result.status]}</span>
              </div>
              <div className="status-facility-desc">
                <strong>{activeMedicine.name}</strong> at <strong>{activeFacility.name}</strong> ({activeFacility.district})
              </div>
              <div className="status-freshness-row">
                <span className="freshness-check-icon">✓</span>
                <span className="freshness-statement">{result.freshnessText}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="citizen-prompt-box">
            <span>Select a facility and medicine above to check verified inventory status.</span>
          </div>
        )}
      </div>

      <div className="citizen-honesty-note">
        <span>🛡️ Data Guarantee: Availability is verified from event-sourced hospital stock ledgers. Never estimated from static quotas.</span>
      </div>
    </div>
  );
}
