import React, { useState, useRef } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  Share2, 
  QrCode, 
  ExternalLink, 
  Sparkles, 
  ShieldCheck, 
  MessageSquare,
  Send,
  Mail,
  CheckCircle2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PhivonexSymbol } from '../brand/PhivonexSymbol';
import { PhivonexLogo } from '../brand/PhivonexLogo';

interface ReferralShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  referralCode: string;
  referralUrl: string;
  userName?: string;
}

export const ReferralShareModal: React.FC<ReferralShareModalProps> = ({
  isOpen,
  onClose,
  referralCode,
  referralUrl,
  userName,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPitch, setCopiedPitch] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'social'>('qr');

  const qrContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const cleanCode = referralCode || 'PHX-MEMBER';
  const cleanUrl = referralUrl || (typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${cleanCode}` : `https://phivonex.online/register?ref=${cleanCode}`);

  const shareTitle = 'Join PHIVONEX Decentralized Network';
  const shareMessage = `🚀 Join me on PHIVONEX — The High-Performance Decentralized Validator Network!\n\nActivate your node, earn daily validator yields, and build your decentralized team.\n\n🔗 Invitation Link: ${cleanUrl}\n🎟️ Referral Code: ${cleanCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(cleanUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPitch = () => {
    navigator.clipboard.writeText(shareMessage);
    setCopiedPitch(true);
    setTimeout(() => setCopiedPitch(false), 2000);
  };

  // Social Share Handlers
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`🚀 Join PHIVONEX Decentralized Network with my referral link!\n\n${cleanUrl}\n\nReferral Code: ${cleanCode}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent(`🚀 Join PHIVONEX Decentralized Network with my invitation link!\nReferral Code: ${cleanCode}`);
    const url = encodeURIComponent(cleanUrl);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`Deploy high-performance validator nodes and earn daily yields with @Phivonex Network.\n\nJoin with my referral link: ${cleanUrl}\n\n#Phivonex #Crypto #Web3 #DeFi #Validator`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareFacebook = () => {
    const url = encodeURIComponent(cleanUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareLinkedIn = () => {
    const url = encodeURIComponent(cleanUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareReddit = () => {
    const url = encodeURIComponent(cleanUrl);
    const title = encodeURIComponent(`PHIVONEX Decentralized Network - Institutional Validator Protocol`);
    window.open(`https://www.reddit.com/submit?url=${url}&title=${title}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Invitation to join PHIVONEX Decentralized Network`);
    const body = encodeURIComponent(`Hi,\n\nI invite you to join the PHIVONEX Decentralized Validator Network.\n\nYou can register directly using my personal referral link:\n${cleanUrl}\n\nReferral Code: ${cleanCode}\n\nWelcome to the future of decentralized computing!`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `Join PHIVONEX Network using referral code: ${cleanCode}`,
          url: cleanUrl,
        });
      } catch (err) {
        // User cancelled or unsupported
      }
    } else {
      handleCopyLink();
    }
  };

  // High-Resolution Branded QR Card Download Generator
  const handleDownloadQrCard = () => {
    setDownloading(true);
    try {
      const svgElement = qrContainerRef.current?.querySelector('svg');
      if (!svgElement) {
        setDownloading(false);
        return;
      }

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const DOMURL = window.URL || window.webkitURL || window;
      const url = DOMURL.createObjectURL(svgBlob);

      const qrImg = new Image();
      qrImg.onload = () => {
        const canvas = document.createElement('canvas');
        const width = 800;
        const height = 960;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Dark Gradient Background
        const bgGrad = ctx.createLinearGradient(0, 0, width, height);
        bgGrad.addColorStop(0, '#060B14');
        bgGrad.addColorStop(0.5, '#0A1224');
        bgGrad.addColorStop(1, '#03060B');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // 2. Cyan Neon Top Glow Accent
        const glowGrad = ctx.createRadialGradient(width / 2, 0, 10, width / 2, 0, 450);
        glowGrad.addColorStop(0, 'rgba(0, 207, 255, 0.35)');
        glowGrad.addColorStop(0.7, 'rgba(0, 136, 255, 0.08)');
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, width, 500);

        // 3. Subtle outer border
        ctx.strokeStyle = 'rgba(0, 207, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.strokeRect(20, 20, width - 40, height - 40);

        // 4. Header Titles
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00CFFF';
        ctx.font = 'bold 36px "Segoe UI", Roboto, sans-serif';
        ctx.fillText('PHIVONEX PROTOCOL', width / 2, 95);

        ctx.fillStyle = '#98A2B3';
        ctx.font = '500 17px "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Decentralized Validator & Economic Network', width / 2, 130);

        // 5. QR Code Background Card
        const cardX = width / 2 - 200;
        const cardY = 175;
        const cardW = 400;
        const cardH = 400;

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 24);
        ctx.fill();

        // 6. Draw QR code
        ctx.drawImage(qrImg, cardX + 30, cardY + 30, 340, 340);

        // 7. Referral Code Pill Box
        const pillY = 620;
        ctx.fillStyle = 'rgba(0, 207, 255, 0.08)';
        ctx.beginPath();
        ctx.roundRect(width / 2 - 240, pillY, 480, 80, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 207, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#00CFFF';
        ctx.font = '600 15px "Segoe UI", Roboto, sans-serif';
        ctx.fillText('OFFICIAL REFERRAL CODE', width / 2, pillY + 32);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px monospace';
        ctx.fillText(cleanCode, width / 2, pillY + 65);

        // 8. Instruction Footer
        ctx.fillStyle = '#E4E7EC';
        ctx.font = '600 18px "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Scan QR Code with Camera to Join & Activate Node', width / 2, 755);

        ctx.fillStyle = '#667085';
        ctx.font = '14px monospace';
        ctx.fillText('phivonex.online', width / 2, 800);

        // 9. Cryptographic Badge Tag
        ctx.fillStyle = '#32D583';
        ctx.font = 'bold 13px "Segoe UI", Roboto, sans-serif';
        ctx.fillText('VERIFIED GENESIS INVITATION', width / 2, 850);

        // Trigger file download
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `phivonex-referral-${cleanCode}.png`;
        downloadLink.href = pngUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        DOMURL.revokeObjectURL(url);
        setDownloading(false);
      };
      qrImg.src = url;
    } catch (e) {
      console.error('Failed to export QR code', e);
      setDownloading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-[#060B14] border border-[#00CFFF]/25 rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(0,207,255,0.18)] overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="PHIVONEX Referral Share"
      >
        {/* Modal Header */}
        <div className="relative px-5 py-4 sm:px-6 sm:py-5 bg-[#091222]/90 border-b border-white/[0.08] flex items-center justify-between">
          {/* Neon ambient glow behind logo */}
          <div className="absolute top-0 left-12 w-32 h-10 bg-[#00CFFF]/20 blur-xl pointer-events-none" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center p-1 shadow-[0_0_15px_rgba(0,207,255,0.2)]">
              <PhivonexSymbol size={28} animated glow />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-extrabold text-base tracking-wide">
                  PHIVONEX
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF]">
                  INVITATION
                </span>
              </div>
              <p className="text-xs text-[#98A2B3]">
                Share referral link & QR code with your partners
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#98A2B3] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-white">

          {/* Top Quick Badges */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#32D583]" />
              <span className="text-[#98A2B3]">Referral Code:</span>
              <span className="font-mono font-bold text-[#00CFFF]">{cleanCode}</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#32D583]" />
                  <span className="text-[#32D583]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* QR Code Presentation Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-[#091529] to-[#040810] border border-[#00CFFF]/30 flex flex-col items-center text-center space-y-4 shadow-inner relative overflow-hidden">
            {/* Ambient Cyan Halo */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#00CFFF]/15 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#00CFFF] uppercase tracking-wider">
              <QrCode className="w-4 h-4" />
              <span>Official QR Code & Logo Emblem</span>
            </div>

            {/* Crisp QR Code Container with Logo Center */}
            <div 
              ref={qrContainerRef}
              className="p-4 bg-white rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.6)] border-2 border-white/[0.2] transition-transform hover:scale-[1.02]"
            >
              <QRCodeSVG
                value={cleanUrl}
                size={180}
                bgColor="#FFFFFF"
                fgColor="#050B14"
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: '/brand/phivonex-symbol.svg',
                  x: undefined,
                  y: undefined,
                  height: 38,
                  width: 38,
                  excavate: true,
                }}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#E4E7EC] font-medium">
                Scan with any mobile camera or QR reader to sign up
              </p>
              <p className="text-[11px] text-[#667085] font-mono">
                Auto-links to your left/right binary placement
              </p>
            </div>

            {/* QR Card Action Buttons */}
            <div className="flex items-center gap-2.5 w-full pt-1">
              <button
                onClick={handleDownloadQrCard}
                disabled={downloading}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>{downloading ? 'Preparing Image...' : 'Download QR Card'}</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(0,207,255,0.3)]"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Social Media Share Buttons Visualization */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                <Share2 className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>Instant Social Media Share</span>
              </div>
              <span className="text-[11px] text-[#98A2B3]">1-Click Broadcast</span>
            </div>

            {/* Grid of Styled Social Media Icons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              
              {/* WhatsApp */}
              <button
                onClick={handleShareWhatsApp}
                className="p-3 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Share via WhatsApp"
              >
                <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#25D366]">WhatsApp</span>
              </button>

              {/* Telegram */}
              <button
                onClick={handleShareTelegram}
                className="p-3 rounded-xl bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/30 text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Share via Telegram"
              >
                <div className="w-8 h-8 rounded-full bg-[#229ED9] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.197 1.006.128.828.942z"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#229ED9]">Telegram</span>
              </button>

              {/* X / Twitter */}
              <button
                onClick={handleShareTwitter}
                className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.15] text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Share on X"
              >
                <div className="w-8 h-8 rounded-full bg-black border border-white/20 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-white">X (Twitter)</span>
              </button>

              {/* Facebook */}
              <button
                onClick={handleShareFacebook}
                className="p-3 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/30 text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Share on Facebook"
              >
                <div className="w-8 h-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#1877F2]">Facebook</span>
              </button>

              {/* LinkedIn */}
              <button
                onClick={handleShareLinkedIn}
                className="p-3 rounded-xl bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 border border-[#0A66C2]/30 text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Share on LinkedIn"
              >
                <div className="w-8 h-8 rounded-full bg-[#0A66C2] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#0A66C2]">LinkedIn</span>
              </button>

              {/* Reddit */}
              <button
                onClick={handleShareReddit}
                className="p-3 rounded-xl bg-[#FF4500]/10 hover:bg-[#FF4500]/20 border border-[#FF4500]/30 text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Share on Reddit"
              >
                <div className="w-8 h-8 rounded-full bg-[#FF4500] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.688-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.197-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#FF4500]">Reddit</span>
              </button>

              {/* Email */}
              <button
                onClick={handleShareEmail}
                className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.15] text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Send via Email"
              >
                <div className="w-8 h-8 rounded-full bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-[#00CFFF] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Mail className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-white">Email</span>
              </button>

              {/* Native Mobile Share */}
              <button
                onClick={handleNativeShare}
                className="p-3 rounded-xl bg-gradient-to-br from-[#00CFFF]/15 to-[#0088FF]/15 hover:from-[#00CFFF]/25 hover:to-[#0088FF]/25 border border-[#00CFFF]/30 text-white flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer"
                title="Open system share sheet"
              >
                <div className="w-8 h-8 rounded-full bg-[#00CFFF] text-[#05070B] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Share2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-[#00CFFF]">More Options</span>
              </button>

            </div>
          </div>

          {/* Referral URL Direct Box */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-[#98A2B3] uppercase font-mono tracking-wider">
              Permanent Invitation Link
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={cleanUrl}
                className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs font-mono text-white select-all focus:outline-none focus:border-[#00CFFF]"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border border-white/[0.1]"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Pre-written Promo Pitch message */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#98A2B3] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                Ready-to-post Invitation Pitch
              </span>
              <button
                onClick={handleCopyPitch}
                className="text-[11px] text-[#00CFFF] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedPitch ? <CheckCircle2 className="w-3 h-3 text-[#32D583]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPitch ? 'Copied pitch text!' : 'Copy full text'}</span>
              </button>
            </div>
            <p className="text-[11px] text-[#667085] font-mono leading-relaxed bg-[#02050B]/60 p-2.5 rounded-lg border border-white/[0.04] select-all">
              &quot;🚀 Join me on PHIVONEX — The High-Performance Decentralized Validator Network! Activate your node and earn yields: {cleanUrl}&quot;
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#091222]/80 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#667085]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#32D583]" />
            End-to-end cryptographic attribution
          </span>
          <button
            onClick={onClose}
            className="text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
