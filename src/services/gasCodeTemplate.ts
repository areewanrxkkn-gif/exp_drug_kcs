/**
 * Google Apps Script (Code.gs) Generator for Khao Chaison Hospital Out-Warehouse Pharmacy
 */
export function generateGoogleAppsScriptCode(sheetId: string, folderId: string): string {
  const cleanSheetId = sheetId || '1kbg4tHYpEpkvlPY5ebmh3GnGBd5DIOYs5UC93Q8EAOU';
  const cleanFolderId = folderId || '1O8MiCSQ43f2aoI7HvcPPY4EM97szYqlb';

  return `/**
 * ==============================================================================
 * ระบบบริหารจัดการคลังยานอก โรงพยาบาลเขาชัยสน จ.พัทลุง
 * Google Apps Script (Code.gs) - รองรับ 19 คอลัมน์ และการแจ้งเตือน Telegram อัตโนมัติ
 * ==============================================================================
 */

const CONFIG = {
  SHEET_ID: "${cleanSheetId}",
  DRIVE_FOLDER_ID: "${cleanFolderId}",
  SHEET_NAME_DRUGS: "คลังยา",
  SHEET_NAME_LOGS: "ประวัติตัดยอด",
  TELEGRAM_BOT_TOKEN: "8803814277:AAH1ezF8t9Hf1m8SOtYUcIOFYiWPFec711Y",
  TELEGRAM_CHAT_ID: "-1004292171419", // Telegram Group ID
};

// 19 คอลัมน์มาตรฐานคลังยา รพ.เขาชัยสน
const HEADERS = [
  "รหัสยา (ID)",
  "ชื่อยา (Drug Name)",
  "Shelf (ชั้นวาง)",
  "Lot No.",
  "บริษัท (Company)",
  "แหล่งที่มา (Source)",
  "คลังย่อย (Sub-warehouse)",
  "วันหมดอายุ (Expiry)",
  "สถานะวันหมดอายุ (Expiry Status)",
  "คงเหลือ (Qty)",
  "หน่วยนับ (Unit)",
  "หน่วยบรรจุ (Package Unit)",
  "Min (ขั้นต่ำ)",
  "Max (สูงสุด)",
  "สถานะสต็อก (Stock Status)",
  "สรุปการแจ้งเตือน (Alert Summary)",
  "วันที่รับเข้า (Received)",
  "สถานะ (ปลอดภัย/ใกล้หมดอายุ/หมดอายุ/สต็อกถึงเกณฑ์ min)",
  "อัปเดตล่าสุด (Last Updated)"
];

/**
 * Handle GET requests
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getDrugs';

    if (action === 'test') {
      return createJsonResponse({ success: true, message: "เชื่อมต่อ Google Apps Script สำเร็จ (Web App Online)" });
    }

    if (action === 'initHeaders') {
      initSheetHeaders();
      return createJsonResponse({ success: true, message: "สร้างและปรับปรุงหัวตาราง 19 คอลัมน์สำเร็จ" });
    }

    if (action === 'getDrugs') {
      const drugs = readAllDrugs();
      return createJsonResponse({ success: true, items: drugs });
    }

    return createJsonResponse({ success: false, error: "Action not recognized" });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle POST requests
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;

    if (action === 'syncAll') {
      const items = postData.items || [];
      writeAllDrugs(items);
      return createJsonResponse({ success: true, count: items.length });
    }

    if (action === 'dispense') {
      const record = postData.record;
      recordDispense(record);
      return createJsonResponse({ success: true });
    }

    if (action === 'deleteMultiple') {
      const ids = postData.ids || [];
      deleteMultipleDrugs(ids);
      return createJsonResponse({ success: true, deletedCount: ids.length });
    }

    if (action === 'uploadFile') {
      const fileName = postData.fileName;
      const base64Data = postData.base64Data;
      const mimeType = postData.mimeType || 'application/pdf';
      const fileUrl = uploadFileToDrive(fileName, base64Data, mimeType);
      return createJsonResponse({ success: true, fileUrl: fileUrl });
    }

    return createJsonResponse({ success: false, error: "Unknown action" });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function initSheetHeaders() {
  const sheet = getOrCreateSheet(CONFIG.SHEET_NAME_DRUGS);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#064e3b').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function readAllDrugs() {
  const sheet = getOrCreateSheet(CONFIG.SHEET_NAME_DRUGS);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values.map(function(row) {
    return {
      id: String(row[0] || ''),
      name: String(row[1] || ''),
      shelf: String(row[2] || ''),
      lot: String(row[3] || ''),
      company: String(row[4] || ''),
      source: String(row[5] || 'GPO'),
      subWarehouse: String(row[6] || 'OPD'),
      expiryDate: formatDate(row[7]),
      quantity: Number(row[9] || 0),
      unit: String(row[10] || 'หน่วย'),
      packageUnit: String(row[11] || ''),
      min: Number(row[12] || 0),
      max: Number(row[13] || 0),
      receivedDate: formatDate(row[16]),
      notes: '',
      updatedAt: String(row[18] || '')
    };
  }).filter(function(d) { return d.name.trim() !== ''; });
}

function writeAllDrugs(items) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_NAME_DRUGS);
  initSheetHeaders();

  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, 1, Math.max(maxRows - 1, 1), HEADERS.length).clearContent();
  }

  if (!items || items.length === 0) return;

  const rows = items.map(function(d) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const exp = new Date(d.expiryDate);
    exp.setHours(0,0,0,0);
    const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

    let expStatus = '✅ ปลอดภัย';
    let simpleStatus = '✅ ปลอดภัย';
    if (daysLeft < 0) {
      expStatus = '🚨 หมดอายุแล้ว (' + Math.abs(daysLeft) + ' วันก่อน)';
      simpleStatus = '🚨 หมดอายุ';
    } else if (daysLeft <= 90) {
      expStatus = '⏳ ใกล้หมดอายุ (' + daysLeft + ' วัน)';
      simpleStatus = '⏳ ใกล้หมดอายุ';
    }

    let stockStatus = '✅ ปกติ';
    if (d.quantity <= d.min) {
      stockStatus = '⚠️ ถึงเกณฑ์ Min (' + d.quantity + '/' + d.min + ')';
      simpleStatus += ' / 📉 ถึงเกณฑ์ min';
    }

    return [
      d.id || '',
      d.name || '',
      d.shelf || '',
      d.lot || '',
      d.company || '',
      d.source || 'GPO',
      d.subWarehouse || 'OPD',
      d.expiryDate || '',
      expStatus,
      d.quantity || 0,
      d.unit || '',
      d.packageUnit || '',
      d.min || 0,
      d.max || 0,
      stockStatus,
      simpleStatus,
      d.receivedDate || '',
      simpleStatus,
      new Date().toISOString()
    ];
  });

  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function recordDispense(record) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_NAME_LOGS);
  if (sheet.getLastRow() === 0) {
    const logHeaders = ["รหัสตัดยอด", "รหัสยา", "ชื่อยา", "Lot", "จำนวน", "หน่วย", "คลังต้นทาง", "แผนกปลายทาง", "ผู้ตัดยอด", "เหตุผล", "คงเหลือ", "วันเวลา"];
    sheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
    sheet.getRange(1, 1, 1, logHeaders.length).setBackground('#0f766e').setFontColor('#ffffff').setFontWeight('bold');
  }

  sheet.appendRow([
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
    record.dispensedAt
  ]);
}

function deleteMultipleDrugs(ids) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_NAME_DRUGS);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const idSet = {};
  ids.forEach(function(id) { idSet[id] = true; });

  for (let i = values.length - 1; i >= 0; i--) {
    if (idSet[values[i][0]]) {
      sheet.deleteRow(i + 2);
    }
  }
}

function uploadFileToDrive(fileName, base64Data, mimeType) {
  let folder;
  try {
    folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  } catch (e) {
    folder = DriveApp.getRootFolder();
  }

  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, mimeType, fileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(val).split('T')[0];
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ฟังก์ชันสำหรับตรวจเช็คสถานะและส่งเข้ากลุ่ม Telegram อัตโนมัติ
 */
function checkInventoryAndNotifyTelegram() {
  const drugs = readAllDrugs();
  const alerts = [];

  drugs.forEach(function(d) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const exp = new Date(d.expiryDate);
    exp.setHours(0,0,0,0);
    const days = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

    if (days < 0) {
      alerts.push("🚨 [หมดอายุแล้ว] " + d.name + " (Lot: " + d.lot + ") คลัง: " + d.subWarehouse);
    } else if (days <= 90) {
      alerts.push("⏳ [ใกล้หมดอายุ " + days + " วัน] " + d.name + " (Lot: " + d.lot + ") คลัง: " + d.subWarehouse);
    } else if (d.quantity <= d.min) {
      alerts.push("📉 [สต็อกถึงเกณฑ์ Min] " + d.name + " เหลือ " + d.quantity + " " + d.unit + " (Min: " + d.min + ")");
    }
  });

  if (alerts.length > 0) {
    const text = "🏥 แจ้งเตือนสถานะคลังยานอก รพ.เขาชัยสน\\nพบ " + alerts.length + " รายการที่ต้องตรวจสอบ:\\n\\n" + alerts.slice(0, 10).join("\\n");
    UrlFetchApp.fetch("https://api.telegram.org/bot" + CONFIG.TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: text
      }),
      muteHttpExceptions: true
    });
  }
}

function installAllTriggers() {
  // Clear existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // Create hourly trigger
  ScriptApp.newTrigger('checkInventoryAndNotifyTelegram')
    .timeBased()
    .everyHours(1)
    .create();
}
`;
}
