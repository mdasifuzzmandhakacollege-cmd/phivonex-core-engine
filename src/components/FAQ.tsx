import React, { useState } from 'react';
import { Plus, Minus, HelpCircle } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is PHIVONEX?',
    answer:
      'PHIVONEX is a decentralized Layer-1 infrastructure protocol engineered around a capped monetary supply, 10,000 Genesis Nodes, deterministic protocol rewards, and an immutable live ledger.',
  },
  {
    question: 'What is the maximum Coin supply?',
    answer:
      'The maximum supply of PHIVO Coin is strictly hardcoded at 100,000,000 PHIVO. No secondary minting, inflationary debasement, or algorithmic emission beyond this ceiling can ever occur.',
  },
  {
    question: 'How many Genesis Nodes are planned?',
    answer:
      'Exactly 10,000 Genesis Nodes are hardcoded into the protocol genesis parameters. This is a perpetual ceiling that will never be expanded.',
  },
  {
    question: 'What is a PHIVONEX Node?',
    answer:
      'A PHIVONEX Node is a specialized validator unit responsible for processing network transactions, attesting block consensus, maintaining the state ledger, and receiving protocol rewards for uptime.',
  },
  {
    question: 'Are Genesis Nodes limited?',
    answer:
      'Yes. Genesis Nodes are strictly limited to 10,000 units. As nodes are allocated to operators, the available primary registry supply permanently decreases.',
  },
  {
    question: 'How do Node rewards work?',
    answer:
      'Rewards are calculated programmatically across periodic consensus epochs. Active nodes that maintain verified hardware uptime and consensus attestations receive deterministic reward distributions directly to their designated non-custodial address.',
  },
  {
    question: 'Can Node ownership be transferred?',
    answer:
      'Yes. Node ownership can be cryptographically transferred between operator addresses via ledger state updates. Transferring ownership reassigns an existing node and never creates duplicate or new node units.',
  },
  {
    question: 'Where can network transactions be verified?',
    answer:
      'All block events, node activations, epoch reward distributions, and state checkpoints are publicly inspectable in real-time through the PHIVONEX live ledger explorer and open RPC gateways.',
  },
  {
    question: 'Does owning a Node guarantee profit?',
    answer:
      'No. Node participation does not guarantee financial return or future market value. Node rewards represent protocol-level computational compensation for securing network validation and consensus.',
  },
  {
    question: 'What happens when Genesis Nodes are fully allocated?',
    answer:
      'Once all 10,000 Genesis Nodes are allocated, primary distribution permanently closes. Future network participants can only acquire existing nodes via secondary peer-to-peer operator transfers.',
  },
];

export const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF]">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>KNOWLEDGE BASE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3]">
            Essential answers regarding the PHIVONEX protocol, Genesis Node mechanics, coin ceiling, and governance.
          </p>
        </div>

        {/* 10 FAQ Accordion Items */}
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isOpen
                    ? 'bg-[#07101D] border-[#00CFFF]/40 shadow-lg shadow-[#00CFFF]/5'
                    : 'bg-[#07101D]/70 border-white/[0.08] hover:border-white/[0.15]'
                }`}
              >
                <button
                  onClick={() => toggleIndex(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm sm:text-base font-bold text-[#F7FAFC]">
                    {item.question}
                  </span>
                  <div className="p-1 rounded-md bg-white/[0.04] text-[#00CFFF] shrink-0">
                    {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-[#98A2B3] leading-relaxed border-t border-white/[0.04] pt-3">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
