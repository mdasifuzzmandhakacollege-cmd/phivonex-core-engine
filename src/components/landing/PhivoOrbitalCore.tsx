import React, { useEffect, useRef, useState } from 'react';
import { PhivonexSymbol } from '../brand/PhivonexSymbol';

interface OrbitalNode {
  id: string;
  label: string;
  caption: string;
  accent: string;
  xPct: number;
  yPct: number;
  svgX: number;
  svgY: number;
}

const ORBITAL_NODES: OrbitalNode[] = [
  {
    id: 'nodes',
    label: 'Decentralized Nodes',
    caption: 'Bounded 10,000-unit Genesis infrastructure validating network continuity.',
    accent: '#F5B800',
    xPct: 16,
    yPct: 18,
    svgX: 98,
    svgY: 98,
  },
  {
    id: 'payments',
    label: 'Borderless Payments',
    caption: 'Low-latency BEP-20 value transfer engineered for global merchant rails.',
    accent: '#00E5FF',
    xPct: 84,
    yPct: 18,
    svgX: 462,
    svgY: 98,
  },
  {
    id: 'liquidity',
    label: 'Liquidity Pools',
    caption: 'Structured depth supporting institutional settlement and instant conversion.',
    accent: '#00E676',
    xPct: 16,
    yPct: 82,
    svgX: 98,
    svgY: 422,
  },
  {
    id: 'custody',
    label: 'Verified Custody',
    caption: 'Segregated reserve protection and continuous transparent accounting.',
    accent: '#FFE082',
    xPct: 84,
    yPct: 82,
    svgX: 462,
    svgY: 422,
  },
];

export const PhivoOrbitalCore: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string>('nodes');

  const activeNode = ORBITAL_NODES.find((n) => n.id === activeNodeId) || ORBITAL_NODES[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const width = 560;
    const height = 520;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cx = width / 2;
    const cy = height / 2;

    // Subtle ambient neural mesh nodes
    const meshPoints = Array.from({ length: 28 }, (_, i) => {
      const angle = (i / 28) * Math.PI * 2;
      const radius = 128 + (i % 4) * 32;
      return {
        baseAngle: angle,
        radius,
        speed: (i % 2 === 0 ? 1 : -1) * (0.00018 + (i % 3) * 0.00009),
        size: 1.4 + (i % 3) * 0.55,
        isGold: i % 3 === 0,
      };
    });

    // Data packets traveling along the 4 primary pathways
    const packets = ORBITAL_NODES.map((node, idx) => ({
      node,
      progress: idx * 0.25,
      speed: 0.0032 + idx * 0.00035,
      outbound: idx % 2 === 0,
    }));

    let rafId = 0;
    let startTime = performance.now();

    const drawFrame = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, width, height);

      // Ambient central radial halo
      const halo = ctx.createRadialGradient(cx, cy, 12, cx, cy, 230);
      halo.addColorStop(0, 'rgba(245, 184, 0, 0.16)');
      halo.addColorStop(0.45, 'rgba(0, 229, 255, 0.06)');
      halo.addColorStop(1, 'rgba(5, 8, 7, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // Compute rotating mesh points
      const coords = meshPoints.map((pt) => {
        const theta = pt.baseAngle + (prefersReducedMotion ? 0 : elapsed * pt.speed);
        return {
          x: cx + Math.cos(theta) * pt.radius,
          y: cy + Math.sin(theta) * (pt.radius * 0.88),
          size: pt.size,
          isGold: pt.isGold,
        };
      });

      // Draw delicate neural mesh edges
      ctx.lineWidth = 0.7;
      for (let i = 0; i < coords.length; i++) {
        for (let j = i + 1; j < coords.length; j++) {
          const dx = coords[i].x - coords[j].x;
          const dy = coords[i].y - coords[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 108) {
            const alpha = (1 - dist / 108) * 0.13;
            ctx.strokeStyle = coords[i].isGold
              ? `rgba(245, 184, 0, ${alpha.toFixed(3)})`
              : `rgba(0, 229, 255, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(coords[i].x, coords[i].y);
            ctx.lineTo(coords[j].x, coords[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw mesh vertices
      for (const c of coords) {
        ctx.fillStyle = c.isGold ? 'rgba(255, 224, 130, 0.55)' : 'rgba(0, 229, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw smooth traveling packets along pathways between core and the 4 pillars
      for (const pkt of packets) {
        if (!prefersReducedMotion) {
          pkt.progress = (pkt.progress + pkt.speed) % 1;
        }
        const t = pkt.outbound ? pkt.progress : 1 - pkt.progress;
        const px = cx + (pkt.node.svgX - cx) * t;
        const py = cy + (pkt.node.svgY - cy) * t;

        const glow = ctx.createRadialGradient(px, py, 0, px, py, 10);
        glow.addColorStop(0, pkt.node.accent);
        glow.addColorStop(1, 'rgba(5, 8, 7, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative w-full max-w-[560px] mx-auto select-none">
      {/* Main Orbital Stage */}
      <div
        className="relative aspect-[560/520] w-full rounded-[28px] overflow-hidden border border-white/[0.09] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(20, 32, 28, 0.85) 0%, rgba(10, 15, 14, 0.92) 55%, rgba(5, 8, 7, 0.98) 100%)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Top subtle specular rim */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#F5B800]/55 to-transparent"
        />

        {/* 60fps Neural Mesh Canvas */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Precision Orbital Vector Geometry */}
        <svg
          viewBox="0 0 560 520"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="phxOrbitalGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFE082" />
              <stop offset="55%" stopColor="#F5B800" />
              <stop offset="100%" stopColor="#00E5FF" />
            </linearGradient>
            <linearGradient id="phxRingCyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#F5B800" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#00E676" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Outer Precision Ellipses */}
          <g className="origin-[280px_260px] animate-spin-slow">
            <circle
              cx="280"
              cy="260"
              r="186"
              fill="none"
              stroke="url(#phxRingCyan)"
              strokeWidth="1"
              strokeDasharray="6 10"
              opacity="0.55"
            />
          </g>
          <g className="origin-[280px_260px] animate-spin-reverse-slow">
            <circle
              cx="280"
              cy="260"
              r="134"
              fill="none"
              stroke="rgba(245, 184, 0, 0.24)"
              strokeWidth="1"
              strokeDasharray="2 7"
            />
          </g>
          <circle
            cx="280"
            cy="260"
            r="84"
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1"
          />

          {/* Neural Connectors from PHIVO Core to the 4 Ecosystem Pillars */}
          {ORBITAL_NODES.map((node) => {
            const isSelected = node.id === activeNodeId;
            return (
              <g key={node.id}>
                <line
                  x1="280"
                  y1="260"
                  x2={node.svgX}
                  y2={node.svgY}
                  stroke={isSelected ? node.accent : 'rgba(255,255,255,0.12)'}
                  strokeWidth={isSelected ? 1.8 : 1}
                  strokeDasharray={isSelected ? undefined : '4 5'}
                  opacity={isSelected ? 0.9 : 0.65}
                />
                <circle
                  cx={node.svgX}
                  cy={node.svgY}
                  r={isSelected ? 6 : 4}
                  fill={node.accent}
                  opacity={isSelected ? 1 : 0.75}
                />
              </g>
            );
          })}

          {/* Central Hexagonal Core Housing */}
          <polygon
            points="280,192 339,226 339,294 280,328 221,294 221,226"
            fill="rgba(8, 14, 12, 0.92)"
            stroke="url(#phxOrbitalGold)"
            strokeWidth="1.8"
          />
          <polygon
            points="280,204 328,232 328,288 280,316 232,288 232,232"
            fill="rgba(245, 184, 0, 0.06)"
            stroke="rgba(255, 224, 130, 0.25)"
            strokeWidth="1"
          />
        </svg>

        {/* Central PHIVO Core Medallion Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center justify-center text-center">
            <PhivonexSymbol size={36} animated={true} className="mb-1" />
            <span
              className="text-sm font-bold tracking-[0.18em] bg-gradient-to-r from-[#FFE082] via-[#F5B800] to-[#00E5FF] bg-clip-text text-transparent"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              PHIVO
            </span>
            <span className="text-[10px] font-mono tracking-[0.16em] text-slate-400 mt-0.5">
              CORE LAYER
            </span>
          </div>
        </div>

        {/* 4 Interactive Satellite Pillar Buttons */}
        {ORBITAL_NODES.map((node) => {
          const isSelected = node.id === activeNodeId;
          const isTop = node.yPct < 50;
          const isLeft = node.xPct < 50;
          return (
            <button
              key={node.id}
              type="button"
              onMouseEnter={() => setActiveNodeId(node.id)}
              onFocus={() => setActiveNodeId(node.id)}
              onClick={() => setActiveNodeId(node.id)}
              className={`absolute z-10 px-3.5 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B800] ${
                isTop ? 'top-4 sm:top-5' : 'bottom-4 sm:bottom-5'
              } ${isLeft ? 'left-4 sm:left-5' : 'right-4 sm:right-5'}`}
              style={{
                background: isSelected
                  ? 'rgba(18, 28, 25, 0.92)'
                  : 'rgba(11, 17, 15, 0.78)',
                border: isSelected
                  ? `1px solid ${node.accent}80`
                  : '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(16px)',
                boxShadow: isSelected
                  ? `0 12px 30px -12px ${node.accent}45`
                  : '0 8px 20px -12px rgba(0,0,0,0.7)',
              }}
            >
              <span
                className="block text-xs sm:text-[13px] font-semibold whitespace-nowrap tracking-tight"
                style={{
                  color: isSelected ? '#FFFFFF' : '#CBD5E1',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {node.label}
              </span>
              <span
                className="block text-[10px] font-mono mt-0.5 tracking-wide"
                style={{ color: isSelected ? node.accent : '#64748B' }}
              >
                BEP-20 · Synchronized
              </span>
            </button>
          );
        })}
      </div>

      {/* Focused Pillar Context Caption */}
      <div className="mt-4 px-5 py-3.5 rounded-2xl border border-white/[0.08] bg-[#0E1513]/70 backdrop-blur-xl flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span style={{ color: activeNode.accent }}>{activeNode.label}</span>
            <span aria-hidden="true">·</span>
            <span>Protocol Architecture</span>
          </div>
          <p className="text-sm text-slate-200 mt-1 leading-relaxed">
            {activeNode.caption}
          </p>
        </div>
      </div>
    </div>
  );
};
