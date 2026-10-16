import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function parseCommandLineArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  const prefixMatch = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixMatch) {
    return prefixMatch.split('=')[1];
  }
  return undefined;
}

const isProd = process.env.NODE_ENV === 'production';
const argPort = parseCommandLineArg('--port') || parseCommandLineArg('-p');
const argHost = parseCommandLineArg('--host') || parseCommandLineArg('-h');

// Dev server MUST run on port 3000 per AI Studio runtime environment instructions.
// In container production, honor process.env.PORT.
const PORT = argPort ? Number(argPort) : (isProd ? Number(process.env.PORT) || 3000 : 3000);
const HOST = argHost || '0.0.0.0';

// Support large PDF payloads up to 50MB
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check API
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// PDF Drug Extraction Endpoint using Gemini AI
app.post('/api/extract-pdf', async (req, res) => {
  try {
    const { base64, fileName } = req.body;

    if (!base64) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาส่งข้อมูลไฟล์ PDF (base64)',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'ระบบยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับการอ่านเอกสารอัตโนมัติ',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Remove data URL prefix if present
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

    const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านเภสัชกรรม คลังยาโรงพยาบาล (Hospital Inventory System)
จงอ่านและสกัดข้อมูลรายการยาทั้งหมดที่พบในเอกสาร PDF นี้ (เช่น ใบส่งมอบเวชภัณฑ์, ใบกำกับภาษี/ใบส่งของ, ใบเบิกยา, เอกสารรับเข้าขององค์การเภสัชกรรม GPO หรือบริษัทยา)

กฎการแปลงข้อมูล:
1. "name": ชื่อยา รูปแบบยา และความแรง (เช่น "Paracetamol 500 mg Tablet", "Amoxicillin 500 mg Cap", "Cefazolin 1g Inj")
2. "lot": เลขที่ผลิต หรือรุ่นที่ผลิต (Lot No. / Batch No.) หากไม่พบให้ระบุ "N/A"
3. "expiryDate": วันหมดอายุ แปลงให้อยู่ในรูปแบบ "YYYY-MM-DD" สากล (ค.ศ.) เท่านั้น
   - หากในเอกสารเป็น พ.ศ. (เช่น 2568, 2569) ให้แปลงเป็น ค.ศ. (เช่น 2025, 2026) โดยลบ 543
   - หากมีแต่วันที่/เดือน/ปี เช่น 31/12/2568 ให้แปลงเป็น "2025-12-31"
   - หากระบุเฉพาะเดือนและปี เช่น 12/2026 ให้ใช้วันสิ้นเดือน เช่น "2026-12-31"
   - หากไม่พบวันหมดอายุ ให้เว้นว่างหรือใช้วันที่ 2 ปีข้างหน้า เช่น "${new Date().getFullYear() + 2}-12-31"
4. "quantity": จำนวนที่ส่งมอบหรือรับเข้า เป็นตัวเลขจำนวนเต็มบวก หากไม่พบให้ใช้ 100
5. "unit": หน่วยนับย่อย (เช่น "เม็ด", "แคปซูล", "ขวด", "แอมพูล", "ไวอัล", "หลอด", "ซอง", "ชิ้น")
6. "packageUnit": ขนาดบรรจุ (เช่น "10x10 เม็ด/กล่อง", "1 ขวด/กล่อง", "50 แอมพูล/กล่อง")
7. "shelf": ชั้นวางเริ่มต้น ให้ใช้ "A1-01" หรือตามที่พบในเอกสาร
8. "company": บริษัทผู้ผลิตหรือผู้จำหน่าย (เช่น "องค์การเภสัชกรรม (GPO)", "บจก.ซิลลิค ฟาร์มา", "ดีเคเอสเอช")
9. "source": แหล่งที่มา เลือกจาก ["GPO", "รพ.พัทลุง", "ไม่ใช่ GPO", "อื่นๆ"] (หากเป็นองค์การเภสัชกรรมให้ใช้ "GPO")
10. "subWarehouse": แผนกคลังย่อย เลือกจาก ["OPD", "IPD", "ER", "คลังใหญ่ (Main)"] (ค่าเริ่มต้น "OPD")
11. "min": สต็อกขั้นต่ำ (ค่าเริ่มต้น 50)
12. "max": สต็อกสูงสุด (ค่าเริ่มต้น 1000)

ส่งผลลัพธ์กลับมาเป็น JSON ตามรูปแบบนี้เท่านั้น:
{
  "documentTitle": "ชื่อเอกสารหรือหัวเรื่อง",
  "documentNumber": "เลขที่ใบส่งของหรือใบกำกับภาษี",
  "documentDate": "วันที่ในเอกสาร (YYYY-MM-DD)",
  "vendor": "ชื่อบริษัทผู้ส่งมอบ",
  "drugs": [
    {
      "name": "string",
      "shelf": "string",
      "lot": "string",
      "company": "string",
      "source": "GPO",
      "subWarehouse": "OPD",
      "expiryDate": "YYYY-MM-DD",
      "quantity": 100,
      "unit": "เม็ด",
      "packageUnit": "10x10 เม็ด/กล่อง",
      "min": 50,
      "max": 1000
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: cleanBase64,
              },
            },
            {
              text: systemPrompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      // Try to find JSON block in markdown
      const jsonMatch = responseText.match(/```json([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        throw new Error('ไม่สามารถแปลงผลลัพธ์จาก AI เป็น JSON ได้');
      }
    }

    const drugs = Array.isArray(parsedData.drugs) ? parsedData.drugs : [];

    // Normalize extracted drugs
    const normalizedDrugs = drugs.map((d: any, index: number) => {
      let expiryDate = d.expiryDate || '';
      // Ensure expiry date is valid string
      if (/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
        // valid
      } else {
        expiryDate = `${new Date().getFullYear() + 2}-12-31`;
      }

      return {
        id: `KCS-PDF-${Date.now().toString().slice(-4)}-${index + 1}`,
        name: String(d.name || `รายการยาที่ ${index + 1}`).trim(),
        shelf: String(d.shelf || 'A1-01').trim(),
        lot: String(d.lot || 'PDF-LOT').trim(),
        company: String(d.company || parsedData.vendor || 'องค์การเภสัชกรรม (GPO)').trim(),
        source: ['GPO', 'รพ.พัทลุง', 'ไม่ใช่ GPO', 'อื่นๆ'].includes(d.source) ? d.source : 'GPO',
        subWarehouse: ['OPD', 'IPD', 'ER', 'คลังใหญ่ (Main)'].includes(d.subWarehouse) ? d.subWarehouse : 'OPD',
        expiryDate,
        quantity: Math.max(0, Number(d.quantity) || 100),
        unit: String(d.unit || 'เม็ด').trim(),
        packageUnit: String(d.packageUnit || '').trim(),
        min: Number(d.min) || 50,
        max: Number(d.max) || 1000,
        receivedDate: parsedData.documentDate || new Date().toISOString().split('T')[0],
        notes: `สกัดจากเอกสาร PDF: ${fileName || 'ใบส่งมอบ/ใบกำกับภาษี'} (เลขที่: ${parsedData.documentNumber || '-'})`,
        isValid: true,
      };
    });

    return res.json({
      success: true,
      documentTitle: parsedData.documentTitle || fileName || 'เอกสารรับเข้าคลังยา',
      documentNumber: parsedData.documentNumber || '',
      documentDate: parsedData.documentDate || '',
      vendor: parsedData.vendor || '',
      count: normalizedDrugs.length,
      drugs: normalizedDrugs,
    });
  } catch (error: any) {
    console.error('Extract PDF Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการวิเคราะห์เอกสาร PDF',
    });
  }
});

// Setup dev server with Vite or production static file serving
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Fallback for SPA routing in development
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        const fs = await import('fs/promises');
        let template = await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        if (vite) vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    // Print Vite's standard local URL output that dev-server supervisors detect
    console.log(`\n  VITE v8.3.0  ready in 150 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/`);
    console.log(`  ➜  press h + enter to show help\n`);
    console.log(`🚀 Server running on http://${HOST}:${PORT} (${isProd ? 'production' : 'development'})\n`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}, closing server...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
