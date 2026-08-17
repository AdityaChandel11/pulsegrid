'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Country } from '@/constants';

interface AtRiskItem {
  facilityId: string;
  medicineId: string;
  facilityName: string;
  facilityType: string;
  district: string;
  medicineName: string;
  p10Days: number;
  p50Days: number;
  p90Days: number;
  confidenceScore: number;
  surgeFlag: boolean;
  riskScore: number;
}

interface AtRiskListProps {
  country: Country;
  onSelectItem: (facilityId: string, medicineId: string) => void;
}

export default function AtRiskList({ country, onSelectItem }: AtRiskListProps) {
  const [items, setItems] = useState<AtRiskItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/at-risk?country=${country}`)
      .then((r) => r.json())
      .then((data: AtRiskItem[]) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [country]);

  const getSeverityClass = useCallback((p50: number, surge: boolean) => {
    if (surge) return 'severity-surge';
    if (p50 <= 5) return 'severity-critical';
    if (p50 <= 10) return 'severity-warning';
    return 'severity-ok';
  }, []);

  const displayItems = items.slice(0, 15);

  return (
    <div className="glass-card animate-in" id="at-risk-list">
      <div className="card-header">
        <span className="card-title">⚠️ At-Risk Ranking</span>
        <span className="card-badge badge-warning">{items.length} tracked</span>
      </div>

      {loading && <div className="shimmer" style={{ height: 200 }} />}

      {!loading && items.length === 0 && (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>No at-risk items</p>
      )}

      {!loading && displayItems.length > 0 && (
        <div className="at-risk-scroll">
          {displayItems.map((item, idx) => (
            <div
              key={`${item.facilityId}-${item.medicineId}`}
              className={`at-risk-row ${getSeverityClass(item.p50Days, item.surgeFlag)}`}
              onClick={() => onSelectItem(item.facilityId, item.medicineId)}
              id={`at-risk-item-${idx}`}
            >
              <div className="at-risk-rank font-mono">#{idx + 1}</div>
              <div className="at-risk-info">
                <div className="at-risk-facility">{item.facilityName}</div>
                <div className="at-risk-medicine">{item.medicineName}</div>
              </div>
              <div className="at-risk-metrics">
                <div className="at-risk-p50 font-mono">
                  {item.p50Days}<span className="at-risk-unit">d</span>
                </div>
                <div className="at-risk-badges">
                  {item.surgeFlag && <span className="card-badge badge-surge" style={{ fontSize: '0.55rem' }}>SURGE</span>}
                  <span className="at-risk-confidence font-mono">{item.confidenceScore}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
