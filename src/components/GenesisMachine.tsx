import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Zap, ShieldCheck, CheckCircle2, Database, Activity, Lock } from 'lucide-react';
import { PhivoCoin, PhivoCoinState } from './PhivoCoin';

export interface GenesisMachineProps {
  nodeNumber?: number;
  publicNodeId?: string;
  status?: 'AVAILABLE' | 'PURCHASED' | 'ACTIVE' | 'EMITTING' | 'MATURED' | string;
  progressPercent?: number;
  distributedAmount?: number;
  remainingPhivo?: number;
  currentDay?: number;
  totalDays?: number;
  isEmitting?: boolean;
  dailyEmission?: number;
  coinState?: PhivoCoinState;
  className?: string;
}

export const GenesisMachine: React.FC<GenesisMachineProps> = ({
  nodeNumber = 42,
  publicNodeId = 'PHX-GENESIS-ENGINE',
  status = 'ACTIVE',
  progressPercent = 31.75,
  distributedAmount = 3175,
  remainingPhivo = 6825,
  currentDay = 127,
  totalDays = 400,
  isEmitting = true,
  dailyEmission,
  coinState = 'GENERATED',
  className = '',
}) => {
  const isMatured = status === 'MATURED' || progressPercent >= 100 || distributedAmount >= 10000;
  const isCurrentlyEmitting = (status === 'EMITTING' || (status === 'ACTIVE' && isEmitting)) && !isMatured;

  return (
    <div
      className={`relative rounded-3xl bg-gradient-to-b from-[#0D182E] via-[#08101E] to-[#03060B] border-2 border-[#00CFFF]/30 shadow-[0_0_70px_rgba(0,207,255,0.18)] p-4 sm:p-7 overflow-hidden ${className}`}
    >
      {/* Background Industrial Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#00CFFF_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.04] pointer-events-none" />

      {/* Header Plate */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <PhivoCoin size={42} state={coinState} glow={true} glowColor={isMatured ? 'gold' : 'cyan'} />
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

        {/* Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div
            className={`px-3.5 py-1.5 rounded-full border text-xs font-mono font-bold flex items-center gap-2 shadow-sm ${
              isMatured
                ? 'bg-[#FDB022]/15 border-[#FDB022]/40 text-[#FDB022]'
                : status === 'EMITTING'
                ? 'bg-[#00CFFF]/20 border-[#00CFFF]/50 text-[#00CFFF]'
                : 'bg-[#32D583]/15 border-[#32D583]/40 text-[#32D583]'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isMatured ? 'bg-[#FDB022]' : status === 'EMITTING' ? 'bg-[#00CFFF] animate-ping' : 'bg-[#32D583] animate-pulse'
              }`}
            />
            <span>
              {isMatured ? '400-DAY MATURED — 100% DISTRIBUTED' : status === 'EMITTING' ? (dailyEmission ? `EMITTING — ${dailyEmission} PHIVO/DAY` : 'EMITTING') : 'ACTIVE / EMITTING'}
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================================
          INTEGRATED MACHINERY FLOW (Desktop Horizontal / Mobile Vertical)
         ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch relative z-10">
        
        {/* 1. REACTOR CONTAINER (Hero Core) */}
        <div className="lg:col-span-4 flex flex-col justify-between p-5 rounded-3xl bg-gradient-to-br from-[#12223D] via-[#0A1527] to-[#040812] border-2 border-[#00CFFF]/40 shadow-[inset_0_0_40px_rgba(0,207,255,0.15)] relative overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
            <span className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">
              REACTOR CORE UNIT #01
            </span>
            <span className="text-[9px] font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2 py-0.5 rounded border border-[#00CFFF]/30">
              ACTIVE
            </span>
          </div>

          <div className="py-6 flex flex-col items-center justify-center">
            <div className="relative w-36 h-36 rounded-full bg-gradient-to-tr from-[#030914] via-[#0B1A33] to-[#122A52] border-2 border-[#00CFFF]/60 flex flex-col items-center justify-center p-2 text-center shadow-[0_0_40px_rgba(0,207,255,0.3)]">
              <PhivoCoin size={54} state={isCurrentlyEmitting ? 'CHARGING' : 'GENERATED'} glow={true} glowColor="cyan" />
              <span className="text-[10px] font-black font-mono text-white mt-1">10,000 PHIVO</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/15 space-y-1.5 font-mono text-xs">
            <div className="flex justify-between text-[#98A2B3]">
              <span>PROGRESS</span>
              <span className="text-[#00CFFF] font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden border border-white/10 p-0.5">
              <div className="h-full rounded-full bg-gradient-to-r from-[#00CFFF] to-[#32D583]" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        {/* 2. CONDUIT & 3. LEDGER CHECKPOINT CONTAINERS */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4 p-5 rounded-3xl bg-[#050B16] border border-white/10 relative overflow-hidden">
          
          {/* Conduit Pipeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-[10px] font-mono font-bold text-[#00CFFF] uppercase tracking-wider">
                CONDUIT PIPELINE
              </span>
              <Activity className="w-3.5 h-3.5 text-[#00CFFF] animate-pulse" />
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between font-mono text-xs">
              <span className="text-white">Token In-Transit</span>
              <PhivoCoin size={32} state="IN_TRANSIT" glow={true} glowColor="gold" />
            </div>
          </div>

          {/* Ledger Checkpoint Container */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-[10px] font-mono font-bold text-[#32D583] uppercase tracking-wider">
                LEDGER CHECKPOINT
              </span>
              <Database className="w-3.5 h-3.5 text-[#32D583]" />
            </div>

            <div className="p-3 rounded-xl bg-[#030712] border border-[#32D583]/30 flex items-center justify-between font-mono text-xs text-[#32D583]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>STATE ROOT CONFIRMED</span>
              </div>
              <PhivoCoin size={28} state="VALIDATED" glow={false} />
            </div>
          </div>

        </div>

        {/* 4. WALLET CHAMBER CONTAINER (Destination Vault) */}
        <div className="lg:col-span-4 flex flex-col justify-between p-5 rounded-3xl bg-[#071220] border border-white/15 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <PhivoCoin size={34} state="CREDITED" glow={true} glowColor="green" />
              <div>
                <span className="text-[10px] font-mono text-[#98A2B3] block uppercase tracking-wider">
                  WALLET CHAMBER
                </span>
                <span className="text-xs font-bold font-mono text-white block">PHIVO VAULT SETTLED</span>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded bg-[#32D583]/15 border border-[#32D583]/30 text-[#32D583] text-[10px] font-mono font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>CREDITED</span>
            </div>
          </div>

          <div className="space-y-3 font-mono py-2">
            <div className="p-3.5 rounded-2xl bg-[#030712] border border-white/15 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#98A2B3] block uppercase">DISTRIBUTED PHIVO</span>
                <span className="text-lg font-black text-[#00CFFF] tabular-nums">
                  {distributedAmount.toLocaleString()} PHIVO
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#32D583] bg-[#32D583]/10 px-2.5 py-1 rounded-lg">
                Day {currentDay} / {totalDays}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#030712] border border-white/15 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#98A2B3] block uppercase">REMAINING UNISSUED</span>
                <span className="text-lg font-black text-[#F7B27A] tabular-nums">
                  {remainingPhivo.toLocaleString()} PHIVO
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#98A2B3]">
                {Math.max(0, totalDays - currentDay)} Days
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-[#98A2B3] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00CFFF] shrink-0" />
            <span>Server-authoritative settlement. Max lifetime cap: 10,000 PHIVO.</span>
          </div>
        </div>

      </div>

      {/* Matured State Overlay */}
      {isMatured && (
        <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-[#FDB022]/20 via-[#FDB022]/10 to-[#FDB022]/20 border border-[#FDB022]/50 text-center space-y-1 relative z-20 shadow-lg">
          <div className="text-sm font-black font-mono text-[#FDB022] tracking-wider uppercase flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />
            <span>NODE MATURED — 100% DISTRIBUTED</span>
          </div>
          <p className="text-xs text-white/90 font-mono">
            All 10,000 PHIVO lifetime node allocation has been fully emitted across 400 eligible reward days.
          </p>
        </div>
      )}

    </div>
  );
};
