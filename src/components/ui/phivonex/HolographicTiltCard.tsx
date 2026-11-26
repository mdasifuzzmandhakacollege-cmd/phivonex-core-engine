import React, { useState, useRef } from 'react';

interface HolographicTiltCardProps {
  children: React.ReactNode;
  className?: string;
  accent?: 'gold' | 'cyan' | 'emerald' | 'neutral';
}

export const HolographicTiltCard: React.FC<HolographicTiltCardProps> = ({
  children,
  className = '',
  accent = 'neutral',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [sheenX, setSheenX] = useState(50);
  const [sheenY, setSheenY] = useState(50);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rX = ((y - centerY) / centerY) * -8; // max rotation degrees
    const rY = ((x - centerX) / centerX) * 8;

    setRotateX(rX);
    setRotateY(rY);
    setSheenX((x / rect.width) * 100);
    setSheenY((y / rect.height) * 100);
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: isHovered
          ? `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`
          : 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
        transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.5s ease-in-out',
      }}
      className={`relative rounded-[24px] overflow-hidden bg-[#0A1224]/80 backdrop-blur-2xl border border-white/10 shadow-2xl will-change-transform ${className}`}
    >
      {/* Holographic Sheen Overlay */}
      {isHovered && (
        <div
          className="absolute inset-0 pointer-events-none z-10 opacity-40 mix-blend-screen transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${sheenX}% ${sheenY}%, rgba(0, 229, 255, 0.25) 0%, rgba(245, 184, 0, 0.15) 40%, transparent 80%)`,
          }}
        />
      )}
      {children}
    </div>
  );
};
