'use client';

import { useId } from 'react';

interface RouteAnimationProps {
  sourceName: string;
  destName: string;
  distanceKm: number;
  etaHours: number;
  active: boolean;
}

export default function RouteAnimation({ sourceName, destName, distanceKm, etaHours, active }: RouteAnimationProps) {
  // useId provides a stable unique ID that does not change across renders.
  // We use it to give the animated elements unique, stable keys.
  const animId = useId();

  if (!active) return null;

  return (
    <div className="route-animation-container animate-in" id="route-animation">
      <div className="route-line">
        <div className="route-line-active" key={`line-${animId}`} />
      </div>
      <div className="route-node source" />
      <div className="route-node destination" />
      <div className="route-vehicle" key={`vehicle-${animId}`}>🚛</div>
      <div className="route-label source-label">{sourceName}</div>
      <div className="route-label dest-label">
        {destName}
        <br />
        <span style={{ color: 'var(--text-accent)', fontSize: '0.65rem' }}>{distanceKm}km · {etaHours}h ETA</span>
      </div>
    </div>
  );
}
