import { DrugItem, DrugStatusResult } from '../types/inventory';

export function calculateDaysLeft(expiryDateStr: string): number {
  if (!expiryDateStr) return 9999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getDrugStatus(drug: DrugItem): DrugStatusResult {
  const daysLeft = calculateDaysLeft(drug.expiryDate);
  let expiryStatus: 'expired' | 'near_expiry' | 'safe' = 'safe';

  if (daysLeft < 0) {
    expiryStatus = 'expired';
  } else if (daysLeft <= 90) {
    expiryStatus = 'near_expiry';
  } else {
    expiryStatus = 'safe';
  }

  let stockStatus: 'low' | 'normal' | 'over' = 'normal';
  const qty = Number(drug.quantity || 0);
  const min = Number(drug.min || 0);
  const max = Number(drug.max || 0);

  if (qty <= min) {
    stockStatus = 'low';
  } else if (max > 0 && qty > max) {
    stockStatus = 'over';
  }

  return {
    expiryStatus,
    stockStatus,
    daysLeft,
  };
}

export function getSimpleDrugStatus(drug: DrugItem): {
  text: string;
  badges: { text: string; badgeClass: string }[];
} {
  const st = getDrugStatus(drug);
  const badges: { text: string; badgeClass: string }[] = [];

  if (st.expiryStatus === 'expired') {
    badges.push({
      text: '🚨 หมดอายุ',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300',
    });
  } else if (st.expiryStatus === 'near_expiry') {
    badges.push({
      text: `⏳ ใกล้หมดอายุ (${st.daysLeft} วัน)`,
      badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse',
    });
  } else {
    badges.push({
      text: '✅ ปลอดภัย',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    });
  }

  if (st.stockStatus === 'low') {
    badges.push({
      text: '📉 ถึงเกณฑ์ min',
      badgeClass: 'bg-orange-100 text-orange-900 border border-orange-300',
    });
  }

  const text = badges.map((b) => b.text).join(' / ');
  return { text, badges };
}

export function getDaysLeftBadge(daysLeft: number): {
  borderClass: string;
  badgeClass: string;
  text: string;
} {
  if (daysLeft < 0) {
    return {
      borderClass: 'border-l-4 border-l-rose-600 bg-rose-50/20',
      badgeClass: 'bg-rose-600 text-white',
      text: `หมดอายุ (${Math.abs(daysLeft)} วันก่อน)`,
    };
  } else if (daysLeft <= 90) {
    return {
      borderClass: 'border-l-4 border-l-amber-500 bg-amber-50/20',
      badgeClass: 'bg-amber-500 text-slate-950 font-bold',
      text: `ใกล้หมดอายุ (${daysLeft} วัน)`,
    };
  }
  return {
    borderClass: 'border-l-4 border-l-emerald-500',
    badgeClass: 'bg-emerald-600 text-white',
    text: `ปลอดภัย (${daysLeft} วัน)`,
  };
}

export function formatThaiDate(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;

    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];

    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543;

    return `${day} ${month} ${year}`;
  } catch {
    return dateString;
  }
}
