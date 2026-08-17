'use client';

import { useEffect, useRef } from 'react';

interface PulseLineProps {
  surgeActive: boolean;
  onJumpToSurge?: () => void;
}

export default function PulseLine({ surgeActive, onJumpToSurge }: PulseLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => canvas.offsetWidth;
    const h = () => canvas.offsetHeight;
    let offset = 0;
    const speed = surgeActive ? 3.2 : 1.4;

    const draw = () => {
      const cw = w();
      const ch = h();
      ctx.clearRect(0, 0, cw, ch);

      const midY = ch / 2;
      const cycleLen = surgeActive ? 75 : 110;

      // Waveform line
      ctx.beginPath();
      ctx.strokeStyle = surgeActive
        ? 'rgba(239, 68, 68, 0.9)'
        : 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = surgeActive ? 2 : 1.5;
      ctx.shadowBlur = surgeActive ? 10 : 4;
      ctx.shadowColor = surgeActive ? '#ef4444' : '#06b6d4';

      for (let x = 0; x <= cw; x++) {
        const phase = ((x + offset) % cycleLen) / cycleLen;
        let y = midY;

        if (phase > 0.35 && phase < 0.40) {
          const t = (phase - 0.35) / 0.05;
          y = midY - Math.sin(t * Math.PI) * (ch * 0.12);
        } else if (phase > 0.42 && phase < 0.45) {
          const t = (phase - 0.42) / 0.03;
          y = midY + Math.sin(t * Math.PI) * (ch * 0.1);
        } else if (phase > 0.45 && phase < 0.52) {
          const t = (phase - 0.45) / 0.07;
          const amplitude = surgeActive ? ch * 0.44 : ch * 0.34;
          y = midY - Math.sin(t * Math.PI) * amplitude;
        } else if (phase > 0.52 && phase < 0.56) {
          const t = (phase - 0.52) / 0.04;
          y = midY + Math.sin(t * Math.PI) * (ch * 0.14);
        } else if (phase > 0.60 && phase < 0.70) {
          const t = (phase - 0.60) / 0.10;
          y = midY - Math.sin(t * Math.PI) * (ch * 0.1);
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      offset += speed;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [surgeActive]);

  return (
    <div
      className={`ambient-pulse-container ${surgeActive ? 'ambient-surge' : 'ambient-calm'}`}
      onClick={surgeActive ? onJumpToSurge : undefined}
      title={surgeActive ? '⚡ Surge detected in network — click to inspect' : 'Network telemetry nominal'}
      id="ambient-ecg-pulse"
      style={{ cursor: surgeActive ? 'pointer' : 'default' }}
    >
      <div className="pulse-meta-text">
        <span className={`pulse-status-dot ${surgeActive ? 'dot-surge' : 'dot-calm'}`} />
        <span className="pulse-status-label">
          {surgeActive ? 'SURGE ALERT ACTIVE' : 'NETWORK TELEMETRY'}
        </span>
      </div>
      <canvas ref={canvasRef} className="ambient-pulse-canvas" />
    </div>
  );
}
