import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AppWindow } from './AppWindow';
import { Subtitle } from './Scene1';

const VOICEOVER = 'استخرج تقارير تساعدك تفهم أداء شركتك، وتعرف بتكسب، بتصرف، وفلوسك رايحة فين.';
const BASE = import.meta.env.BASE_URL;

const CALLOUTS = [
  { label: '🏆 هامش الربح 65.7%', top: '20%', right: '3%', color: '#10b981', delay: 1.0 },
  { label: '⭐ الصحة المالية 90/100', top: '42%', right: '3%', color: '#e8d5a3', delay: 1.5 },
  { label: '📊 إيرادات > مصروفات', top: '64%', right: '3%', color: '#38bdf8', delay: 2.0 },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const t = [setTimeout(() => setPhase(1), 250), setTimeout(() => setPhase(2), 650)];
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const id = setInterval(() => { i++; setTyped(VOICEOVER.slice(0, i)); if (i >= VOICEOVER.length) clearInterval(id); }, 29);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <motion.div className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.6 }}>

      <motion.div className="px-10 pt-8 pb-3 text-center"
        initial={{ opacity: 0, y: -20 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
        <h1 className="text-4xl font-black text-white" style={{ fontFamily: 'Cairo, sans-serif' }}>
          تقارير مالية{' '}
          <span style={{
            background: 'linear-gradient(135deg, #a78bfa, #38bdf8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>واضحة ودقيقة</span>
        </h1>
      </motion.div>

      {phase >= 2 && (
        <div className="flex-1 flex gap-4 px-8 pb-20 min-h-0">
          {/* Main screenshot */}
          <div className="flex-1 min-w-0">
            <AppWindow src={`${BASE}images/ss-reports.png`} title="الموازنات والتحليل المالي"
              glowColor="rgba(167,139,250,0.2)" style={{ height: '100%' }}
              animate={{ opacity: 1, y: 0, scale: 1 }} />
          </div>

          {/* Callout cards */}
          <motion.div className="w-52 shrink-0 flex flex-col gap-3"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <p className="text-white/60 text-sm font-black text-center" style={{ fontFamily: 'Cairo, sans-serif' }}>النتائج الرئيسية</p>
            {CALLOUTS.map((c, i) => (
              <motion.div key={i} className="rounded-2xl px-4 py-3.5"
                style={{
                  background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)',
                  border: `1px solid ${c.color}40`, boxShadow: `0 0 20px ${c.color}20`
                }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: c.delay }}>
                <p className="text-sm font-black" style={{ color: c.color, fontFamily: 'Cairo, sans-serif' }}>{c.label}</p>
              </motion.div>
            ))}

            {/* Donut placeholder */}
            <motion.div className="rounded-2xl p-4 flex flex-col items-center gap-2 mt-auto"
              style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }}>
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                {[
                  { pct: 45, color: '#1e3a8a', offset: 0 },
                  { pct: 28, color: '#e8d5a3', offset: 45 },
                  { pct: 27, color: '#10b981', offset: 73 },
                ].map((s, i) => {
                  const r = 30, c = 2 * Math.PI * r;
                  return (
                    <motion.circle key={i} cx="40" cy="40" r={r} fill="none"
                      stroke={s.color} strokeWidth="14"
                      strokeDasharray={`${(s.pct / 100) * c} ${c - (s.pct / 100) * c}`}
                      strokeDashoffset={-(s.offset / 100) * c}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 + i * 0.2 }} />
                  );
                })}
              </svg>
              <p className="text-white/60 text-xs text-center" style={{ fontFamily: 'Cairo, sans-serif' }}>توزيع الأداء المالي</p>
            </motion.div>
          </motion.div>
        </div>
      )}

      <Subtitle text={typed} show={phase >= 2} />
    </motion.div>
  );
}
