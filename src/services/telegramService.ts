import { TelegramConfig, DrugItem, DispenseRecord } from '../types/inventory';
import { getDrugStatus, formatThaiDate } from '../utils/drugUtils';

export const TELEGRAM_BOT_TOKEN_DEFAULT = '8803814277:AAH1ezF8t9Hf1m8SOtYUcIOFYiWPFec711Y';
export const TELEGRAM_GROUP_ID_DEFAULT = '-1004292171419';

// Status tracker to avoid sending repeated messages for the exact same drug state
const lastNotifiedStatusCache = new Map<string, string>();

// Helper delay to respect Telegram rate-limiting (avoid 429 Too Many Requests)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Escape HTML characters for Telegram HTML parse_mode to prevent parsing errors
function escapeHtml(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const TelegramService = {
  /**
   * ส่งข้อความเดี่ยวไปยัง Telegram Bot
   */
  async sendSingleRawMessage(token: string, targetChat: string, text: string, useHtml = true): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const payload: Record<string, any> = {
        chat_id: targetChat,
        text: text,
      };
      if (useHtml) {
        payload.parse_mode = 'HTML';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.ok && useHtml) {
        // หากส่งแบบ HTML ไม่ผ่านเนื่องจากรูปแบบ tag ให้ fallback ส่งแบบ Plain Text เพื่อไม่ให้ข้อมูลสูญหาย
        console.warn('Telegram HTML parse failed, retrying plain text:', data.description);
        const fallbackRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChat,
            text: text.replace(/<[^>]+>/g, ''), // Strip HTML tags
          }),
        });
        const fallbackData = await fallbackRes.json();
        return !!fallbackData.ok;
      }
      return !!data.ok;
    } catch (err) {
      console.warn('Telegram sendSingleRawMessage error:', err);
      return false;
    }
  },

  /**
   * ส่งข้อความทั่วไป โดยหากข้อความยาวเกินข้อกำหนดของ Telegram (4,096 ตัวอักษร)
   * จะทำการแบ่ง chunk ส่งเป็นหลายข้อความต่อเนื่องโดยอัตโนมัติ
   */
  async sendMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    const token = botToken || TELEGRAM_BOT_TOKEN_DEFAULT;
    const target = chatId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!token || !target || !text) return false;

    // Telegram อนุญาตความยาวสูงสุด 4,096 ตัวอักษรต่อข้อความ
    const MAX_CHUNK_LENGTH = 3800;

    if (text.length <= MAX_CHUNK_LENGTH) {
      return await this.sendSingleRawMessage(token, target, text, true);
    }

    // ทำการตัดแบ่งข้อความตามบรรทัดเพื่อไม่ให้เนื้อหาถูกตัดกลางคัน
    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > MAX_CHUNK_LENGTH) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + line : line;
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    let allSuccess = true;
    for (let i = 0; i < chunks.length; i++) {
      const partPrefix = chunks.length > 1 ? `[ตอนที่ ${i + 1}/${chunks.length}]\n` : '';
      const ok = await this.sendSingleRawMessage(token, target, partPrefix + chunks[i], true);
      if (!ok) allSuccess = false;
      if (i < chunks.length - 1) {
        await delay(350); // เว้นระยะ 350ms ระหว่างข้อความ
      }
    }

    return allSuccess;
  },

  /**
   * ทดสอบการเชื่อมต่อ Telegram Bot
   */
  async testConnection(config: TelegramConfig): Promise<{ success: boolean; message: string }> {
    const token = config.botToken || TELEGRAM_BOT_TOKEN_DEFAULT;
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!token) {
      return { success: false, message: 'กรุณาระบุ Telegram Bot Token' };
    }
    if (!targetChat) {
      return { success: false, message: 'กรุณาระบุ Chat ID หรือ Group ID' };
    }

    const testMsg = `🏥 <b>ทดสอบการเชื่อมต่อ Telegram Bot</b>
ระบบคลังยานอก โรงพยาบาลเขาชัยสน จ.พัทลุง
⏰ เวลา: ${new Date().toLocaleTimeString('th-TH')} น.
✅ สถานะ: บอทเชื่อมต่อและสามารถส่งข้อความเข้ากลุ่ม ${escapeHtml(targetChat)} ได้สมบูรณ์พร้อมระบบแบ่งตอนอัตโนมัติ`;

    const ok = await this.sendMessage(token, targetChat, testMsg);
    if (ok) {
      return { success: true, message: `ส่งข้อความทดสอบเข้ากลุ่ม (${targetChat}) สำเร็จเรียบร้อย!` };
    }
    return { success: false, message: `ส่งไม่สำเร็จ กรุณาตรวจสอบว่าบอทถูกดึงเข้ากลุ่มแล้ว หรือ Token/Chat ID ถูกต้องหรือไม่` };
  },

  /**
   * แจ้งเตือนเมื่อมีการบันทึกหรือแก้ไขข้อมูลยา
   */
  async notifyDrugSaved(config: TelegramConfig, drug: DrugItem, isEdit: boolean): Promise<void> {
    if (!config.enabled || !config.notifyOnSave) return;
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!targetChat) return;

    const actionText = isEdit ? '✏️ <b>แก้ไขข้อมูลยา</b>' : '➕ <b>เพิ่มรายการยาใหม่</b>';
    const msg = `${actionText}
🏥 คลังยานอก รพ.เขาชัยสน
💊 <b>${escapeHtml(drug.name)}</b>
📍 Shelf: <code>${escapeHtml(drug.shelf)}</code> | Lot: <code>${escapeHtml(drug.lot)}</code>
🏢 คลัง: <b>${escapeHtml(drug.subWarehouse)}</b> | แหล่ง: ${escapeHtml(drug.source)}
📦 คงเหลือ: <b>${drug.quantity.toLocaleString()} ${escapeHtml(drug.unit)}</b> ${drug.packageUnit ? `(${escapeHtml(drug.packageUnit)})` : ''}
⏳ วันหมดอายุ: ${formatThaiDate(drug.expiryDate)}
🕒 อัปเดต: ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  /**
   * แจ้งเตือนเมื่อมีการลบรายการยา
   */
  async notifyDrugDeleted(config: TelegramConfig, name: string, lot: string, count?: number): Promise<void> {
    if (!config.enabled) return;
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
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
💊 <b>${escapeHtml(name)}</b> ${lot ? `(Lot: <code>${escapeHtml(lot)}</code>)` : ''}
🕒 เวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;
    }

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  /**
   * แจ้งเตือนเมื่อมีการบันทึกการตัดจ่ายยา
   */
  async notifyDrugDispensed(config: TelegramConfig, record: DispenseRecord): Promise<void> {
    if (!config.enabled || !config.notifyOnDispense) return;
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!targetChat) return;

    const msg = `📤 <b>บันทึกการตัดยอดจ่ายยา</b>
🏥 คลังยานอก รพ.เขาชัยสน
💊 <b>${escapeHtml(record.drugName)}</b>
🔖 Lot: <code>${escapeHtml(record.lot)}</code>
📉 ตัดจ่าย: <b>-${record.amount.toLocaleString()} ${escapeHtml(record.unit)}</b>
🏢 คลังต้นทาง: ${escapeHtml(record.fromWarehouse)} ➡️ ไปยัง: <b>${escapeHtml(record.toDepartment)}</b>
👤 ผู้ตัดยอด: ${escapeHtml(record.requestedBy)}
📝 เหตุผล: ${escapeHtml(record.reason || '-')}
📊 คงเหลือหลังตัด: <b>${record.remainingAfter.toLocaleString()} ${escapeHtml(record.unit)}</b>
🕒 วันเวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  /**
   * แจ้งเตือนสรุปผลการนำเข้าข้อมูล
   */
  async notifyImportSuccess(config: TelegramConfig, added: number, updated: number): Promise<void> {
    if (!config.enabled) return;
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!targetChat) return;

    const msg = `📥 <b>นำเข้าข้อมูลคลังยาสำเร็จ</b>
🏥 คลังยานอก รพ.เขาชัยสน
➕ เพิ่มรายการใหม่: <b>${added}</b> รายการ
🔄 อัปเดตข้อมูลเดิม: <b>${updated}</b> รายการ
📊 รวมประมวลผล: <b>${added + updated}</b> รายการ
🕒 เวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;

    await this.sendMessage(config.botToken, targetChat, msg);
  },

  /**
   * ตรวจสอบและแจ้งเตือนสถานะยาเปลี่ยนแปลงอัตโนมัติ (รองรับมากกว่า 100 รายการ แบ่งส่งครบทุกรายการ)
   */
  async checkAndNotifyStatusChangesAutomatically(config: TelegramConfig, drugs: DrugItem[]): Promise<void> {
    if (!config.enabled || !config.notifyOnStatusChange) return;
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!targetChat) return;

    const changedAlerts: { drug: DrugItem; desc: string }[] = [];

    drugs.forEach((drug) => {
      const st = getDrugStatus(drug);
      const currentSignature = `${st.expiryStatus}__${st.daysLeft}`;
      const prevSignature = lastNotifiedStatusCache.get(drug.id);

      // เตือนเฉพาะรายการที่หมดอายุ หรือ ใกล้หมดอายุ (เกณฑ์ ≤ 180 วัน) และสถานะเปลี่ยนแปลงไปจากเดิม (ยกเลิกการเตือน min)
      const isUrgent = st.expiryStatus === 'expired' || st.expiryStatus === 'near_expiry';

      if (isUrgent && prevSignature !== currentSignature) {
        lastNotifiedStatusCache.set(drug.id, currentSignature);

        let desc = '';
        if (st.expiryStatus === 'expired') {
          desc = `🚨 <b>หมดอายุแล้ว</b> (${Math.abs(st.daysLeft)} วันก่อน)`;
        } else if (st.expiryStatus === 'near_expiry') {
          desc = `⏳ <b>ใกล้หมดอายุ</b> (เหลือ ${st.daysLeft} วัน / เกณฑ์ ≤ 180 วัน)`;
        }

        changedAlerts.push({ drug, desc });
      } else if (!isUrgent) {
        lastNotifiedStatusCache.set(drug.id, currentSignature);
      }
    });

    if (changedAlerts.length === 0) return;

    // แบ่งรายการส่งเป็นชุด (Batch) ละ 20-25 รายการ เพื่อให้ส่งได้ครบถ้วนแม้มี 100+ รายการ
    const ITEMS_PER_BATCH = 20;
    const totalBatches = Math.ceil(changedAlerts.length / ITEMS_PER_BATCH);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const startIdx = batchIdx * ITEMS_PER_BATCH;
      const batchItems = changedAlerts.slice(startIdx, startIdx + ITEMS_PER_BATCH);

      const itemsText = batchItems
        .map((item, idx) => {
          const num = startIdx + idx + 1;
          return `${num}. <b>${escapeHtml(item.drug.name)}</b> (คลัง: ${escapeHtml(item.drug.subWarehouse)})
   Lot: <code>${escapeHtml(item.drug.lot)}</code> | Shelf: <code>${escapeHtml(item.drug.shelf || '-')}</code>
   👉 ${item.desc}`;
        })
        .join('\n\n');

      let header = '';
      if (totalBatches === 1) {
        header = `⚡ <b>แจ้งเตือนสถานะยาเปลี่ยนแปลง</b>
🏥 คลังยานอก รพ.เขาชัยสน
พบ <b>${changedAlerts.length}</b> รายการที่ต้องตรวจสอบ (หมดอายุ / ใกล้หมดอายุ ≤ 180 วัน):`;
      } else {
        header = `⚡ <b>แจ้งเตือนสถานะยาเปลี่ยนแปลง (ตอนที่ ${batchIdx + 1}/${totalBatches})</b>
🏥 คลังยานอก รพ.เขาชัยสน
พบรายการเปลี่ยนแปลงทั้งหมด <b>${changedAlerts.length}</b> รายการ (แสดงรายการที่ ${startIdx + 1} - ${startIdx + batchItems.length}):`;
      }

      let footer = `🕒 ${new Date().toLocaleTimeString('th-TH')} น.`;
      if (batchIdx === totalBatches - 1 && totalBatches > 1) {
        footer = `------------------------------------\n✅ แจ้งเตือนครบถ้วนทั้งหมด <b>${changedAlerts.length}</b> รายการ\n${footer}`;
      }

      const fullMessage = `${header}\n\n${itemsText}\n\n${footer}`;
      await this.sendMessage(config.botToken, targetChat, fullMessage);

      if (batchIdx < totalBatches - 1) {
        await delay(400); // หน่วงเวลาเล็กน้อยเพื่อป้องกัน Telegram rate limit
      }
    }
  },

  /**
   * ส่งรายงานสรุปสถานะยาเร่งด่วนทั้งหมด (เฉพาะหมดอายุ และ ใกล้หมดอายุ ≤ 180 วัน)
   * ยกเลิกการเตือน Min ตามคำขอผู้ใช้
   * รองรับรายการจำนวนมาก เช่น 100 - 300+ รายการ โดยแบ่งส่งเป็นตอนๆ ครบทุกรายการ ไม่ถูกตัดทอน
   */
  async notifyInventoryStatusAlerts(
    config: TelegramConfig,
    drugs: DrugItem[]
  ): Promise<{ sentCount: number; messageCount: number }> {
    const targetChat = config.groupId || TELEGRAM_GROUP_ID_DEFAULT;
    if (!targetChat) return { sentCount: 0, messageCount: 0 };

    // คัดกรองเฉพาะรายการที่หมดอายุหรือใกล้หมดอายุ (เกณฑ์ 180 วัน) ยกเลิกการเตือน min
    const urgentItems = drugs.filter((d) => {
      const st = getDrugStatus(d);
      return st.expiryStatus === 'expired' || st.expiryStatus === 'near_expiry';
    });

    if (urgentItems.length === 0) {
      return { sentCount: 0, messageCount: 0 };
    }

    // สรุปสถิติ
    let expiredCount = 0;
    let nearExpiryCount = 0;

    urgentItems.forEach((d) => {
      const st = getDrugStatus(d);
      if (st.expiryStatus === 'expired') expiredCount++;
      else if (st.expiryStatus === 'near_expiry') nearExpiryCount++;
    });

    // กำหนดจำนวนรายการต่อ 1 ข้อความ (20 รายการต่อข้อความ เพื่อความกระชับและไม่เกินโควต้า 4,096 ตัวอักษร)
    const ITEMS_PER_BATCH = 20;
    const totalBatches = Math.ceil(urgentItems.length / ITEMS_PER_BATCH);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const startIdx = batchIdx * ITEMS_PER_BATCH;
      const currentBatch = urgentItems.slice(startIdx, startIdx + ITEMS_PER_BATCH);

      const lines = currentBatch.map((d, idx) => {
        const globalNum = startIdx + idx + 1;
        const st = getDrugStatus(d);

        let statusTags = '';
        if (st.expiryStatus === 'expired') {
          statusTags = `🚨 <b>[หมดอายุ ${Math.abs(st.daysLeft)} วัน]</b>`;
        } else if (st.expiryStatus === 'near_expiry') {
          statusTags = `⏳ <b>[ใกล้หมด ${st.daysLeft} วัน]</b>`;
        }

        return `${globalNum}. <b>${escapeHtml(d.name)}</b> ${statusTags}
   📍 คลัง: ${escapeHtml(d.subWarehouse)} | Shelf: <code>${escapeHtml(d.shelf || '-')}</code> | Lot: <code>${escapeHtml(d.lot || '-')}</code>
   📦 คงเหลือ: <b>${d.quantity.toLocaleString()} ${escapeHtml(d.unit)}</b> | 📅 Exp: ${formatThaiDate(d.expiryDate)}`;
      });

      let header = '';
      if (totalBatches === 1) {
        header = `🔔 <b>รายงานสรุปสถานะยาเร่งด่วน (วันหมดอายุ)</b>
🏥 คลังยานอก รพ.เขาชัยสน
📊 พบรายการต้องตรวจสอบทั้งหมด <b>${urgentItems.length}</b> รายการ:
• 🚨 ยาหมดอายุ: <b>${expiredCount}</b> รายการ
• ⏳ ยาใกล้หมดอายุ (≤ 180 วัน): <b>${nearExpiryCount}</b> รายการ
------------------------------------
📋 <b>รายการยา:</b>`;
      } else {
        const partTitle = `🔔 <b>รายงานสรุปสถานะยาเร่งด่วน (ตอนที่ ${batchIdx + 1}/${totalBatches})</b>`;
        if (batchIdx === 0) {
          header = `${partTitle}
🏥 คลังยานอก รพ.เขาชัยสน
📊 รวมรายการต้องตรวจสอบทั้งหมด <b>${urgentItems.length}</b> รายการ:
• 🚨 ยาหมดอายุ: <b>${expiredCount}</b> รายการ
• ⏳ ยาใกล้หมดอายุ (≤ 180 วัน): <b>${nearExpiryCount}</b> รายการ
------------------------------------
📋 <b>แสดงรายการลำดับที่ ${startIdx + 1} - ${startIdx + currentBatch.length}:</b>`;
        } else {
          header = `${partTitle}
🏥 คลังยานอก รพ.เขาชัยสน
📋 <b>แสดงรายการลำดับที่ ${startIdx + 1} - ${startIdx + currentBatch.length} (จากทั้งหมด ${urgentItems.length} รายการ):</b>`;
        }
      }

      let footer = `🕒 เวลา: ${new Date().toLocaleTimeString('th-TH')} น.`;
      if (batchIdx === totalBatches - 1) {
        footer = `------------------------------------\n✅ <b>รายงานครบถ้วนทั้งหมด ${urgentItems.length} รายการเรียบร้อย</b>\n${footer}`;
      }

      const messageContent = `${header}\n\n${lines.join('\n\n')}\n\n${footer}`;
      await this.sendMessage(config.botToken, targetChat, messageContent);

      if (batchIdx < totalBatches - 1) {
        await delay(400); // หน่วงเวลาป้องกัน rate limit
      }
    }

    return { sentCount: urgentItems.length, messageCount: totalBatches };
  },
};
