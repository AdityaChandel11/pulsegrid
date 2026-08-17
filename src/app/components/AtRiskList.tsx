'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Country } from '@/constants';

export interface AtRiskItem {
  facilityId: string;
  medicineId: string;
  facilityName: string;
  facilityType: string;
  district: string;
  medicineName: string;
  medicineCategory: string;
  p10Days: number;
  p50Days: number;
  p90Days: number;
  confidenceScore: number;
  surgeFlag: boolean;
  riskScore: number;
  source: 'api' | 'barcode' | 'manual';
  lastUpdated: string;
  freshnessText: string;
}

interface AtRiskListProps {
  country: Country;
  onSelectItem: (facilityId: string, medicineId: string) => void;
  selectedFacilityId?: string | null;
  selectedMedicineId?: string | null;
  refreshTrigger?: number;
}

export default function AtRiskList({
  country,
  onSelectItem,
  selectedFacilityId,
  selectedMedicineId,
  refreshTrigger,
}: AtRiskListProps) {
  const [items, setItems] = useState<AtRiskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/at-risk?country=${country}`)
      .then((r) => r.json())
      .then((data: AtRiskItem[]) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [country, refreshTrigger]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((item) => {
      if (item.medicineCategory) cats.add(item.medicineCategory);
    });
    return Array.from(cats);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        categoryFilter === 'all' || item.medicineCategory === categoryFilter;
      const matchesSearch =
        !searchQuery ||
        item.facilityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.medicineName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.district.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [items, categoryFilter, searchQuery]);

  const surgeCount = items.filter((i) => i.surgeFlag).length;

  return (
    <div className="glass-card at-risk-card animate-in" id="at-risk-list">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-title">⚠️ At-Risk Supply Ranking</span>
          <span className="card-badge badge-warning font-mono">{items.length} items</span>
        </div>
        {surgeCount > 0 && (
          <span className="card-badge badge-surge animate-pulse">
            ⚡ {surgeCount} Active {surgeCount === 1 ? 'Surge' : 'Surges'}
          </span>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="at-risk-filter-bar">
        <input
          type="text"
          className="pg-input at-risk-search-input"
          placeholder="Filter facility, district or medicine..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          id="at-risk-search-input"
        />

        <select
          className="pg-select at-risk-category-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          id="at-risk-category-filter"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading && items.length === 0 ? (
        <div className="shimmer" style={{ height: 280, borderRadius: 8 }} />
      ) : filteredItems.length === 0 ? (
        <div className="empty-at-risk">
          <p className="text-muted">No at-risk items matching filter criteria</p>
        </div>
      ) : (
        <div className="at-risk-scroll" id="at-risk-scroll-container">
          {filteredItems.map((item, idx) => {
            const isSelected =
              selectedFacilityId === item.facilityId &&
              (!selectedMedicineId || selectedMedicineId === item.medicineId);

            const severityClass = item.surgeFlag
              ? 'severity-surge'
              : item.p50Days <= 5
              ? 'severity-critical'
              : item.p50Days <= 10
              ? 'severity-warning'
              : 'severity-ok';

            return (
              <div
                key={`${item.facilityId}-${item.medicineId}`}
                className={`at-risk-row ${severityClass} ${isSelected ? 'row-selected' : ''}`}
                onClick={() => onSelectItem(item.facilityId, item.medicineId)}
                id={`at-risk-item-${item.facilityId}-${item.medicineId}`}
              >
                {/* Rank number */}
                <div className="at-risk-rank font-mono">#{idx + 1}</div>

                {/* Facility & Medicine Details */}
                <div className="at-risk-info">
                  <div className="at-risk-facility-row">
                    <span className="at-risk-facility">{item.facilityName}</span>
                    <span className="at-risk-district-tag">
                      {item.facilityType} · {item.district}
                    </span>
                  </div>

                  <div className="at-risk-medicine-row">
                    <span className="at-risk-medicine">{item.medicineName}</span>
                    <span className="at-risk-category-badge">{item.medicineCategory}</span>
                  </div>

                  {/* Inline Source & Freshness */}
                  <div className="at-risk-meta-inline">
                    <span className="freshness-tag">
                      📡 {item.source} · {item.freshnessText}
                    </span>
                  </div>
                </div>

                {/* Metrics: P50 Days, Confidence, Surge Badge */}
                <div className="at-risk-metrics">
                  <div className="at-risk-p50-box">
                    <div className="at-risk-p50 font-mono">
                      {item.p50Days}
                      <span className="at-risk-unit">d</span>
                    </div>
                    <div className="at-risk-p50-label">to stockout</div>
                  </div>

                  <div className="at-risk-badges">
                    {item.surgeFlag && (
                      <span className="card-badge badge-surge animate-pulse" style={{ fontSize: '0.62rem' }}>
                        ⚡ SURGE
                      </span>
                    )}
                    <span className="at-risk-confidence-pill font-mono">
                      {item.confidenceScore}% confidence
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
