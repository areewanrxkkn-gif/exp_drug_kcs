import { GasConfig, DrugItem, DispenseRecord } from '../types/inventory';

export const GasApiService = {
  async testConnection(config: GasConfig): Promise<{ success: boolean; message: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, message: 'กรุณาระบุ Web App URL ให้ถูกต้อง (ขึ้นต้นด้วย https://script.google.com/...)' };
    }

    try {
      const url = `${config.scriptUrl}${config.scriptUrl.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`;
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }
      const data = await res.json();
      return { success: !!data.success, message: data.message || 'เชื่อมต่อ Google Apps Script สำเร็จ' };
    } catch (err: any) {
      return {
        success: false,
        message: `เชื่อมต่อไม่สำเร็จ: ${err.message || 'CORS / Network Error'} (ตรวจสอบว่า Deploy Web App เป็น Anyone หรือยัง)`,
      };
    }
  },

  async fetchDrugs(config: GasConfig): Promise<{ success: boolean; items?: DrugItem[]; error?: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
    }

    try {
      const url = `${config.scriptUrl}${config.scriptUrl.includes('?') ? '&' : '?'}action=getDrugs&t=${Date.now()}`;
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        return { success: true, items: data.items };
      }
      return { success: false, error: data.error || 'ไม่สามารถดึงข้อมูลได้' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  },

  async syncAllToGas(config: GasConfig, items: DrugItem[]): Promise<{ success: boolean; error?: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
    }

    try {
      const payload = {
        action: 'syncAll',
        sheetId: config.sheetId,
        items: items,
      };

      const res = await fetch(config.scriptUrl, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script redirects require handling
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Sync error' };
    }
  },

  async dispenseItemToGas(config: GasConfig, record: DispenseRecord): Promise<{ success: boolean; error?: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
    }

    try {
      const payload = {
        action: 'dispense',
        sheetId: config.sheetId,
        record: record,
      };

      await fetch(config.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteMultipleItemsFromGas(config: GasConfig, ids: string[]): Promise<{ success: boolean; error?: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
    }

    try {
      const payload = {
        action: 'deleteMultiple',
        sheetId: config.sheetId,
        ids: ids,
      };

      await fetch(config.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async initHeadersInGas(config: GasConfig): Promise<{ success: boolean; error?: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
    }

    try {
      const url = `${config.scriptUrl}${config.scriptUrl.includes('?') ? '&' : '?'}action=initHeaders&t=${Date.now()}`;
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      return { success: !!data.success, error: data.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async uploadFileToDrive(
    config: GasConfig,
    fileName: string,
    base64Data: string,
    mimeType: string = 'application/pdf'
  ): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
    if (!config.scriptUrl || !config.scriptUrl.startsWith('http')) {
      return { success: false, error: 'ยังไม่ได้ระบุ Web App URL' };
    }

    try {
      const payload = {
        action: 'uploadFile',
        folderId: config.folderId,
        fileName: fileName,
        base64Data: base64Data,
        mimeType: mimeType,
      };

      const res = await fetch(config.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        return { success: true, fileUrl: data.fileUrl };
      }
      return { success: false, error: data.error || 'Upload error' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
