import { DrugItem, LineConfig, GasConfig } from '../types/inventory';
import { calculateDaysLeft, formatThaiDate } from '../utils/drugUtils';

export interface AlertSummary {
  expiredList: DrugItem[];
  nearExpiryList: DrugItem[];
  lowStockList: DrugItem[];
  totalAlerts: number;
}

export const LineService = {
  getAlertSummary(drugs: DrugItem[], alertDays: number = 90): AlertSummary {
    const expiredList: DrugItem[] = [];
    const nearExpiryList: DrugItem[] = [];
    const lowStockList: DrugItem[] = [];

    drugs.forEach((drug) => {
      const daysLeft = calculateDaysLeft(drug.expiryDate);

      if (daysLeft < 0) {
        expiredList.push(drug);
      } else if (daysLeft <= alertDays) {
        nearExpiryList.push(drug);
      }

      if (Number(drug.quantity || 0) <= Number(drug.min || 0)) {
        lowStockList.push(drug);
      }
    });

    return {
      expiredList,
      nearExpiryList,
      lowStockList,
      totalAlerts: expiredList.length + nearExpiryList.length + lowStockList.length,
    };
  },

  buildAlertMessage(drugs: DrugItem[], alertDays: number = 90): string {
    const summary = this.getAlertSummary(drugs, alertDays);
    const dateStr = new Date().toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let msg = `🏥 รายงานสถานะคลังยานอก รพ.เขาชัยสน\n`;
    msg += `📅 ประจำวันที่ ${dateStr}\n\n`;

    if (summary.totalAlerts === 0) {
      msg += `✅ สถานะคลังยาปกติ ไม่มีรายการยาหมดอายุหรือถึงเกณฑ์ Min ในขณะนี้`;
      return msg;
    }

    if (summary.expiredList.length > 0) {
      msg += `🚨 [ยาหมดอายุแล้ว] (${summary.expiredList.length} รายการ)\n`;
      summary.expiredList.slice(0, 5).forEach((d, i) => {
        msg += ` ${i + 1}. ${d.name} (Lot: ${d.lot}) Exp: ${formatThaiDate(d.expiryDate)}\n`;
      });
      if (summary.expiredList.length > 5) {
        msg += ` ...และอีก ${summary.expiredList.length - 5} รายการ\n`;
      }
      msg += `\n`;
    }

    if (summary.nearExpiryList.length > 0) {
      msg += `⏳ [ยาใกล้หมดอายุ ≤ ${alertDays} วัน] (${summary.nearExpiryList.length} รายการ)\n`;
      summary.nearExpiryList.slice(0, 5).forEach((d, i) => {
        const days = calculateDaysLeft(d.expiryDate);
        msg += ` ${i + 1}. ${d.name} (Lot: ${d.lot}) เหลือ ${days} วัน (${d.subWarehouse})\n`;
      });
      if (summary.nearExpiryList.length > 5) {
        msg += ` ...และอีก ${summary.nearExpiryList.length - 5} รายการ\n`;
      }
      msg += `\n`;
    }

    if (summary.lowStockList.length > 0) {
      msg += `📉 [ยาถึงเกณฑ์ Min] (${summary.lowStockList.length} รายการ)\n`;
      summary.lowStockList.slice(0, 5).forEach((d, i) => {
        msg += ` ${i + 1}. ${d.name} คงเหลือ ${d.quantity}/${d.min} ${d.unit} (${d.subWarehouse})\n`;
      });
      if (summary.lowStockList.length > 5) {
        msg += ` ...และอีก ${summary.lowStockList.length - 5} รายการ\n`;
      }
      msg += `\n`;
    }

    msg += `📌 ตรวจสอบและบริหารจัดการได้ที่ระบบคลังยานอก รพ.เขาชัยสน`;
    return msg;
  },

  async sendAlert(
    lineConfig: LineConfig,
    gasConfig: GasConfig,
    drugs: DrugItem[],
    messageText: string
  ): Promise<{ success: boolean; message: string }> {
    // If LINE Channel Access Token and Destination ID are provided
    if (lineConfig.channelAccessToken && lineConfig.destinationId) {
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${lineConfig.channelAccessToken}`,
          },
          body: JSON.stringify({
            to: lineConfig.destinationId,
            messages: [{ type: 'text', text: messageText }],
          }),
        });

        if (res.ok) {
          return { success: true, message: 'ส่งข้อความแจ้งเตือนผ่าน LINE Push API สำเร็จแล้ว' };
        }
      } catch (e: any) {
        console.warn('Direct LINE push error (likely CORS):', e);
      }
    }

    // Secondary fallback: Send via Google Apps Script Web App
    if (gasConfig.scriptUrl && gasConfig.scriptUrl.startsWith('http')) {
      try {
        await fetch(gasConfig.scriptUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sendLineAlert',
            message: messageText,
            destinationId: lineConfig.destinationId,
          }),
        });
        return { success: true, message: 'ส่งคำสั่งแจ้งเตือนผ่าน Google Apps Script สำเร็จแล้ว' };
      } catch (err: any) {
        return { success: false, message: `ส่งไม่สำเร็จ: ${err.message}` };
      }
    }

    return {
      success: false,
      message: 'กรุณาตั้งค่า Channel Access Token หรือเชื่อมต่อ Google Apps Script Web App เพื่อส่งการแจ้งเตือน',
    };
  },
};
