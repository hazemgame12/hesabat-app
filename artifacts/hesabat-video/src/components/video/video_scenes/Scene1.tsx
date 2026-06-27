import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const VOICEOVER = 'لو حسابات شركتك متفرقة بين Excel، فواتير، إيميلات، وملفات كتير… حسابات هيساعدك تنظم كل ده في مكان واحد.';
const BASE = import.meta.env.BASE_URL;

const CHAOS = [
  { emoji: '📊', label: 'Excel', x: '7%', y: '15%', rotate: -12 },
  { emoji: '🧾', label: 'فواتير', x: '76%', y: '12%', rotate: 8 },
  { emoji: '📧', label: 'إيميلات', x: '80%', y: '64%', rotate: -6 },
  { emoji: '📁', label: 'ملفات', x: '8%', y: '60%', rotate: 10 },
];

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  x: `${Math.random() * 100}%`, y: `${Math.random() * 100}%`,
  size: Math.random() * 3 + 1, delay: Math.random() * 3, dur: Math.random() * 4 + 3,
}));

export function Scene1() {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 3000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const id = setInterval(() => { i++; setTyped(VOICEOVER.slice(0, i)); if (i >= VOICEOVER.length) clearInterval(id); }, 26);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.7 }}>

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <motion.div key={i} className="absolute rounded-full pointer-events-none"
          style={{ left: p.x, top: p.y, width: p.size, height: p.size, background: 'rgba(255,255,255,0.25)' }}
          animate={{ y: [0, -20, 0], opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }} />
      ))}

      {/* Scattered chaos */}
      {CHAOS.map((item, i) => (
        <motion.div key={i} className="absolute flex flex-col items-center gap-2 pointer-events-none"
          style={{ left: item.x, top: item.y, rotate: item.rotate }}
          initial={{ opacity: 0.7, scale: 1 }}
          animate={phase >= 3
            ? { opacity: 0, scale: 0, x: 'calc(50vw - 80px)', y: 'calc(50vh - 80px)', rotate: 0 }
            : { opacity: 0.5, scale: 1 }}
          transition={{ duration: 0.8, delay: i * 0.06, ease: 'easeInOut' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            {item.emoji}
          </div>
          <span className="text-white/50 text-xs font-bold" style={{ fontFamily: 'Cairo, sans-serif' }}>{item.label}</span>
        </motion.div>
      ))}

      {/* Main hero */}
      <motion.div className="flex flex-col items-center gap-6 z-10"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : {}}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}>

        {/* Logo card */}
        <motion.div className="relative"
          animate={{ y: [0, -6, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}>
          <div className="absolute inset-0 rounded-3xl blur-xl"
            style={{ background: 'rgba(56,189,248,0.3)', transform: 'scale(1.1)' }} />
          <div className="relative rounded-3xl overflow-hidden shadow-2xl"
            style={{ padding: '20px 32px', background: 'white' }}>
            <img src={`${BASE}images/hesabat-logo-full.png`} alt="حسابات" className="h-16 w-auto object-contain" />
          </div>
        </motion.div>

        {/* Headline */}
        <div className="text-center">
          <motion.h1 className="text-6xl font-black leading-tight"
            style={{ fontFamily: 'Cairo, sans-serif' }}
            initial={{ opacity: 0, y: 16 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2 }}>
            <span style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #93c5fd 50%, #e8d5a3 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>حسابات — برنامج محاسبي ذكي</span>
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #e8d5a3 0%, #fcd34d 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>لإدارة شركتك بسهولة</span>
          </motion.h1>
          <motion.p className="mt-3 text-xl text-blue-200/80"
            style={{ fontFamily: 'Cairo, sans-serif' }}
            initial={{ opacity: 0 }} animate={phase >= 2 ? { opacity: 1 } : {}} transition={{ delay: 0.2 }}>
            لإدارة شركتك بكفاءة واحترافية
          </motion.p>
        </div>

        {/* Feature pills */}
        <motion.div className="flex items-center gap-3 flex-wrap justify-center"
          initial={{ opacity: 0, y: 12 }} animate={phase >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.4 }}>
          {['📊 لوحة تحكم', '🧾 فواتير', '🏦 بنوك', '📈 تقارير', '👥 عملاء'].map((tag, i) => (
            <motion.span key={i} className="px-4 py-1.5 rounded-full text-sm font-bold"
              style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', color: '#e8d5a3', fontFamily: 'Cairo, sans-serif', border: '1px solid rgba(255,255,255,0.2)' }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 + 0.5 }}>
              {tag}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>

      {/* Subtitle */}
      <Subtitle text={typed} show={phase >= 2} />
    </motion.div>
  );
}

export function Subtitle({ text, show }: { text: string; show: boolean }) {
  return (
    <motion.div className="absolute bottom-5 left-5 right-5"
      initial={{ opacity: 0, y: 10 }} animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} transition={{ duration: 0.4 }}>
      <div className="rounded-2xl px-6 py-3.5 text-center text-[15px] leading-relaxed text-white font-medium"
        style={{
          background: 'rgba(10,20,50,0.75)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Cairo, sans-serif',
          minHeight: '3.2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
        }}>
        {text || '\u00A0'}<span className="opacity-50 animate-pulse">|</span>
      </div>
    </motion.div>
  );
}
