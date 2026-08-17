'use client';

import { useEffect, useRef } from 'react';

interface PulseLineProps {
  surgeActive: boolean;
}

export default function PulseLine({ surgeActive }: PulseLineProps) {
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
    const speed = surgeActive ? 3.5 : 1.8;

    const draw = () => {
      const cw = w();
      const ch = h();
      ctx.clearRect(0, 0, cw, ch);

      const midY = ch / 2;
      const cycleLen = surgeActive ? 80 : 120;

      // ECG-style waveform
      ctx.beginPath();
      ctx.strokeStyle = surgeActive
        ? 'rgba(239, 68, 68, 0.8)'
        : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = surgeActive ? 2 : 1.5;
      ctx.shadowBlur = surgeActive ? 12 : 6;
      ctx.shadowColor = surgeActive ? '#ef4444' : '#38bdf8';

      for (let x = 0; x <= cw; x++) {
        const phase = ((x + offset) % cycleLen) / cycleLen;
        let y = midY;

        if (phase > 0.35 && phase < 0.40) {
          // Small P-wave bump
          const t = (phase - 0.35) / 0.05;
          y = midY - Math.sin(t * Math.PI) * (ch * 0.1);
        } else if (phase > 0.42 && phase < 0.45) {
          // Q dip
          const t = (phase - 0.42) / 0.03;
          y = midY + Math.sin(t * Math.PI) * (ch * 0.08);
        } else if (phase > 0.45 && phase < 0.52) {
          // QRS spike
          const t = (phase - 0.45) / 0.07;
          const amplitude = surgeActive ? ch * 0.42 : ch * 0.32;
          y = midY - Math.sin(t * Math.PI) * amplitude;
        } else if (phase > 0.52 && phase < 0.56) {
          // S dip
          const t = (phase - 0.52) / 0.04;
          y = midY + Math.sin(t * Math.PI) * (ch * 0.12);
        } else if (phase > 0.60 && phase < 0.70) {
          // T-wave
          const t = (phase - 0.60) / 0.10;
          y = midY - Math.sin(t * Math.PI) * (ch * 0.08);
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Glow trail effect
      const grad = ctx.createLinearGradient(0, 0, cw, 0);
      grad.addColorStop(0, 'transparent');
      const scanPos = ((offset * 2) % (cw + 60)) / (cw + 60);
      grad.addColorStop(Math.max(0, scanPos - 0.08), 'transparent');
      grad.addColorStop(scanPos, surgeActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 189, 248, 0.2)');
      grad.addColorStop(Math.min(1, scanPos + 0.02), 'transparent');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);

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
    <canvas
      ref={canvasRef}
      className={`pulse-line-canvas${surgeActive ? ' surge' : ''}`}
      id="ecg-pulse-line"
    />
  );
}
