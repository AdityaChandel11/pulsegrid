'use client';

interface RouteAnimationProps {
  sourceName: string;
  destName: string;
  distanceKm: number;
  etaHours: number;
  active: boolean;
}

export default function RouteAnimation({ sourceName, destName, distanceKm, etaHours, active }: RouteAnimationProps) {
  if (!active) return null;

  return (
    <div className="route-animation-container animate-in" id="route-animation">
      <div className="route-line">
        <div className="route-line-active" key={Date.now()} />
      </div>
      <div className="route-node source" />
      <div className="route-node destination" />
      <div className="route-vehicle" key={`v-${Date.now()}`}>🚛</div>
      <div className="route-label source-label">{sourceName}</div>
      <div className="route-label dest-label">
        {destName}
        <br />
        <span style={{ color: 'var(--text-accent)', fontSize: '0.65rem' }}>{distanceKm}km · {etaHours}h ETA</span>
      </div>
    </div>
  );
}
