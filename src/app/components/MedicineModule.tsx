'use client';

import { useEffect, useState } from 'react';
import type { Medicine } from '@/types';

interface MedicineModuleProps {
  selectedMedicineId: string | null;
  onSelectMedicine: (m: Medicine) => void;
  facilityId: string | null;
}

export default function MedicineModule({ selectedMedicineId, onSelectMedicine, facilityId }: MedicineModuleProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [stock, setStock] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/medicines')
      .then((r) => r.json())
      .then((data: Medicine[]) => {
        setMedicines(data);
        if (!selectedMedicineId && data.length > 0) {
          onSelectMedicine(data[0]);
        }
      })
      .catch(() => setMedicines([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch citizen-check for stock info
  useEffect(() => {
    if (!facilityId || !selectedMedicineId) { setStock(null); return; }
    fetch(`/api/citizen-check?facilityId=${facilityId}&medicineId=${selectedMedicineId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'available') setStock(1);
        else if (data.status === 'low') setStock(0);
        else setStock(-1);
      })
      .catch(() => setStock(null));
  }, [facilityId, selectedMedicineId]);

  const selected = medicines.find((m) => m.id === selectedMedicineId);

  return (
    <div className="glass-card animate-in" id="medicine-module">
      <div className="card-header">
        <span className="card-title">💊 Medicine</span>
        {selected && (
          <span className="card-badge badge-info">{selected.category}</span>
        )}
      </div>
      <select
        className="pg-select w-full"
        id="medicine-select"
        value={selectedMedicineId || ''}
        onChange={(e) => {
          const m = medicines.find((med) => med.id === e.target.value);
          if (m) onSelectMedicine(m);
        }}
      >
        {medicines.map((m) => (
          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
        ))}
      </select>
      {facilityId && stock !== null && (
        <div className="mt-md" style={{ fontSize: '0.82rem' }}>
          <span style={{ color: stock > 0 ? 'var(--status-ok)' : stock === 0 ? 'var(--status-warning)' : 'var(--status-critical)' }}>
            {stock > 0 ? '● In Stock' : stock === 0 ? '● Low Stock' : '● Out of Stock'}
          </span>
        </div>
      )}
    </div>
  );
}
