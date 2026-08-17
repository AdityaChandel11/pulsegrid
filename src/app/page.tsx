'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Facility } from '@/types';
import type { Country } from '@/constants';
import CountryToggle from './components/CountryToggle';
import PulseLine from './components/PulseLine';
import KpiPanel from './components/KpiPanel';
import FacilityMap, { type ActiveRoute } from './components/FacilityMap';
import AtRiskList, { type AtRiskItem } from './components/AtRiskList';
import FacilityDetailPanel from './components/FacilityDetailPanel';
import CrossBorderSignals from './components/CrossBorderSignals';
import CitizenChecker from './components/CitizenChecker';

type ActiveModule = 'operations' | 'citizen' | 'signals';

export default function Home() {
  const [country, setCountry] = useState<Country>('india');
  const [activeModule, setActiveModule] = useState<ActiveModule>('operations');

  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);

  const [facilitySeverityMap, setFacilitySeverityMap] = useState<
    Record<string, 'low' | 'medium' | 'high' | 'surge'>
  >({});
  const [surgeActive, setSurgeActive] = useState(false);
  const [firstSurgeFacility, setFirstSurgeFacility] = useState<{
    facilityId: string;
    medicineId: string;
  } | null>(null);

  // Active redistribution route animation state
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);

  // Live simulation loop state
  const [isSimulating, setIsSimulating] = useState(true);
  const [simulationScenario, setSimulationScenario] = useState<'normal' | 'surge'>('normal');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [simTickCount, setSimTickCount] = useState(0);

  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch at-risk data to compute map severity and detect surge
  const fetchAtRiskState = useCallback(() => {
    fetch(`/api/at-risk?country=${country}`)
      .then((r) => r.json())
      .then((data: AtRiskItem[]) => {
        const severityMap: Record<string, 'low' | 'medium' | 'high' | 'surge'> = {};
        let foundSurge = false;
        let firstSurge: { facilityId: string; medicineId: string } | null = null;

        data.forEach((item) => {
          if (item.surgeFlag) {
            severityMap[item.facilityId] = 'surge';
            foundSurge = true;
            if (!firstSurge) {
              firstSurge = { facilityId: item.facilityId, medicineId: item.medicineId };
            }
          } else if (severityMap[item.facilityId] !== 'surge') {
            if (item.p50Days <= 5) {
              severityMap[item.facilityId] = 'high';
            } else if (item.p50Days <= 10 && severityMap[item.facilityId] !== 'high') {
              severityMap[item.facilityId] = 'medium';
            } else if (!severityMap[item.facilityId]) {
              severityMap[item.facilityId] = 'low';
            }
          }
        });

        setFacilitySeverityMap(severityMap);
        setSurgeActive(foundSurge);
        setFirstSurgeFacility(firstSurge);
      })
      .catch(() => {
        setSurgeActive(false);
      });
  }, [country]);

  // Initial and country change fetch
  useEffect(() => {
    fetchAtRiskState();
  }, [fetchAtRiskState, refreshTrigger]);

  // Live demo simulation loop (ticks simulation endpoint every 2 seconds when enabled)
  useEffect(() => {
    if (!isSimulating) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    simIntervalRef.current = setInterval(() => {
      fetch('/api/simulation/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, scenario: simulationScenario }),
      })
        .then((r) => r.json())
        .then(() => {
          setSimTickCount((prev) => prev + 1);
          setRefreshTrigger((prev) => prev + 1);
        })
        .catch(() => {});
    }, 2000);

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulating, country, simulationScenario]);

  // Handle Manual Single Step Simulation Tick
  const handleManualTick = useCallback(() => {
    fetch('/api/simulation/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, scenario: simulationScenario }),
    })
      .then((r) => r.json())
      .then(() => {
        setSimTickCount((prev) => prev + 1);
        setRefreshTrigger((prev) => prev + 1);
      })
      .catch(() => {});
  }, [country, simulationScenario]);

  // Handle facility selection from map or list
  const handleSelectFacility = useCallback((f: Facility) => {
    setSelectedFacility(f);
  }, []);

  const handleAtRiskSelect = useCallback(
    (facilityId: string, medicineId: string) => {
      setSelectedMedicineId(medicineId);
      fetch(`/api/facilities?country=${country}`)
        .then((r) => r.json())
        .then((facilities: Facility[]) => {
          const f = facilities.find((fac) => fac.id === facilityId);
          if (f) {
            setSelectedFacility(f);
          }
        })
        .catch(() => {});
    },
    [country],
  );

  // Jump to active surging facility when operator clicks pulse banner / KPI surge
  const handleJumpToSurge = useCallback(() => {
    if (!firstSurgeFacility) return;
    setActiveModule('operations');
    handleAtRiskSelect(firstSurgeFacility.facilityId, firstSurgeFacility.medicineId);
  }, [firstSurgeFacility, handleAtRiskSelect]);

  const handleCountryChange = useCallback((c: Country) => {
    setCountry(c);
    setSelectedFacility(null);
    setSelectedMedicineId(null);
    setActiveRoute(null);
  }, []);

  const handleApproveTransfer = useCallback((route: ActiveRoute) => {
    setActiveRoute(route);
    setRefreshTrigger((prev) => prev + 1);
    // Clear route animation after 8 seconds
    setTimeout(() => {
      setActiveRoute(null);
    }, 8000);
  }, []);

  return (
    <main className="dashboard-container">
      {/* Top Header Bar */}
      <header className="top-command-bar" id="top-command-bar">
        {/* Brand & Subtitle */}
        <div className="brand-group">
          <div className="brand-title-wrap">
            <span className="brand-icon">⚡</span>
            <h1 className="brand-title" id="dashboard-title">
              PulseGrid
            </h1>
            <span className="brand-env-badge">NOC COMMAND CENTER</span>
          </div>
          <p className="brand-subtitle">Federated Hospital Supply-Chain Control Tower</p>
        </div>

        {/* Module Switcher Tabs */}
        <nav className="module-tabs" id="module-navigation">
          <button
            className={`module-tab-btn ${activeModule === 'operations' ? 'active' : ''}`}
            onClick={() => setActiveModule('operations')}
            id="tab-operations"
          >
            📊 Operations Grid
          </button>
          <button
            className={`module-tab-btn ${activeModule === 'citizen' ? 'active' : ''}`}
            onClick={() => setActiveModule('citizen')}
            id="tab-citizen"
          >
            🏥 Citizen Checker
          </button>
          <button
            className={`module-tab-btn ${activeModule === 'signals' ? 'active' : ''}`}
            onClick={() => setActiveModule('signals')}
            id="tab-signals"
          >
            🌐 Cross-Border Signals
          </button>
        </nav>

        {/* Ambient Pulse Indicator & Country Selector */}
        <div className="top-right-group">
          <PulseLine surgeActive={surgeActive} onJumpToSurge={handleJumpToSurge} />
          <CountryToggle selected={country} onChange={handleCountryChange} />
        </div>
      </header>

      {/* Live Simulation Control HUD & Data Honesty Strip */}
      <div className="sim-control-strip" id="simulation-hud">
        <div className="sim-status-group">
          <div className={`live-pulse-dot ${isSimulating ? 'active' : 'paused'}`} />
          <span className="sim-label">
            LIVE SIMULATION STREAM: {isSimulating ? 'TRANSMITTING' : 'PAUSED'}
          </span>
          <span className="sim-ticks font-mono">
            {simTickCount > 0 ? `[Tick #${simTickCount}]` : '[Idle]'}
          </span>
        </div>

        <div className="sim-actions-group">
          <div className="scenario-toggle-wrap">
            <span className="scenario-label">Scenario:</span>
            <button
              className={`scenario-btn ${simulationScenario === 'normal' ? 'active' : ''}`}
              onClick={() => setSimulationScenario('normal')}
              id="scenario-normal-btn"
            >
              Normal Load
            </button>
            <button
              className={`scenario-btn emergency ${simulationScenario === 'surge' ? 'active' : ''}`}
              onClick={() => setSimulationScenario('surge')}
              id="scenario-surge-btn"
            >
              ⚡ Surge Surge Influx
            </button>
          </div>

          <button
            className={`sim-toggle-btn ${isSimulating ? 'pause' : 'play'}`}
            onClick={() => setIsSimulating(!isSimulating)}
            id="toggle-simulation-btn"
          >
            {isSimulating ? '⏸ Pause Stream' : '▶ Resume Stream'}
          </button>

          <button
            className="sim-step-btn"
            onClick={handleManualTick}
            title="Inject single deterministic event batch"
            id="manual-tick-btn"
          >
            ⚡ Step Tick
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="dashboard-content">
        {/* KPI Strip — Always visible across operations view */}
        <KpiPanel
          country={country}
          refreshTrigger={refreshTrigger}
          onSurgeClick={handleJumpToSurge}
        />

        {/* View 1: Operations Command Center (Default Hero View) */}
        {activeModule === 'operations' && (
          <div className="operations-split-layout">
            {/* Map (Hero ~60%) */}
            <div className="map-column">
              <FacilityMap
                country={country}
                onSelectFacility={handleSelectFacility}
                selectedFacilityId={selectedFacility?.id || null}
                facilitySeverity={facilitySeverityMap}
                activeRoute={activeRoute}
              />
            </div>

            {/* At-Risk Exception Ranking (~40%) */}
            <div className="ranking-column">
              <AtRiskList
                country={country}
                onSelectItem={handleAtRiskSelect}
                selectedFacilityId={selectedFacility?.id || null}
                selectedMedicineId={selectedMedicineId}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        )}

        {/* View 2: Citizen Availability Portal */}
        {activeModule === 'citizen' && (
          <div className="module-view-container animate-in">
            <CitizenChecker
              country={country}
              preselectedFacilityId={selectedFacility?.id}
              preselectedMedicineId={selectedMedicineId}
            />
          </div>
        )}

        {/* View 3: Cross-Border Signal Exchange */}
        {activeModule === 'signals' && (
          <div className="module-view-container animate-in">
            <CrossBorderSignals country={country} />
          </div>
        )}
      </div>

      {/* Slide-Over Facility Detail Panel */}
      {selectedFacility && (
        <FacilityDetailPanel
          facility={selectedFacility}
          selectedMedicineId={selectedMedicineId}
          onClose={() => {
            setSelectedFacility(null);
            setSelectedMedicineId(null);
          }}
          onApproveTransfer={handleApproveTransfer}
        />
      )}

      {/* Persistent Data Honesty Footer */}
      <footer className="dashboard-footer" id="data-honesty-footer">
        <div className="footer-content">
          <span className="footer-shield">🛡️</span>
          <p>
            <strong>PulseGrid Operational Integrity:</strong> For this live evaluation, the hospital/e-Aushadhi event stream is simulated deterministically through the SQLite event ledger. All forecasting percentiles (p10/p50/p90), confidence weights, surge detection z-scores, and redistribution candidates are recalculated dynamically from real runtime event state.
          </p>
        </div>
      </footer>
    </main>
  );
}
