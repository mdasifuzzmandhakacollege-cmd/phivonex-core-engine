import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  Layers,
  Coins,
  Shield,
  ArrowRight,
  ArrowUpRight,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Globe,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  Zap,
  Award,
  Wallet,
  FileText,
  Sliders,
  Workflow,
  ShieldCheck,
  Info,
  ArrowRightLeft,
  Scale,
  CheckSquare,
  UserPlus,
  LogIn,
} from 'lucide-react';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';
import { BnbIcon, PhivoCoinIcon } from '../components/brand/CryptoIcons';
import { PHIVONEX_TOKEN_CONFIG } from '../server/config/tokenConfig';

interface PublicLandingPageProps {
  onNavigate: (route: string) => void;
  user: any;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({ onNavigate, user }) => {
  // Navigation & Interactive UI States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [contractCopied, setContractCopied] = useState(false);
  const [simulatedProtocolStep, setSimulatedProtocolStep] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');

  // Handle Scroll Effects & Active Section Tracking
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);

      const sections = ['hero', 'ecosystem', 'genesis-nodes', 'phivo', 'technology', 'security', 'roadmap', 'faq'];
      const scrollPosition = window.scrollY + 200;

      for (const sectionId of sections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Contract Copy Action
  const copyContractAddress = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(PHIVONEX_TOKEN_CONFIG.contractAddress);
      setContractCopied(true);
      setTimeout(() => setContractCopied(false), 2000);
    }
  };

  // Toggle FAQ Accordion
  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // Smooth Section Scroll
  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Synthetic Protocol Simulation Cycle
  useEffect(() => {
    const timer = setInterval(() => {
      setSimulatedProtocolStep((prev) => (prev + 1) % 4);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  // FAQ Items
  const faqItems = [
    {
      q: 'What is PHIVONEX?',
      a: 'PHIVONEX is an enterprise-grade digital node ecosystem and Web3 participation platform. It unifies Genesis Node participation, PHIVO token utility, multi-layer network incentives, and auditable financial ledger operations into one coherent architecture.',
    },
    {
      q: 'What is a Genesis Node?',
      a: 'A Genesis Node is a structured participation unit within the PHIVONEX ecosystem. Genesis V1 nodes feature a lifetime allocation cap of 10,000 PHIVO emitted across eligible daily epochs. Daily PHIVO emission is governed by the active protocol economic configuration.',
    },
    {
      q: 'What is PHIVO?',
      a: 'PHIVO is the native ecosystem utility asset deployed on BNB Smart Chain under the BEP-20 token standard with 18 decimal places and a maximum supply cap of 100,000,000 PHIVO.',
    },
    {
      q: 'Which blockchain does PHIVONEX use?',
      a: 'PHIVONEX integrates directly with BNB Smart Chain (BSC) for on-chain BEP-20 token operations and deposit verification while utilizing a high-performance server-authoritative double-entry ledger for real-time internal state transitions.',
    },
    {
      q: 'How are Genesis Node rewards recorded?',
      a: 'Genesis Node emissions are calculated and posted by server-authoritative epoch engines. Rewards are recorded with purchase-time economic snapshots, ensuring historical terms remain immutable and traceable regardless of future global configuration updates.',
    },
    {
      q: 'What is the configured reference value?',
      a: 'The configured reference rate ($0.10 USD for PHIVO, $1,000 USD for Genesis Nodes) represents an internal protocol accounting benchmark used by the platform conversion engine. It is an informational reference and does not constitute a guaranteed market price or exchange rate.',
    },
    {
      q: 'How does the direct referral system work?',
      a: 'Direct referrals reward users with a configured $50 USD credit for each direct participant who successfully activates an eligible Genesis Node. Earnings converge into the user’s unified USDT wallet balance.',
    },
    {
      q: 'How does binary matching work?',
      a: 'Binary matching calculates volume across Left and Right subtrees. Server-side matching engines process daily volume settlements, credit eligible binary bonuses, and carry forward unused volume according to network rules.',
    },
    {
      q: 'What are leadership rewards?',
      a: 'Leadership rewards represent sequential milestone achievements earned as network volume and rank qualifications grow. Progression follows structured ranks from Standard Member up to Node Titan.',
    },
    {
      q: 'Can leadership rewards be non-cash?',
      a: 'Yes. Certain leadership ranks provide non-cash recognition rewards (such as luxury retreats, travel packages, or executive car rewards). Non-cash rewards carry an Indicative Display Value for recognition purposes and do not generate direct wallet cash credits.',
    },
    {
      q: 'How does the unified wallet work?',
      a: 'The unified wallet aggregates all settled USDT credits—including deposits, account credits, referral commissions, binary matching, and coin swaps—into a single spendable available balance while retaining traceable underlying ledger audit records.',
    },
    {
      q: 'How are deposits verified?',
      a: 'On-chain deposits on BNB Smart Chain are verified by confirmation-aware verification services. Transactions are checked for contract address, recipient wallet, asset, and required block confirmations before ledger crediting.',
    },
    {
      q: 'How are withdrawals processed?',
      a: 'Withdrawal requests undergo balance validation, status tracking, and multi-stage administrative review before disbursement, maintaining a transparent and auditable payout lifecycle.',
    },
    {
      q: 'Does PHIVONEX guarantee profit?',
      a: 'No. PHIVONEX does not guarantee economic returns, token appreciation, or financial yield. All digital asset and node activities carry inherent technical and market risks.',
    },
    {
      q: 'How does PHIVONEX protect operational privacy?',
      a: 'PHIVONEX enforces strict operational privacy. Public interfaces present conceptual protocol flows and architecture specifications, while private user records, database UUIDs, internal admin actions, and telemetry feeds remain protected.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F5F7FA] font-sans antialiased selection:bg-[#00CFFF]/20 selection:text-[#00CFFF] overflow-x-hidden relative">
      
      {/* Background Subtle Grid Texture */}
      <div className="fixed inset-0 bg-grid-pattern opacity-40 pointer-events-none z-0" />

      {/* ======================================================================
          1. TOP NAVIGATION (Sticky Glassmorphic Header)
         ====================================================================== */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'backdrop-blur-2xl bg-[#05070B]/90 border-b border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.8)] py-3'
            : 'backdrop-blur-md bg-[#05070B]/70 border-b border-white/[0.05] py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer select-none group" 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <PhivonexLogo size="md" theme="dark" animated={true} />
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold tracking-wider text-slate-300">
            {[
              { id: 'hero', label: 'Home' },
              { id: 'ecosystem', label: 'Ecosystem' },
              { id: 'genesis-nodes', label: 'Genesis Nodes' },
              { id: 'phivo', label: 'PHIVO' },
              { id: 'technology', label: 'Technology' },
              { id: 'security', label: 'Security' },
              { id: 'roadmap', label: 'Roadmap' },
              { id: 'faq', label: 'FAQ' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`relative py-1.5 transition-colors cursor-pointer focus:outline-none ${
                  activeSection === item.id ? 'text-[#00CFFF]' : 'hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {activeSection === item.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#00CFFF] to-emerald-400 rounded-full shadow-[0_0_8px_#00CFFF]" />
                )}
              </button>
            ))}
          </nav>

          {/* Primary Action CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <button 
              onClick={() => onNavigate('/login')}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] hover:border-[#00CFFF]/40 rounded-lg transition-all shadow-[0_0_15px_rgba(0,207,255,0.05)] hover:shadow-[0_0_20px_rgba(0,207,255,0.2)] cursor-pointer flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 text-[#00CFFF]" />
              <span>Login</span>
            </button>
            <button 
              onClick={() => onNavigate('/register')}
              className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 rounded-lg transition-all shadow-[0_0_20px_rgba(0,207,255,0.25)] hover:shadow-[0_0_30px_rgba(0,207,255,0.4)] cursor-pointer flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5 text-slate-950" />
              <span>Register</span>
            </button>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex lg:hidden">
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-300 hover:text-[#00CFFF] transition-colors focus:outline-none rounded-lg hover:bg-white/[0.05]"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/[0.08] bg-[#05070B]/98 backdrop-blur-2xl px-5 pt-4 pb-6 space-y-3">
            <button onClick={() => scrollToSection('hero')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">Home</button>
            <button onClick={() => scrollToSection('ecosystem')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">Ecosystem</button>
            <button onClick={() => scrollToSection('genesis-nodes')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">Genesis Nodes</button>
            <button onClick={() => scrollToSection('phivo')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">PHIVO Token</button>
            <button onClick={() => scrollToSection('technology')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">Technology</button>
            <button onClick={() => scrollToSection('security')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">Security</button>
            <button onClick={() => scrollToSection('roadmap')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">Roadmap</button>
            <button onClick={() => scrollToSection('faq')} className="block w-full text-left py-2 text-sm text-slate-300 hover:text-[#00CFFF]">FAQ</button>
            
            <div className="pt-4 border-t border-white/[0.08] grid grid-cols-2 gap-3">
              <button 
                onClick={() => { setMobileMenuOpen(false); onNavigate('/login'); }}
                className="w-full py-3 text-center text-xs font-bold uppercase tracking-wider text-white bg-white/[0.06] border border-white/[0.12] rounded-lg cursor-pointer"
              >
                Login
              </button>
              <button 
                onClick={() => { setMobileMenuOpen(false); onNavigate('/register'); }}
                className="w-full py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-950 bg-gradient-to-r from-[#00CFFF] to-[#00A3FF] rounded-lg cursor-pointer"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ======================================================================
          2. HERO SECTION
         ====================================================================== */}
      <section id="hero" className="relative pt-12 sm:pt-20 pb-20 overflow-hidden z-10">
        {/* Ambient Radial Illumination */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#00CFFF]/15 via-[#07101D]/50 to-transparent pointer-events-none animate-breathing-glow" />
        <div className="absolute top-1/4 right-12 w-[450px] h-[450px] bg-[#00A3FF]/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 left-10 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Hero Content Left */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 text-left">
            
            {/* Kicker Eyebrow Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-xs font-mono text-[#00CFFF]">
              <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-ping" />
              <span className="uppercase tracking-widest font-bold">Genesis Node Economy</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1] font-sans">
              PHIVONEX <br />
              <span className="bg-gradient-to-r from-white via-[#E0F2FE] to-[#00CFFF] bg-clip-text text-transparent">
                A Global Node Ecosystem
              </span>
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed font-normal">
              A next-generation digital ecosystem connecting Genesis Node participation, PHIVO utility, network incentives and transparent financial operations through one unified platform.
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <button 
                onClick={() => onNavigate('/register')}
                className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-slate-950 bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 rounded-xl transition-all shadow-[0_0_25px_rgba(0,207,255,0.35)] hover:shadow-[0_0_35px_rgba(0,207,255,0.5)] flex items-center justify-center gap-2.5 group cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-slate-950" />
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-slate-950" />
              </button>
              
              <button 
                onClick={() => onNavigate('/login')}
                className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-slate-200 hover:text-white bg-[#07101D] hover:bg-[#0A1628] border border-white/[0.12] hover:border-[#00CFFF]/50 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              >
                <LogIn className="w-4 h-4 text-[#00CFFF]" />
                <span>Login</span>
              </button>
            </div>

            {/* Lightweight Secondary Link */}
            <div className="pt-1">
              <button
                onClick={() => scrollToSection('ecosystem')}
                className="text-xs font-semibold text-[#00CFFF] hover:text-white flex items-center gap-1.5 transition-colors group cursor-pointer"
              >
                <span>Explore Ecosystem</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Conceptual Trust Pillars Strip */}
            <div className="pt-8 border-t border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>Transparent Architecture</span>
                </div>
                <p className="text-[11px] text-[#98A2B3]">Auditable ledger model</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Lock className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>Secure Infrastructure</span>
                </div>
                <p className="text-[11px] text-[#98A2B3]">Server-authoritative state</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Layers className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>Unified Ecosystem</span>
                </div>
                <p className="text-[11px] text-[#98A2B3]">Nodes, token &amp; wallet</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Globe className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>Global Participation</span>
                </div>
                <p className="text-[11px] text-[#98A2B3]">Structured Node Participation</p>
              </div>
            </div>

          </div>

          {/* Hero Visual Right — Animated Protocol Core */}
          <div className="lg:col-span-5 w-full flex justify-center">
            <div className="relative w-full max-w-md aspect-square rounded-3xl bg-gradient-to-b from-[#0A1628] via-[#07101D] to-[#05070B] border border-[#00CFFF]/30 p-6 flex flex-col justify-between overflow-hidden shadow-2xl shadow-[#00CFFF]/15 backdrop-blur-2xl">
              
              {/* Highlight Edge Beam */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00CFFF] to-transparent" />
              
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5 relative z-10">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#00CFFF]" />
                  <span className="text-[11px] font-mono text-slate-200 font-bold tracking-widest uppercase">
                    GENESIS NETWORK CORE
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF]">
                  BEP-20 COMPATIBLE
                </span>
              </div>

              {/* Protocol SVG Globe / Mesh Graphic with GPU Animations */}
              <div className="flex-1 flex items-center justify-center relative py-6 select-none">
                <svg className="w-full h-full max-h-[230px]" viewBox="0 0 240 240" fill="none">
                  {/* Rotating Outer Ring */}
                  <g className="animate-spin-slow" style={{ transformOrigin: '120px 120px' }}>
                    <circle cx="120" cy="120" r="102" stroke="#00CFFF" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="6 6" />
                    <circle cx="120" cy="18" r="4.5" fill="#00CFFF" />
                    <circle cx="222" cy="120" r="4.5" fill="#32D583" />
                    <circle cx="120" cy="222" r="4.5" fill="#00A3FF" />
                    <circle cx="18" cy="120" r="4.5" fill="#7057FF" />
                  </g>

                  {/* Counter-Rotating Middle Ring */}
                  <g className="animate-spin-reverse-slow" style={{ transformOrigin: '120px 120px' }}>
                    <circle cx="120" cy="120" r="76" stroke="#00A3FF" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="4 4" />
                    <circle cx="173" cy="67" r="3.5" fill="#00CFFF" />
                    <circle cx="67" cy="173" r="3.5" fill="#32D583" />
                  </g>

                  {/* Static Core Boundary */}
                  <circle cx="120" cy="120" r="52" stroke="#00CFFF" strokeOpacity="0.4" strokeWidth="1.5" />

                  {/* Core Symbol Center */}
                  <circle cx="120" cy="120" r="30" fill="#07101D" stroke="#00CFFF" strokeWidth="2" className="drop-shadow-[0_0_10px_#00CFFF]" />
                  <text x="120" y="124" textAnchor="middle" fill="#00CFFF" fontSize="12" fontWeight="bold" fontFamily="monospace">
                    PHIVO
                  </text>
                </svg>
              </div>

              {/* Bottom Metrics Bar */}
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.08] relative z-10 text-left">
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Architecture</span>
                  <span className="text-xs font-bold font-mono text-white">Genesis V1 Architecture</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Max Supply</span>
                  <span className="text-xs font-bold font-mono text-[#00CFFF]">100M PHIVO</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          3. VALUE PROPOSITION STRIP
         ====================================================================== */}
      <section className="py-8 bg-[#07101D]/70 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
            
            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] hover:border-[#00CFFF]/30 transition-all duration-300">
              <div className="flex items-center gap-2 text-xs font-bold text-[#00CFFF] font-mono mb-1">
                <Server className="w-4 h-4" />
                <span>Genesis Node Economy</span>
              </div>
              <p className="text-xs text-slate-300">
                Structured participation model with snapshotted lifecycle terms.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] hover:border-[#00CFFF]/30 transition-all duration-300">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 font-mono uppercase mb-1">
                <PhivoCoinIcon size={16} />
                <span>PHIVO ECOSYSTEM</span>
              </div>
              <p className="text-xs text-slate-300">
                BEP-20 ecosystem utility asset deployed on BNB Smart Chain.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] hover:border-[#00CFFF]/30 transition-all duration-300">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 font-mono uppercase mb-1">
                <FileText className="w-4 h-4" />
                <span>AUDITABLE OPERATIONS</span>
              </div>
              <p className="text-xs text-slate-300">
                Server-authoritative double-entry financial ledger architecture.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] hover:border-[#00CFFF]/30 transition-all duration-300">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-400 font-mono uppercase mb-1">
                <Wallet className="w-4 h-4" />
                <span>UNIFIED EXPERIENCE</span>
              </div>
              <p className="text-xs text-slate-300">
                Structured Genesis Node participation in a single unified platform.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ======================================================================
          4. PHIVONEX ECOSYSTEM SECTION
         ====================================================================== */}
      <section id="ecosystem" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              ECOSYSTEM ARCHITECTURE
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              The PHIVONEX Ecosystem
            </h2>
            <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
              One integrated platform connecting node participation, PHIVO utility, network growth systems and secure digital-asset operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            
            {/* Card 1 */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-300 space-y-4 group">
              <div className="p-3 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] w-fit">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">1. Genesis Nodes</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Structured lifecycle and reward allocation framework with snapshot preservation across 400 eligible reward epochs.
              </p>
              <button onClick={() => scrollToSection('genesis-nodes')} className="text-xs font-bold text-[#00CFFF] flex items-center gap-1 group-hover:gap-2 transition-all cursor-pointer">
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] hover:border-emerald-500/40 transition-all duration-300 space-y-4 group">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 w-fit">
                <PhivoCoinIcon size={24} />
              </div>
              <h3 className="text-lg font-bold text-white">2. PHIVO Utility Token</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ecosystem utility asset on BNB Smart Chain engineered for reward accounting, platform services, and wallet conversion.
              </p>
              <button onClick={() => scrollToSection('phivo')} className="text-xs font-bold text-emerald-400 flex items-center gap-1 group-hover:gap-2 transition-all cursor-pointer">
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] hover:border-purple-500/40 transition-all duration-300 space-y-4 group">
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 w-fit">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">3. Network Incentives</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Multi-layer direct referral, binary matching, and rank progression architecture calculated by server-authoritative engines.
              </p>
              <button onClick={() => scrollToSection('network-incentives')} className="text-xs font-bold text-purple-400 flex items-center gap-1 group-hover:gap-2 transition-all cursor-pointer">
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Card 4 */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] hover:border-amber-500/40 transition-all duration-300 space-y-4 group">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 w-fit">
                <Wallet className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">4. Unified Wallet</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Deposits, account credits, coin swaps, and supported withdrawals managed within one auditable double-entry ledger environment.
              </p>
              <button onClick={() => scrollToSection('wallet')} className="text-xs font-bold text-amber-400 flex items-center gap-1 group-hover:gap-2 transition-all cursor-pointer">
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Card 5 */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-300 space-y-4 group md:col-span-2 lg:col-span-1">
              <div className="p-3 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] w-fit">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">5. Governance &amp; Security</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Versioned economic controls, role-based administrative auditing, session security, and automated financial reconciliation.
              </p>
              <button onClick={() => scrollToSection('security')} className="text-xs font-bold text-[#00CFFF] flex items-center gap-1 group-hover:gap-2 transition-all cursor-pointer">
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

        </div>
      </section>

      {/* ======================================================================
          5. GENESIS NODE SECTION
         ====================================================================== */}
      <section id="genesis-nodes" className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-6 space-y-6 text-left">
              <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
                PARTICIPATION ARCHITECTURE
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
                Genesis Nodes <br />
                <span className="text-slate-400 text-2xl font-normal">Structured Participation in the PHIVONEX Ecosystem</span>
              </h2>

              <p className="text-sm text-slate-300 leading-relaxed">
                Genesis V1 Nodes form the foundational infrastructure participation layer. Each Genesis V1 Node participates in the protocol with lifetime allocation terms, while daily PHIVO emission is governed by the active protocol economic configuration.
              </p>

              {/* Public-Safe Specifications Grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
                <div className="p-3 rounded-2xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Product Unit</span>
                  <span className="font-bold text-white">Genesis V1 Node</span>
                </div>

                <div className="p-3 rounded-2xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Configured Price</span>
                  <span className="font-bold text-[#00CFFF]">$1,000 USD (Ref)</span>
                </div>

                <div className="p-3 rounded-2xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Lifetime Allocation</span>
                  <span className="font-bold text-emerald-400">10,000 PHIVO</span>
                </div>

                <div className="p-3 rounded-2xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Daily Emission</span>
                  <span className="font-bold text-white">Protocol Governed</span>
                </div>

                <div className="p-3 rounded-2xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Eligible Term</span>
                  <span className="font-bold text-white">200 Eligible Days</span>
                </div>

                <div className="p-3 rounded-2xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Participation</span>
                  <span className="font-bold text-purple-400">Structured Node Participation</span>
                </div>
              </div>

              {/* Snapshot USP Banner */}
              <div className="p-4 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-start gap-3 text-xs text-[#00CFFF]">
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-slate-200 leading-normal">
                  <strong className="text-white">Protocol Governance:</strong> Genesis Node lifetime allocations and purchase parameters are preserved, while daily PHIVO emission is governed by the active protocol economic configuration.
                </p>
              </div>

            </div>

            {/* Server Visual Right — Redesigned Genesis Engine Reactor Card */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="w-full max-w-xl p-6 sm:p-8 rounded-3xl bg-[#05070B] border border-[#00CFFF]/25 shadow-[0_0_50px_rgba(0,207,255,0.12)] text-left relative overflow-hidden space-y-6">
                
                {/* Subtle Accent Glow Line Top */}
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#00CFFF] to-transparent" />

                {/* 1. CARD HEADER */}
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] shadow-[0_0_15px_rgba(0,207,255,0.2)]">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold font-mono tracking-wide text-white">PHX–GENESIS–ENGINE #01</h4>
                      <span className="text-[10px] font-mono text-[#00CFFF] uppercase tracking-wider font-semibold block">GENESIS V1 NODE</span>
                    </div>
                  </div>
                  
                  {/* Compact Status Pill with Soft Green Pulse */}
                  <div className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(50,213,131,0.2)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>EMISSION ACTIVE</span>
                  </div>
                </div>

                {/* 2. ENGINE CHAMBER & REACTOR CORE (Occupies ~60% of card area) */}
                <div className="p-6 rounded-2xl bg-[#07101D]/80 border border-white/[0.06] relative overflow-hidden backdrop-blur-xl flex flex-col items-center justify-center space-y-6 shadow-inner">
                  
                  {/* Background Circuit Grid & Conduit Ray Overlays */}
                  <div className="absolute inset-0 bg-grid-pattern opacity-25 pointer-events-none" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#00CFFF]/10 rounded-full blur-[80px] pointer-events-none animate-pulse-slow" />

                  {/* Main Reactor Graphic with Native Animated Rotation */}
                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center select-none my-2">
                    <svg className="w-full h-full" viewBox="0 0 280 280" fill="none">
                      <defs>
                        <linearGradient id="coreGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#00CFFF" stopOpacity="0.9" />
                          <stop offset="50%" stopColor="#00A3FF" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#32D583" stopOpacity="0.8" />
                        </linearGradient>
                        <radialGradient id="reactorGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#00CFFF" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#07101D" stopOpacity="0" />
                        </radialGradient>
                      </defs>

                      {/* Background Ambient Glow Disc */}
                      <circle cx="140" cy="140" r="130" fill="url(#reactorGlow)" />

                      {/* Outer Circuit Lines & Conduit Rays */}
                      <line x1="140" y1="10" x2="140" y2="40" stroke="#00CFFF" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 2" />
                      <line x1="140" y1="240" x2="140" y2="270" stroke="#00CFFF" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 2" />
                      <line x1="10" y1="140" x2="40" y2="140" stroke="#00CFFF" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 2" />
                      <line x1="240" y1="140" x2="270" y2="140" stroke="#00CFFF" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 2" />

                      {/* Outer Mechanical Segmented Ring (14s clockwise rotation) */}
                      <g>
                        <circle cx="140" cy="140" r="122" stroke="#00CFFF" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="8 6 2 6" />
                        <circle cx="140" cy="18" r="4.5" fill="#00CFFF" />
                        <circle cx="262" cy="140" r="4.5" fill="#32D583" />
                        <circle cx="140" cy="262" r="4.5" fill="#00A3FF" />
                        <circle cx="18" cy="140" r="4.5" fill="#7057FF" />
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="0 140 140"
                          to="360 140 140"
                          dur="14s"
                          repeatCount="indefinite"
                        />
                      </g>

                      {/* Middle Concentric Ring with Notch Marks (10s reverse rotation) */}
                      <g>
                        <circle cx="140" cy="140" r="95" stroke="#00A3FF" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="16 8" />
                        <circle cx="207" cy="73" r="4" fill="#32D583" />
                        <circle cx="73" cy="207" r="4" fill="#00CFFF" />
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="360 140 140"
                          to="0 140 140"
                          dur="10s"
                          repeatCount="indefinite"
                        />
                      </g>

                      {/* Inner Energy Track Ring & Central PHIVO Coin Graphic (Synchronously Rotating) */}
                      <g>
                        <circle cx="140" cy="140" r="68" stroke="#32D583" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="6 4" />
                        <circle cx="140" cy="72" r="3.5" fill="#00CFFF" />
                        <circle cx="140" cy="208" r="3.5" fill="#00A3FF" />

                        {/* Synchronously Rotating Central PHIVO Coin Emblem */}
                        <g className="drop-shadow-[0_0_22px_rgba(0,207,255,0.75)]">
                          {/* Outer Coin Border / Metallic Rim */}
                          <circle cx="140" cy="140" r="42" fill="#05070B" stroke="#00CFFF" strokeWidth="2" />
                          <circle cx="140" cy="140" r="38" fill="#07101D" stroke="url(#coreGlow)" strokeWidth="1.5" />
                          <circle cx="140" cy="140" r="33" fill="none" stroke="#00CFFF" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="4 2" />

                          {/* Coin Notch Accents */}
                          <line x1="140" y1="101" x2="140" y2="107" stroke="#00CFFF" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="140" y1="173" x2="140" y2="179" stroke="#00CFFF" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="101" y1="140" x2="107" y2="140" stroke="#00CFFF" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="173" y1="140" x2="179" y2="140" stroke="#00CFFF" strokeWidth="2.5" strokeLinecap="round" />

                          {/* Stylized PHIVO 'P' Symbol */}
                          <path
                            d="M131 123 C131 123, 142 122, 147 123 C154 124, 157 128, 157 133 C157 139, 152 143, 145 143 L137 143"
                            stroke="#00CFFF"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            className="drop-shadow-[0_0_8px_#00CFFF]"
                          />
                          <line x1="137" y1="123" x2="137" y2="157" stroke="#00CFFF" strokeWidth="3.5" strokeLinecap="round" />
                          
                          {/* Green Reward Signal Dot on Coin */}
                          <circle cx="148" cy="133" r="2.5" fill="#32D583" className="drop-shadow-[0_0_6px_#32D583]" />
                        </g>

                        {/* Synchronous Rotation Animation */}
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="0 140 140"
                          to="360 140 140"
                          dur="10s"
                          repeatCount="indefinite"
                        />
                      </g>
                    </svg>
                  </div>

                  {/* 4. ENGINE TELEMETRY (3 Compact Integrated Blocks) */}
                  <div className="w-full grid grid-cols-3 gap-2.5 pt-2 border-t border-white/[0.08] relative z-10 text-center font-mono">
                    <div className="p-2.5 rounded-xl bg-[#05070B]/90 border border-white/[0.06] space-y-0.5">
                      <span className="text-[9px] text-[#98A2B3] uppercase tracking-wider block">Daily Emission</span>
                      <span className="text-xs font-bold text-white block">Protocol Governed</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#05070B]/90 border border-white/[0.06] space-y-0.5">
                      <span className="text-[9px] text-[#98A2B3] uppercase tracking-wider block">Lifetime Allocation</span>
                      <span className="text-xs font-bold text-[#00CFFF] block">10,000 PHIVO</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#05070B]/90 border border-white/[0.06] space-y-0.5">
                      <span className="text-[9px] text-[#98A2B3] uppercase tracking-wider block">Eligible Term</span>
                      <span className="text-xs font-bold text-emerald-400 block">200 Days</span>
                    </div>
                  </div>

                </div>

                {/* 5. LIFECYCLE PROGRESS */}
                <div className="p-4 rounded-2xl bg-[#07101D]/50 border border-white/[0.06] space-y-2.5 text-left">
                  <div className="flex items-center justify-between text-xs font-mono font-bold">
                    <span className="text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#00CFFF]" />
                      <span>200-DAY LIFECYCLE</span>
                    </span>
                    <span className="text-[10px] text-[#98A2B3] font-normal">Genesis V1 Economic Model</span>
                  </div>

                  {/* Thin Premium Progress Track */}
                  <div className="w-full h-1.5 bg-[#05070B] rounded-full border border-white/[0.08] overflow-hidden p-0.5 relative">
                    <div className="h-full bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 rounded-full w-full shadow-[0_0_10px_#00CFFF]" />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                    <span>Daily PHIVO emission is governed by the active protocol economic configuration.</span>
                    <span className="text-slate-200 font-semibold">➔ 10,000 PHIVO Cap</span>
                  </div>
                </div>

                {/* 6. REFERENCE VALUE FOOTER */}
                <div className="p-3.5 rounded-2xl bg-[#05070B] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-[#98A2B3] uppercase block">Configured Reference Rate</span>
                    <span className="font-bold text-[#00CFFF]">$0.10 / PHIVO</span>
                  </div>

                  <div className="text-left sm:text-right space-y-0.5">
                    <span className="text-[10px] text-[#98A2B3] uppercase block">Reference Allocation Value</span>
                    <span className="font-bold text-white text-sm block">$1,000 USD</span>
                    <span className="text-[9px] text-slate-400 block font-normal">Based on configured $0.10 PHIVO reference rate</span>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ======================================================================
          6. PHIVO UTILITY TOKEN SECTION
         ====================================================================== */}
      <section id="phivo" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-emerald-400 tracking-widest block">
              ECOSYSTEM UTILITY ASSET
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              PHIVO — The Utility Layer of PHIVONEX
            </h2>
            <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
              PHIVO powers reward emissions, platform conversion mechanics, and ecosystem utility operations.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Specs Panel */}
            <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-[#07101D] border border-white/[0.08] shadow-2xl space-y-6 text-left">
              <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                <PhivoCoinIcon size={36} />
                <div>
                  <h3 className="text-lg font-bold text-white">PHIVO Token Specifications</h3>
                  <span className="text-xs font-mono text-emerald-400">BEP-20 Standard</span>
                </div>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-[#98A2B3]">Token Symbol</span>
                  <span className="font-bold text-white">PHIVO</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-[#98A2B3]">Network</span>
                  <span className="font-bold text-white">BNB Smart Chain (BSC)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-[#98A2B3]">Token Standard</span>
                  <span className="font-bold text-white">BEP-20</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-[#98A2B3]">Decimals</span>
                  <span className="font-bold text-white">18</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/[0.04]">
                  <span className="text-[#98A2B3]">Maximum Supply</span>
                  <span className="font-bold text-emerald-400">100,000,000 PHIVO</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[#98A2B3]">Configured Reference Rate</span>
                  <span className="font-bold text-[#00CFFF]">$0.10 USD (Configured Reference Rate)</span>
                </div>
              </div>

              {/* Copy Contract Box */}
              <div className="p-3.5 rounded-2xl bg-[#05070B] border border-white/[0.08] space-y-2">
                <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">
                  BSC Contract Address
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-300 truncate">
                    {PHIVONEX_TOKEN_CONFIG.contractAddress}
                  </span>
                  <button
                    onClick={copyContractAddress}
                    className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-emerald-400 transition-colors cursor-pointer shrink-0"
                    title="Copy Contract Address"
                  >
                    {contractCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Use Cases Grid */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-emerald-500/30 transition-all duration-300 space-y-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
                  <Coins className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white">Genesis Reward Accounting</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Direct daily emission allocations credited to node operators per epoch.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#00CFFF]/30 transition-all duration-300 space-y-2">
                <div className="p-2 rounded-xl bg-[#00CFFF]/10 text-[#00CFFF] w-fit">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white">Internal Ecosystem Conversion</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Seamless internal conversion between PHIVO and USDT based on server-authoritative rates.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-purple-500/30 transition-all duration-300 space-y-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 w-fit">
                  <Wallet className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white">Wallet Integration</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Fully integrated into the PHIVONEX double-entry ledger wallet environment.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-amber-500/30 transition-all duration-300 space-y-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 w-fit">
                  <Sliders className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white">Platform Utility</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Powers future ecosystem services, governance benchmarks, and service access.
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ======================================================================
          7. HOW PHIVONEX WORKS (4 Steps)
         ====================================================================== */}
      <section className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              USER LIFECYCLE
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              How PHIVONEX Works
            </h2>
            <p className="text-sm text-[#98A2B3]">
              Simple, transparent 4-step participation flow powered by server-authoritative engines.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left relative">
            
            {/* Step 1 */}
            <div className="p-6 rounded-3xl bg-[#05070B] border border-white/[0.08] space-y-3 relative hover:border-[#00CFFF]/40 transition-all duration-300">
              <span className="text-xs font-mono font-bold text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-1 rounded-md">STEP 01</span>
              <h3 className="text-base font-bold text-white pt-2">1. JOIN</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Create your PHIVONEX account and complete security profile verification.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-3xl bg-[#05070B] border border-white/[0.08] space-y-3 relative hover:border-emerald-500/40 transition-all duration-300">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">STEP 02</span>
              <h3 className="text-base font-bold text-white pt-2">2. PARTICIPATE</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Access Genesis Node allocation and internal ecosystem services.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-3xl bg-[#05070B] border border-white/[0.08] space-y-3 relative hover:border-purple-500/40 transition-all duration-300">
              <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md">STEP 03</span>
              <h3 className="text-base font-bold text-white pt-2">3. EARN / RECEIVE</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Eligible ecosystem activities are processed by server-authoritative engines.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-6 rounded-3xl bg-[#05070B] border border-white/[0.08] space-y-3 relative hover:border-amber-500/40 transition-all duration-300">
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md">STEP 04</span>
              <h3 className="text-base font-bold text-white pt-2">4. USE</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Manage PHIVO, wallet operations, internal conversion and supported withdrawals.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ======================================================================
          8. NETWORK INCENTIVE ARCHITECTURE
         ====================================================================== */}
      <section id="network-incentives" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-purple-400 tracking-widest block">
              GROWTH INCENTIVES
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              A Multi-Layer Network Growth Architecture
            </h2>
            <p className="text-sm text-[#98A2B3]">
              Structured incentives calculated by server-authoritative rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            
            {/* Direct Referral */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] space-y-3 hover:border-[#00CFFF]/40 transition-all duration-300">
              <div className="p-2.5 rounded-xl bg-[#00CFFF]/10 text-[#00CFFF] w-fit">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">1. Direct Referral</h3>
              <div className="text-xl font-bold font-mono text-[#00CFFF]">$50 USD</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Configured reward per eligible direct Genesis Node activation credited to unified USDT balance.
              </p>
            </div>

            {/* Binary Matching */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] space-y-3 hover:border-emerald-500/40 transition-all duration-300">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
                <Workflow className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">2. Daily Binary Matching</h3>
              <div className="text-xl font-bold font-mono text-emerald-400">Server Matched</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Server-calculated Left/Right subtree volume matching with daily settlement and carry-forward.
              </p>
            </div>

            {/* Promotion Milestones */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] space-y-3 hover:border-purple-500/40 transition-all duration-300">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 w-fit">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">3. Promotion Milestones</h3>
              <div className="text-xl font-bold font-mono text-purple-400">Rank Milestones</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Structured qualification milestones with recorded historical achievement snapshots.
              </p>
            </div>

            {/* Leadership Recognition */}
            <div className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] space-y-3 hover:border-amber-500/40 transition-all duration-300">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">4. Leadership Ranks</h3>
              <div className="text-xl font-bold font-mono text-amber-400">Sequential Ranks</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sequential rank progression featuring USDT or configurable non-cash recognition rewards.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ======================================================================
          9. LEADERSHIP RANKS & RECOGNITION
         ====================================================================== */}
      <section className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-amber-400 tracking-widest block">
              RANK PROGRESSION
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Leadership &amp; Recognition
            </h2>
            <p className="text-sm text-[#98A2B3]">
              Sequential rank journey with verified qualification and milestone recording.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
            {[
              { rank: 'Standard Member', level: 'Level 0' },
              { rank: 'Node Builder', level: 'Level 1' },
              { rank: 'Node Master', level: 'Level 2' },
              { rank: 'Node Captain', level: 'Level 3' },
              { rank: 'Node Commander', level: 'Level 4' },
              { rank: 'Node Ambassador', level: 'Level 5' },
              { rank: 'Node Titan', level: 'Level 6' },
            ].map((r, i) => (
              <div key={r.rank} className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.08] hover:border-[#00CFFF]/30 transition-all duration-300 space-y-1">
                <span className="text-[10px] font-mono text-[#00CFFF] block">{r.level}</span>
                <span className="text-xs font-bold text-white block">{r.rank}</span>
              </div>
            ))}
          </div>

          {/* Non-Cash Notice */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left flex items-center gap-3">
            <Info className="w-5 h-5 shrink-0 text-amber-400" />
            <p className="leading-normal">
              <strong className="text-white">Indicative Display Value Notice:</strong> Non-cash leadership rewards (such as Travel Packages or Executive Vehicles) represent non-monetary recognition rewards with an Indicative Display Value. No cash wallet credit is created for non-cash rewards.
            </p>
          </div>

        </div>
      </section>

      {/* ======================================================================
          10. UNIFIED WALLET & LEDGER SECTION
         ====================================================================== */}
      <section id="wallet" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              FINANCIAL ARCHITECTURE
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              One Unified Financial Experience
            </h2>
            <p className="text-sm text-[#98A2B3]">
              Eligible settled USDT credits converge into one authoritative spendable balance while each source remains individually traceable.
            </p>
          </div>

          {/* Conceptual Flow Diagram */}
          <div className="p-8 rounded-3xl bg-[#07101D] border border-white/[0.08] shadow-2xl text-left space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              
              {/* Inflow Sources */}
              <div className="space-y-2 text-xs">
                <span className="text-[10px] font-mono uppercase text-[#98A2B3] block font-bold">Inflow Credit Sources</span>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">Verified USDT Deposit</div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">Account Credit</div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">Referral Commission</div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">Matching Bonus</div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">PHIVO Swap Conversion</div>
              </div>

              {/* Central Converged Pool */}
              <div className="p-6 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/40 text-center space-y-2 shadow-[0_0_20px_rgba(0,207,255,0.15)]">
                <span className="text-[10px] font-mono uppercase text-[#00CFFF] font-bold block">Converged Ledger Engine</span>
                <div className="text-2xl font-bold font-mono text-emerald-300">
                  Unified Available USDT
                </div>
                <p className="text-[11px] text-[#98A2B3]">
                  Single spendable balance backing all user actions.
                </p>
              </div>

              {/* Outflow Actions */}
              <div className="space-y-2 text-xs">
                <span className="text-[10px] font-mono uppercase text-[#98A2B3] block font-bold">Ecosystem Destinations</span>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-emerald-500/30 text-emerald-300 font-bold">Genesis Node Activation</div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">Internal Ecosystem Swap</div>
                <div className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-slate-200">Audited Withdrawal Disbursement</div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          11. PHIVO ↔ USDT CONVERSION SECTION
         ====================================================================== */}
      <section className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-mono uppercase font-bold text-emerald-400 tracking-widest block">
                INTERNAL CONVERSION ENGINE
              </span>
              <h2 className="text-3xl font-extrabold text-white">
                Integrated Asset Conversion
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Convert accumulated PHIVO emissions into USDT or USDT into PHIVO directly within your unified wallet environment.
              </p>
              <ul className="space-y-2 text-xs font-mono text-[#98A2B3]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Server-Authoritative Conversion Rate</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Immutable Historical Rate Snapshots</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Concurrency &amp; Balance Validation Protection</span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-[#05070B] border border-white/[0.1] shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <span className="text-xs font-bold text-white font-mono">PHIVO ↔ USDT CONVERSION</span>
                <span className="text-[10px] font-mono font-bold text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-1 rounded">
                  INTERNAL ECOSYSTEM MODULE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-center font-mono">
                <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">PHIVO Reference Rate</span>
                  <span className="text-lg font-bold text-emerald-400">$0.10 USD</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Conversion Fee</span>
                  <span className="text-lg font-bold text-[#00CFFF]">0.00%</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          12. BNB SMART CHAIN SECTION
         ====================================================================== */}
      <section className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-[#07101D] via-[#0D1C33] to-[#07101D] border border-amber-500/30 text-left grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-2xl">
            <div className="lg:col-span-8 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-300">
                <BnbIcon size={16} />
                <span>BNB SMART CHAIN INTEGRATION</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Built on BNB Smart Chain
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Full BEP-20 compatibility with automated on-chain confirmation verification, deposit tracking, and token contract validation.
              </p>
            </div>

            <div className="lg:col-span-4 flex justify-end">
              <div className="p-6 rounded-2xl bg-[#05070B] border border-amber-500/20 text-center space-y-2 w-full">
                <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Blockchain Asset</span>
                <span className="text-lg font-bold font-mono text-amber-300 block">BEP-20 Standard</span>
                <span className="text-[11px] text-slate-400 block">Fast, low-cost block settlements</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          13. SECURITY ARCHITECTURE SECTION
         ====================================================================== */}
      <section id="security" className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10 overflow-hidden">
        
        {/* Animated Radar Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] border border-[#00CFFF]/10 rounded-full pointer-events-none animate-radar-sweep" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 relative z-10">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              ENTERPRISE PROTECTION
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Security by Architecture
            </h2>
            <p className="text-sm text-[#98A2B3]">
              8 core layers of cryptographic and server-authoritative security protection.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {[
              {
                title: 'Server-Authoritative Operations',
                desc: 'All critical financial calculations and emissions are validated exclusively server-side.',
                icon: Server,
              },
              {
                title: 'Immutable Ledger Model',
                desc: 'Credits, debits, and reversals are retained as auditable double-entry event entries.',
                icon: FileText,
              },
              {
                title: 'Transactional Settlement',
                desc: 'Node purchases revalidate balances inside protected database transactions.',
                icon: ShieldCheck,
              },
              {
                title: 'Role-Based Administration',
                desc: 'Strict separation of administrative duties and user permissions.',
                icon: Lock,
              },
              {
                title: 'Session Security',
                desc: 'Cryptographic session validation and account protection infrastructure.',
                icon: Shield,
              },
              {
                title: 'Financial Reconciliation',
                desc: 'Automated integrity checks detect and resolve financial discrepancies.',
                icon: Scale,
              },
              {
                title: 'Chain Validation',
                desc: 'Deposit chain verification and confirmation threshold validation.',
                icon: CheckSquare,
              },
              {
                title: 'Audit Trail',
                desc: 'Administrative actions record reason codes and immutable historical logs.',
                icon: Activity,
              },
            ].map((s) => (
              <div key={s.title} className="p-6 rounded-3xl bg-[#05070B] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-300 space-y-3">
                <div className="p-2.5 rounded-xl bg-[#00CFFF]/10 text-[#00CFFF] w-fit">
                  <s.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">{s.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ======================================================================
          14. TRANSPARENCY SECTION — SYNTHETIC PROTOCOL FLOW
         ====================================================================== */}
      <section id="technology" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              TRANSPARENCY WITHOUT EXPOSING PRIVATE OPERATIONS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Protocol Lifecycle Visualization
            </h2>
            <p className="text-sm text-[#98A2B3]">
              PHIVONEX makes ecosystem rules, architecture and financial mechanics understandable while keeping private operational data protected.
            </p>
          </div>

          {/* Interactive Protocol Flow Simulation Box */}
          <div className="p-8 rounded-3xl bg-[#07101D] border border-[#00CFFF]/30 shadow-2xl text-left space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#00CFFF]" />
                <span className="text-sm font-bold text-white">Illustrative Protocol Flow</span>
              </div>
              <span className="text-[10px] font-mono text-[#98A2B3] bg-white/[0.04] px-3 py-1 rounded border border-white/[0.08] w-fit">
                Illustrative protocol activity — no private account data displayed
              </span>
            </div>

            {/* 4 Protocol Flow Stages */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { stage: '1. Node Activation', status: 'State Validated', desc: 'Node participation terms recorded' },
                { stage: '2. Epoch Processing', status: 'Emission Calculated', desc: 'Protocol emission distributed to eligible nodes' },
                { stage: '3. Ledger Verification', status: 'Double-Entry Posted', desc: 'Auditable balance entries updated' },
                { stage: '4. Ecosystem Sync', status: 'Wallet Synchronized', desc: 'Unified available USDT updated' },
              ].map((stg, i) => (
                <div
                  key={stg.stage}
                  className={`p-4 rounded-2xl border transition-all duration-300 ${
                    simulatedProtocolStep === i
                      ? 'bg-[#00CFFF]/10 border-[#00CFFF] ring-1 ring-[#00CFFF]/50 shadow-[0_0_15px_rgba(0,207,255,0.2)]'
                      : 'bg-[#05070B] border-white/[0.08]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white font-mono">{stg.stage}</span>
                    {simulatedProtocolStep === i && (
                      <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-ping" />
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 block font-bold">{stg.status}</span>
                  <p className="text-[11px] text-[#98A2B3] mt-1">{stg.desc}</p>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button 
                onClick={() => onNavigate('/login')}
                className="px-5 py-2 text-xs font-bold text-[#00CFFF] bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Login to View Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          15. ADMIN GOVERNANCE — PUBLIC SAFE VERSION
         ====================================================================== */}
      <section className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              PROTOCOL GOVERNANCE
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Versioned Economic Governance
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Authorized administrators manage economic configuration through validated, versioned and audited controls. Changes preserve administrative history and support consistent platform-wide synchronization.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-[#05070B] border border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-6 text-left">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF]">
                <Sliders className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Audited Governance Cycle</h3>
                <p className="text-xs text-[#98A2B3]">
                  Policy Definition ➔ Schema Validation ➔ Versioning ➔ Audit Log ➔ Platform Synchronization
                </p>
              </div>
            </div>

            <span className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-[#00CFFF] font-bold shrink-0">
              Audited Control Architecture
            </span>
          </div>

        </div>
      </section>

      {/* ======================================================================
          16. REAL-TIME EXPERIENCE
         ====================================================================== */}
      <section className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-center">
          <span className="text-xs font-mono uppercase font-bold text-emerald-400 tracking-widest block">
            REAL-TIME INFRASTRUCTURE
          </span>
          <h2 className="text-3xl font-extrabold text-white">
            Connected Across the Ecosystem
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Real-time in-app notification and synchronization infrastructure ensures instant updates for node emissions, wallet deposits, matching settlements, and account security events.
          </p>
        </div>
      </section>

      {/* ======================================================================
          17. WHY PHIVONEX / 12 CORE USPs GRID
         ====================================================================== */}
      <section className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              CORE ADVANTAGES
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              12 Reasons to Choose PHIVONEX
            </h2>
            <p className="text-sm text-[#98A2B3]">
              Purpose-built Web3 infrastructure engineered for performance and security.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-left">
            {[
              { num: '01', title: 'Dynamic Protocol Emission', desc: 'Daily PHIVO emission is governed by the active protocol economic configuration.' },
              { num: '02', title: 'Lifetime-Capped Node Allocation', desc: '10,000 PHIVO maximum lifetime emission cap per Genesis V1 Node.' },
              { num: '03', title: 'Server-Validated Reward Engines', desc: 'Epoch reward engines execute server-side with cryptographic ledger checks.' },
              { num: '04', title: 'Unified Spendable USDT Ledger', desc: 'All settled USDT credits converge into one spendable wallet balance.' },
              { num: '05', title: 'Multi-Layer Network Incentives', desc: 'Direct referral, binary matching, and rank promotion rewards in one system.' },
              { num: '06', title: 'Monetary & Non-Cash Rewards', desc: 'Flexible leadership recognition supporting USDT or non-cash achievements.' },
              { num: '07', title: 'Versioned Economic Governance', desc: 'Administrative parameter updates maintain version control and audit history.' },
              { num: '08', title: 'Built-In Financial Reconciliation', desc: 'Automated background checks verify ledger state integrity.' },
              { num: '09', title: 'Auditable Withdrawal Lifecycle', desc: 'Multi-stage withdrawal validation with status and processing logs.' },
              { num: '10', title: 'BSC Deposit Verification', desc: 'Confirmation-aware crediting for BNB Smart Chain deposits.' },
              { num: '11', title: 'Historical Reward Integrity', desc: 'All past node earnings remain fully traceable and immutable.' },
              { num: '12', title: 'One Unified Operator Experience', desc: 'Seamless dashboard managing nodes, tokens, network, and wallet.' },
            ].map((usp) => (
              <div key={usp.num} className="p-5 rounded-2xl bg-[#05070B] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-300 space-y-2">
                <span className="text-xs font-mono font-bold text-[#00CFFF]">{usp.num}</span>
                <h3 className="text-sm font-bold text-white">{usp.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{usp.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ======================================================================
          18. ROADMAP
         ====================================================================== */}
      <section id="roadmap" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              SYSTEM EVOLUTION
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Ecosystem Roadmap
            </h2>
            <p className="text-sm text-[#98A2B3]">
              High-level strategic development milestones.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {[
              { phase: 'PHASE 01', title: 'Genesis Infrastructure', desc: 'Launch of Genesis Node architecture, server-authoritative ledger, and BEP-20 token contract.' },
              { phase: 'PHASE 02', title: 'Ecosystem Expansion', desc: 'Integration of unified USDT wallet, PHIVO conversion module, and multi-layer network incentives.' },
              { phase: 'PHASE 03', title: 'Utility Integration', desc: 'Enhanced platform utilities, non-cash recognition systems, and real-time in-app synchronization.' },
              { phase: 'PHASE 04', title: 'Global Network Growth', desc: 'Expanded operator tools, international leadership events, and institutional integrations.' },
            ].map((p) => (
              <div key={p.phase} className="p-6 rounded-3xl bg-[#07101D] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-300 space-y-3">
                <span className="text-xs font-mono font-bold text-[#00CFFF]">{p.phase}</span>
                <h3 className="text-base font-bold text-white">{p.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ======================================================================
          19. FAQ ACCORDION SECTION
         ====================================================================== */}
      <section id="faq" className="py-20 bg-[#07101D]/50 border-y border-white/[0.08] relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-left">
          
          <div className="text-center space-y-3">
            <span className="text-xs font-mono uppercase font-bold text-[#00CFFF] tracking-widest block">
              FREQUENTLY ASKED QUESTIONS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Got Questions? We Have Answers
            </h2>
            <p className="text-sm text-[#98A2B3]">
              Everything you need to know about the PHIVONEX ecosystem.
            </p>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-[#05070B] border border-white/[0.08] overflow-hidden transition-all duration-300 hover:border-[#00CFFF]/30"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-5 text-left font-bold text-sm text-white flex items-center justify-between gap-4 cursor-pointer hover:text-[#00CFFF] transition-colors"
                >
                  <span>{item.q}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="w-5 h-5 text-[#00CFFF] shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                </button>

                {openFaq === idx && (
                  <div className="px-5 pb-5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-white/[0.04]">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ======================================================================
          20. RISK & DISCLOSURE STRIP
         ====================================================================== */}
      <section className="py-8 bg-[#05070B] border-b border-white/[0.08] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-[#98A2B3] space-y-2">
          <p className="max-w-4xl mx-auto leading-relaxed">
            <strong className="text-white">Risk Disclosure:</strong> Digital assets, blockchain infrastructure and node participation involve technical, market and regulatory risk. Reference values are informational and are not guarantees of market value or financial return. PHIVONEX does not guarantee economic returns or token appreciation.
          </p>
        </div>
      </section>

      {/* ======================================================================
          21. FINAL CTA SECTION
         ====================================================================== */}
      <section className="py-20 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-10 sm:p-14 rounded-3xl bg-gradient-to-r from-[#00CFFF]/15 via-[#07101D] to-emerald-500/15 border border-[#00CFFF]/40 text-center space-y-6 shadow-2xl relative overflow-hidden">
            
            {/* Top Border Glow */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00CFFF] to-transparent" />

            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Explore the PHIVONEX Ecosystem
            </h2>
            <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
              Create your account to access Genesis Nodes, PHIVO utility and the integrated PHIVONEX platform.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-2">
              <button
                onClick={() => onNavigate('/register')}
                className="w-full sm:w-auto px-8 py-4 text-xs font-bold uppercase tracking-wider text-slate-950 bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 rounded-xl transition-all shadow-lg shadow-[#00CFFF]/25 cursor-pointer flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-slate-950" />
                <span>Create Account</span>
              </button>
              <button
                onClick={() => onNavigate('/login')}
                className="w-full sm:w-auto px-8 py-4 text-xs font-bold uppercase tracking-wider text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] hover:border-[#00CFFF]/40 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4 text-[#00CFFF]" />
                <span>Login</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          22. FOOTER
         ====================================================================== */}
      <footer className="py-12 bg-[#02050B] border-t border-white/[0.08] text-left text-xs text-[#98A2B3] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            
            {/* Brand Column */}
            <div className="md:col-span-2 space-y-4">
              <PhivonexLogo size="md" theme="dark" animated={true} />
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Enterprise Web3 node ecosystem unifying Genesis Node participation, PHIVO token utility, and auditable financial ledger operations.
              </p>
            </div>

            {/* Column 1: Ecosystem */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Ecosystem</h4>
              <ul className="space-y-2">
                <li><button onClick={() => scrollToSection('genesis-nodes')} className="hover:text-[#00CFFF] transition-colors">Genesis Nodes</button></li>
                <li><button onClick={() => scrollToSection('phivo')} className="hover:text-[#00CFFF] transition-colors">PHIVO Token</button></li>
                <li><button onClick={() => scrollToSection('network-incentives')} className="hover:text-[#00CFFF] transition-colors">Network Incentives</button></li>
                <li><button onClick={() => scrollToSection('technology')} className="hover:text-[#00CFFF] transition-colors">Technology</button></li>
              </ul>
            </div>

            {/* Column 2: Resources */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Resources</h4>
              <ul className="space-y-2">
                <li><button onClick={() => scrollToSection('security')} className="hover:text-[#00CFFF] transition-colors">Security</button></li>
                <li><button onClick={() => scrollToSection('faq')} className="hover:text-[#00CFFF] transition-colors">FAQ</button></li>
                <li><button onClick={() => scrollToSection('roadmap')} className="hover:text-[#00CFFF] transition-colors">Roadmap</button></li>
              </ul>
            </div>

            {/* Column 3: Legal */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Legal &amp; Policy</h4>
              <ul className="space-y-2">
                <li><span className="hover:text-[#00CFFF] cursor-pointer transition-colors">Terms of Service</span></li>
                <li><span className="hover:text-[#00CFFF] cursor-pointer transition-colors">Privacy Policy</span></li>
                <li><span className="hover:text-[#00CFFF] cursor-pointer transition-colors">Risk Disclosure</span></li>
                <li><span className="hover:text-[#00CFFF] cursor-pointer transition-colors">AML &amp; Compliance</span></li>
              </ul>
            </div>

          </div>

          <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#98A2B3]">
            <div>
              © 2026 PHIVONEX Network. All rights reserved.
            </div>
            <div className="font-mono">
              BEP-20 Smart Contract Protocol Layer
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
};
