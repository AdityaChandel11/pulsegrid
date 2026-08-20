'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import type { Facility, Medicine, InventoryEventSource, InventoryEventType } from '@/types';
import type { Country } from '@/constants';

interface StockSummary {
  currentStock: number;
  batches: Array<{
    batchNumber: string | null;
    expiryDate: string | null;
    estimatedQuantity: number;
    expiryStatus: 'ok' | 'expiring_soon' | 'expired';
  }>;
  activeBatchCount: number;
  earliestExpiry: string | null;
}

interface ForecastSummary {
  p10Days: number;
  p50Days: number;
  p90Days: number;
  confidenceScore: number;
  surgeFlag: boolean;
  source: InventoryEventSource;
  lastUpdated: string;
}

interface InventoryEventRow {
  id: string;
  facilityId: string;
  medicineId: string;
  type: InventoryEventType;
  quantity: number;
  timestamp: string;
  source: InventoryEventSource;
  batchNumber: string | null;
  expiryDate: string | null;
  notes: string | null;
  medicineName: string;
  medicineUnit: string;
  medicineCategory: string;
}

interface ParsedIntake {
  medicineId: string;
  medicineName: string;
  quantity: number;
  batchNumber: string;
  expiryDate: string;
  source: 'OCR_INVOICE' | 'VOICE_LOG';
  confidence: number;
  notes?: string;
  transcription?: string;
}

interface TrackRecordSummary {
  accuracyScore: number;
  avgErrorDays: number;
  sampleSize: number;
}

interface MedicineOperationsPanelProps {
  country: Country;
  initialFacilityId?: string | null;
  initialMedicineId?: string | null;
  onFacilityChange?: (facility: Facility) => void;
}

export default function MedicineOperationsPanel({
  country,
  initialFacilityId,
  initialMedicineId,
  onFacilityChange,
}: MedicineOperationsPanelProps) {
  const formId = useId();

  // Facility & Medicine lists
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // Active sub-view tab within the panel
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'receive' | 'dispense' | 'ledger' | 'batches' | 'confidence'
  >('overview');

  // Simulation clock
  const [simClock, setSimClock] = useState<string>('');

  // Per-medicine inventory stock summaries & forecast cache for the facility
  const [stockMap, setStockMap] = useState<Record<string, StockSummary>>({});
  const [forecastMap, setForecastMap] = useState<Record<string, ForecastSummary>>({});
  const [trackRecord, setTrackRecord] = useState<TrackRecordSummary | null>(null);

  // Full Ledger Events for selected facility
  const [events, setEvents] = useState<InventoryEventRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerMedicineFilter, setLedgerMedicineFilter] = useState<string>('all');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('all');

  // Form states: Receive Stock
  const [receiveMedId, setReceiveMedId] = useState<string>('');
  const [receiveQty, setReceiveQty] = useState<number>(100);
  const [receiveBatch, setReceiveBatch] = useState<string>('');
  const [receiveExpiry, setReceiveExpiry] = useState<string>('');
  const [receiveSource, setReceiveSource] = useState<InventoryEventSource>('BARCODE');
  const [receiveNotes, setReceiveNotes] = useState<string>('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveResult, setReceiveResult] = useState<{
    success: boolean;
    newStock?: number;
    error?: string;
  } | null>(null);

  // Form states: Dispense Stock
  const [dispenseMedId, setDispenseMedId] = useState<string>('');
  const [dispenseQty, setDispenseQty] = useState<number>(10);
  const [dispenseBatch, setDispenseBatch] = useState<string>('');
  const [dispenseNotes, setDispenseNotes] = useState<string>('');
  const [dispenseSubmitting, setDispenseSubmitting] = useState(false);
  const [dispenseResult, setDispenseResult] = useState<{
    success: boolean;
    newStock?: number;
    error?: string;
    requested?: number;
    available?: number;
  } | null>(null);

  // Smart Intake Simulation Modal State
  const [intakeModal, setIntakeModal] = useState<{
    open: boolean;
    type: 'ocr' | 'voice';
    loading: boolean;
    data: ParsedIntake | null;
  }>({
    open: false,
    type: 'ocr',
    loading: false,
    data: null,
  });

  // 1. Fetch simulation clock
  const fetchClock = useCallback(() => {
    fetch('/api/clock')
      .then((r) => r.json())
      .then((d: { simulationTime: string }) => {
        if (d.simulationTime) setSimClock(d.simulationTime);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchClock();
  }, [fetchClock]);

  // 2. Fetch Facilities for current country
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/facilities?country=${country}`)
      .then((r) => r.json())
      .then((data: Facility[]) => {
        if (cancelled) return;
        setFacilities(data);
        if (data.length > 0) {
          const match = initialFacilityId
            ? data.find((f) => f.id === initialFacilityId)
            : data[0];
          const chosen = match || data[0];
          setSelectedFacility(chosen);
          if (onFacilityChange) onFacilityChange(chosen);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [country, initialFacilityId, onFacilityChange]);

  // 3. Fetch Medicines catalog
  useEffect(() => {
    let cancelled = false;
    fetch('/api/medicines')
      .then((r) => r.json())
      .then((data: Medicine[]) => {
        if (cancelled) return;
        setMedicines(data);
        if (data.length > 0) {
          const match = initialMedicineId
            ? data.find((m) => m.id === initialMedicineId)
            : data[0];
          const chosen = match || data[0];
          setSelectedMedicine(chosen);
          setReceiveMedId(chosen.id);
          setDispenseMedId(chosen.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialMedicineId]);

  // 4. Fetch facility track record
  useEffect(() => {
    if (!selectedFacility) return;
    let cancelled = false;
    fetch(`/api/predictions/track-record/${selectedFacility.id}`)
      .then((r) => r.json())
      .then((d: TrackRecordSummary) => {
        if (!cancelled) setTrackRecord(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedFacility]);

  // 5. Fetch all Stock & Forecast for all medicines at current facility
  const refreshFacilityInventory = useCallback(() => {
    if (!selectedFacility || medicines.length === 0) return;

    fetchClock();

    // Fetch ledger events asynchronously
    Promise.resolve().then(() => {
      setLedgerLoading(true);
    });
    fetch(`/api/inventory/events?facilityId=${selectedFacility.id}&limit=100`)
      .then((r) => r.json())
      .then((eventData: InventoryEventRow[]) => {
        setEvents(eventData);
        setLedgerLoading(false);
      })
      .catch(() => {
        setEvents([]);
        setLedgerLoading(false);
      });

    // Fetch stock and forecast for each medicine
    medicines.forEach((med) => {
      fetch(`/api/inventory/stock?facilityId=${selectedFacility.id}&medicineId=${med.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((stockData: StockSummary | null) => {
          if (stockData) {
            setStockMap((prev) => ({ ...prev, [med.id]: stockData }));
          }
        })
        .catch(() => {});

      fetch(`/api/forecast/${selectedFacility.id}/${med.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((fcData: ForecastSummary | null) => {
          if (fcData) {
            setForecastMap((prev) => ({ ...prev, [med.id]: fcData }));
          }
        })
        .catch(() => {});
    });
  }, [selectedFacility, medicines, fetchClock]);

  useEffect(() => {
    refreshFacilityInventory();
  }, [refreshFacilityInventory]);

  // Handle Facility Selector Change
  const handleSelectFacility = (facilityId: string) => {
    const fac = facilities.find((f) => f.id === facilityId);
    if (fac) {
      setSelectedFacility(fac);
      if (onFacilityChange) onFacilityChange(fac);
      setReceiveResult(null);
      setDispenseResult(null);
    }
  };

  // Auto-generate batch number helper
  const generateNewBatchNumber = () => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `BT-${year}${month}-${random}`;
  };

  // Auto-generate default expiry date (24 months ahead)
  const generateDefaultExpiry = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().split('T')[0];
  };

  // Submit Receive Stock Form
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacility || !receiveMedId) return;

    setReceiveSubmitting(true);
    setReceiveResult(null);

    const batch = receiveBatch.trim() || generateNewBatchNumber();
    const expiry = receiveExpiry.trim() || generateDefaultExpiry();

    try {
      const res = await fetch('/api/inventory/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: selectedFacility.id,
          medicineId: receiveMedId,
          quantity: Number(receiveQty),
          source: receiveSource,
          batchNumber: batch,
          expiryDate: expiry,
          notes: receiveNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setReceiveResult({ success: true, newStock: data.newStock });
        setReceiveBatch('');
        setReceiveNotes('');
        refreshFacilityInventory();
      } else {
        setReceiveResult({ success: false, error: data.error || 'Failed to record stock receipt' });
      }
    } catch {
      setReceiveResult({ success: false, error: 'Network communication error' });
    } finally {
      setReceiveSubmitting(false);
    }
  };

  // Submit Dispense Stock Form
  const handleDispenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacility || !dispenseMedId) return;

    setDispenseSubmitting(true);
    setDispenseResult(null);

    try {
      const res = await fetch('/api/inventory/dispense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: selectedFacility.id,
          medicineId: dispenseMedId,
          quantity: Number(dispenseQty),
          batchNumber: dispenseBatch.trim() || undefined,
          notes: dispenseNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDispenseResult({ success: true, newStock: data.newStock });
        setDispenseNotes('');
        refreshFacilityInventory();
      } else {
        setDispenseResult({
          success: false,
          error: data.error || 'Failed to dispense stock',
          requested: data.requested,
          available: data.available,
        });
      }
    } catch {
      setDispenseResult({ success: false, error: 'Network communication error' });
    } finally {
      setDispenseSubmitting(false);
    }
  };

  // Launch Simulated OCR Intake
  const handleTriggerOcrIntake = async () => {
    setIntakeModal({ open: true, type: 'ocr', loading: true, data: null });
    try {
      const res = await fetch('/api/intake/ocr-demo', { method: 'POST' });
      const d = await res.json();
      setIntakeModal({
        open: true,
        type: 'ocr',
        loading: false,
        data: d.parsedData,
      });
    } catch {
      setIntakeModal({ open: false, type: 'ocr', loading: false, data: null });
    }
  };

  // Launch Simulated Voice Intake
  const handleTriggerVoiceIntake = async () => {
    setIntakeModal({ open: true, type: 'voice', loading: true, data: null });
    try {
      const res = await fetch('/api/intake/voice-demo', { method: 'POST' });
      const d = await res.json();
      setIntakeModal({
        open: true,
        type: 'voice',
        loading: false,
        data: {
          ...d.parsedData,
          transcription: d.transcription,
        },
      });
    } catch {
      setIntakeModal({ open: false, type: 'voice', loading: false, data: null });
    }
  };

  // Confirm and commit smart intake into SQLite via `/api/inventory/receive`
  const handleConfirmIntake = async () => {
    if (!selectedFacility || !intakeModal.data) return;
    const intake = intakeModal.data;

    try {
      const res = await fetch('/api/inventory/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: selectedFacility.id,
          medicineId: intake.medicineId,
          quantity: intake.quantity,
          source: intake.source,
          batchNumber: intake.batchNumber,
          expiryDate: intake.expiryDate,
          notes: intake.transcription
            ? `Voice intake verified: "${intake.transcription}"`
            : `OCR intake verified (confidence ${(intake.confidence * 100).toFixed(0)}%)`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIntakeModal({ open: false, type: 'ocr', loading: false, data: null });
        refreshFacilityInventory();
        setActiveSubTab('ledger');
      }
    } catch {
      // ignore
    }
  };

  // Filtered Ledger Events
  const filteredEvents = events.filter((ev) => {
    const matchesMed =
      ledgerMedicineFilter === 'all' || ev.medicineId === ledgerMedicineFilter;
    const matchesType =
      ledgerTypeFilter === 'all' || ev.type === ledgerTypeFilter;
    return matchesMed && matchesType;
  });

  const selectedMedStock = selectedMedicine ? stockMap[selectedMedicine.id] : null;
  const selectedMedForecast = selectedMedicine ? forecastMap[selectedMedicine.id] : null;

  return (
    <div className="medicine-operations-container animate-in" id="medicine-operations-panel">
      {/* Top Header & Context Control Strip */}
      <div className="med-ops-header-card glass-card">
        <div className="med-ops-header-left">
          <div className="med-ops-badge">⚡ AUTHORITATIVE MEDICINE LEDGER</div>
          <h2 className="med-ops-title">Hospital Medicine Operations Core</h2>
          <div className="med-ops-subtitle">
            Single-entry transactional pipeline for verified stock receipt, dispensing, lot tracking, and explainable forecasting.
          </div>
        </div>

        {/* Facility Selector & Clock Strip */}
        <div className="med-ops-header-controls">
          <div className="facility-picker-box">
            <label className="field-label" htmlFor={`fac-select-${formId}`}>
              Active Hospital / Facility ({country.toUpperCase()})
            </label>
            <select
              id={`fac-select-${formId}`}
              className="pg-select w-full"
              value={selectedFacility?.id || ''}
              onChange={(e) => handleSelectFacility(e.target.value)}
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.type} · {f.district})
                </option>
              ))}
            </select>
          </div>

          <div className="sim-clock-display-box" id="sim-clock-badge">
            <div className="clock-tag">AUTHORITATIVE SIMULATION CLOCK</div>
            <div className="clock-time font-mono">
              📅 {simClock ? simClock.replace('T', ' ').substring(0, 19) + ' UTC' : 'Syncing clock...'}
            </div>
            <div className="clock-note">Decoupled from wall-clock time</div>
          </div>
        </div>
      </div>

      {/* Smart Intake Quick Trigger Bar */}
      <div className="smart-intake-bar glass-card">
        <div className="smart-intake-info">
          <span className="smart-icon">🤖</span>
          <div>
            <div className="smart-title">Multimodal Smart Intake Pipeline</div>
            <div className="smart-desc">
              Deterministic simulated adapters for invoice OCR scans and clinical voice logs. All outputs require human verification before being committed to the ledger.
            </div>
          </div>
        </div>

        <div className="smart-intake-actions">
          <button
            type="button"
            className="btn-intake-ocr"
            id="btn-trigger-ocr"
            onClick={handleTriggerOcrIntake}
          >
            📄 Simulate OCR Invoice Scan
          </button>
          <button
            type="button"
            className="btn-intake-voice"
            id="btn-trigger-voice"
            onClick={handleTriggerVoiceIntake}
          >
            🎙️ Simulate Voice Log Entry
          </button>
        </div>
      </div>

      {/* Operations Navigation Tabs */}
      <div className="med-ops-tabs-nav">
        <button
          type="button"
          className={`med-ops-tab-btn ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
          id="tab-ops-overview"
        >
          📊 Inventory & Risk Overview
        </button>
        <button
          type="button"
          className={`med-ops-tab-btn ${activeSubTab === 'receive' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('receive')}
          id="tab-ops-receive"
        >
          📥 Receive Stock
        </button>
        <button
          type="button"
          className={`med-ops-tab-btn ${activeSubTab === 'dispense' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('dispense')}
          id="tab-ops-dispense"
        >
          📤 Dispense Stock
        </button>
        <button
          type="button"
          className={`med-ops-tab-btn ${activeSubTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('ledger')}
          id="tab-ops-ledger"
        >
          📜 Transaction Ledger ({events.length})
        </button>
        <button
          type="button"
          className={`med-ops-tab-btn ${activeSubTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('batches')}
          id="tab-ops-batches"
        >
          🏷️ Lot & Expiry Tracker
        </button>
        <button
          type="button"
          className={`med-ops-tab-btn ${activeSubTab === 'confidence' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('confidence')}
          id="tab-ops-confidence"
        >
          🎯 Explainable Confidence
        </button>
      </div>

      {/* TAB 1: INVENTORY OVERVIEW TABLE */}
      {activeSubTab === 'overview' && (
        <div className="med-ops-tab-content glass-card animate-in">
          <div className="tab-section-header">
            <div>
              <h3 className="section-heading">Facility Medicine Inventory & Forecast Status</h3>
              <p className="section-subtext">
                Live derived stock from event ledger. Monte Carlo P10/P50/P90 days to stockout and confidence calculated at runtime.
              </p>
            </div>
            <button
              type="button"
              className="btn-refresh"
              onClick={refreshFacilityInventory}
              title="Refresh ledger state"
            >
              🔄 Refresh State
            </button>
          </div>

          <div className="med-inventory-table-wrap">
            <table className="med-inventory-table" id="med-inventory-table">
              <thead>
                <tr>
                  <th>Medicine Name</th>
                  <th>Category</th>
                  <th>On-Hand Stock</th>
                  <th>Risk Band (P10 / P50 / P90)</th>
                  <th>Confidence</th>
                  <th>Earliest Lot Expiry</th>
                  <th>Source Stream</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((m) => {
                  const s = stockMap[m.id];
                  const fc = forecastMap[m.id];
                  const stock = s ? s.currentStock : '—';
                  const isSelected = selectedMedicine?.id === m.id;

                  const p50 = fc ? fc.p50Days : null;
                  const severityClass =
                    fc?.surgeFlag
                      ? 'badge-surge'
                      : p50 !== null && p50 <= 5
                      ? 'badge-critical'
                      : p50 !== null && p50 <= 10
                      ? 'badge-warning'
                      : 'badge-ok';

                  const statusLabel =
                    fc?.surgeFlag
                      ? '⚡ SURGE ACTIVE'
                      : p50 !== null && p50 <= 5
                      ? `CRITICAL (${p50}d)`
                      : p50 !== null && p50 <= 10
                      ? `WATCH (${p50}d)`
                      : p50 !== null
                      ? `NORMAL (${p50}d)`
                      : 'CALCULATING';

                  return (
                    <tr
                      key={m.id}
                      className={isSelected ? 'selected-row' : ''}
                      onClick={() => {
                        setSelectedMedicine(m);
                        setReceiveMedId(m.id);
                        setDispenseMedId(m.id);
                      }}
                    >
                      <td className="med-name-cell">
                        <strong>{m.name}</strong>
                        <span className="med-unit-tag">{m.unit}</span>
                      </td>
                      <td>
                        <span className="med-cat-pill">{m.category}</span>
                      </td>
                      <td className="font-mono med-stock-cell">
                        <strong className={Number(stock) <= 0 ? 'text-critical' : 'text-accent'}>
                          {stock}
                        </strong>
                      </td>
                      <td className="font-mono">
                        {fc ? (
                          <div className="risk-band-pill">
                            <span className="text-critical">{fc.p10Days}d</span> /{' '}
                            <span className="text-warning font-bold">{fc.p50Days}d</span> /{' '}
                            <span className="text-ok">{fc.p90Days}d</span>
                          </div>
                        ) : (
                          <span className="text-muted">...</span>
                        )}
                      </td>
                      <td>
                        {fc ? (
                          <span
                            className="font-mono font-semibold"
                            style={{
                              color:
                                fc.confidenceScore >= 70
                                  ? 'var(--status-ok)'
                                  : fc.confidenceScore >= 40
                                  ? 'var(--status-warning)'
                                  : 'var(--status-critical)',
                            }}
                          >
                            {fc.confidenceScore}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.78rem' }}>
                        {s?.earliestExpiry ? (
                          <span>🗓️ {s.earliestExpiry}</span>
                        ) : (
                          <span className="text-muted">None active</span>
                        )}
                      </td>
                      <td>
                        <span className="source-mini-tag">
                          📡 {fc?.source || 'MANUAL'}
                        </span>
                      </td>
                      <td>
                        <span className={`card-badge ${severityClass}`}>{statusLabel}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-inspect-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMedicine(m);
                            setReceiveMedId(m.id);
                            setDispenseMedId(m.id);
                            setActiveSubTab('batches');
                          }}
                        >
                          Inspect Lots →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RECEIVE STOCK FORM */}
      {activeSubTab === 'receive' && (
        <div className="med-ops-tab-content glass-card animate-in">
          <div className="form-split-grid">
            <div className="form-column">
              <h3 className="section-heading">📥 Record Verified Stock Receipt</h3>
              <p className="section-subtext">
                Enters positive quantity into the authoritative ledger. Lot/batch and expiry dates are indexed for inventory freshness tracking.
              </p>

              <form onSubmit={handleReceiveSubmit} className="med-ops-form" id="receive-stock-form">
                <div className="form-field">
                  <label className="field-label" htmlFor={`rcv-med-${formId}`}>
                    Select Medicine to Receive
                  </label>
                  <select
                    id={`rcv-med-${formId}`}
                    className="pg-select w-full"
                    value={receiveMedId}
                    onChange={(e) => setReceiveMedId(e.target.value)}
                    required
                  >
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.unit}) — {m.category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row-2">
                  <div className="form-field">
                    <label className="field-label" htmlFor={`rcv-qty-${formId}`}>
                      Quantity Received (Units)
                    </label>
                    <input
                      id={`rcv-qty-${formId}`}
                      type="number"
                      min="1"
                      step="1"
                      className="pg-input w-full font-mono"
                      value={receiveQty}
                      onChange={(e) => setReceiveQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="field-label" htmlFor={`rcv-src-${formId}`}>
                      Canonical Intake Source
                    </label>
                    <select
                      id={`rcv-src-${formId}`}
                      className="pg-select w-full"
                      value={receiveSource}
                      onChange={(e) => setReceiveSource(e.target.value as InventoryEventSource)}
                      required
                    >
                      <option value="BARCODE">BARCODE (Physical Scan)</option>
                      <option value="OCR_INVOICE">OCR_INVOICE (Invoice Ingestion)</option>
                      <option value="VOICE_LOG">VOICE_LOG (Clinician Audio Log)</option>
                      <option value="MANUAL">MANUAL (Manual Portal Entry)</option>
                      <option value="SIMULATION">SIMULATION (Automated Stream)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-field">
                    <label className="field-label" htmlFor={`rcv-batch-${formId}`}>
                      Batch / Lot Number (Optional)
                    </label>
                    <input
                      id={`rcv-batch-${formId}`}
                      type="text"
                      placeholder="e.g. BT-202608-4821"
                      className="pg-input w-full font-mono"
                      value={receiveBatch}
                      onChange={(e) => setReceiveBatch(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="field-label" htmlFor={`rcv-exp-${formId}`}>
                      Expiry Date (YYYY-MM-DD)
                    </label>
                    <input
                      id={`rcv-exp-${formId}`}
                      type="date"
                      className="pg-input w-full font-mono"
                      value={receiveExpiry}
                      onChange={(e) => setReceiveExpiry(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="field-label" htmlFor={`rcv-notes-${formId}`}>
                    Notes / Delivery Reference
                  </label>
                  <input
                    id={`rcv-notes-${formId}`}
                    type="text"
                    placeholder="e.g. Central Medical Store truck dispatch #402"
                    className="pg-input w-full"
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={receiveSubmitting}
                  id="btn-submit-receive"
                >
                  {receiveSubmitting ? 'Writing to SQLite Ledger...' : '✓ Authorize & Commit Stock Receipt'}
                </button>
              </form>

              {receiveResult && (
                <div
                  className={`result-banner animate-in ${
                    receiveResult.success ? 'result-success' : 'result-error'
                  }`}
                  id="receive-result-banner"
                >
                  {receiveResult.success ? (
                    <div>
                      <strong>✓ Stock Ingested Successfully!</strong>
                      <p>
                        New verified stock for this medicine: <strong>{receiveResult.newStock} units</strong>.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <strong>✕ Ingestion Rejected</strong>
                      <p>{receiveResult.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="info-column">
              <div className="info-card">
                <h4 className="info-title">🛡️ Event Sourcing Invariants</h4>
                <ul className="info-list">
                  <li>
                    <strong>Quantity &gt; 0:</strong> Negative quantities are rejected at the database service layer with <code>InvalidQuantityError</code>.
                  </li>
                  <li>
                    <strong>No Stock Cache:</strong> Current stock is always calculated dynamically as <code>Σ(RECEIVED + TRANSFERRED_IN) − Σ(DISPENSED + TRANSFERRED_OUT + EXPIRED + DAMAGED)</code>.
                  </li>
                  <li>
                    <strong>Deterministic Auditability:</strong> Every receipt creates an immutable record tied to timestamp, batch, and verified source.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DISPENSE STOCK FORM */}
      {activeSubTab === 'dispense' && (
        <div className="med-ops-tab-content glass-card animate-in">
          <div className="form-split-grid">
            <div className="form-column">
              <h3 className="section-heading">📤 Record Clinical Dispensation</h3>
              <p className="section-subtext">
                Authoritatively decreases hospital stock. Outflow transactions that exceed verified on-hand stock are atomically rejected.
              </p>

              <form onSubmit={handleDispenseSubmit} className="med-ops-form" id="dispense-stock-form">
                <div className="form-field">
                  <label className="field-label" htmlFor={`dsp-med-${formId}`}>
                    Select Medicine to Dispense
                  </label>
                  <select
                    id={`dsp-med-${formId}`}
                    className="pg-select w-full"
                    value={dispenseMedId}
                    onChange={(e) => {
                      setDispenseMedId(e.target.value);
                      setDispenseResult(null);
                    }}
                    required
                  >
                    {medicines.map((m) => {
                      const s = stockMap[m.id]?.currentStock ?? 0;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} — Current Stock: {s} {m.unit}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="form-row-2">
                  <div className="form-field">
                    <label className="field-label" htmlFor={`dsp-qty-${formId}`}>
                      Quantity to Dispense (Units)
                    </label>
                    <input
                      id={`dsp-qty-${formId}`}
                      type="number"
                      min="1"
                      step="1"
                      className="pg-input w-full font-mono"
                      value={dispenseQty}
                      onChange={(e) => setDispenseQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="field-label" htmlFor={`dsp-batch-${formId}`}>
                      Lot / Batch Reference (Optional)
                    </label>
                    <input
                      id={`dsp-batch-${formId}`}
                      type="text"
                      placeholder="e.g. BT-202608-4821"
                      className="pg-input w-full font-mono"
                      value={dispenseBatch}
                      onChange={(e) => setDispenseBatch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="field-label" htmlFor={`dsp-notes-${formId}`}>
                    Prescription / Ward Details
                  </label>
                  <input
                    id={`dsp-notes-${formId}`}
                    type="text"
                    placeholder="e.g. Emergency ward triage #8839"
                    className="pg-input w-full"
                    value={dispenseNotes}
                    onChange={(e) => setDispenseNotes(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={dispenseSubmitting}
                  id="btn-submit-dispense"
                >
                  {dispenseSubmitting ? 'Validating Stock & Writing...' : '✓ Authorize & Dispense Stock'}
                </button>
              </form>

              {dispenseResult && (
                <div
                  className={`result-banner animate-in ${
                    dispenseResult.success ? 'result-success' : 'result-error'
                  }`}
                  id="dispense-result-banner"
                >
                  {dispenseResult.success ? (
                    <div>
                      <strong>✓ Dispensation Committed to Ledger!</strong>
                      <p>
                        Updated verified on-hand stock: <strong>{dispenseResult.newStock} units</strong>.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <strong>✕ Outflow Operation Rejected (Insufficient Stock)</strong>
                      <p>{dispenseResult.error}</p>
                      {dispenseResult.requested !== undefined && (
                        <div className="rejection-breakdown font-mono">
                          Requested: {dispenseResult.requested} units | Available: {dispenseResult.available} units
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="info-column">
              <div className="info-card warning-border">
                <h4 className="info-title text-warning">⚠️ Negative Stock Prevention</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  The backend enforces an atomic transaction check before emitting any <code>DISPENSED</code>, <code>TRANSFERRED_OUT</code>, <code>EXPIRED</code>, or <code>DAMAGED</code> event. If the requested quantity exceeds the sum of positive events, the SQLite transaction throws <code>InsufficientStockError</code> and cancels the operation without modifying state.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TRANSACTION LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="med-ops-tab-content glass-card animate-in">
          <div className="tab-section-header">
            <div>
              <h3 className="section-heading">Chronological Event Sourced Ledger</h3>
              <p className="section-subtext">
                Authoritative transaction ledger for {selectedFacility?.name}. All stock is mathematically derived from these rows.
              </p>
            </div>

            {/* Filter Bar */}
            <div className="ledger-filter-bar">
              <select
                className="pg-select"
                value={ledgerMedicineFilter}
                onChange={(e) => setLedgerMedicineFilter(e.target.value)}
                id="ledger-filter-med"
              >
                <option value="all">All Medicines</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                className="pg-select"
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
                id="ledger-filter-type"
              >
                <option value="all">All Event Types</option>
                <option value="RECEIVED">RECEIVED (+)</option>
                <option value="DISPENSED">DISPENSED (−)</option>
                <option value="TRANSFERRED_IN">TRANSFERRED_IN (+)</option>
                <option value="TRANSFERRED_OUT">TRANSFERRED_OUT (−)</option>
                <option value="EXPIRED">EXPIRED (−)</option>
                <option value="DAMAGED">DAMAGED (−)</option>
              </select>
            </div>
          </div>

          {ledgerLoading ? (
            <div className="shimmer" style={{ height: 300, borderRadius: 8 }} />
          ) : filteredEvents.length === 0 ? (
            <div className="empty-state-box">
              <p className="text-muted">No inventory events matching selected criteria.</p>
            </div>
          ) : (
            <div className="ledger-table-wrap">
              <table className="ledger-table" id="inventory-ledger-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Medicine</th>
                    <th>Event Type</th>
                    <th>Quantity</th>
                    <th>Source</th>
                    <th>Batch #</th>
                    <th>Expiry Date</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((ev) => {
                    const isPositive =
                      ev.type === 'RECEIVED' || ev.type === 'TRANSFERRED_IN';
                    const typeClass =
                      ev.type === 'RECEIVED'
                        ? 'badge-ok'
                        : ev.type === 'TRANSFERRED_IN'
                        ? 'badge-info'
                        : ev.type === 'DISPENSED'
                        ? 'badge-warning'
                        : ev.type === 'TRANSFERRED_OUT'
                        ? 'badge-critical'
                        : 'badge-surge';

                    return (
                      <tr key={ev.id}>
                        <td className="font-mono text-muted" style={{ fontSize: '0.74rem' }}>
                          {ev.timestamp.replace('T', ' ').substring(0, 19)}
                        </td>
                        <td>
                          <strong>{ev.medicineName}</strong>
                        </td>
                        <td>
                          <span className={`card-badge ${typeClass}`}>{ev.type}</span>
                        </td>
                        <td className="font-mono">
                          <strong className={isPositive ? 'text-ok' : 'text-critical'}>
                            {isPositive ? `+${ev.quantity}` : `−${ev.quantity}`}
                          </strong>
                        </td>
                        <td>
                          <span className="source-mini-tag">📡 {ev.source}</span>
                        </td>
                        <td className="font-mono" style={{ fontSize: '0.74rem' }}>
                          {ev.batchNumber || '—'}
                        </td>
                        <td className="font-mono" style={{ fontSize: '0.74rem' }}>
                          {ev.expiryDate || '—'}
                        </td>
                        <td className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {ev.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BATCH & EXPIRY TRACKER */}
      {activeSubTab === 'batches' && (
        <div className="med-ops-tab-content glass-card animate-in">
          <div className="tab-section-header">
            <div>
              <h3 className="section-heading">
                Active Lot / Batch Inventory for {selectedMedicine?.name}
              </h3>
              <p className="section-subtext">
                Lot-specific tracking with automated shelf-life degradation countdowns and quarantine alerts.
              </p>
            </div>

            <select
              className="pg-select"
              value={selectedMedicine?.id || ''}
              onChange={(e) => {
                const m = medicines.find((item) => item.id === e.target.value);
                if (m) setSelectedMedicine(m);
              }}
            >
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="batch-grid">
            <div className="batch-summary-card">
              <div className="batch-summary-stat">
                <span className="stat-label">Total On-Hand Stock</span>
                <span className="stat-num text-accent font-mono">
                  {selectedMedStock?.currentStock ?? 0} {selectedMedicine?.unit}
                </span>
              </div>
              <div className="batch-summary-stat">
                <span className="stat-label">Active Lots</span>
                <span className="stat-num font-mono">
                  {selectedMedStock?.activeBatchCount ?? 0}
                </span>
              </div>
              <div className="batch-summary-stat">
                <span className="stat-label">Earliest Expiry Date</span>
                <span className="stat-num text-warning font-mono">
                  {selectedMedStock?.earliestExpiry || 'None'}
                </span>
              </div>
            </div>

            <div className="batch-cards-container">
              {selectedMedStock?.batches && selectedMedStock.batches.length > 0 ? (
                selectedMedStock.batches.map((b, idx) => {
                  const statusBadge =
                    b.expiryStatus === 'expired'
                      ? 'badge-critical'
                      : b.expiryStatus === 'expiring_soon'
                      ? 'badge-warning'
                      : 'badge-ok';

                  const statusText =
                    b.expiryStatus === 'expired'
                      ? 'EXPIRED (QUARANTINE)'
                      : b.expiryStatus === 'expiring_soon'
                      ? 'EXPIRING SOON (≤30d)'
                      : 'SHELF STABLE';

                  return (
                    <div key={b.batchNumber || idx} className="batch-item-card">
                      <div className="batch-item-header">
                        <span className="batch-num-tag font-mono">🏷️ {b.batchNumber || 'Unassigned'}</span>
                        <span className={`card-badge ${statusBadge}`}>{statusText}</span>
                      </div>
                      <div className="batch-item-body">
                        <div>
                          <span className="batch-stat-label">Estimated Quantity:</span>
                          <span className="batch-stat-val font-mono">{b.estimatedQuantity} units</span>
                        </div>
                        <div>
                          <span className="batch-stat-label">Expiry Date:</span>
                          <span className="batch-stat-val font-mono">
                            {b.expiryDate ? `🗓️ ${b.expiryDate}` : 'No date recorded'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state-box">
                  <p className="text-muted">No indexed batches for {selectedMedicine?.name}.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: EXPLAINABLE CONFIDENCE */}
      {activeSubTab === 'confidence' && (
        <div className="med-ops-tab-content glass-card animate-in">
          <div className="tab-section-header">
            <div>
              <h3 className="section-heading">
                Explainable Confidence Decomposition for {selectedMedicine?.name}
              </h3>
              <p className="section-subtext">
                Deterministic mathematical breakdown of how forecasting confidence is computed from data stream freshness and historical accuracy.
              </p>
            </div>

            <select
              className="pg-select"
              value={selectedMedicine?.id || ''}
              onChange={(e) => {
                const m = medicines.find((item) => item.id === e.target.value);
                if (m) setSelectedMedicine(m);
              }}
            >
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="confidence-breakdown-grid">
            <div className="formula-card">
              <h4 className="info-title">📐 Authoritative Formula</h4>
              <div className="formula-box font-mono">
                Confidence = (0.60 × FreshnessScore) + (0.40 × HistoricalAccuracy)
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                Freshness decays exponentially with a half-life of 48 hours relative to the SimulationClock. Historical accuracy is computed from past predictions that reached resolution.
              </p>
            </div>

            <div className="breakdown-factors-grid">
              <div className="factor-box">
                <span className="factor-name">Overall Confidence Score</span>
                <span
                  className="factor-val font-mono"
                  style={{
                    color:
                      (selectedMedForecast?.confidenceScore ?? 0) >= 70
                        ? 'var(--status-ok)'
                        : (selectedMedForecast?.confidenceScore ?? 0) >= 40
                        ? 'var(--status-warning)'
                        : 'var(--status-critical)',
                  }}
                >
                  {selectedMedForecast?.confidenceScore ?? '—'}%
                </span>
                <span className="factor-weight">Weighted Synthesis</span>
              </div>

              <div className="factor-box">
                <span className="factor-name">Stream Freshness Factor</span>
                <span className="factor-val font-mono text-accent">
                  {selectedMedForecast ? `📡 ${selectedMedForecast.source}` : '—'}
                </span>
                <span className="factor-weight">60% Weight in Final Score</span>
              </div>

              <div className="factor-box">
                <span className="factor-name">Facility Historical Accuracy</span>
                <span className="factor-val font-mono text-ok">
                  {trackRecord ? `${Math.round(trackRecord.accuracyScore * 100)}%` : '—'}
                </span>
                <span className="factor-weight">
                  40% Weight (±{trackRecord?.avgErrorDays ?? 0}d avg error, {trackRecord?.sampleSize ?? 0} samples)
                </span>
              </div>

              <div className="factor-box">
                <span className="factor-name">Active Consumption Velocity</span>
                <span className="factor-val font-mono">
                  {selectedMedForecast?.surgeFlag ? (
                    <span className="text-critical">⚡ Surge Multiplier (3.5x)</span>
                  ) : (
                    <span className="text-ok">Nominal Poisson Rate</span>
                  )}
                </span>
                <span className="factor-weight">Z-Score &gt; 2.0 Threshold</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMART INTAKE MODAL (Simulated OCR / Voice Review & Confirm) */}
      {intakeModal.open && (
        <div className="intake-modal-backdrop" id="intake-modal-backdrop">
          <div className="intake-modal glass-card animate-in" id="intake-modal">
            <div className="intake-modal-header">
              <div className="intake-title-wrap">
                <span className="intake-icon">
                  {intakeModal.type === 'ocr' ? '📄' : '🎙️'}
                </span>
                <div>
                  <h3 className="intake-modal-title">
                    {intakeModal.type === 'ocr'
                      ? 'Simulated Invoice OCR Intake'
                      : 'Simulated Voice Log Intake'}
                  </h3>
                  <span className="card-badge badge-warning">
                    SIMULATED ADAPTER DEMO — CONFIRMATION REQUIRED
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setIntakeModal({ open: false, type: 'ocr', loading: false, data: null })}
              >
                ✕
              </button>
            </div>

            <div className="intake-modal-body">
              {intakeModal.loading ? (
                <div className="intake-loading-state">
                  <div className="shimmer" style={{ height: 160, borderRadius: 8 }} />
                  <p className="text-muted mt-md">Parsing intake data stream...</p>
                </div>
              ) : intakeModal.data ? (
                <div className="intake-parsed-preview">
                  {intakeModal.data.transcription && (
                    <div className="transcription-bubble">
                      <span className="transcription-label">Transcribed Audio Stream:</span>
                      <p className="transcription-text">&ldquo;{intakeModal.data.transcription}&rdquo;</p>
                    </div>
                  )}

                  <div className="intake-fields-grid">
                    <div className="intake-field">
                      <span className="field-label">Target Facility</span>
                      <span className="intake-val">{selectedFacility?.name}</span>
                    </div>

                    <div className="intake-field">
                      <span className="field-label">Extracted Medicine</span>
                      <span className="intake-val text-accent">{intakeModal.data.medicineName}</span>
                    </div>

                    <div className="intake-field">
                      <span className="field-label">Parsed Quantity</span>
                      <span className="intake-val font-mono">{intakeModal.data.quantity} units</span>
                    </div>

                    <div className="intake-field">
                      <span className="field-label">Generated Lot / Batch</span>
                      <span className="intake-val font-mono">{intakeModal.data.batchNumber}</span>
                    </div>

                    <div className="intake-field">
                      <span className="field-label">Parsed Expiry Date</span>
                      <span className="intake-val font-mono">{intakeModal.data.expiryDate}</span>
                    </div>

                    <div className="intake-field">
                      <span className="field-label">Extraction Confidence</span>
                      <span className="intake-val text-ok font-mono">
                        {(intakeModal.data.confidence * 100).toFixed(0)}% verified
                      </span>
                    </div>
                  </div>

                  <div className="intake-guarantee-note">
                    🛡️ This record will be committed to the SQLite ledger with source{' '}
                    <strong>{intakeModal.data.source}</strong>.
                  </div>

                  <div className="intake-modal-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => setIntakeModal({ open: false, type: 'ocr', loading: false, data: null })}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      id="btn-confirm-intake"
                      onClick={handleConfirmIntake}
                    >
                      ✓ Confirm & Commit to Ledger
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
