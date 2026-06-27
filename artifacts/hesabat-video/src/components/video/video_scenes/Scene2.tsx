import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AppWindow } from './AppWindow';
import { Subtitle } from './Scene1';

const VOICEOVER = 'مع حسابات تقدر تتابع الإيرادات، المصروفات، الأرباح، وحركة شركتك من لوحة تحكم واضحة وسهلة.';
const BASE = import.meta.env.BASE_URL;

const METRICS = [
  { label: 'صافي الربح', value: '١٢٤٬٤٦٨', icon: '📈', color: '#10b981' },
  { label: 'النقدية والبنوك', value: '١٨٬٥٧٠', icon: '🏦', color: '#38bdf8' },
  { label: 'مستحقات العملاء', value: '١٨٨', icon: '👥', color: '#e8d5a3' },
];

export function Scene2() {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const t = [setTimeout(() => setPhase(1), 250), setTimeout(() => setPhase(2), 700)];
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const id = setInterval(() => { i++; setTyped(VOICEOVER.slice(0, i)); if (i >= VOICEOVER.length) clearInterval(id); }, 26);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <motion.div className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.6 }}>

      {/* Header */}
      <motion.div className="px-10 pt-8 pb-3 text-center"
        initial={{ opacity: 0, y: -20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
        <h1 className="text-4xl font-black text-white" style={{ fontFamily: 'Cairo, sans-serif' }}>
          كل حسابات شركتك{' '}
          <span style={{
            background: 'linear-gradient(135deg, #38bdf8, #e8d5a3)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>في مكان واحد</span>
        </h1>
      </motion.div>

      {/* Two-column layout */}
      <div className="flex-1 flex gap-6 px-8 pb-20 min-h-0">
        {/* Screenshot — main */}
        {phase >= 2 && (
          <div className="flex-1 min-w-0">
            <AppWindow src={`${BASE}images/ss-dashboard.png`} delay={0.05}
              glowColor="rgba(56,189,248,0.2)"
              style={{ height: '100%' }}
              animate={{ opacity: 1, y: 0, scale: 1 }} />
          </div>
        )}

        {/* Right sidebar — metrics */}
        <motion.div className="w-52 flex flex-col gap-3 shrink-0"
          initial={{ opacity: 0, x: 30 }} animate={phase >= 2 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }}>
          <p className="text-white/60 text-sm font-black text-center mb-1" style={{ fontFamily: 'Cairo, sans-serif' }}>أبرز المؤشرات</p>
          {METRICS.map((m, i) => (
            <motion.div key={i} className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)' }}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 + 0.35 }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{m.icon}</span>
                <p className="text-white/60 text-xs font-bold" style={{ fontFamily: 'Cairo, sans-serif' }}>{m.label}</p>
              </div>
              <p className="text-2xl font-black" style={{ color: m.color, fontFamily: 'Cairo, sans-serif' }}>{m.value}</p>
              <p className="text-white/40 text-[10px] mt-0.5" style={{ fontFamily: 'Cairo, sans-serif' }}>درهم إماراتي</p>
            </motion.div>
          ))}

          <motion.div className="mt-auto rounded-2xl p-4 text-center"
            style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(99,102,241,0.15))', border: '1px solid rgba(56,189,248,0.25)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <p className="text-4xl font-black" style={{ color: '#10b981', fontFamily: 'Cairo, sans-serif' }}>٩٠</p>
            <p className="text-white/70 text-xs mt-1" style={{ fontFamily: 'Cairo, sans-serif' }}>الصحة المالية / ١٠٠</p>
            <p className="text-xs font-bold mt-1" style={{ color: '#e8d5a3', fontFamily: 'Cairo, sans-serif' }}>وضع ممتاز ✓</p>
          </motion.div>
        </motion.div>
      </div>

      <Subtitle text={typed} show={phase >= 2} />
    </motion.div>
  );
}
