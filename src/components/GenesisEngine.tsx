import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Cpu, Zap, ShieldCheck, CheckCircle2, Wallet, ArrowRight, Activity, Check, Lock, Database, Server, Volume2, VolumeX } from 'lucide-react';
import { PhivoCoinLogo } from './PhivoCoinLogo';

export interface GenesisEngineProps {
  nodeNumber?: number;
  publicNodeId?: string;
  status?: 'AVAILABLE' | 'PURCHASED' | 'ACTIVE' | 'EMITTING' | 'MATURED' | string;
  progressPercent?: number;
  distributedAmount?: number;
  distributedPhivo?: number; // fallback alias
  remainingPhivo?: number;
  currentDay?: number;
  totalDays?: number;
  isEmitting?: boolean;
  dailyEmission?: number;
  className?: string;
}

export const GenesisEngine: React.FC<GenesisEngineProps> = ({
  nodeNumber = 42,
  publicNodeId = 'PHX-GENESIS-ENGINE',
  status = 'ACTIVE',
  progressPercent,
  distributedAmount,
  distributedPhivo,
  remainingPhivo,
  currentDay = 127,
  totalDays = 200,
  isEmitting = true,
  dailyEmission,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [activeStage, setActiveStage] = useState<number>(0); // 0: Output Port, 1: Conduit, 2: Release Gate, 3: Ledger Node, 4: Wallet Entry
  const [chamberGlow, setChamberGlow] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);

  // Web Audio API Soundscape Synthesizers (Low-frequency reactor hum & synthetic token pulse)
  const triggerTokenPulseSound = (freq = 580) => {
    if (isMuted || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Ignore audio context errors gracefully
    }
  };

  // Derive authoritative amounts & percentages
  const effectiveDistributed = Math.min(
    10000,
    Math.max(0, distributedAmount ?? distributedPhivo ?? 3175)
  );
  const effectiveRemaining = remainingPhivo ?? Math.max(0, 10000 - effectiveDistributed);
  const effectiveProgress = Math.min(
    100,
    progressPercent ?? Number(((effectiveDistributed / 10000) * 100).toFixed(2))
  );

  const isMatured = status === 'MATURED' || effectiveProgress >= 100 || effectiveDistributed >= 10000;
  const isCurrentlyEmitting = (status === 'EMITTING' || (status === 'ACTIVE' && isEmitting)) && !isMatured;
  const isEngineActive = (status === 'ACTIVE' || status === 'EMITTING' || isEmitting) && !isMatured;

  // Web Audio API Reactor Hum Synthesis Effect
  useEffect(() => {
    if (isMuted || !isCurrentlyEmitting || prefersReducedMotion || typeof window === 'undefined') return;

    let ctx: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let filter: BiquadFilterNode | null = null;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
        osc = ctx.createOscillator();
        filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        // Sub-bass 55Hz reactor hum
        osc.type = 'sine';
        osc.frequency.value = 55;

        // Lowpass filter for smooth acoustic hum
        filter.type = 'lowpass';
        filter.frequency.value = 110;

        gain.gain.setValueAtTime(0.03, ctx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
      }
    } catch {
      // Audio autoplay policy fallback
    }

    return () => {
      try {
        if (osc) osc.stop();
        if (ctx) ctx.close();
      } catch {
        // Cleanup
      }
    };
  }, [isMuted, isCurrentlyEmitting, prefersReducedMotion]);

  // Rotation & Pulse Speeds
  let outerGearDuration = 20;
  let innerTurbineDuration = 12;
  let reactorPulseDuration = 2.8;

  if (prefersReducedMotion || isMatured || status === 'AVAILABLE') {
    outerGearDuration = 0;
    innerTurbineDuration = 0;
    reactorPulseDuration = 0;
  } else if (status === 'EMITTING') {
    outerGearDuration = 8;
    innerTurbineDuration = 5;
    reactorPulseDuration = 1.5;
  } else if (status === 'ACTIVE' || isCurrentlyEmitting) {
    outerGearDuration = 18;
    innerTurbineDuration = 11;
    reactorPulseDuration = 2.6;
  }

  // Token Motion Conduit Pipeline Loop with Audio Pulse Triggers
  useEffect(() => {
    if (prefersReducedMotion || !isCurrentlyEmitting) {
      setActiveStage(0);
      return;
    }

    const interval = setInterval(() => {
      setActiveStage((prev) => {
        const next = (prev + 1) % 5;
        if (next === 2) {
          triggerTokenPulseSound(620);
        } else if (next === 4) {
          setChamberGlow(true);
          triggerTokenPulseSound(880);
          setTimeout(() => setChamberGlow(false), 1200);
        }
        return next;
      });
    }, 2600);

    return () => clearInterval(interval);
  }, [prefersReducedMotion, isCurrentlyEmitting, isMuted]);

  return (
    <div
      className={`relative rounded-3xl bg-gradient-to-b from-[#0D182E] via-[#08101E] to-[#03060B] border-2 border-[#00CFFF]/30 shadow-[0_0_70px_rgba(0,207,255,0.18)] p-4 sm:p-7 overflow-hidden ${className}`}
    >
      {/* Background Industrial Grid & Atmospheric Energy Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(#00CFFF_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.04] pointer-events-none" />
      <div className="absolute -top-28 -left-28 w-96 h-96 bg-[#00CFFF]/[0.07] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-28 -right-28 w-96 h-96 bg-[#32D583]/[0.06] rounded-full blur-[120px] pointer-events-none" />

      {/* Machinery Machine Header Plate */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <PhivoCoinLogo
            size={40}
            animated={!isMatured && !prefersReducedMotion}
            glow={true}
            glowColor={isMatured ? 'gold' : 'cyan'}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-[#00CFFF] tracking-widest uppercase">
                PHIVONEX GENESIS INFRASTRUCTURE MACHINE
              </span>
              <span className="px-2 py-0.5 rounded bg-white/10 text-[9px] font-mono text-white/80 border border-white/10">
                HARDWARE MESH V1.0
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black font-mono text-white tracking-tight flex items-center gap-2">
              <span>{publicNodeId}</span>
              <span className="text-xs text-[#98A2B3] font-normal">#{nodeNumber}</span>
            </h3>
          </div>
        </div>

        {/* Operating Status Badge & Audio Soundscape Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* Soundscape Control Button */}
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            className={`px-3 py-1 rounded-full border text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              !isMuted
                ? 'bg-[#00CFFF]/20 border-[#00CFFF] text-[#00CFFF] shadow-[0_0_12px_rgba(0,207,255,0.3)]'
                : 'bg-white/5 border-white/10 text-[#98A2B3] hover:text-white hover:border-white/20'
            }`}
            title={isMuted ? 'Unmute Soundscape' : 'Mute Soundscape'}
          >
            {!isMuted ? <Volume2 className="w-3.5 h-3.5 text-[#00CFFF] animate-pulse" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{!isMuted ? 'SFX HUM ON' : 'SFX OFF'}</span>
          </button>

          <div
            className={`px-3.5 py-1.5 rounded-full border text-xs font-mono font-bold flex items-center gap-2 shadow-sm ${
              isMatured
                ? 'bg-[#FDB022]/15 border-[#FDB022]/40 text-[#FDB022]'
                : status === 'EMITTING'
                ? 'bg-[#00CFFF]/20 border-[#00CFFF]/50 text-[#00CFFF]'
                : isEngineActive
                ? 'bg-[#32D583]/15 border-[#32D583]/40 text-[#32D583]'
                : 'bg-white/5 border-white/10 text-[#98A2B3]'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isMatured
                  ? 'bg-[#FDB022]'
                  : status === 'EMITTING'
                  ? 'bg-[#00CFFF] animate-ping'
                  : isEngineActive
                  ? 'bg-[#32D583] animate-pulse'
                  : 'bg-[#98A2B3]'
              }`}
            />
            <span>
              {isMatured
                ? '200-DAY MATURED — 100% DISTRIBUTED'
                : status === 'EMITTING'
                ? (dailyEmission ? `EMITTING — ${dailyEmission} PHIVO/DAY` : 'EMITTING')
                : isEngineActive
                ? 'ACTIVE / EMITTING'
                : `STATUS: ${status}`}
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================================
          INTEGRATED MACHINERY SCENE (Reactor → Output → Conduit → Gate → Validation → Vault)
         ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch relative z-10">
        
        {/* ====================================================================
            1. CENTRAL PHYSICAL GENESIS MACHINE / REACTOR CORE (HERO MODULE)
           ==================================================================== */}
        <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-3xl bg-gradient-to-br from-[#12223D] via-[#0A1527] to-[#040812] border-2 border-[#00CFFF]/40 shadow-[inset_0_0_40px_rgba(0,207,255,0.15)] relative overflow-hidden group">
          
          {/* Physical Machine Chassis Corner Plates & Rivet Bolts */}
          <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-slate-400 to-slate-800 border border-white/40 shadow-sm" />
          <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-slate-400 to-slate-800 border border-white/40 shadow-sm" />
          <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-slate-400 to-slate-800 border border-white/40 shadow-sm" />
          <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-slate-400 to-slate-800 border border-white/40 shadow-sm" />

          {/* Machine Header Branding Plate */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00CFFF] animate-pulse" />
              <span className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                GENESIS REACTOR CORE UNIT #01
              </span>
            </div>
            <span className="text-[9px] font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2 py-0.5 rounded border border-[#00CFFF]/30">
              VAL-MESH
            </span>
          </div>

          {/* REACTOR CORE CHAMBER WITH MECHANICAL ROTATING GEARS */}
          <div className="relative py-4 flex flex-col items-center justify-center min-h-[240px]">
            
            {/* Outer Physical Metallic Gear Ring */}
            <motion.div
              className={`absolute w-56 h-56 rounded-full border-4 border-dashed ${
                isMatured
                  ? 'border-[#FDB022]/40'
                  : status === 'EMITTING'
                  ? 'border-[#00CFFF]'
                  : 'border-[#00CFFF]/40'
              }`}
              animate={outerGearDuration === 0 ? { rotate: 0 } : { rotate: 360 }}
              transition={
                outerGearDuration === 0
                  ? { duration: 0 }
                  : { repeat: Infinity, duration: outerGearDuration, ease: 'linear' }
              }
            />

            {/* Inner Precision Turbine Ring (Counter-Rotating) */}
            <motion.div
              className={`absolute w-44 h-44 rounded-full border-2 border-dotted ${
                isMatured ? 'border-[#FDB022]/60' : 'border-[#FFD700]/60'
              }`}
              animate={innerTurbineDuration === 0 ? { rotate: 0 } : { rotate: -360 }}
              transition={
                innerTurbineDuration === 0
                  ? { duration: 0 }
                  : { repeat: Infinity, duration: innerTurbineDuration, ease: 'linear' }
              }
            />

            {/* Illuminated Glass Reactor Core Cylinder */}
            <motion.div
              className="relative w-36 h-36 rounded-full bg-gradient-to-tr from-[#030914] via-[#0B1A33] to-[#122A52] border-2 border-[#00CFFF]/60 flex flex-col items-center justify-center p-2 text-center shadow-[0_0_40px_rgba(0,207,255,0.3)] z-10"
              animate={
                reactorPulseDuration === 0
                  ? { scale: 1 }
                  : {
                      scale: [1, 1.04, 1],
                      boxShadow: [
                        '0 0 25px rgba(0,207,255,0.3)',
                        status === 'EMITTING'
                          ? '0 0 55px rgba(0,207,255,0.8)'
                          : '0 0 40px rgba(0,207,255,0.5)',
                        '0 0 25px rgba(0,207,255,0.3)',
                      ],
                    }
              }
              transition={
                reactorPulseDuration === 0
                  ? { duration: 0 }
                  : { repeat: Infinity, duration: reactorPulseDuration, ease: 'easeInOut' }
              }
            >
              {/* 3D Gold & Cyan Coin emblem inside reactor */}
              <PhivoCoinLogo
                size={48}
                animated={!isMatured && !prefersReducedMotion}
                glow={true}
                glowColor={isMatured ? 'gold' : 'cyan'}
              />

              <span className="text-[10px] font-black font-mono text-white mt-1">
                10,000 PHIVO
              </span>
            </motion.div>

            {/* Output Exhaust Nozzle Indicator */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 w-6 h-10 rounded-r-lg bg-gradient-to-r from-[#00CFFF]/40 to-[#00CFFF] border-y border-r border-[#00CFFF] shadow-[0_0_15px_#00CFFF] hidden lg:flex items-center justify-center">
              <Zap className="w-3 h-3 text-slate-950 animate-pulse" />
            </div>
          </div>

          {/* SECONDARY MACHINERY TELEMETRY & PROGRESS GAUGES */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#98A2B3]">LIFETIME ALLOCATION PROGRESS</span>
              <span className="text-[#00CFFF] font-bold">{effectiveProgress}%</span>
            </div>

            {/* Sleek Horizontal Machinery Progress Bar */}
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden border border-white/10 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  isMatured
                    ? 'bg-gradient-to-r from-[#FFD700] to-[#FDB022]'
                    : 'bg-gradient-to-r from-[#00CFFF] to-[#32D583]'
                }`}
                style={{ width: `${effectiveProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-[#98A2B3]">
              <span>Day {currentDay} of {totalDays}</span>
              <span>{dailyEmission ? `${dailyEmission} PHIVO / Day` : 'Protocol Governed Emission'}</span>
            </div>
          </div>

        </div>

        {/* ====================================================================
            2. ANIMATED CONDUIT PIPELINE, RELEASE GATE & LEDGER CHECKPOINT
           ==================================================================== */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-3 p-4 rounded-3xl bg-[#050B16] border border-white/10 relative overflow-hidden">
          
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#00CFFF]" />
              <span className="text-[10px] font-mono font-bold text-[#00CFFF] uppercase tracking-wider">
                EMISSION CONDUIT FLOW
              </span>
            </div>
            <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-ping" />
          </div>

          {/* Physical Glowing Conduit Pipe */}
          <div className="relative py-3 space-y-2.5">
            
            {/* Animated Traveling Beam inside Pipe */}
            {!prefersReducedMotion && isCurrentlyEmitting && (
              <motion.div
                className="absolute inset-y-0 bg-gradient-to-r from-transparent via-[#00CFFF]/40 to-transparent w-full pointer-events-none rounded-xl"
                animate={{
                  y: [`${activeStage * 20}%`, `${(activeStage + 1) * 20}%`],
                }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
              />
            )}

            {/* STAGE 1: REACTOR OUTPUT PORT */}
            <div
              className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeStage === 0 && isCurrentlyEmitting
                  ? 'bg-[#00CFFF]/20 border-[#00CFFF] text-white shadow-[0_0_15px_rgba(0,207,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-[#98A2B3]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#00CFFF]/20 text-[#00CFFF] flex items-center justify-center font-bold text-[10px]">
                  01
                </div>
                <div>
                  <span className="font-bold block text-[11px] text-white">REACTOR OUTPUT</span>
                  <span className="text-[9px] text-[#98A2B3]">Token Particles Released</span>
                </div>
              </div>
              {activeStage === 0 && isCurrentlyEmitting && (
                <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-ping" />
              )}
            </div>

            {/* STAGE 2: RELEASE GATE (ATTENTATION) */}
            <div
              className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeStage === 1 && isCurrentlyEmitting
                  ? 'bg-[#00CFFF]/20 border-[#00CFFF] text-white shadow-[0_0_15px_rgba(0,207,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-[#98A2B3]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#32D583]/20 text-[#32D583] flex items-center justify-center font-bold text-[10px]">
                  02
                </div>
                <div>
                  <span className="font-bold block text-[11px] text-white">RELEASE GATE</span>
                  <span className="text-[9px] text-[#98A2B3]">Validator Attested</span>
                </div>
              </div>
              {activeStage === 1 && isCurrentlyEmitting && (
                <Check className="w-3.5 h-3.5 text-[#32D583]" />
              )}
            </div>

            {/* STAGE 3: LEDGER VALIDATION NODE */}
            <div
              className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeStage === 2 && isCurrentlyEmitting
                  ? 'bg-[#00CFFF]/20 border-[#00CFFF] text-white shadow-[0_0_15px_rgba(0,207,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-[#98A2B3]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#00CFFF]/20 text-[#00CFFF] flex items-center justify-center font-bold text-[10px]">
                  03
                </div>
                <div>
                  <span className="font-bold block text-[11px] text-white">LEDGER NODE</span>
                  <span className="text-[9px] text-[#98A2B3]">State Root Confirmed</span>
                </div>
              </div>
              {activeStage === 2 && isCurrentlyEmitting && (
                <Database className="w-3.5 h-3.5 text-[#00CFFF] animate-pulse" />
              )}
            </div>

            {/* STAGE 4: TOKEN-TO-WALLET CONDUIT PASSAGE */}
            <div
              className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeStage === 3 && isCurrentlyEmitting
                  ? 'bg-[#00CFFF]/20 border-[#00CFFF] text-white shadow-[0_0_15px_rgba(0,207,255,0.3)]'
                  : 'bg-white/5 border-white/10 text-[#98A2B3]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#FFD700]/20 text-[#FFD700] flex items-center justify-center font-bold text-[10px]">
                  04
                </div>
                <div>
                  <span className="font-bold block text-[11px] text-white">CONDUIT TRANSFER</span>
                  <span className="text-[9px] text-[#98A2B3]">In-Transit to Vault</span>
                </div>
              </div>

              {/* 3D Animated PHIVO Coin Travelling Particle */}
              {!prefersReducedMotion && activeStage === 3 && isCurrentlyEmitting && (
                <AnimatePresence>
                  <motion.div
                    key="coin-travel"
                    initial={{ scale: 0, x: -10 }}
                    animate={{ scale: 1.2, x: 0 }}
                    exit={{ scale: 0.8, x: 10 }}
                    transition={{ duration: 0.5 }}
                  >
                    <PhivoCoinLogo size={24} animated={true} glow={true} glowColor="gold" />
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

          </div>

          <div className="text-[10px] font-mono text-[#98A2B3] text-center pt-2 border-t border-white/10">
            Pipeline: <strong className="text-white">Reactor → Conduit → Ledger → Vault</strong>
          </div>

        </div>

        {/* ====================================================================
            3. WALLET VAULT CHAMBER (DESTINATION MODULE)
           ==================================================================== */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          <motion.div
            className="p-5 rounded-3xl border transition-colors duration-500 space-y-4 relative bg-[#071220] border-white/15 shadow-2xl h-full flex flex-col justify-between"
            animate={
              chamberGlow && !prefersReducedMotion
                ? {
                    borderColor: '#00CFFF',
                    boxShadow: '0 0 40px rgba(0,207,255,0.4)',
                    backgroundColor: 'rgba(0,207,255,0.12)',
                  }
                : {
                    borderColor: 'rgba(255,255,255,0.15)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                    backgroundColor: '#071220',
                  }
            }
            transition={{ duration: 0.4 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <PhivoCoinLogo size={34} animated={false} glow={true} glowColor="green" />
                <div>
                  <span className="text-[10px] font-mono text-[#98A2B3] block uppercase tracking-wider">
                    DESTINATION CHAMBER
                  </span>
                  <span className="text-xs font-bold font-mono text-white block">PHIVO WALLET VAULT</span>
                </div>
              </div>

              <div className="px-2.5 py-1 rounded bg-[#32D583]/15 border border-[#32D583]/30 text-[#32D583] text-[10px] font-mono font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>SETTLED</span>
              </div>
            </div>

            {/* Real Telemetry Readout */}
            <div className="space-y-3 font-mono">
              <div className="p-3.5 rounded-2xl bg-[#030712] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#98A2B3] block uppercase">DISTRIBUTED PHIVO</span>
                  <span className="text-xl font-black text-[#00CFFF] tabular-nums">
                    {effectiveDistributed.toLocaleString()} PHIVO
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#32D583] bg-[#32D583]/10 px-2.5 py-1 rounded-lg border border-[#32D583]/20">
                  Day {currentDay} / {totalDays}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#030712] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#98A2B3] block uppercase">REMAINING UNISSUED</span>
                  <span className="text-xl font-black text-[#F7B27A] tabular-nums">
                    {effectiveRemaining.toLocaleString()} PHIVO
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#98A2B3]">
                  {Math.max(0, totalDays - currentDay)} Days Left
                </span>
              </div>
            </div>

            {/* Ledger Notice */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-[#98A2B3] leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#00CFFF] shrink-0 mt-0.5" />
              <span>
                Server-authoritative ledger credits user PHIVO wallet balance upon epoch settlement. Max lifetime cap: <strong>10,000 PHIVO</strong>.
              </span>
            </div>

          </motion.div>
        </div>

      </div>

      {/* MATURED STATE LOCK OVERLAY BANNER */}
      {isMatured && (
        <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-[#FDB022]/20 via-[#FDB022]/10 to-[#FDB022]/20 border border-[#FDB022]/50 text-center space-y-1 relative z-20 shadow-lg">
          <div className="text-sm font-black font-mono text-[#FDB022] tracking-wider uppercase flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />
            <span>NODE MATURED — 100% DISTRIBUTED</span>
          </div>
          <p className="text-xs text-white/90 font-mono">
            All 10,000 PHIVO lifetime node allocation has been fully emitted across 200 eligible reward days. Further reward emission for this Genesis Node is complete.
          </p>
        </div>
      )}

    </div>
  );
};
