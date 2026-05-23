import { useEffect, useState, useRef } from "react";

function Counter({ end, suffix, title }: { end: number; suffix: string; title: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          let start = 0;
          const duration = 2000;
          const increment = end / (duration / 16);
          const timer = setInterval(() => {
            start += increment;
            if (start >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(Math.floor(start));
            }
          }, 16);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [end]);

  return (
    <div ref={ref} className="text-center p-6">
      <div className="text-4xl md:text-5xl font-bold text-white mb-2" dir="ltr">
        {count}{suffix}
      </div>
      <div className="text-white/80 text-lg md:text-xl font-medium">{title}</div>
    </div>
  );
}

export default function Stats() {
  return (
    <section className="py-20 bg-[#001d56]">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-x-reverse divide-white/10">
          <Counter end={20} suffix="+" title="سنة خبرة" />
          <Counter end={7000} suffix="+" title="مشاريع مكتملة" />
          <Counter end={10} suffix="+" title="الموظفين الماهرون" />
          <Counter end={1000} suffix="+" title="العملاء النشطين" />
        </div>
      </div>
    </section>
  );
}
