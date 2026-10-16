import { DrugItem, DispenseRecord } from '../types/inventory';
import { getDrugStatus, getSimpleDrugStatus } from '../utils/drugUtils';
import { getAccessToken } from './googleAuthService';

const HEADERS = [
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

export const GoogleSheetsDirectService = {
  async fetchDrugs(sheetId: string): Promise<{ success: boolean; items?: DrugItem[]; error?: string; needsAuth?: boolean }> {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, needsAuth: true, error: 'ยังไม่ได้เชื่อมต่อบัญชี Google' };
    }

    try {
      const range = encodeURIComponent('คลังยา!A2:S');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        return { success: false, needsAuth: true, error: 'สิทธิ์การเข้าถึง Google Sheet หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error?.message || `Google Sheets API Error (${res.status})` };
      }

      const data = await res.json();
      const rows: any[][] = data.values || [];

      const items: DrugItem[] = rows
        .filter((r) => r && r[1] && String(r[1]).trim() !== '')
        .map((r, idx) => ({
          id: String(r[0] || `KCS-${Date.now().toString().slice(-4)}-${idx + 1}`),
          name: String(r[1] || ''),
          shelf: String(r[2] || 'A1-01'),
          lot: String(r[3] || 'N/A'),
          company: String(r[4] || 'องค์การเภสัชกรรม (GPO)'),
          source: (r[5] as any) || 'GPO',
          subWarehouse: (r[6] as any) || 'OPD',
          expiryDate: String(r[7] || ''),
          quantity: Number(r[9] || 0),
          unit: String(r[10] || 'หน่วย'),
          packageUnit: String(r[11] || ''),
          min: Number(r[12] || 0),
          max: Number(r[13] || 0),
          receivedDate: String(r[16] || new Date().toISOString().split('T')[0]),
          notes: '',
          updatedAt: String(r[18] || new Date().toISOString()),
        }));

      return { success: true, items };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async syncAllToSheets(sheetId: string, drugs: DrugItem[]): Promise<{ success: boolean; error?: string; needsAuth?: boolean }> {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, needsAuth: true, error: 'ยังไม่ได้เชื่อมต่อบัญชี Google' };
    }

    try {
      const sheetName = 'คลังยา';
      
      // 1. Build row values
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
          stockText = `⚠️ ถึงเกณฑ์ Min (${d.quantity}/${d.min})`;
        } else if (d.max > 0 && d.quantity > d.max) {
          stockText = `📦 สต็อกเกิน Max (${d.quantity}/${d.max})`;
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
          new Date().toISOString(),
        ];
      });

      const allValues = [HEADERS, ...rows];

      // 2. Clear existing sheet
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName + '!A1:S')}:clear`;
      await fetch(clearUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      // 3. Write new values
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName + '!A1:S')}?valueInputOption=USER_ENTERED`;
      const res = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: allValues }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || `HTTP ${res.status}` };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async recordDispense(sheetId: string, record: DispenseRecord): Promise<{ success: boolean; error?: string }> {
    const token = await getAccessToken();
    if (!token) return { success: false };

    try {
      const sheetName = 'ประวัติตัดยอด';
      const row = [
        record.id,
        record.drugId,
        record.drugName,
        record.lot,
        record.amount,
        record.unit,
        record.fromWarehouse,
        record.toDepartment,
        record.requestedBy,
        record.reason,
        record.remainingAfter,
        record.dispensedAt,
      ];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName + '!A1')}:append?valueInputOption=USER_ENTERED`;
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
