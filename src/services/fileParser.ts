import * as XLSX from 'xlsx';
import { DrugItem, SourceType, SubWarehouse } from '../types/inventory';
import { getDrugStatus, getSimpleDrugStatus, formatThaiDate } from '../utils/drugUtils';

export interface ParsedImportRow {
  id?: string;
  name: string;
  shelf: string;
  lot: string;
  company: string;
  source: SourceType;
  subWarehouse: SubWarehouse;
  expiryDate: string;
  quantity: number;
  unit: string;
  packageUnit?: string;
  min: number;
  max: number;
  receivedDate?: string;
  notes?: string;
  isValid: boolean;
  validationError?: string;
}

export function exportDrugsToExcel(drugs: DrugItem[]): void {
  const headers = [
    'รหัสยา (ID)',
    'ชื่อยา (Drug Name)',
    'Shelf (ชั้นวาง)',
    'Lot No.',
    'บริษัท (Company)',
    'แหล่งที่มา (Source)',
    'คลังย่อย (Sub-warehouse)',
    'วันหมดอายุ (Expiry)',
    'สถานะวันหมดอายุ (Expiry Status)',
    'คงเหลือ (Qty)',
    'หน่วยนับ (Unit)',
    'หน่วยบรรจุ (Package Unit)',
    'Min (ขั้นต่ำ)',
    'Max (สูงสุด)',
    'สถานะสต็อก (Stock Status)',
    'สรุปการแจ้งเตือน (Alert Summary)',
    'วันที่รับเข้า (Received)',
    'สถานะ (ปลอดภัย/ใกล้หมดอายุ/หมดอายุ/สต็อกถึงเกณฑ์ min)',
    'อัปเดตล่าสุด (Last Updated)',
  ];

  const rows = drugs.map((d) => {
    const st = getDrugStatus(d);
    const simple = getSimpleDrugStatus(d);

    let expText = '✅ ปลอดภัย';
    if (st.expiryStatus === 'expired') {
      expText = `🚨 หมดอายุแล้ว (${Math.abs(st.daysLeft)} วันก่อน)`;
    } else if (st.expiryStatus === 'near_expiry') {
      expText = `⏳ ใกล้หมดอายุ (${st.daysLeft} วัน)`;
    }

    let stockText = '✅ ปกติ';
    if (d.quantity <= d.min) {
      stockText = `⚠️ ถึงเกณฑ์ Min หรือต่ำกว่า (${d.quantity}/${d.min})`;
    } else if (d.max > 0 && d.quantity > d.max) {
      stockText = `📦 เกิน Max (${d.quantity}/${d.max})`;
    }

    return [
      d.id,
      d.name,
      d.shelf,
      d.lot,
      d.company,
      d.source,
      d.subWarehouse,
      d.expiryDate,
      expText,
      d.quantity,
      d.unit,
      d.packageUnit || '',
      d.min,
      d.max,
      stockText,
      simple.text,
      d.receivedDate,
      simple.text,
      d.updatedAt || new Date().toISOString(),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'คลังยานอก');

  const todayStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `คลังยานอก_รพ_เขาชัยสน_${todayStr}.xlsx`);
}

export function downloadExcelTemplate(): void {
  const headers = [
    'รหัสยา',
    'ชื่อยา',
    'Shelf',
    'Lot No.',
    'บริษัท',
    'แหล่งที่มา',
    'คลังย่อย',
    'วันหมดอายุ (YYYY-MM-DD)',
    'จำนวนคงเหลือ',
    'หน่วยนับ',
    'หน่วยบรรจุ',
    'Min',
    'Max',
    'วันที่รับเข้า (YYYY-MM-DD)',
    'หมายเหตุ',
  ];

  const sampleRows = [
    [
      'KCS-00101',
      'Paracetamol 500 mg Tablet',
      'A1-02',
      'GPO67012',
      'องค์การเภสัชกรรม (GPO)',
      'GPO',
      'OPD',
      '2026-12-31',
      500,
      'เม็ด',
      '10x10 เม็ด/กล่อง',
      100,
      1000,
      '2024-01-10',
      'ยาสามัญ',
    ],
    [
      'KCS-00102',
      'Amoxicillin 500 mg Capsule',
      'B2-01',
      'AMX-2401',
      'องค์การเภสัชกรรม (GPO)',
      'GPO',
      'OPD',
      '2026-06-30',
      80,
      'แคปซูล',
      '10x10 เม็ด/กล่อง',
      50,
      500,
      '2024-02-15',
      'ยาปฏิชีวนะ',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'Template_นำเข้ารายการยา_รพ_เขาชัยสน.xlsx');
}

export async function parseExcelFile(file: File): Promise<ParsedImportRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

  if (!data || data.length < 2) {
    throw new Error('ไม่พบข้อมูลในไฟล์ Excel หรือตารางว่างเปล่า');
  }

  const rawHeaders: string[] = (data[0] || []).map((h: any) => String(h || '').trim().toLowerCase());

  // Function to find column index
  const findCol = (...keywords: string[]) => {
    return rawHeaders.findIndex((h) => keywords.some((k) => h.includes(k.toLowerCase())));
  };

  const idCol = findCol('รหัสยา', 'id', 'code');
  const nameCol = findCol('ชื่อยา', 'drug', 'name', 'item');
  const shelfCol = findCol('shelf', 'ชั้นวาง', 'ตู้');
  const lotCol = findCol('lot', 'batch', 'รุ่น');
  const companyCol = findCol('บริษัท', 'company', 'ผู้ผลิต', 'ผู้จัดจำหน่าย');
  const sourceCol = findCol('แหล่งที่มา', 'source', 'แหล่ง');
  const subCol = findCol('คลังย่อย', 'subwarehouse', 'คลัง', 'แผนก');
  const expCol = findCol('วันหมดอายุ', 'expiry', 'exp', 'หมดอายุ');
  const qtyCol = findCol('จำนวน', 'คงเหลือ', 'qty', 'quantity', 'ยอด');
  const unitCol = findCol('หน่วยนับ', 'หน่วย', 'unit');
  const pkgCol = findCol('หน่วยบรรจุ', 'package', 'ขนาดบรรจุ', 'บรรจุ');
  const minCol = findCol('min', 'ขั้นต่ำ');
  const maxCol = findCol('max', 'สูงสุด');
  const recCol = findCol('รับเข้า', 'received');
  const notesCol = findCol('หมายเหตุ', 'notes', 'remark');

  const rows: ParsedImportRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.length === 0) continue;

    const rawName = String((nameCol !== -1 ? r[nameCol] : r[1]) || '').trim();
    if (!rawName) continue; // Skip empty row

    const id = idCol !== -1 && r[idCol] ? String(r[idCol]).trim() : undefined;
    const shelf = (shelfCol !== -1 && r[shelfCol] ? String(r[shelfCol]).trim() : '') || 'A1-01';
    const lot = (lotCol !== -1 && r[lotCol] ? String(r[lotCol]).trim() : '') || 'N/A';
    const company = (companyCol !== -1 && r[companyCol] ? String(r[companyCol]).trim() : '') || 'องค์การเภสัชกรรม (GPO)';

    // Source
    let source: SourceType = 'GPO';
    const srcVal = (sourceCol !== -1 && r[sourceCol] ? String(r[sourceCol]).trim() : '').toLowerCase();
    if (srcVal.includes('พัทลุง') || srcVal.includes('ptl')) {
      source = 'รพ.พัทลุง';
    } else if (srcVal.includes('ไม่ใช่') || srcVal.includes('non')) {
      source = 'ไม่ใช่ GPO';
    } else if (srcVal.includes('อื่น')) {
      source = 'อื่นๆ';
    }

    // Sub-warehouse
    let subWarehouse: SubWarehouse = 'OPD';
    const subVal = (subCol !== -1 && r[subCol] ? String(r[subCol]).trim() : '').toUpperCase();
    if (subVal.includes('IPD')) subWarehouse = 'IPD';
    else if (subVal.includes('ER')) subWarehouse = 'ER';
    else if (subVal.includes('ใหญ่') || subVal.includes('MAIN')) subWarehouse = 'คลังใหญ่ (Main)';

    // Expiry date format normalization
    let expiryDate = '';
    const rawExp = expCol !== -1 ? r[expCol] : r[7];
    if (rawExp) {
      expiryDate = normalizeDateString(rawExp);
    }

    const quantity = qtyCol !== -1 && !isNaN(Number(r[qtyCol])) ? Number(r[qtyCol]) : 0;
    const unit = (unitCol !== -1 && r[unitCol] ? String(r[unitCol]).trim() : '') || 'หน่วย';
    const packageUnit = pkgCol !== -1 && r[pkgCol] ? String(r[pkgCol]).trim() : '';
    const min = minCol !== -1 && !isNaN(Number(r[minCol])) ? Number(r[minCol]) : 50;
    const max = maxCol !== -1 && !isNaN(Number(r[maxCol])) ? Number(r[maxCol]) : 1000;
    const receivedDate = recCol !== -1 && r[recCol] ? normalizeDateString(r[recCol]) : new Date().toISOString().split('T')[0];
    const notes = notesCol !== -1 && r[notesCol] ? String(r[notesCol]).trim() : '';

    const isValid = Boolean(rawName && expiryDate && quantity >= 0);
    let validationError: string | undefined;
    if (!rawName) validationError = 'ไม่มีชื่อยา';
    else if (!expiryDate) validationError = 'ไม่มีวันหมดอายุ';
    else if (quantity < 0) validationError = 'จำนวนคงเหลือติดลบ';

    rows.push({
      id,
      name: rawName,
      shelf,
      lot,
      company,
      source,
      subWarehouse,
      expiryDate,
      quantity,
      unit,
      packageUnit,
      min,
      max,
      receivedDate,
      notes,
      isValid,
      validationError,
    });
  }

  return rows;
}

function normalizeDateString(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(val).trim();
  // If DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    let y = Number(parts[2]);
    if (y > 2500) y -= 543; // Buddhist Era conversion
    return `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {}

  return s;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
