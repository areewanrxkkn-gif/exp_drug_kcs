export type SubWarehouse = 'OPD' | 'IPD' | 'ER' | 'คลังใหญ่ (Main)';
export type SourceType = 'GPO' | 'ไม่ใช่ GPO' | 'รพ.พัทลุง' | 'อื่นๆ';

export interface DrugItem {
  id: string;
  name: string;
  shelf: string;
  lot: string;
  company: string;
  source: SourceType;
  subWarehouse: SubWarehouse;
  expiryDate: string; // YYYY-MM-DD
  quantity: number;
  unit: string;
  packageUnit?: string;
  min: number;
  max: number;
  receivedDate: string; // YYYY-MM-DD
  notes?: string;
  updatedAt?: string;
}

export interface DispenseRecord {
  id: string;
  drugId: string;
  drugName: string;
  lot: string;
  amount: number;
  unit: string;
  fromWarehouse: string;
  toDepartment: string;
  requestedBy: string;
  dispensedAt: string;
  reason: string;
  remainingAfter: number;
}

export interface GasConfig {
  sheetId: string;
  scriptUrl: string;
  folderId: string;
  autoSync: boolean;
  lastSyncTime: string | null;
}

export interface TelegramConfig {
  botToken: string;
  botId: string;
  chatId: string;
  groupId: string;
  enabled: boolean;
  notifyOnSave: boolean;
  notifyOnDispense: boolean;
  notifyOnStatusChange: boolean;
  notifyGroup: boolean;
  lastAlertSentAt: string | null;
}

export interface LineConfig {
  channelAccessToken: string;
  destinationId: string;
  alertDaysBeforeExpiry: number;
}

export interface DrugStatusResult {
  expiryStatus: 'expired' | 'near_expiry' | 'safe';
  stockStatus: 'low' | 'normal' | 'over';
  daysLeft: number;
}
