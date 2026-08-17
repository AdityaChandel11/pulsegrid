'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Facility, Medicine } from '@/types';
import type { Country } from '@/constants';
import CountryToggle from './components/CountryToggle';
import PulseLine from './components/PulseLine';
import KpiPanel from './components/KpiPanel';
import FacilityMap from './components/FacilityMap';
import AtRiskList from './components/AtRiskList';
import MedicineModule from './components/MedicineModule';
import ForecastChart from './components/ForecastChart';
import TrackRecord from './components/TrackRecord';
import RedistributionCard from './components/RedistributionCard';
import BedsModule from './components/BedsModule';
import StaffModule from './components/StaffModule';
import CrossBorderSignals from './components/CrossBorderSignals';
import CitizenChecker from './components/CitizenChecker';

const DATA_HONESTY_TEXT =
  'For this prototype, the hospital/e-Aushadhi event stream is simulated. The production architecture accepts the same events through an API.';

export default function Home() {
  const [country, setCountry] = useState<Country>('india');
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [surgeActive, setSurgeActive] = useState(false);

  // Check if any facility is in surge mode
  useEffect(() => {
    fetch(`/api/at-risk?country=${country}`)
      .then((r) => r.json())
      .then((data: { surgeFlag: boolean }[]) => {
        setSurgeActive(data.some((d) => d.surgeFlag));
      })
      .catch(() => setSurgeActive(false));
  }, [country]);

  const handleSelectFacility = useCallback((f: Facility) => {
    setSelectedFacility(f);
  }, []);

  const handleSelectMedicine = useCallback((m: Medicine) => {
    setSelectedMedicine(m);
  }, []);

  const handleCountryChange = useCallback((c: Country) => {
    setCountry(c);
    setSelectedFacility(null);
  }, []);

  const handleAtRiskSelect = useCallback((facilityId: string, _medicineId: string) => {
    // Fetch the facility to set it
    fetch(`/api/facilities?country=${country}`)
      .then((r) => r.json())
      .then((facilities: Facility[]) => {
        const f = facilities.find((fac) => fac.id === facilityId);
        if (f) setSelectedFacility(f);
      })
      .catch(() => {});
  }, [country]);

  return (
    <main className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 id="dashboard-title">PulseGrid</h1>
          <div className="subtitle">Healthcare Supply Chain Command Center</div>
        </div>
        <CountryToggle selected={country} onChange={handleCountryChange} />
      </div>

      {/* ECG Pulse Line */}
      <PulseLine surgeActive={surgeActive} />

      {/* KPI Panel */}
      <KpiPanel country={country} />

      {/* Selected facility info */}
      {selectedFacility && (
        <div className="glass-card animate-in" style={{ padding: '12px 20px' }} id="selected-facility-banner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedFacility.name}</span>
              <span className="text-muted" style={{ marginLeft: 12, fontSize: '0.78rem' }}>
                {selectedFacility.type} · {selectedFacility.district}
              </span>
            </div>
            <button className="btn-secondary" onClick={() => setSelectedFacility(null)}>✕ Clear</button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Map - spans 2 cols */}
        <FacilityMap
          country={country}
          onSelectFacility={handleSelectFacility}
          selectedFacilityId={selectedFacility?.id || null}
        />

        {/* At-Risk Ranking */}
        <AtRiskList
          country={country}
          onSelectItem={handleAtRiskSelect}
        />

        {/* Medicine selector */}
        <MedicineModule
          selectedMedicineId={selectedMedicine?.id || null}
          onSelectMedicine={handleSelectMedicine}
          facilityId={selectedFacility?.id || null}
        />

        {/* Forecast chart */}
        <ForecastChart
          facilityId={selectedFacility?.id || null}
          medicineId={selectedMedicine?.id || null}
        />

        {/* Track Record */}
        <TrackRecord facilityId={selectedFacility?.id || null} />

        {/* Citizen Checker */}
        <CitizenChecker
          facilityId={selectedFacility?.id || null}
          medicineId={selectedMedicine?.id || null}
          facilityName={selectedFacility?.name || ''}
          medicineName={selectedMedicine?.name || ''}
        />

        {/* Redistribution - spans 2 cols */}
        <RedistributionCard
          facilityId={selectedFacility?.id || null}
          facilityName={selectedFacility?.name || ''}
          medicineId={selectedMedicine?.id || null}
        />

        {/* Beds */}
        <BedsModule facilityId={selectedFacility?.id || null} />

        {/* Staff */}
        <StaffModule facilityId={selectedFacility?.id || null} />

        {/* Cross-border signals */}
        <CrossBorderSignals country={country} />
      </div>

      {/* Footer with data-honesty line */}
      <footer className="dashboard-footer" id="data-honesty-footer">
        <p>{DATA_HONESTY_TEXT}</p>
      </footer>
    </main>
  );
}
