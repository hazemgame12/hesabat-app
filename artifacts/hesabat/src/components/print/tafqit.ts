// Arabic number-to-words (تفقيط) for currency amounts. Handles whole units and
// fractional subunits (e.g. جنيه / قرش). Supports integers up to the trillions.

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];

const TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];

const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

// scale label for [singular, dual, plural(3-10), accusative(11+)]
const SCALES: { one: string; two: string; few: string; many: string }[] = [
  { one: "", two: "", few: "", many: "" },
  { one: "ألف", two: "ألفان", few: "آلاف", many: "ألف" },
  { one: "مليون", two: "مليونان", few: "ملايين", many: "مليون" },
  { one: "مليار", two: "ملياران", few: "مليارات", many: "مليار" },
  { one: "تريليون", two: "تريليونان", few: "تريليونات", many: "تريليون" },
];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (hundred > 0) parts.push(HUNDREDS[hundred]!);
  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest]!);
    } else {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;
      if (ones > 0) {
        // Arabic says ones before tens: "واحد وعشرون"
        parts.push(`${ONES[ones]!} و${TENS[tens]!}`);
      } else {
        parts.push(TENS[tens]!);
      }
    }
  }
  return parts.join(" و");
}

function scaleLabel(
  groupValue: number,
  scaleIdx: number,
): string {
  const s = SCALES[scaleIdx];
  if (!s || scaleIdx === 0) return "";
  if (groupValue === 1) return s.one;
  if (groupValue === 2) return s.two;
  if (groupValue >= 3 && groupValue <= 10) return s.few;
  return s.many;
}

function integerToWords(num: number): string {
  if (num === 0) return "صفر";
  const groups: number[] = [];
  let n = num;
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const chunks: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (g === 0) continue;
    const words = threeDigitsToWords(g);
    const label = scaleLabel(g, i);
    if (i === 0) {
      chunks.push(words);
    } else if (g === 1) {
      chunks.push(label);
    } else if (g === 2) {
      chunks.push(label);
    } else {
      chunks.push(`${words} ${label}`);
    }
  }
  return chunks.join(" و");
}

export type CurrencyWords = { main: string; sub: string };

const CURRENCY_NAMES: Record<string, CurrencyWords> = {
  EGP: { main: "جنيه مصري", sub: "قرش" },
  SAR: { main: "ريال سعودي", sub: "هللة" },
  AED: { main: "درهم إماراتي", sub: "فلس" },
  KWD: { main: "دينار كويتي", sub: "فلس" },
  QAR: { main: "ريال قطري", sub: "درهم" },
  BHD: { main: "دينار بحريني", sub: "فلس" },
  OMR: { main: "ريال عماني", sub: "بيسة" },
  USD: { main: "دولار أمريكي", sub: "سنت" },
  EUR: { main: "يورو", sub: "سنت" },
};

/**
 * Convert a numeric amount to its Arabic words representation, including the
 * currency name and subunit. e.g. 1140.50 EGP →
 * "ألف ومائة وأربعون جنيه مصري وخمسون قرش فقط لا غير".
 */
export function tafqit(amount: number, currency = "EGP"): string {
  const cur = CURRENCY_NAMES[currency] ?? {
    main: currency,
    sub: "",
  };
  const safe = Math.abs(Number(amount) || 0);
  const whole = Math.floor(safe);
  const sub = Math.round((safe - whole) * 100);

  const parts: string[] = [];
  parts.push(`${integerToWords(whole)} ${cur.main}`);
  if (sub > 0 && cur.sub) {
    parts.push(`${integerToWords(sub)} ${cur.sub}`);
  }
  return `${parts.join(" و")} فقط لا غير`;
}
