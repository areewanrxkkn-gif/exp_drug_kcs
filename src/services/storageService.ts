import { DrugItem, DispenseRecord, GasConfig, TelegramConfig, LineConfig } from '../types/inventory';

const STORAGE_KEYS = {
  DRUGS: 'kcs_pharmacy_drugs',
  DISPENSE_RECORDS: 'kcs_pharmacy_dispense_records',
  GAS_CONFIG: 'kcs_pharmacy_gas_config',
  TELEGRAM_CONFIG: 'kcs_pharmacy_telegram_config',
  LINE_CONFIG: 'kcs_pharmacy_line_config',
};

// Initial realistic drug items for Khao Chaison Hospital Out-Warehouse
const DEFAULT_DRUGS: DrugItem[] = [
  {
    id: 'KCS-00101',
    name: 'Paracetamol 500 mg Tablet',
    shelf: 'A1-02',
    lot: 'GPO67012',
    company: 'องค์การเภสัชกรรม (GPO)',
    source: 'GPO',
    subWarehouse: 'OPD',
    expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
    quantity: 450,
    unit: 'เม็ด',
    packageUnit: '10x10 เม็ด/กล่อง',
    min: 100,
    max: 1000,
    receivedDate: '2024-01-15',
    notes: 'ยาสามัญประจำบ้าน เบิกจ่ายบ่อย',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KCS-00102',
    name: 'Amoxicillin 500 mg Capsule',
    shelf: 'B2-01',
    lot: 'LOT-24B09',
    company: 'องค์การเภสัชกรรม (GPO)',
    source: 'GPO',
    subWarehouse: 'OPD',
    expiryDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0], // ใกล้หมดอายุ (<= 90 วัน)
    quantity: 40,
    unit: 'แคปซูล',
    packageUnit: '10x10 เม็ด/กล่อง',
    min: 50, // ต่ำกว่า min
    max: 500,
    receivedDate: '2024-02-10',
    notes: 'ยาปฏิชีวนะ ใกล้หมดอายุ 45 วัน & ถึงเกณฑ์ Min',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KCS-00103',
    name: 'Ceftriaxone 1 g Injection',
    shelf: 'ตู้เย็นช่อง 1',
    lot: 'CFT-6799',
    company: 'โรงพยาบาลพัทลุง (คลังยาใหญ่)',
    source: 'รพ.พัทลุง',
    subWarehouse: 'ER',
    expiryDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0], // ใกล้หมดอายุ
    quantity: 15,
    unit: 'Vial',
    packageUnit: '10 ไวอัล/กล่อง',
    min: 20, // ต่ำกว่า min
    max: 100,
    receivedDate: '2024-03-01',
    notes: 'ยาฉุกเฉิน ER เก็บในอุณหภูมิควบคุม',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KCS-00104',
    name: 'Metformin 500 mg Tablet',
    shelf: 'A2-04',
    lot: 'MTF-2024A',
    company: 'บ. เบอร์ลินฟาร์มาฯ',
    source: 'ไม่ใช่ GPO',
    subWarehouse: 'OPD',
    expiryDate: new Date(Date.now() + 300 * 86400000).toISOString().split('T')[0],
    quantity: 800,
    unit: 'เม็ด',
    packageUnit: '500 เม็ด/ขวด',
    min: 200,
    max: 2000,
    receivedDate: '2024-04-12',
    notes: 'ยาคลินิกเบาหวาน OPD',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KCS-00105',
    name: 'Diazepam 10 mg/2 mL Injection',
    shelf: 'ตู้ควบคุมพิเศษ',
    lot: 'DZ-2309',
    company: 'องค์การเภสัชกรรม (GPO)',
    source: 'GPO',
    subWarehouse: 'ER',
    expiryDate: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0], // หมดอายุแล้ว (-15 วัน)
    quantity: 5,
    unit: 'แอมพูล',
    packageUnit: '10 แอมพูล/กล่อง',
    min: 10,
    max: 50,
    receivedDate: '2023-11-01',
    notes: 'ยาควบคุมพิเศษ หมดอายุแล้ว รอทำลายตามระเบียบ',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KCS-00106',
    name: 'Omeprazole 20 mg Capsule',
    shelf: 'C1-03',
    lot: 'OMP-6705',
    company: 'องค์การเภสัชกรรม (GPO)',
    source: 'GPO',
    subWarehouse: 'IPD',
    expiryDate: new Date(Date.now() + 210 * 86400000).toISOString().split('T')[0],
    quantity: 320,
    unit: 'แคปซูล',
    packageUnit: '14 แคปซูล/แผง',
    min: 100,
    max: 600,
    receivedDate: '2024-05-20',
    notes: 'ยาลดกรดสำหรับผู้ป่วยใน IPD',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'KCS-00107',
    name: 'Adrenaline 1 mg/1 mL Injection',
    shelf: 'รถฉุกเฉิน Crash Cart',
    lot: 'ADR-2401',
    company: 'โรงพยาบาลพัทลุง (คลังยาใหญ่)',
    source: 'รพ.พัทลุง',
    subWarehouse: 'ER',
    expiryDate: new Date(Date.now() + 75 * 86400000).toISOString().split('T')[0], // ใกล้หมดอายุ
    quantity: 18,
    unit: 'แอมพูล',
    packageUnit: '10 แอมพูล/กล่อง',
    min: 20, // ต่ำกว่า min
    max: 50,
    receivedDate: '2024-02-15',
    notes: 'ยาช่วยชีวิตฉุกเฉิน Resuscitation ER',
    updatedAt: new Date().toISOString(),
  },
];

export const StorageService = {
  getDrugs(): DrugItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DRUGS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('StorageService getDrugs error:', e);
    }
    // Default fallback
    this.saveDrugs(DEFAULT_DRUGS);
    return DEFAULT_DRUGS;
  },

  saveDrugs(drugs: DrugItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.DRUGS, JSON.stringify(drugs));
    } catch (e) {
      console.error('StorageService saveDrugs error:', e);
    }
  },

  getDispenseRecords(): DispenseRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DISPENSE_RECORDS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('StorageService getDispenseRecords error:', e);
    }
    return [];
  },

  saveDispenseRecord(record: DispenseRecord): DispenseRecord[] {
    const records = this.getDispenseRecords();
    const updated = [record, ...records];
    try {
      localStorage.setItem(STORAGE_KEYS.DISPENSE_RECORDS, JSON.stringify(updated));
    } catch (e) {
      console.error('StorageService saveDispenseRecord error:', e);
    }
    return updated;
  },

  getGasConfig(): GasConfig | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GAS_CONFIG);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {}
    return null;
  },

  saveGasConfig(config: GasConfig): void {
    try {
      localStorage.setItem(STORAGE_KEYS.GAS_CONFIG, JSON.stringify(config));
    } catch (e) {}
  },

  getTelegramConfig(): TelegramConfig {
    const defaultConfig: TelegramConfig = {
      botToken: '8939804029:AAHbGhUHnaPyAjRG8bzLpGRagstrZXpi2UQ',
      botId: '8739503406',
      chatId: '-5583489864',
      groupId: '-5583489864',
      enabled: true,
      notifyOnSave: true,
      notifyOnDispense: true,
      notifyOnStatusChange: true,
      notifyGroup: true,
      lastAlertSentAt: null,
    };

    try {
      const data = localStorage.getItem(STORAGE_KEYS.TELEGRAM_CONFIG);
      if (data) {
        return { ...defaultConfig, ...JSON.parse(data) };
      }
    } catch (e) {}
    return defaultConfig;
  },

  saveTelegramConfig(config: TelegramConfig): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TELEGRAM_CONFIG, JSON.stringify(config));
    } catch (e) {}
  },

  getLineConfig(): LineConfig {
    const defaultConfig: LineConfig = {
      channelAccessToken: '',
      destinationId: '',
      alertDaysBeforeExpiry: 90,
    };
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LINE_CONFIG);
      if (data) {
        return { ...defaultConfig, ...JSON.parse(data) };
      }
    } catch (e) {}
    return defaultConfig;
  },

  saveLineConfig(config: LineConfig): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LINE_CONFIG, JSON.stringify(config));
    } catch (e) {}
  },
};
