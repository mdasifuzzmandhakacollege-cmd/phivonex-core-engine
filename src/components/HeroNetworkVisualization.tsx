import React, { useEffect, useRef } from 'react';

interface HeroNetworkVisualizationProps {
  onNodeSelect?: (nodeInfo: { id: string; role: string; latency: string }) => void;
}

interface SatelliteNode {
  id: string;
  x: number;
  y: number;
  baseRadius: number;
  orbitRadius: number;
  angle: number;
  speed: number;
  color: string;
  pulseTimer: number;
  pulseInterval: number;
  isEmitting: boolean;
  pulseProgress: number;
  role: string;
  load: string;
}

export const HeroNetworkVisualization: React.FC<HeroNetworkVisualizationProps> = ({ onNodeSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mousePos = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const hoveredNode = useRef<SatelliteNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Set dimensions with device pixel ratio
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse movement for subtle parallax (max 6-12px)
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      mousePos.current.targetX = ((clientX / rect.width) - 0.5) * 16;
      mousePos.current.targetY = ((clientY / rect.height) - 0.5) * 16;

      // Check hover
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const centerX = width / 2 + mousePos.current.x;
      const centerY = height / 2 + mousePos.current.y;

      let found: SatelliteNode | null = null;
      for (const node of nodes) {
        const nx = centerX + Math.cos(node.angle) * node.orbitRadius;
        const ny = centerY + Math.sin(node.angle) * node.orbitRadius * 0.72;
        const dist = Math.hypot(clientX - nx, clientY - ny);
        if (dist < 14) {
          found = node;
          break;
        }
      }
      hoveredNode.current = found;
      if (found && onNodeSelect) {
        onNodeSelect({ id: found.id, role: found.role, latency: found.load });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Generate 22 satellite nodes in 3 concentric tiered orbits
    const nodeCount = 22;
    const roles = ['Validator', 'Ledger Checkpoint', 'Relay Gateway', 'State Witness', 'Reward Assessor'];
    const nodes: SatelliteNode[] = [];

    for (let i = 0; i < nodeCount; i++) {
      const tier = i < 6 ? 1 : i < 14 ? 2 : 3;
      const orbitRadius = tier === 1 ? 95 + (i % 3) * 15 : tier === 2 ? 160 + (i % 4) * 20 : 230 + (i % 5) * 22;
      const baseAngle = (i / nodeCount) * Math.PI * 2 + (Math.random() * 0.3);
      const speed = prefersReducedMotion ? 0 : (0.0008 + (Math.random() * 0.0006)) * (i % 2 === 0 ? 1 : -0.85);

      nodes.push({
        id: `PX-NODE-${String(1000 + i * 412).padStart(6, '0')}`,
        x: 0,
        y: 0,
        baseRadius: tier === 1 ? 4.5 : 3.2,
        orbitRadius,
        angle: baseAngle,
        speed,
        color: i % 4 === 0 ? '#00C8FF' : i % 4 === 1 ? '#1A8CFF' : i % 4 === 2 ? '#6C5CFF' : '#32D583',
        pulseTimer: Math.random() * 200,
        pulseInterval: 220 + Math.random() * 240,
        isEmitting: false,
        pulseProgress: 0,
        role: roles[i % roles.length],
        load: `${12 + (i * 3) % 28}ms`,
      });
    }

    let corePulse = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.clearRect(0, 0, width, height);

      // Interpolate mouse parallax
      mousePos.current.x += (mousePos.current.targetX - mousePos.current.x) * 0.05;
      mousePos.current.y += (mousePos.current.targetY - mousePos.current.y) * 0.05;

      const centerX = width / 2 + mousePos.current.x;
      const centerY = height / 2 + mousePos.current.y;

      // Draw subtle orbital guide tracks
      const orbits = [110, 180, 255];
      ctx.lineWidth = 1;
      orbits.forEach((radius, idx) => {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radius, radius * 0.72, 0, 0, Math.PI * 2);
        ctx.strokeStyle = idx === 0 ? 'rgba(0, 200, 255, 0.07)' : 'rgba(255, 255, 255, 0.035)';
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Update and position nodes
      nodes.forEach((node) => {
        if (!prefersReducedMotion) {
          node.angle += node.speed;
          node.pulseTimer++;
          if (node.pulseTimer > node.pulseInterval) {
            node.isEmitting = true;
            node.pulseProgress = 0;
            node.pulseTimer = 0;
          }
        }
        node.x = centerX + Math.cos(node.angle) * node.orbitRadius;
        node.y = centerY + Math.sin(node.angle) * node.orbitRadius * 0.72;
      });

      // Draw connections from core to satellites
      nodes.forEach((node) => {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.09)';
        ctx.lineWidth = 0.75;
        ctx.stroke();

        // Draw active data pulse traveling along connection line
        if (node.isEmitting) {
          node.pulseProgress += 0.014;
          if (node.pulseProgress > 1) {
            node.isEmitting = false;
          } else {
            const px = centerX + (node.x - centerX) * node.pulseProgress;
            const py = centerY + (node.y - centerY) * node.pulseProgress;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#00C8FF';
            ctx.shadowColor = '#00C8FF';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      });

      // Cross-connect neighboring satellite nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 85) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            const alpha = (1 - dist / 85) * 0.12;
            ctx.strokeStyle = `rgba(108, 92, 255, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw satellite nodes
      nodes.forEach((node) => {
        const isHovered = hoveredNode.current?.id === node.id;
        const radius = isHovered ? node.baseRadius * 1.6 : node.baseRadius;

        // Outer glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? 'rgba(0, 200, 255, 0.25)' : 'rgba(0, 200, 255, 0.04)';
        ctx.fill();

        // Node dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#FFFFFF' : node.color;
        ctx.fill();
      });

      // Draw Central Core Node
      corePulse += 0.025;
      const corePulseScale = 1 + Math.sin(corePulse) * 0.05;

      // Core outer aura
      const auraGrad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 70 * corePulseScale);
      auraGrad.addColorStop(0, 'rgba(0, 207, 255, 0.3)');
      auraGrad.addColorStop(0.5, 'rgba(112, 87, 255, 0.1)');
      auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(centerX, centerY, 70 * corePulseScale, 0, Math.PI * 2);
      ctx.fillStyle = auraGrad;
      ctx.fill();

      // Core boundary ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, 28 * corePulseScale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 207, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Core Dark Capsule Base
      ctx.beginPath();
      ctx.arc(centerX, centerY, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#07101D';
      ctx.shadowColor = 'rgba(0, 207, 255, 0.6)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Core Inner PHIVONEX Symbol Rendering (Faceted Ribbon & 3 Constellation Nodes)
      ctx.save();
      ctx.translate(centerX - 13, centerY - 13);
      const scale = 26 / 320;
      ctx.scale(scale, scale);

      // Stem (Violet to Cyan)
      const stemGrad = ctx.createLinearGradient(88, 238, 126, 96);
      stemGrad.addColorStop(0, '#7057FF');
      stemGrad.addColorStop(0.5, '#168BFF');
      stemGrad.addColorStop(1, '#00CFFF');
      ctx.fillStyle = stemGrad;
      ctx.beginPath();
      ctx.moveTo(88, 126);
      ctx.lineTo(126, 96);
      ctx.lineTo(126, 238);
      ctx.lineTo(88, 206);
      ctx.closePath();
      ctx.fill();

      // Top Ribbon (Cyan to Blue)
      const topGrad = ctx.createLinearGradient(88, 126, 254, 168);
      topGrad.addColorStop(0, '#80EAFF');
      topGrad.addColorStop(0.4, '#00CFFF');
      topGrad.addColorStop(1, '#168BFF');
      ctx.fillStyle = topGrad;
      ctx.beginPath();
      ctx.moveTo(88, 126);
      ctx.lineTo(160, 62);
      ctx.lineTo(232, 94);
      ctx.lineTo(254, 118);
      ctx.lineTo(254, 168);
      ctx.lineTo(216, 204);
      ctx.lineTo(152, 236);
      ctx.lineTo(132, 238);
      ctx.lineTo(204, 208);
      ctx.lineTo(246, 172);
      ctx.lineTo(246, 112);
      ctx.lineTo(196, 66);
      ctx.lineTo(126, 96);
      ctx.closePath();
      ctx.fill();

      // 3 Constellation nodes inside symbol
      ctx.fillStyle = '#00CFFF';
      ctx.beginPath();
      ctx.arc(124, 142, 10, 0, Math.PI * 2);
      ctx.arc(164, 114, 11, 0, Math.PI * 2);
      ctx.arc(208, 182, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(124, 142, 4, 0, Math.PI * 2);
      ctx.arc(164, 114, 4.5, 0, Math.PI * 2);
      ctx.arc(208, 182, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Tooltip for hovered node
      if (hoveredNode.current) {
        const hn = hoveredNode.current;
        const tx = hn.x + 12;
        const ty = hn.y - 12;

        ctx.fillStyle = 'rgba(8, 11, 18, 0.92)';
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty - 26, 130, 36, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(hn.id, tx + 8, ty - 12);

        ctx.fillStyle = '#32D583';
        ctx.font = '400 9px system-ui, sans-serif';
        ctx.fillText(`● ${hn.role} (${hn.load})`, tx + 8, ty);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [onNodeSelect]);

  return (
    <div className="relative w-full h-full min-h-[460px] lg:min-h-[580px] flex items-center justify-center select-none overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,200,255,0.08)_0%,rgba(108,92,255,0.03)_40%,transparent_70%)] pointer-events-none" />

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair relative z-10"
        style={{ touchAction: 'none' }}
      />

      {/* Floating Topology Legend / Status */}
      <div className="absolute bottom-4 right-4 z-20 hidden sm:flex items-center gap-4 px-3.5 py-2 bg-[#080B12]/80 backdrop-blur-md rounded-lg border border-white/[0.08] text-xs font-mono text-[#98A2B3]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#00C8FF]" />
          <span>Core</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#32D583]" />
          <span>Active Nodes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6C5CFF]" />
          <span>Pulse Relays</span>
        </div>
      </div>
    </div>
  );
};
