import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Download,
  Lock,
  Menu,
  ShieldCheck,
  X,
  Activity,
  FileCheck2,
} from 'lucide-react';
import { PhivoOrbitalCore } from '../components/landing/PhivoOrbitalCore';
import { EcosystemArchitectureGrid } from '../components/landing/EcosystemArchitectureGrid';
import { PhivoTokenomicsSection } from '../components/landing/PhivoTokenomicsSection';
import { GlobalRoadmapSection } from '../components/landing/GlobalRoadmapSection';
import { AppDownloadSheet } from '../components/landing/AppDownloadSheet';
import { LegalModal } from '../components/modals/LegalModal';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';

export interface LandingPageProps {
  onNavigate: (route: string) => void;
  user?: any;
}

const NAV_LINKS = [
  { id: 'vision', label: 'Vision' },
  { id: 'ecosystem', label: 'Ecosystem' },
  { id: 'utility', label: 'PHIVO Utility' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'security', label: 'Security' },
];

const HERO_METRICS = [
  { label: 'TOTAL TOKEN SUPPLY', value: '100,000,000 PHIVO', accent: '#F5B800' },
  { label: 'GENESIS INFRASTRUCTURE', value: '10,000 Global Nodes', accent: '#00E5FF' },
  { label: 'SETTLEMENT NETWORK', value: 'BNB Smart Chain (BEP-20)', accent: '#00E676' },
];

const LONGEVITY_THESIS = [
  {
    index: '01',
    title: 'Bounded Infrastructure Supply',
    description:
      'Genesis infrastructure is hard-capped at 10,000 Global Nodes. Eliminating uncapped node issuance protects network scarcity and prevents structural dilution across market cycles.',
    accent: '#F5B800',
  },
  {
    index: '02',
    title: 'Utility-Driven Token Velocity',
    description:
      'PHIVO is engineered as a working digital asset anchored to real ecosystem settlement, time-locked vault participation, instant liquidity conversion, and global merchant payments.',
    accent: '#00E5FF',
  },
  {
    index: '03',
    title: 'Disciplined Reserve & Custody Architecture',
    description:
      'Ecosystem liquidity and user balances operate under segregated asset protection, disciplined treasury guardrails, and transparent accounting designed for institutional durability.',
    accent: '#00E676',
  },
  {
    index: '04',
    title: 'Phased Global Scalability',
    description:
      'Expansion proceeds through measured multi-year phases—from Genesis Core infrastructure and mobile access to PHIVONEX Pay commerce rails and decentralized Web3 cloud services.',
    accent: '#FFE082',
  },
];

const SECURITY_ASSURANCES = [
  {
    title: 'Verifiable On-Chain Settlement',
    description:
      'Deposits, withdrawals, and BEP-20 asset transfers settle transparently on BNB Smart Chain with independently verifiable transaction hashes.',
    icon: ShieldCheck,
    accent: '#00E5FF',
  },
  {
    title: 'Segregated Asset Custody',
    description:
      'Operational liquidity, strategic reserves, and participant vault commitments are compartmentalized to preserve clear asset boundaries at all times.',
    icon: Lock,
    accent: '#F5B800',
  },
  {
    title: 'Automated Reserve Protection',
    description:
      'Continuous treasury monitoring and automated pacing guardrails safeguard settlement reliability during periods of heightened network demand.',
    icon: Activity,
    accent: '#00E676',
  },
  {
    title: '24/7 Transparent Accounting',
    description:
      'Every settlement event, conversion, and vault milestone is recorded in clean chronological history inside each participant’s verified account.',
    icon: FileCheck2,
    accent: '#FFE082',
  },
];

const FAQ_ITEMS = [
  {
    q: 'What is PHIVONEX and what problem does the ecosystem solve?',
    a: 'PHIVONEX is a unified Web3 and digital infrastructure ecosystem built on BNB Smart Chain. It brings together decentralized node infrastructure, institutional liquidity modules, time-locked asset vaults, and borderless BEP-20 payment rails within a single cohesive settlement environment.',
  },
  {
    q: 'How is the long-term sustainability of PHIVO engineered?',
    a: 'PHIVO operates with a strictly fixed maximum supply of 100,000,000 tokens and zero uncapped minting. Long-term durability is anchored by bounded Genesis Node capacity (10,000 units), disciplined strategic reserves, and expanding real-world utility across ecosystem settlement and PHIVONEX Pay merchant rails.',
  },
  {
    q: 'What are PHIVONEX Genesis Nodes?',
    a: 'Genesis Nodes form the foundational infrastructure layer of PHIVONEX Genesis Core™. Capped permanently at 10,000 global units, Genesis Nodes represent scarce ecosystem infrastructure designed to support decentralized participation and structured PHIVO distribution.',
  },
  {
    q: 'Why does PHIVONEX utilize BNB Smart Chain (BEP-20)?',
    a: 'BNB Smart Chain delivers fast block finality, minimal transaction overhead, and broad global wallet compatibility—making it ideal for borderless BEP-20 settlement, instant conversions, and everyday merchant payment infrastructure.',
  },
  {
    q: 'How are digital assets and reserves protected across the platform?',
    a: 'PHIVONEX employs segregated asset custody, automated reserve protection guardrails, and verifiable on-chain BEP-20 settlement. Every transaction and balance movement is recorded transparently inside the authenticated member environment.',
  },
  {
    q: 'Where can participants view detailed portfolio modules and private member tools?',
    a: 'All account-specific controls, wallet balances, active infrastructure modules, and private ecosystem participation tools are securely housed inside the authenticated Member Portal. Create an account or sign in to access your personalized workspace.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, user }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('vision');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [appDownloadOpen, setAppDownloadOpen] = useState(false);
  const [legalModalTitle, setLegalModalTitle] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
      const scrollY = window.scrollY + 180;
      for (const link of NAV_LINKS) {
        const el = document.getElementById(link.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollY >= top && scrollY < top + height) {
            setActiveSection(link.id);
            break;
          }
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleEnterEcosystem = () => {
    setMobileMenuOpen(false);
    onNavigate(user ? '/app' : '/register');
  };

  const handleMemberLogin = () => {
    setMobileMenuOpen(false);
    onNavigate(user ? '/app' : '/login');
  };

  return (
    <div className="min-h-screen bg-[#050807] text-[#F5F7FA] font-sans antialiased selection:bg-[#F5B800]/25 selection:text-[#FFE082] overflow-x-hidden relative">
      {/* Subtle Ambient Obsidian Depth Field */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 45% at 50% -8%, rgba(245, 184, 0, 0.08), transparent 65%), radial-gradient(ellipse 55% 40% at 88% 22%, rgba(0, 229, 255, 0.05), transparent 60%)',
        }}
      />

      {/* =====================================================================
          SECTION 1: STICKY GLASS NAVIGATION BAR
         ===================================================================== */}
      <header
        className={`sticky top-0 z-50 transition-all duration-200 ${
          isScrolled
            ? 'bg-[#050807]/85 backdrop-blur-2xl border-b border-white/[0.09] py-3'
            : 'bg-[#050807]/60 backdrop-blur-xl border-b border-white/[0.05] py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Original PHIVONEX Brand Logo */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] rounded-lg"
            aria-label="PHIVONEX Home"
          >
            <PhivonexLogo size="md" theme="dark" animated={true} />
          </button>

          {/* Zone 2: 5 Clean Anchor Links */}
          <nav
            aria-label="Primary"
            className="hidden lg:flex items-center gap-8 text-sm font-medium text-slate-300"
          >
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => scrollToSection(link.id)}
                  className={`relative py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B800] rounded ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{link.label}</span>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 -bottom-0.5 h-px transition-opacity duration-200 bg-gradient-to-r from-[#F5B800] to-[#00E5FF] ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Member Login & Enter Ecosystem Gold CTA */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleMemberLogin}
              className="px-4 py-2 text-sm font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] rounded-xl"
            >
              Member Login
            </button>
            <button
              type="button"
              onClick={handleEnterEcosystem}
              className="px-5 py-2.5 text-sm font-semibold text-[#050807] rounded-xl bg-gradient-to-r from-[#F5B800] via-[#FFD54F] to-[#FFE082] hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-[0_10px_28px_-10px_rgba(245,184,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Enter Ecosystem
            </button>
          </div>

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Responsive Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/[0.08] bg-[#050807]/98 backdrop-blur-2xl px-5 pt-4 pb-6 space-y-2">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollToSection(link.id)}
                className="block w-full text-left py-2.5 text-sm font-medium text-slate-200 hover:text-[#FFE082] transition-colors cursor-pointer"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-4 mt-2 border-t border-white/[0.08] grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleMemberLogin}
                className="py-2.5 px-4 rounded-xl text-sm font-medium text-white border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
              >
                Member Login
              </button>
              <button
                type="button"
                onClick={handleEnterEcosystem}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold text-[#050807] bg-gradient-to-r from-[#F5B800] to-[#FFE082] hover:brightness-105 transition-all whitespace-nowrap cursor-pointer"
              >
                Enter Ecosystem
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10">
        {/* =====================================================================
            SECTION 2: HERO SECTION
           ===================================================================== */}
        <section className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pt-14 sm:pt-20 lg:pt-24 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-6 space-y-7">
              <div className="text-xs font-mono tracking-[0.16em] text-[#FFE082] font-medium">
                GLOBAL WEB3 ECOSYSTEM • BNB SMART CHAIN (BEP-20)
              </div>

              <h1
                className="text-white font-semibold tracking-tight leading-[1.08]"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(2.25rem, 4.3vw, 3.85rem)',
                  textWrap: 'balance',
                }}
              >
                Where Decentralized Innovation Meets{' '}
                <span className="bg-gradient-to-r from-[#FFE082] via-[#F5B800] to-[#00E5FF] bg-clip-text text-transparent">
                  Real-World Utility
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                A unified digital ecosystem empowering global participants with transparent node infrastructure, borderless PHIVO utility, and sustainable long-term growth.
              </p>

              {/* Hero CTAs */}
              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={handleEnterEcosystem}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-[#050807] bg-gradient-to-r from-[#F5B800] via-[#FFD54F] to-[#FFE082] hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-[0_14px_34px_-12px_rgba(245,184,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span>Enter Ecosystem</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleMemberLogin}
                  className="inline-flex items-center justify-center px-5 py-3.5 rounded-xl text-sm font-semibold text-white border border-white/[0.14] bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/[0.24] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                >
                  Member Portal
                </button>

                <button
                  type="button"
                  onClick={() => setAppDownloadOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-medium text-slate-300 hover:text-[#00E5FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                >
                  <Download className="w-4 h-4 text-[#00E5FF]" />
                  <span>Download Official App</span>
                </button>
              </div>
            </div>

            {/* Right Interactive Visual: 60fps PHIVO Orbital Core & Neural Mesh */}
            <div className="lg:col-span-6">
              <PhivoOrbitalCore />
            </div>
          </div>

          {/* 3 Clean Full-Width Ecosystem Metric Cards */}
          <div className="mt-14 lg:mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
            {HERO_METRICS.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[20px] px-6 py-5 border border-white/[0.08] flex flex-col justify-between gap-2"
                style={{
                  background: 'rgba(14, 21, 19, 0.68)',
                  backdropFilter: 'blur(24px)',
                }}
              >
                <span className="text-[11px] font-mono tracking-[0.14em] text-slate-400">
                  {metric.label}
                </span>
                <span
                  className="text-xl sm:text-2xl font-semibold font-mono tabular-nums tracking-tight"
                  style={{ color: metric.accent }}
                >
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Subtle Hairline Divider */}
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent" />
        </div>

        {/* =====================================================================
            SECTION 3: PROTOCOL LONGEVITY & SUSTAINABILITY THESIS (#vision)
           ===================================================================== */}
        <section
          id="vision"
          className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-20 sm:py-28"
        >
          <div className="max-w-2xl">
            <span className="text-xs font-mono tracking-[0.14em] text-[#F5B800]">
              Protocol Vision
            </span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Engineered for Multi-Year Longevity and Real Economic Utility
            </h2>
            <p className="mt-4 text-base text-slate-400 leading-relaxed">
              Sustainable Web3 networks are built on scarcity, transparent reserve stewardship, and disciplined real-world utility—not short-lived speculation.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {LONGEVITY_THESIS.map((card) => (
              <div
                key={card.index}
                className="rounded-[22px] p-6 sm:p-7 border border-white/[0.08] flex flex-col justify-between gap-5 transition-colors duration-200 hover:border-white/[0.16]"
                style={{
                  background: 'rgba(14, 21, 19, 0.68)',
                  backdropFilter: 'blur(24px)',
                }}
              >
                <div>
                  <span
                    className="font-mono text-xs font-semibold tabular-nums"
                    style={{ color: card.accent }}
                  >
                    {card.index}
                  </span>
                  <h3
                    className="mt-4 text-lg font-semibold text-white tracking-tight leading-snug"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className="h-px w-12"
                  style={{ backgroundColor: `${card.accent}60` }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* =====================================================================
            SECTION 4: CORE ECOSYSTEM ARCHITECTURE (#ecosystem)
           ===================================================================== */}
        <section
          id="ecosystem"
          className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-20 sm:py-28 border-t border-white/[0.06]"
        >
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl">
              <span className="text-xs font-mono tracking-[0.14em] text-[#00E5FF]">
                Ecosystem Architecture
              </span>
              <h2
                className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight"
                style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
              >
                Four Interconnected Pillars of Digital Infrastructure
              </h2>
            </div>
            <p className="text-sm sm:text-base text-slate-400 max-w-md leading-relaxed">
              Every module operates under unified settlement standards—connecting infrastructure nodes, institutional liquidity, vaults, and multi-asset wallets.
            </p>
          </div>

          <EcosystemArchitectureGrid onExplore={handleEnterEcosystem} />
        </section>

        {/* =====================================================================
            SECTION 5: PHIVO TOKENOMICS & REAL-WORLD UTILITY LAYER (#utility)
           ===================================================================== */}
        <section
          id="utility"
          className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-20 sm:py-28 border-t border-white/[0.06]"
        >
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-mono tracking-[0.14em] text-[#F5B800]">
              PHIVO Utility Layer
            </span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Fixed Supply Monetary Architecture Built for Real Settlement
            </h2>
            <p className="mt-4 text-base text-slate-400 leading-relaxed">
              With a hard cap of 100,000,000 PHIVO on BNB Smart Chain, token allocation prioritizes long-term node operators, deep liquidity, and global merchant infrastructure.
            </p>
          </div>

          <PhivoTokenomicsSection />
        </section>

        {/* =====================================================================
            SECTION 6: 4-PHASE GLOBAL FUTURE ROADMAP (#roadmap)
           ===================================================================== */}
        <section
          id="roadmap"
          className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-20 sm:py-28 border-t border-white/[0.06]"
        >
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-mono tracking-[0.14em] text-[#00E676]">
              Global Trajectory
            </span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Four-Phase Roadmap to Borderless Web3 Utility
            </h2>
            <p className="mt-4 text-base text-slate-400 leading-relaxed">
              A disciplined, milestone-driven rollout scaling PHIVONEX from core infrastructure and mobile access to global merchant settlement and decentralized governance.
            </p>
          </div>

          <GlobalRoadmapSection />
        </section>

        {/* =====================================================================
            SECTION 7: ENTERPRISE SECURITY & TRANSPARENCY (#security)
           ===================================================================== */}
        <section
          id="security"
          className="scroll-mt-24 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-20 sm:py-28 border-t border-white/[0.06]"
        >
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-mono tracking-[0.14em] text-[#00E5FF]">
              Security &amp; Assurance
            </span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Institutional Custody Discipline and Verifiable Transparency
            </h2>
            <p className="mt-4 text-base text-slate-400 leading-relaxed">
              Built around conservative asset protection, clear settlement trails, and continuous operational resilience for global participants.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SECURITY_ASSURANCES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-[22px] p-6 sm:p-7 border border-white/[0.08] flex flex-col gap-4 transition-colors duration-200 hover:border-white/[0.16]"
                  style={{
                    background: 'rgba(14, 21, 19, 0.68)',
                    backdropFilter: 'blur(24px)',
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/[0.1] bg-white/[0.03]"
                    style={{ color: item.accent }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3
                    className="text-lg font-semibold text-white tracking-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* =====================================================================
            SECTION 8: INFORMATIVE WEB3 FAQ ACCORDION
           ===================================================================== */}
        <section
          id="faq"
          className="scroll-mt-24 max-w-4xl mx-auto px-5 sm:px-6 lg:px-8 py-20 sm:py-28 border-t border-white/[0.06]"
        >
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-mono tracking-[0.14em] text-[#F5B800]">
              Protocol Clarity
            </span>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-base text-slate-400">
              Clear answers regarding PHIVONEX infrastructure, PHIVO supply mechanics, custody safeguards, and member portal access.
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-[20px] border transition-colors duration-200 overflow-hidden"
                  style={{
                    background: isOpen
                      ? 'rgba(18, 28, 25, 0.78)'
                      : 'rgba(14, 21, 19, 0.58)',
                    borderColor: isOpen
                      ? 'rgba(245, 184, 0, 0.32)'
                      : 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5B800]"
                  >
                    <span
                      className="text-base font-medium text-white leading-snug"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#F5B800]' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6 pt-0 text-sm sm:text-[15px] text-slate-300 leading-relaxed border-t border-white/[0.06]">
                      <p className="pt-4">{item.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* =====================================================================
            SECTION 9A: PRE-FOOTER VISION CALLOUT
           ===================================================================== */}
        <section className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pb-20 sm:pb-24">
          <div
            className="relative rounded-[28px] px-7 sm:px-12 py-12 sm:py-16 border border-white/[0.1] overflow-hidden text-center"
            style={{
              background:
                'radial-gradient(ellipse 80% 90% at 50% 0%, rgba(245, 184, 0, 0.12), rgba(14, 21, 19, 0.88) 58%, rgba(5, 8, 7, 0.96) 100%)',
              backdropFilter: 'blur(24px)',
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-[#F5B800]/65 to-transparent"
            />

            <span className="text-xs font-mono tracking-[0.16em] text-[#FFE082]">
              PHIVONEX GLOBAL ECOSYSTEM
            </span>

            <h2
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-semibold text-white tracking-tight max-w-3xl mx-auto leading-tight"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Step Into the Future of Decentralized Utility
            </h2>

            <p className="mt-4 text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
              Create your verified member account to explore Genesis infrastructure, unified BEP-20 settlement, and the complete PHIVONEX workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleEnterEcosystem}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-[#050807] bg-gradient-to-r from-[#F5B800] via-[#FFD54F] to-[#FFE082] hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-[0_14px_34px_-12px_rgba(245,184,0,0.55)]"
              >
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setAppDownloadOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white border border-white/[0.15] bg-white/[0.04] hover:bg-white/[0.09] transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#00E5FF]" />
                <span>Download Official App</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* =====================================================================
          SECTION 9B: INSTITUTIONAL 4-COLUMN FOOTER
         ===================================================================== */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-[#040605]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Column 1: Brand & Mission */}
            <div className="space-y-4">
              <div className="flex items-center">
                <PhivonexLogo size="md" theme="dark" animated={true} />
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xs">
                Unified Web3 infrastructure uniting bounded Genesis Nodes, institutional liquidity, and borderless BEP-20 utility on BNB Smart Chain.
              </p>
            </div>

            {/* Column 2: Ecosystem */}
            <div>
              <h3 className="text-xs font-mono tracking-[0.14em] text-slate-300 uppercase mb-4">
                Ecosystem
              </h3>
              <ul className="space-y-2.5 text-sm text-slate-400">
                {NAV_LINKS.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(link.id)}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Access */}
            <div>
              <h3 className="text-xs font-mono tracking-[0.14em] text-slate-300 uppercase mb-4">
                Member Access
              </h3>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li>
                  <button
                    type="button"
                    onClick={handleEnterEcosystem}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Create Account
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleMemberLogin}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Member Portal Login
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setAppDownloadOpen(true)}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Download Official App
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection('faq')}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Protocol FAQ
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Legal & Compliance */}
            <div>
              <h3 className="text-xs font-mono tracking-[0.14em] text-slate-300 uppercase mb-4">
                Governance &amp; Legal
              </h3>
              <ul className="space-y-2.5 text-sm text-slate-400">
                {[
                  'Terms of Service',
                  'Privacy Policy',
                  'Risk Disclosure',
                  'AML & Compliance',
                ].map((docTitle) => (
                  <li key={docTitle}>
                    <button
                      type="button"
                      onClick={() => setLegalModalTitle(docTitle)}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      {docTitle}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} PHIVONEX Digital Infrastructure Ecosystem. All rights reserved.</p>
            <p className="font-mono">BNB Smart Chain (BEP-20) · 100,000,000 PHIVO Max Supply</p>
          </div>
        </div>
      </footer>

      {/* Interactive Modals */}
      <AppDownloadSheet
        isOpen={appDownloadOpen}
        onClose={() => setAppDownloadOpen(false)}
        onOpenPortal={handleMemberLogin}
      />
      <LegalModal
        title={legalModalTitle}
        onClose={() => setLegalModalTitle(null)}
      />
    </div>
  );
};

export default LandingPage;
