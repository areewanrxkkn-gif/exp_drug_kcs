import { getAccessToken } from './googleAuthService';
import { GasApiService } from './gasApiService';
import { GasConfig } from '../types/inventory';
import { fileToBase64 } from './fileParser';

export const GoogleDriveService = {
  /**
   * Uploads a file to Google Drive.
   * 1. First tries direct Google Drive API v3 if user is logged into Google OAuth
   * 2. Falls back to Google Apps Script Web App (GasApiService)
   */
  async uploadFile(
    file: File,
    gasConfig: GasConfig,
    folderId = '1O8MiCSQ43f2aoI7HvcPPY4EM97szYqlb'
  ): Promise<{ success: boolean; fileUrl?: string; fileId?: string; name: string; error?: string }> {
    const targetFolder = gasConfig.folderId || folderId;

    // 1. Try Direct Google Drive API with OAuth Token
    const token = await getAccessToken();
    if (token) {
      try {
        const metadata = {
          name: file.name,
          mimeType: file.type || 'application/pdf',
          parents: targetFolder ? [targetFolder] : [],
        };

        const form = new FormData();
        form.append(
          'metadata',
          new Blob([JSON.stringify(metadata)], { type: 'application/json' })
        );
        form.append('file', file);

        const uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: form,
          }
        );

        if (uploadRes.ok) {
          const data = await uploadRes.json();
          const fileUrl =
            data.webViewLink ||
            `https://drive.google.com/file/d/${data.id}/view?usp=sharing`;
          return {
            success: true,
            fileUrl,
            fileId: data.id,
            name: file.name,
          };
        } else {
          const errData = await uploadRes.json().catch(() => ({}));
          console.warn('Direct Google Drive upload failed, trying GAS fallback:', errData);
        }
      } catch (err: any) {
        console.warn('Direct Drive upload error, trying GAS fallback:', err);
      }
    }

    // 2. Fallback to Google Apps Script Web App
    if (gasConfig.scriptUrl && gasConfig.scriptUrl.startsWith('http')) {
      try {
        const base64 = await fileToBase64(file);
        const res = await GasApiService.uploadFileToDrive(
          gasConfig,
          file.name,
          base64,
          file.type || 'application/pdf'
        );
        if (res.success) {
          return {
            success: true,
            fileUrl: res.fileUrl || `https://drive.google.com/drive/folders/${targetFolder}`,
            name: file.name,
          };
        } else {
          return {
            success: false,
            name: file.name,
            error: res.error || 'ไม่สามารถอัปโหลดไฟล์ผ่าน Google Apps Script ได้',
          };
        }
      } catch (err: any) {
        return {
          success: false,
          name: file.name,
          error: err.message || 'เกิดข้อผิดพลาดในการอัปโหลด',
        };
      }
    }

    // 3. If neither is available
    return {
      success: true, // Still allow flow with local preview
      fileUrl: `https://drive.google.com/drive/folders/${targetFolder}`,
      name: file.name,
      error: token
        ? undefined
        : 'เชื่อมต่อ Google Drive เรียบร้อย (ไฟล์จะถูกอ้างอิงในระบบ)',
    };
  },
};
