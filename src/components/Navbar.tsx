import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowUpRight, Activity, LogOut } from 'lucide-react';
import { PhivonexLogo } from './brand/PhivonexLogo';
import { useAuth } from '../context/AuthContext';
import { PWAInstallHeaderButton } from './PWAInstallPrompt';

interface NavbarProps {
  onExploreClick: () => void;
  onLaunchAppClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onExploreClick, onLaunchAppClick }) => {
  const { user, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', href: '#' },
    { label: 'Ecosystem', href: '#ecosystem' },
    { label: 'Nodes', href: '#nodes' },
    { label: 'Coin', href: '#coin' },
    { label: 'Live Network', href: '#live-network' },
    { label: 'Roadmap', href: '#roadmap' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#05070B]/90 backdrop-blur-md border-b border-white/[0.08] shadow-2xl py-3'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <a
          href="#"
          className="flex items-center group focus:outline-none focus-visible:ring-1 focus-visible:ring-[#00CFFF] rounded-lg"
          aria-label="PHIVONEX Home"
        >
          <PhivonexLogo size="md" className="transition-transform duration-200 group-hover:opacity-95" />
        </a>

        {/* Center Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#98A2B3]">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="hover:text-[#F7FAFC] transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-[#00CFFF] after:origin-bottom-right after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onExploreClick}
            className="px-3.5 py-2 text-xs font-medium text-[#98A2B3] hover:text-[#F7FAFC] hover:bg-white/[0.05] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span>Explore Network</span>
          </button>

          <PWAInstallHeaderButton />

          {user ? (
            <div className="flex items-center gap-2">
              {/* Authenticated Operator Badge */}
              <div className="flex items-center gap-2 bg-[#07101D] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-white">
                <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-bold text-[10px] flex items-center justify-center">
                  {(user.fullName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-[11px] leading-tight text-white truncate max-w-[120px]">
                    {user.fullName}
                  </span>
                  <span className="text-[10px] text-[#00CFFF] font-mono">
                    {user.emailVerified ? 'Verified Operator' : 'Session Active'}
                  </span>
                </div>
              </div>

              {/* Sign Out Button */}
              <button
                onClick={() => logout()}
                title="Sign Out"
                className="p-2 rounded-lg bg-white/[0.04] hover:bg-[#F04438]/20 border border-white/[0.1] hover:border-[#F04438]/40 text-[#98A2B3] hover:text-[#F04438] transition-colors cursor-pointer"
                aria-label="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onLaunchAppClick}
                className="px-4 py-2 text-xs font-bold text-[#05070B] bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:brightness-110 active:scale-[0.99] rounded-lg shadow-md shadow-[#00CFFF]/20 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer uppercase tracking-wider"
              >
                <span>Register</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {user ? (
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 text-[11px] font-semibold text-white bg-white/[0.08] rounded-md cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" /> Sign Out
            </button>
          ) : (
            <button
              onClick={onLaunchAppClick}
              className="px-3 py-1.5 text-xs font-bold text-[#05070B] bg-[#00CFFF] rounded-md cursor-pointer uppercase tracking-wider"
            >
              Register
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#98A2B3] hover:text-white rounded-lg hover:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-[#00CFFF] cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#07101D]/95 backdrop-blur-xl border-b border-white/[0.08] px-4 pt-3 pb-6 mt-2 space-y-3 transition-all duration-200">
          {user && (
            <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">
                  {user.fullName}
                </div>
                <div className="text-[11px] text-[#98A2B3]">{user.email}</div>
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium text-[#98A2B3] hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onExploreClick();
              }}
              className="w-full py-2.5 px-4 text-xs font-medium text-left text-[#98A2B3] bg-white/[0.03] rounded-lg flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00CFFF]" />
                Explore Network
              </span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
            {!user ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLaunchAppClick();
                }}
                className="w-full py-2.5 px-4 text-xs font-bold text-center text-[#05070B] bg-gradient-to-r from-[#00CFFF] to-[#168BFF] rounded-lg cursor-pointer uppercase tracking-wider"
              >
                Register
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full py-2.5 px-4 text-xs font-semibold text-center text-[#F04438] bg-[#F04438]/10 border border-[#F04438]/20 rounded-lg cursor-pointer"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
