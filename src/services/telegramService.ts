import { TelegramConfig, DrugItem, DispenseRecord } from '../types/inventory';
import { getDrugStatus, formatThaiDate } from '../utils/drugUtils';

// Status tracker to avoid sending repeated messages for the exact same drug state
const lastNotifiedStatusCache = new Map<string, string>();

export const TelegramService = {
  async sendMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    if (!botToken || !chatId || !text) return false;
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });
      const data = await res.json();
      return !!data.ok;
    } catch (err) {
      console.warn('Telegram sendMessage warning:', err);
      return false;
    }
  },

  async testConnection(config: TelegramConfig): Promise<{ success: boolean; message: string }> {
    if (!config.botToken) {
      return { success: false, message: 'กรุณาระบุ Telegram Bot Token' };
    }
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) {
      return { success: false, message: 'กรุณาระบุ Chat ID หรือ Group ID' };
    }

    const testMsg = `🏥 <b>ทดสอบการเชื่อมต่อ Telegram Bot</b>
ระบบคลังยานอก โรงพยาบาลเขาชัยสน จ.พัทลุง
⏰ เวลา: ${new Date().toLocaleTimeString('th-TH')} น.
✅ สถานะ: บอทเชื่อมต่อและสามารถส่งข้อความเข้ากลุ่มได้สมบูรณ์`;

    const ok = await this.sendMessage(config.botToken, targetChat, testMsg);
    if (ok) {
      return { success: true, message: `ส่งข้อความทดสอบเข้ากลุ่ม/แชท (${targetChat}) สำเร็จเรียบร้อย!` };
    }
    return { success: false, message: `ส่งไม่สำเร็จ กรุณาตรวจสอบว่าบอทถูกดึงเข้ากลุ่มแล้ว หรือ Token/Chat ID ถูกต้องหรือไม่` };
  },

  async notifyDrugSaved(config: TelegramConfig, drug: DrugItem, isEdit: boolean): Promise<void> {
    if (!config.enabled || !config.notifyOnSave) return;
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) return;

    const actionText = isEdit ? '✏️ <b>แก้ไขข้อมูลยา</b>' : '➕ <b>เพิ่มรายการยาใหม่</b>';
    const msg = `${actionText}
🏥 คลังยานอก รพ.เขาชัยสน
💊 <b>${drug.name}</b>
📍 Shelf: <code>${drug.shelf}</code> | Lot: <code>${drug.lot}</code>
🏢 คลัง: <b>${drug.subWarehouse}</b> | แหล่ง: ${drug.source}
📦 คงเหลือ: <b>${drug.quantity.toLocaleString()} ${drug.unit}</b> ${drug.packageUnit ? `(${drug.packageUnit})` : ''}
⏳ วันหมดอายุ: ${formatThaiDate(drug.expiryDate)}
🕒 อัปเดต: ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  async notifyDrugDeleted(config: TelegramConfig, name: string, lot: string, count?: number): Promise<void> {
    if (!config.enabled) return;
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) return;

    let msg = '';
    if (count && count > 1) {
      msg = `🗑️ <b>ลบรายการยา ${count} รายการ</b>
🏥 คลังยานอก รพ.เขาชัยสน
ระบบได้ลบรายการยาที่เลือกออกจากระบบและ Google Sheet เรียบร้อยแล้ว
🕒 เวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;
    } else {
      msg = `🗑️ <b>ลบรายการยาออกจากคลัง</b>
🏥 คลังยานอก รพ.เขาชัยสน
💊 <b>${name}</b> ${lot ? `(Lot: <code>${lot}</code>)` : ''}
🕒 เวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;
    }

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  async notifyDrugDispensed(config: TelegramConfig, record: DispenseRecord): Promise<void> {
    if (!config.enabled || !config.notifyOnDispense) return;
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) return;

    const msg = `📤 <b>บันทึกการตัดยอดจ่ายยา</b>
🏥 คลังยานอก รพ.เขาชัยสน
💊 <b>${record.drugName}</b>
🔖 Lot: <code>${record.lot}</code>
📉 ตัดจ่าย: <b>-${record.amount.toLocaleString()} ${record.unit}</b>
🏢 คลังต้นทาง: ${record.fromWarehouse} ➡️ ไปยัง: <b>${record.toDepartment}</b>
👤 ผู้ตัดยอด: ${record.requestedBy}
📝 เหตุผล: ${record.reason || '-'}
📊 คงเหลือหลังตัด: <b>${record.remainingAfter.toLocaleString()} ${record.unit}</b>
🕒 วันเวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  async notifyImportSuccess(config: TelegramConfig, added: number, updated: number): Promise<void> {
    if (!config.enabled) return;
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) return;

    const msg = `📥 <b>นำเข้าข้อมูลคลังยาสำเร็จ</b>
🏥 คลังยานอก รพ.เขาชัยสน
➕ เพิ่มรายการใหม่: <b>${added}</b> รายการ
🔄 อัปเดตข้อมูลเดิม: <b>${updated}</b> รายการ
📊 รวมประมวลผล: <b>${added + updated}</b> รายการ
🕒 เวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  async checkAndNotifyStatusChangesAutomatically(config: TelegramConfig, drugs: DrugItem[]): Promise<void> {
    if (!config.enabled || !config.notifyOnStatusChange) return;
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) return;

    const changedAlerts: string[] = [];

    drugs.forEach((drug) => {
      const st = getDrugStatus(drug);
      const currentSignature = `${st.expiryStatus}__${st.stockStatus}__${st.daysLeft}__${drug.quantity}`;
      const prevSignature = lastNotifiedStatusCache.get(drug.id);

      // Only alert if status is not safe or low, AND status changed
      const isUrgent = st.expiryStatus !== 'safe' || st.stockStatus === 'low';

      if (isUrgent && prevSignature !== currentSignature) {
        lastNotifiedStatusCache.set(drug.id, currentSignature);

        let desc = '';
        if (st.expiryStatus === 'expired') {
          desc = `🚨 <b>หมดอายุแล้ว</b> (${Math.abs(st.daysLeft)} วันก่อน)`;
        } else if (st.expiryStatus === 'near_expiry') {
          desc = `⏳ <b>ใกล้หมดอายุ</b> (เหลือ ${st.daysLeft} วัน)`;
        }

        if (st.stockStatus === 'low') {
          desc += desc ? ` | 📉 <b>ถึงเกณฑ์ Min</b> (${drug.quantity}/${drug.min} ${drug.unit})` : `📉 <b>สต็อกถึงเกณฑ์ Min</b> (${drug.quantity}/${drug.min} ${drug.unit})`;
        }

        changedAlerts.push(`• <b>${drug.name}</b> (คลัง ${drug.subWarehouse})
  Lot: <code>${drug.lot}</code> - ${desc}`);
      } else if (!isUrgent) {
        lastNotifiedStatusCache.set(drug.id, currentSignature);
      }
    });

    if (changedAlerts.length > 0) {
      const msg = `⚡ <b>แจ้งเตือนสถานะยาเปลี่ยนแปลง</b>
🏥 คลังยานอก รพ.เขาชัยสน
พบ <b>${changedAlerts.length}</b> รายการที่ต้องตรวจสอบ:

${changedAlerts.slice(0, 8).join('\n\n')}
${changedAlerts.length > 8 ? `\n...และอีก ${changedAlerts.length - 8} รายการ` : ''}

🕒 ${new Date().toLocaleTimeString('th-TH')} น.`;

      await this.sendMessage(config.botToken, targetChat, msg);
    }
  },

  async notifyInventoryStatusAlerts(config: TelegramConfig, drugs: DrugItem[]): Promise<{ sentCount: number }> {
    const targetChat = config.groupId || config.chatId;
    if (!targetChat) return { sentCount: 0 };

    const urgentItems = drugs.filter((d) => {
      const st = getDrugStatus(d);
      return st.expiryStatus !== 'safe' || st.stockStatus === 'low';
    });

    if (urgentItems.length === 0) {
      return { sentCount: 0 };
    }

    const lines = urgentItems.slice(0, 10).map((d, idx) => {
      const st = getDrugStatus(d);
      let tag = '';
      if (st.expiryStatus === 'expired') tag = '🚨 [หมดอายุ]';
      else if (st.expiryStatus === 'near_expiry') tag = `⏳ [ใกล้หมด ${st.daysLeft} วัน]`;
      if (st.stockStatus === 'low') tag += ` 📉 [≤ Min ${d.quantity}/${d.min}]`;

      return `${idx + 1}. <b>${d.name}</b> ${tag}
   Shelf: <code>${d.shelf}</code> | คลัง: ${d.subWarehouse} | Lot: <code>${d.lot}</code>`;
    });

    const msg = `🔔 <b>รายงานสรุปสถานะยาเร่งด่วน</b>
🏥 คลังยานอก รพ.เขาชัยสน
พบรายการต้องตรวจสอบทั้งหมด <b>${urgentItems.length}</b> รายการ:

${lines.join('\n\n')}
${urgentItems.length > 10 ? `\n...และอีก ${urgentItems.length - 10} รายการในระบบ` : ''}

🕒 ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
    return { sentCount: urgentItems.length };
  },
};
