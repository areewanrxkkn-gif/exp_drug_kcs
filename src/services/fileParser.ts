import * as XLSX from 'xlsx';
import { DrugItem, SourceType, SubWarehouse } from '../types/inventory';
import { getDrugStatus, getSimpleDrugStatus } from '../utils/drugUtils';

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
  isDateEstimated?: boolean;
}

export interface ExcelWorkbookInfo {
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  sampleRows: any[][];
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
    [
      'KCS-00103',
      'Cefazolin 1g Injection',
      'C1-04',
      'CFZ-6609',
      'บจก. สยามเภสัช',
      'ไม่ใช่ GPO',
      'ER',
      '2026-08-31',
      25,
      'ไวอัล',
      '10 ไวอัล/กล่อง',
      40,
      300,
      '2024-03-01',
      'ยาฉีดสำรองห้องฉุกเฉิน',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'Template_นำเข้ารายการยา_รพ_เขาชัยสน.xlsx');
}

/**
 * Inspect an Excel file and return metadata including available sheets and columns.
 */
export async function inspectExcelWorkbook(file: File): Promise<ExcelWorkbookInfo> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetNames = wb.SheetNames || [];

  if (sheetNames.length === 0) {
    throw new Error('ไม่พบชีท (Worksheet) ใดๆ ในไฟล์ Excel นี้');
  }

  // Find best sheet (first sheet with data)
  let bestSheetName = sheetNames[0];
  let bestRows: any[][] = [];
  let headerRowIndex = 0;

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    if (data && data.length > 1) {
      bestSheetName = name;
      bestRows = data;
      headerRowIndex = detectHeaderRowIndex(data);
      break;
    }
  }

  const headers = (bestRows[headerRowIndex] || []).map((h) => String(h || '').trim());
  const sampleRows = bestRows.slice(headerRowIndex + 1, headerRowIndex + 5);

  return {
    sheetNames,
    activeSheet: bestSheetName,
    headers,
    sampleRows,
  };
}

/**
 * Scans first 15 rows of an Excel sheet to find the most probable header row.
 */
function detectHeaderRowIndex(data: any[][]): number {
  const keywords = [
    'ชื่อ', 'ยา', 'รายการ', 'เวชภัณฑ์', 'drug', 'name', 'item',
    'lot', 'batch', 'รุ่น', 'ผลิต',
    'วัน', 'หมดอายุ', 'exp', 'expiry', 'ed',
    'จำนวน', 'คงเหลือ', 'qty', 'quantity', 'ยอด',
    'หน่วย', 'unit', 'ชั้น', 'shelf', 'รหัส', 'code', 'id'
  ];

  let bestIndex = 0;
  let maxScore = -1;

  const maxScanRows = Math.min(15, data.length);
  for (let i = 0; i < maxScanRows; i++) {
    const row = data[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let score = 0;
    for (const cell of row) {
      const s = String(cell || '').trim().toLowerCase();
      if (!s) continue;
      for (const kw of keywords) {
        if (s.includes(kw)) {
          score += 2;
        }
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export interface CustomColumnMapping {
  idCol?: number;
  nameCol?: number;
  shelfCol?: number;
  lotCol?: number;
  companyCol?: number;
  sourceCol?: number;
  subWarehouseCol?: number;
  expiryCol?: number;
  quantityCol?: number;
  unitCol?: number;
  packageUnitCol?: number;
  minCol?: number;
  maxCol?: number;
  receivedCol?: number;
  notesCol?: number;
  headerRowIndex?: number;
  sheetName?: string;
}

/**
 * Universal and robust Excel Parser:
 * - Automatically finds header row (even if title rows exist above it)
 * - Identifies Thai hospital and GPO headers
 * - Normalizes Buddhist Era (พ.ศ.) and Gregorian (ค.ศ.) dates
 * - Handles Excel numeric serial dates (e.g. 45321)
 * - Tolerates missing expiry dates without failing the entire row
 */
export async function parseExcelFile(
  file: File,
  customMapping?: CustomColumnMapping
): Promise<ParsedImportRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('ไม่พบข้อมูลชีทในไฟล์ Excel');
  }

  const targetSheetName = customMapping?.sheetName && wb.Sheets[customMapping.sheetName]
    ? customMapping.sheetName
    : wb.SheetNames[0];

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    throw new Error(`ไม่พบชีทชื่อ "${targetSheetName}" ในไฟล์`);
  }

  // Get raw 2D array
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

  if (!data || data.length < 1) {
    throw new Error('ไม่พบข้อมูลในตาราง Excel หรือตารางว่างเปล่า');
  }

  // Determine header row index
  const headerIdx = customMapping?.headerRowIndex !== undefined
    ? customMapping.headerRowIndex
    : detectHeaderRowIndex(data);

  const rawHeaders: string[] = (data[headerIdx] || []).map((h: any) =>
    String(h || '').trim().toLowerCase()
  );

  // Helper to find column matching any keyword
  const findCol = (...keywords: string[]): number => {
    return rawHeaders.findIndex((h) =>
      keywords.some((k) => h.includes(k.toLowerCase()))
    );
  };

  // Match columns using extensive dictionary of Thai hospital terms
  const idCol = customMapping?.idCol !== undefined && customMapping.idCol >= 0
    ? customMapping.idCol
    : findCol('รหัสยา', 'รหัสเวชภัณฑ์', 'รหัสสินค้า', 'รหัส', 'code', 'id', 'drug id', 'item code');

  const nameCol = customMapping?.nameCol !== undefined && customMapping.nameCol >= 0
    ? customMapping.nameCol
    : findCol(
        'ชื่อยา', 'รายการยา', 'ชื่อเวชภัณฑ์', 'รายการเวชภัณฑ์', 'รายการ',
        'เวชภัณฑ์', 'ชื่อสามัญ', 'ชื่อการค้า', 'รายการสินค้า', 'สินค้า',
        'drug', 'name', 'item', 'description', 'generic', 'trade', 'medicine'
      );

  const shelfCol = customMapping?.shelfCol !== undefined && customMapping.shelfCol >= 0
    ? customMapping.shelfCol
    : findCol('shelf', 'ชั้นวาง', 'ตู้', 'ตำแหน่ง', 'location', 'ที่เก็บ', 'ช่อง', 'ตู้/ชั้น');

  const lotCol = customMapping?.lotCol !== undefined && customMapping.lotCol >= 0
    ? customMapping.lotCol
    : findCol('lot', 'lot no', 'lot no.', 'batch', 'batch no', 'เลขที่ผลิต', 'รุ่น', 'รุ่นที่ผลิต', 'รุ่นผลิต', 'lot/batch');

  const companyCol = customMapping?.companyCol !== undefined && customMapping.companyCol >= 0
    ? customMapping.companyCol
    : findCol('บริษัท', 'ผู้ผลิต', 'ผู้จัดจำหน่าย', 'ตัวแทนจำหน่าย', 'company', 'vendor', 'supplier', 'องค์การเภสัชกรรม');

  const sourceCol = customMapping?.sourceCol !== undefined && customMapping.sourceCol >= 0
    ? customMapping.sourceCol
    : findCol('แหล่งที่มา', 'แหล่ง', 'source', 'ประเภทการจัดซื้อ', 'งบ', 'ประเภท');

  const subCol = customMapping?.subWarehouseCol !== undefined && customMapping.subWarehouseCol >= 0
    ? customMapping.subWarehouseCol
    : findCol('คลังย่อย', 'คลัง', 'แผนก', 'subwarehouse', 'sub-warehouse', 'warehouse', 'ห้องยา');

  const expCol = customMapping?.expiryCol !== undefined && customMapping.expiryCol >= 0
    ? customMapping.expiryCol
    : findCol(
        'วันหมดอายุ', 'หมดอายุ', 'exp', 'expiry', 'ed', 'exp.date',
        'exp date', 'ว.ด.ป.หมดอายุ', 'วันหมด', 'exp_date', 'expire',
        'วันหมดอายุ (วว/ดด/ปปปป)', 'exp_d'
      );

  const qtyCol = customMapping?.quantityCol !== undefined && customMapping.quantityCol >= 0
    ? customMapping.quantityCol
    : findCol(
        'จำนวนคงเหลือ', 'คงเหลือ', 'ยอดคงเหลือ', 'จำนวน', 'qty',
        'quantity', 'ยอด', 'จำนวนรับ', 'ยอดรับ', 'ยอดสต็อก', 'สต็อก', 'balance', 'on hand', 'stock'
      );

  const pkgCol = customMapping?.packageUnitCol !== undefined && customMapping.packageUnitCol >= 0
    ? customMapping.packageUnitCol
    : findCol('หน่วยบรรจุ', 'ขนาดบรรจุ', 'บรรจุ', 'package', 'pack', 'pack unit', 'packaging');

  // Avoid matching package unit for unitCol
  let unitCol = customMapping?.unitCol !== undefined && customMapping.unitCol >= 0
    ? customMapping.unitCol
    : rawHeaders.findIndex((h, idx) => {
        if (idx === pkgCol) return false;
        return ['หน่วยนับ', 'หน่วย', 'unit', 'uom', 'หน่วยย่อย'].some((k) => h.includes(k));
      });

  const minCol = customMapping?.minCol !== undefined && customMapping.minCol >= 0
    ? customMapping.minCol
    : findCol('min', 'ขั้นต่ำ', 'เกณฑ์ต่ำ', 'สต็อกต่ำสุด');

  const maxCol = customMapping?.maxCol !== undefined && customMapping.maxCol >= 0
    ? customMapping.maxCol
    : findCol('max', 'สูงสุด', 'เกณฑ์สูงสุด', 'สต็อกสูงสุด');

  const recCol = customMapping?.receivedCol !== undefined && customMapping.receivedCol >= 0
    ? customMapping.receivedCol
    : findCol('รับเข้า', 'วันที่รับ', 'วันที่รับเข้า', 'received', 'receive date');

  const notesCol = customMapping?.notesCol !== undefined && customMapping.notesCol >= 0
    ? customMapping.notesCol
    : findCol('หมายเหตุ', 'notes', 'note', 'remark', 'remarks', 'comment');

  const rows: ParsedImportRow[] = [];

  // Parse each row below the header
  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (!r || !Array.isArray(r) || r.length === 0) continue;

    // Detect drug name (fallback to column 0 or 1 if specific column not found)
    let rawName = '';
    if (nameCol !== -1 && r[nameCol] !== undefined) {
      rawName = String(r[nameCol] || '').trim();
    } else {
      // Pick first non-empty text column
      for (const val of r) {
        const s = String(val || '').trim();
        if (s && isNaN(Number(s)) && s.length > 2) {
          rawName = s;
          break;
        }
      }
    }

    if (!rawName) continue; // Skip completely empty row

    // Skip summary/footer rows like "รวมทั้งสิ้น", "Total", "Grand Total"
    const lowerName = rawName.toLowerCase();
    if (
      lowerName.includes('รวมทั้งสิ้น') ||
      lowerName.includes('ยอดรวม') ||
      lowerName.startsWith('รวม ') ||
      lowerName === 'total' ||
      lowerName.includes('grand total')
    ) {
      continue;
    }

    const id = idCol !== -1 && r[idCol] ? String(r[idCol]).trim() : undefined;
    const shelf = (shelfCol !== -1 && r[shelfCol] ? String(r[shelfCol]).trim() : '') || 'A1-01';
    const lot = (lotCol !== -1 && r[lotCol] ? String(r[lotCol]).trim() : '') || 'N/A';
    const company = (companyCol !== -1 && r[companyCol] ? String(r[companyCol]).trim() : '') || 'องค์การเภสัชกรรม (GPO)';

    // Source normalization
    let source: SourceType = 'GPO';
    const srcVal = (sourceCol !== -1 && r[sourceCol] ? String(r[sourceCol]).trim() : '').toLowerCase();
    if (srcVal.includes('พัทลุง') || srcVal.includes('ptl')) {
      source = 'รพ.พัทลุง';
    } else if (srcVal.includes('ไม่ใช่') || srcVal.includes('non')) {
      source = 'ไม่ใช่ GPO';
    } else if (srcVal.includes('อื่น') || srcVal.includes('other')) {
      source = 'อื่นๆ';
    } else if (company.includes('พัทลุง')) {
      source = 'รพ.พัทลุง';
    } else if (!company.includes('องค์การเภสัช') && !company.includes('GPO')) {
      source = 'ไม่ใช่ GPO';
    }

    // Sub-warehouse normalization
    let subWarehouse: SubWarehouse = 'OPD';
    const subVal = (subCol !== -1 && r[subCol] ? String(r[subCol]).trim() : '').toUpperCase();
    if (subVal.includes('IPD') || subVal.includes('ใน')) subWarehouse = 'IPD';
    else if (subVal.includes('ER') || subVal.includes('ฉุกเฉิน')) subWarehouse = 'ER';
    else if (subVal.includes('ใหญ่') || subVal.includes('MAIN')) subWarehouse = 'คลังใหญ่ (Main)';

    // Expiry date format normalization
    let expiryDate = '';
    let isDateEstimated = false;
    const rawExp = expCol !== -1 ? r[expCol] : undefined;
    if (rawExp !== undefined && rawExp !== null && String(rawExp).trim() !== '') {
      expiryDate = normalizeDateString(rawExp);
    }

    // If date is completely missing or could not be parsed, give a safe 2-year estimate
    if (!expiryDate) {
      const futureYear = new Date().getFullYear() + 2;
      expiryDate = `${futureYear}-12-31`;
      isDateEstimated = true;
    }

    // Quantity normalization
    let quantity = 0;
    if (qtyCol !== -1 && r[qtyCol] !== undefined) {
      const cleanNum = String(r[qtyCol]).replace(/,/g, '').trim();
      quantity = !isNaN(Number(cleanNum)) ? Number(cleanNum) : 0;
    } else {
      quantity = 100;
    }

    const unit = (unitCol !== -1 && r[unitCol] ? String(r[unitCol]).trim() : '') || 'เม็ด';
    const packageUnit = pkgCol !== -1 && r[pkgCol] ? String(r[pkgCol]).trim() : '';
    const min = minCol !== -1 && !isNaN(Number(String(r[minCol]).replace(/,/g, '')))
      ? Number(String(r[minCol]).replace(/,/g, ''))
      : 50;
    const max = maxCol !== -1 && !isNaN(Number(String(r[maxCol]).replace(/,/g, '')))
      ? Number(String(r[maxCol]).replace(/,/g, ''))
      : 1000;
    const receivedDate = recCol !== -1 && r[recCol]
      ? normalizeDateString(r[recCol])
      : new Date().toISOString().split('T')[0];
    const notes = notesCol !== -1 && r[notesCol] ? String(r[notesCol]).trim() : '';

    const isValid = Boolean(rawName && quantity >= 0);
    let validationError: string | undefined;
    if (!rawName) validationError = 'ไม่มีชื่อยา';
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
      isDateEstimated,
    });
  }

  if (rows.length === 0) {
    throw new Error('ไม่พบแถวข้อมูลยาที่สามารถอ่านได้ในไฟล์ Excel นี้ กรุณาตรวจสอบหรือใช้เครื่องมือจับคู่คอลัมน์');
  }

  return rows;
}

/**
 * Normalizes any Thai or English date input into standard YYYY-MM-DD.
 * Supports:
 * - Date objects
 * - Excel numeric serial numbers (e.g. 45321)
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - Thai Buddhist Era (พ.ศ. 2568, 2569 -> 2025, 2026)
 * - Short Thai/English 2-digit years (e.g. 15/10/68, 15/10/25)
 * - Thai Month names (เช่น 31 ธ.ค. 2568, 15 ต.ค. 68)
 * - Month-only dates (เช่น 12/2026, 10/2568) -> converted to last day of that month
 */
export function normalizeDateString(val: any): string {
  if (val === null || val === undefined) return '';

  // 1. JavaScript Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Excel numeric serial date (e.g. 45000)
  if (typeof val === 'number') {
    if (val > 20000 && val < 80000) {
      const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  let s = String(val).trim();
  if (!s) return '';

  // 3. Standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    let y = Number(s.slice(0, 4));
    if (y > 2400) y -= 543; // Buddhist Era
    return `${y}-${s.slice(5, 10)}`;
  }

  // Thai month names dictionary
  const thaiMonths: { [key: string]: string } = {
    'ม.ค.': '01', 'มกราคม': '01', 'มกรา': '01', 'jan': '01', 'january': '01',
    'ก.พ.': '02', 'กุมภาพันธ์': '02', 'กุมภา': '02', 'feb': '02', 'february': '02',
    'มี.ค.': '03', 'มีนาคม': '03', 'มีนา': '03', 'mar': '03', 'march': '03',
    'เม.ย.': '04', 'เมษายน': '04', 'เมษา': '04', 'apr': '04', 'april': '04',
    'พ.ค.': '05', 'พฤษภาคม': '05', 'พฤษภา': '05', 'may': '05',
    'มิ.ย.': '06', 'มิถุนายน': '06', 'มิถุนา': '06', 'jun': '06', 'june': '06',
    'ก.ค.': '07', 'กรกฎาคม': '07', 'กรกฎา': '07', 'jul': '07', 'july': '07',
    'ส.ค.': '08', 'สิงหาคม': '08', 'สิงหา': '08', 'aug': '08', 'august': '08',
    'ก.ย.': '09', 'กันยายน': '09', 'กันยา': '09', 'sep': '09', 'september': '09',
    'ต.ค.': '10', 'ตุลาคม': '10', 'ตุลา': '10', 'oct': '10', 'october': '10',
    'พ.ย.': '11', 'พฤศจิกายน': '11', 'พฤศจิกา': '11', 'nov': '11', 'november': '11',
    'ธ.ค.': '12', 'ธันวาคม': '12', 'ธันวา': '12', 'dec': '12', 'december': '12',
  };

  // 4. Thai text date: e.g. "31 ต.ค. 2568" or "15 ธันวาคม 68"
  for (const [monthName, monthNum] of Object.entries(thaiMonths)) {
    if (s.toLowerCase().includes(monthName.toLowerCase())) {
      const cleanParts = s.split(/[\s,/-]+/).filter(Boolean);
      let day = '28';
      let year = new Date().getFullYear();

      for (const part of cleanParts) {
        const num = Number(part);
        if (!isNaN(num)) {
          if (num >= 1 && num <= 31 && day === '28') {
            day = String(num).padStart(2, '0');
          } else if (num > 2400) {
            year = num - 543;
          } else if (num >= 2000) {
            year = num;
          } else if (num >= 50 && num <= 99) {
            year = 2500 + num - 543;
          } else if (num >= 20 && num <= 49) {
            year = 2000 + num;
          }
        }
      }

      // Compute last day of month if day is 28 or default
      const lastDay = new Date(year, Number(monthNum), 0).getDate();
      const finalDay = Math.min(Number(day), lastDay);
      return `${year}-${monthNum}-${String(finalDay).padStart(2, '0')}`;
    }
  }

  // 5. Slash or Dash separated: DD/MM/YYYY or MM/YYYY or DD-MM-YYYY
  const parts = s.split(/[/.-]/).map((p) => p.trim());

  if (parts.length === 3) {
    let p0 = Number(parts[0]);
    let p1 = Number(parts[1]);
    let p2 = Number(parts[2]);

    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      // Determine which part is year
      let y = p2;
      let m = p1;
      let d = p0;

      // If YYYY/MM/DD
      if (p0 > 1000) {
        y = p0;
        m = p1;
        d = p2;
      }

      // Convert Buddhist year
      if (y > 2400) {
        y -= 543;
      } else if (y >= 50 && y <= 99) {
        // Thai 2-digit year (e.g. 68 -> 2568 -> 2025)
        y = 2500 + y - 543;
      } else if (y >= 0 && y < 50) {
        // Western 2-digit year (e.g. 26 -> 2026)
        y = 2000 + y;
      }

      const mm = String(Math.max(1, Math.min(12, m))).padStart(2, '0');
      const lastDay = new Date(y, Number(mm), 0).getDate();
      const dd = String(Math.max(1, Math.min(lastDay, d))).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }
  }

  // 6. Month & Year only: e.g. 12/2026 or 10/68 or 10/2569
  if (parts.length === 2) {
    let m = Number(parts[0]);
    let y = Number(parts[1]);
    if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
      if (y > 2400) y -= 543;
      else if (y >= 50 && y <= 99) y = 2500 + y - 543;
      else if (y >= 0 && y < 50) y = 2000 + y;

      const mm = String(m).padStart(2, '0');
      const lastDay = new Date(y, m, 0).getDate();
      return `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // 7. Generic JavaScript Date parse fallback
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      let y = parsed.getFullYear();
      if (y > 2400) y -= 543;
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
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
