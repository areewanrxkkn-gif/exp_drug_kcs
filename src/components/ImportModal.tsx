import React, { useState } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Check, 
  Loader2, 
  ExternalLink,
  Layers,
  ArrowRight,
  RotateCcw,
  Trash2,
  Edit2,
  Sparkles,
  Sliders,
  Calendar,
  Building,
  HelpCircle
} from 'lucide-react';
import { DrugItem, GasConfig, SourceType, SubWarehouse } from '../types/inventory';
import { 
  parseExcelFile, 
  downloadExcelTemplate, 
  fileToBase64, 
  inspectExcelWorkbook, 
  CustomColumnMapping,
  ExcelWorkbookInfo, 
  ParsedImportRow,
  normalizeDateString
} from '../services/fileParser';
import { GoogleDriveService } from '../services/googleDriveService';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportDrugs: (drugs: DrugItem[]) => void;
  gasConfig?: GasConfig;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportDrugs,
  gasConfig = {
    sheetId: '1kbg4tHYpEpkvlPY5ebmh3GnGBd5DIOYs5UC93Q8EAOU',
    scriptUrl: '',
    folderId: '1O8MiCSQ43f2aoI7HvcPPY4EM97szYqlb',
    autoSync: false,
    lastSyncTime: null,
  },
}) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'pdf'>('excel');
  
  // Excel state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelError, setExcelError] = useState<string>('');

  // Column Mapping State
  const [showMappingTool, setShowMappingTool] = useState(false);
  const [workbookInfo, setWorkbookInfo] = useState<ExcelWorkbookInfo | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [customMapping, setCustomMapping] = useState<CustomColumnMapping>({
    nameCol: -1,
    expiryCol: -1,
    quantityCol: -1,
    lotCol: -1,
    shelfCol: -1,
    unitCol: -1,
    companyCol: -1,
    subWarehouseCol: -1,
    sourceCol: -1,
  });

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [pdfExtractedRows, setPdfExtractedRows] = useState<ParsedImportRow[]>([]);
  const [pdfSelectedIndices, setPdfSelectedIndices] = useState<Set<number>>(new Set());
  const [pdfDocInfo, setPdfDocInfo] = useState<{
    title?: string;
    number?: string;
    date?: string;
    vendor?: string;
  } | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfUploadResult, setPdfUploadResult] = useState<{ url?: string; name?: string } | null>(null);
  const [pdfError, setPdfError] = useState<string>('');
  const [showPdfPasteTool, setShowPdfPasteTool] = useState(false);
  const [pdfPastedText, setPdfPastedText] = useState('');

  // Batch tools
  const [batchExpiryInput, setBatchExpiryInput] = useState('');
  const [batchShelfInput, setBatchShelfInput] = useState('');

  if (!isOpen) return null;

  // ==========================================
  // EXCEL HANDLERS
  // ==========================================

  const handleExcelDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFile(file);
    setIsParsingExcel(true);
    setExcelError('');

    try {
      // 1. Inspect workbook for sheet & header info
      try {
        const info = await inspectExcelWorkbook(file);
        setWorkbookInfo(info);
        setSelectedSheet(info.activeSheet);
      } catch (infoErr) {
        console.warn('Workbook info inspection warning:', infoErr);
      }

      // 2. Parse file with dynamic header search & date normalization
      const rows = await parseExcelFile(file);
      setParsedRows(rows);
      
      // Auto select valid rows
      const validIndices = new Set<number>();
      rows.forEach((r, idx) => {
        if (r.isValid) validIndices.add(idx);
      });
      setSelectedIndices(validIndices);
    } catch (err: any) {
      setExcelError('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + (err.message || 'รูปแบบไฟล์ไม่ถูกต้อง'));
      setShowMappingTool(true); // Open mapping tool on failure to help user map columns
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleApplyCustomMapping = async () => {
    if (!excelFile) return;
    setIsParsingExcel(true);
    setExcelError('');

    try {
      const mappingToUse: CustomColumnMapping = {
        ...customMapping,
        sheetName: selectedSheet,
      };

      const rows = await parseExcelFile(excelFile, mappingToUse);
      setParsedRows(rows);
      const all = new Set<number>();
      rows.forEach((r, idx) => {
        if (r.isValid) all.add(idx);
      });
      setSelectedIndices(all);
      setShowMappingTool(false);
    } catch (err: any) {
      setExcelError('ไม่สามารถอ่านด้วยการจับคู่นี้ได้: ' + err.message);
    } finally {
      setIsParsingExcel(false);
    }
  };

  const toggleSelectRow = (index: number) => {
    const updated = new Set(selectedIndices);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setSelectedIndices(updated);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === parsedRows.length) {
      setSelectedIndices(new Set());
    } else {
      const all = new Set<number>();
      parsedRows.forEach((_, i) => all.add(i));
      setSelectedIndices(all);
    }
  };

  const handleClearExcel = () => {
    setExcelFile(null);
    setParsedRows([]);
    setSelectedIndices(new Set());
    setExcelError('');
    setWorkbookInfo(null);
    setShowMappingTool(false);
  };

  const handleUpdateRowField = (index: number, field: keyof ParsedImportRow, value: any) => {
    setParsedRows((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      const hasName = Boolean(updated.name && String(updated.name).trim());
      updated.isValid = hasName && updated.quantity >= 0;

      if (!hasName) updated.validationError = 'ไม่มีชื่อยา';
      else if (updated.quantity < 0) updated.validationError = 'จำนวนคงเหลือติดลบ';
      else updated.validationError = undefined;

      next[index] = updated;
      return next;
    });
  };

  const handleDeletePreviewRow = (index: number) => {
    setParsedRows((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const handleBatchChangeSubWarehouse = (targetWh: SubWarehouse) => {
    if (selectedIndices.size === 0) return;
    setParsedRows((prev) =>
      prev.map((r, i) => (selectedIndices.has(i) ? { ...r, subWarehouse: targetWh } : r))
    );
  };

  const handleBatchSetExpiry = () => {
    if (!batchExpiryInput || selectedIndices.size === 0) return;
    setParsedRows((prev) =>
      prev.map((r, i) => (selectedIndices.has(i) ? { ...r, expiryDate: batchExpiryInput, isDateEstimated: false } : r))
    );
    setBatchExpiryInput('');
  };

  const handleBatchSetShelf = () => {
    if (!batchShelfInput.trim() || selectedIndices.size === 0) return;
    setParsedRows((prev) =>
      prev.map((r, i) => (selectedIndices.has(i) ? { ...r, shelf: batchShelfInput.trim() } : r))
    );
    setBatchShelfInput('');
  };

  const handleConfirmImportExcel = () => {
    const itemsToAdd: DrugItem[] = [];
    const timestamp = Date.now();

    parsedRows.forEach((row, idx) => {
      if (selectedIndices.has(idx)) {
        itemsToAdd.push({
          id: row.id || `KCS-IMP-${timestamp.toString().slice(-4)}-${idx + 1}`,
          name: row.name,
          shelf: row.shelf || 'ทั่วไป',
          lot: row.lot || 'N/A',
          company: row.company || 'ไม่ระบุ',
          source: row.source,
          subWarehouse: row.subWarehouse,
          expiryDate: row.expiryDate,
          quantity: row.quantity,
          unit: row.unit,
          packageUnit: row.packageUnit || '',
          min: row.min,
          max: row.max,
          receivedDate: row.receivedDate || new Date().toISOString().split('T')[0],
          notes: row.notes || 'นำเข้าจากไฟล์ Excel',
          updatedAt: new Date().toISOString(),
        });
      }
    });

    if (itemsToAdd.length === 0) {
      setExcelError('กรุณาเลือกอย่างน้อย 1 รายการเพื่อนำเข้า');
      return;
    }

    onImportDrugs(itemsToAdd);
    onClose();
  };

  // ==========================================
  // PDF HANDLERS & AI EXTRACTION
  // ==========================================

  const handlePdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('กรุณาเลือกไฟล์เอกสาร PDF เท่านั้น');
      return;
    }

    setPdfFile(file);
    setPdfError('');
    setPdfUploadResult(null);
    setPdfExtractedRows([]);
    setPdfSelectedIndices(new Set());
    setPdfDocInfo(null);

    // Automatically trigger AI extraction
    await extractDataFromPdf(file);
  };

  const extractDataFromPdf = async (file: File) => {
    setIsExtractingPdf(true);
    setPdfError('');

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch('/api/extract-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64,
          fileName: file.name,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'ไม่สามารถวิเคราะห์เอกสาร PDF ได้');
      }

      setPdfDocInfo({
        title: result.documentTitle,
        number: result.documentNumber,
        date: result.documentDate,
        vendor: result.vendor,
      });

      const extracted: ParsedImportRow[] = (result.drugs || []).map((d: any) => ({
        ...d,
        isValid: true,
      }));

      if (extracted.length === 0) {
        setPdfError('อ่านเอกสารแล้วแต่ไม่พบรายการยาที่สามารถสกัดได้ คุณสามารถใช้วิธีวางข้อความ (Paste Text) หรือกรอกรายการได้');
        setShowPdfPasteTool(true);
      } else {
        setPdfExtractedRows(extracted);
        const all = new Set<number>();
        extracted.forEach((_, i) => all.add(i));
        setPdfSelectedIndices(all);
      }
    } catch (err: any) {
      console.error('PDF AI extraction error:', err);
      setPdfError(`การสกัดด้วย AI: ${err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ'}`);
      setShowPdfPasteTool(true); // Provide paste tool fallback
    } finally {
      setIsExtractingPdf(false);
    }
  };

  // Upload PDF to Google Drive Folder
  const handleUploadPdfToDrive = async () => {
    if (!pdfFile) return;

    setIsUploadingPdf(true);
    setPdfError('');

    try {
      const res = await GoogleDriveService.uploadFile(
        pdfFile,
        gasConfig,
        gasConfig.folderId || '1O8MiCSQ43f2aoI7HvcPPY4EM97szYqlb'
      );

      if (res.success) {
        setPdfUploadResult({
          url: res.fileUrl,
          name: res.name,
        });

        // Attach drive link to all extracted rows
        setPdfExtractedRows((prev) =>
          prev.map((r) => ({
            ...r,
            notes: `${r.notes || ''} [ลิงก์เอกสาร Drive: ${res.fileUrl}]`.trim(),
          }))
        );
      } else {
        setPdfError(res.error || 'ไม่สามารถอัปโหลดเข้า Google Drive ได้');
      }
    } catch (err: any) {
      setPdfError('เกิดข้อผิดพลาดในการอัปโหลด Drive: ' + (err.message || 'Upload error'));
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // Parse pasted raw text from PDF/OCR
  const handleParsePastedText = () => {
    if (!pdfPastedText.trim()) return;

    const lines = pdfPastedText.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows: ParsedImportRow[] = [];

    lines.forEach((line, idx) => {
      // Split by tab or multiple spaces or comma
      const parts = line.split(/\t+|\s{2,}|,/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 1) return;

      const name = parts[0] || `รายการยาที่ ${idx + 1}`;
      let lot = 'N/A';
      let expiryDate = `${new Date().getFullYear() + 2}-12-31`;
      let qty = 100;
      let unit = 'เม็ด';

      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        // Check if numeric quantity
        if (!isNaN(Number(p)) && Number(p) > 0 && qty === 100) {
          qty = Number(p);
        } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(p) || /^\d{4}-\d{2}-\d{2}$/.test(p)) {
          expiryDate = normalizeDateString(p);
        } else if (p.toLowerCase().includes('lot') || p.startsWith('B') || p.startsWith('L')) {
          lot = p;
        } else if (['เม็ด', 'แคปซูล', 'ขวด', 'แอมพูล', 'ไวอัล', 'หลอด', 'ซอง', 'กล่อง'].includes(p)) {
          unit = p;
        }
      }

      rows.push({
        id: `KCS-PASTE-${Date.now().toString().slice(-4)}-${idx + 1}`,
        name,
        shelf: 'A1-01',
        lot,
        company: pdfDocInfo?.vendor || 'องค์การเภสัชกรรม (GPO)',
        source: 'GPO',
        subWarehouse: 'OPD',
        expiryDate,
        quantity: qty,
        unit,
        min: 50,
        max: 1000,
        receivedDate: new Date().toISOString().split('T')[0],
        notes: `นำเข้าจากการวางข้อความเอกสาร PDF: ${pdfFile?.name || 'เอกสารรับเข้า'}`,
        isValid: true,
      });
    });

    if (rows.length > 0) {
      setPdfExtractedRows((prev) => [...prev, ...rows]);
      setPdfSelectedIndices(new Set(Array.from({ length: rows.length + pdfExtractedRows.length }, (_, i) => i)));
      setPdfPastedText('');
      setShowPdfPasteTool(false);
    }
  };

  const toggleSelectPdfRow = (index: number) => {
    const updated = new Set(pdfSelectedIndices);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setPdfSelectedIndices(updated);
  };

  const toggleSelectAllPdf = () => {
    if (pdfSelectedIndices.size === pdfExtractedRows.length) {
      setPdfSelectedIndices(new Set());
    } else {
      const all = new Set<number>();
      pdfExtractedRows.forEach((_, i) => all.add(i));
      setPdfSelectedIndices(all);
    }
  };

  const handleUpdatePdfRowField = (index: number, field: keyof ParsedImportRow, value: any) => {
    setPdfExtractedRows((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      const hasName = Boolean(updated.name && String(updated.name).trim());
      updated.isValid = hasName && updated.quantity >= 0;
      next[index] = updated;
      return next;
    });
  };

  const handleDeletePdfRow = (index: number) => {
    setPdfExtractedRows((prev) => prev.filter((_, i) => i !== index));
    setPdfSelectedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const handleBatchChangePdfSubWarehouse = (targetWh: SubWarehouse) => {
    if (pdfSelectedIndices.size === 0) return;
    setPdfExtractedRows((prev) =>
      prev.map((r, i) => (pdfSelectedIndices.has(i) ? { ...r, subWarehouse: targetWh } : r))
    );
  };

  const handleConfirmImportPdf = () => {
    const itemsToAdd: DrugItem[] = [];
    const timestamp = Date.now();

    pdfExtractedRows.forEach((row, idx) => {
      if (pdfSelectedIndices.has(idx)) {
        itemsToAdd.push({
          id: row.id || `KCS-PDF-${timestamp.toString().slice(-4)}-${idx + 1}`,
          name: row.name,
          shelf: row.shelf || 'ทั่วไป',
          lot: row.lot || 'N/A',
          company: row.company || 'ไม่ระบุ',
          source: row.source,
          subWarehouse: row.subWarehouse,
          expiryDate: row.expiryDate,
          quantity: row.quantity,
          unit: row.unit,
          packageUnit: row.packageUnit || '',
          min: row.min,
          max: row.max,
          receivedDate: row.receivedDate || new Date().toISOString().split('T')[0],
          notes: row.notes || `นำเข้าจาก PDF: ${pdfFile?.name || ''}`,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    if (itemsToAdd.length === 0) {
      setPdfError('กรุณาเลือกอย่างน้อย 1 รายการเพื่อนำเข้า');
      return;
    }

    onImportDrugs(itemsToAdd);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-800 rounded-lg text-emerald-300">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-['Prompt'] font-bold text-base sm:text-lg">
                นำเข้าข้อมูลคลังยา (Excel & PDF อัตโนมัติ)
              </h3>
              <p className="text-xs text-emerald-200/80">ระบบคลังยานอก รพ.เขาชัยสน</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-800/80 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3">
          <button
            onClick={() => setActiveTab('excel')}
            className={`pb-3 px-4 text-xs sm:text-sm font-semibold flex items-center space-x-2 border-b-2 transition cursor-pointer ${
              activeTab === 'excel'
                ? 'border-emerald-700 text-emerald-900 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>นำเข้าจากไฟล์ Excel (.xlsx / .xls / .csv)</span>
          </button>

          <button
            onClick={() => setActiveTab('pdf')}
            className={`pb-3 px-4 text-xs sm:text-sm font-semibold flex items-center space-x-2 border-b-2 transition cursor-pointer ${
              activeTab === 'pdf'
                ? 'border-teal-700 text-teal-900 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <FileText className="w-4 h-4 text-teal-700" />
            <span>นำเข้าเอกสาร PDF (AI สกัดข้อมูลอัตโนมัติ)</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: EXCEL IMPORT */}
        {/* ============================================================== */}
        {activeTab === 'excel' && (
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            
            {/* File drop zone & Template download */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-emerald-950 font-['Prompt']">
                    เลือกหรือลากไฟล์ Excel เข้ามา
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    รองรับทุกรูปแบบไฟล์ (.xlsx, .xls, .csv) จาก HOSxP, GPO หรือ Template รพ. พร้อมระบบตรวจจับคอลัมน์และแปลงปี พ.ศ. อัตโนมัติ
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={downloadExcelTemplate}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>ดาวน์โหลด Template</span>
                </button>

                <label className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg cursor-pointer shadow-xs transition">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>เลือกไฟล์ Excel</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleExcelDrop}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Error Message */}
            {excelError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{excelError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMappingTool(true)}
                  className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950"
                >
                  เปิดเครื่องมือจับคู่คอลัมน์
                </button>
              </div>
            )}

            {/* Parsing Indicator */}
            {isParsingExcel && (
              <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
                <p className="text-xs font-medium">กำลังอ่านและจัดเรียงข้อมูลในไฟล์ Excel...</p>
              </div>
            )}

            {/* Column Mapping Tool Accordion */}
            {excelFile && (
              <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowMappingTool(!showMappingTool)}
                    className="flex items-center space-x-1.5 text-xs font-bold text-emerald-900 hover:underline cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>⚙️ ปรับการจับคู่คอลัมน์ด้วยตนเอง (Column Mapping Tool)</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (ใช้กรณีคอลัมน์ในไฟล์ Excel ของท่านมีชื่อเฉพาะ)
                    </span>
                  </button>
                  <span className="text-[11px] text-slate-500">
                    ไฟล์: <strong className="text-slate-700">{excelFile.name}</strong>
                  </span>
                </div>

                {showMappingTool && workbookInfo && (
                  <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                    {/* Sheet selector */}
                    {workbookInfo.sheetNames.length > 1 && (
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="font-semibold text-slate-700">เลือกชีท (Sheet):</span>
                        <select
                          value={selectedSheet}
                          onChange={(e) => setSelectedSheet(e.target.value)}
                          className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          {workbookInfo.sheetNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Mapping Selectors */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์ชื่อยา *</label>
                        <select
                          value={customMapping.nameCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, nameCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์วันหมดอายุ</label>
                        <select
                          value={customMapping.expiryCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, expiryCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์จำนวนคงเหลือ</label>
                        <select
                          value={customMapping.quantityCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, quantityCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์ Lot No.</label>
                        <select
                          value={customMapping.lotCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, lotCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์ Shelf (ชั้นวาง)</label>
                        <select
                          value={customMapping.shelfCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, shelfCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์หน่วยนับ</label>
                        <select
                          value={customMapping.unitCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, unitCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">คอลัมน์บริษัทผู้ผลิต</label>
                        <select
                          value={customMapping.companyCol}
                          onChange={(e) => setCustomMapping({ ...customMapping, companyCol: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value={-1}>-- ตรวจจับอัตโนมัติ --</option>
                          {workbookInfo.headers.map((h, i) => (
                            <option key={i} value={i}>คอลัมน์ {i + 1}: {h || `(ไม่มีชื่อ)`}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleApplyCustomMapping}
                          className="w-full px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded font-bold text-xs shadow-xs transition cursor-pointer"
                        >
                          ประมวลผลไฟล์ใหม่
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Parsed Table Preview */}
            {!isParsingExcel && parsedRows.length > 0 && (
              <div className="space-y-3">
                {/* Preview Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex items-center space-x-3 text-xs text-slate-700">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-emerald-800 hover:text-emerald-950 underline font-semibold cursor-pointer"
                    >
                      {selectedIndices.size === parsedRows.length ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                    </button>
                    <span className="font-medium">
                      • เลือกแล้ว <strong className="text-emerald-800 font-bold">{selectedIndices.size}</strong> จาก {parsedRows.length} รายการ
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleClearExcel}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                      title="เคลียร์รายการที่อ่านเข้ามาและเลือกไฟล์ใหม่"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>เคลียร์ข้อมูล / อัปไฟล์ใหม่</span>
                    </button>
                  </div>
                </div>

                {/* Batch Tools */}
                <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 text-emerald-950 font-medium">
                    <span>⚡ กำหนดคลังย่อย ({selectedIndices.size} รายการ):</span>
                    <button
                      type="button"
                      onClick={() => handleBatchChangeSubWarehouse('OPD')}
                      disabled={selectedIndices.size === 0}
                      className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold disabled:opacity-40 transition cursor-pointer"
                    >
                      OPD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchChangeSubWarehouse('IPD')}
                      disabled={selectedIndices.size === 0}
                      className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold disabled:opacity-40 transition cursor-pointer"
                    >
                      IPD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchChangeSubWarehouse('ER')}
                      disabled={selectedIndices.size === 0}
                      className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold disabled:opacity-40 transition cursor-pointer"
                    >
                      ER
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchChangeSubWarehouse('คลังใหญ่ (Main)')}
                      disabled={selectedIndices.size === 0}
                      className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold disabled:opacity-40 transition cursor-pointer"
                    >
                      คลังใหญ่
                    </button>
                  </div>

                  {/* Batch set expiry & shelf */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-1">
                      <input
                        type="date"
                        value={batchExpiryInput}
                        onChange={(e) => setBatchExpiryInput(e.target.value)}
                        className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleBatchSetExpiry}
                        disabled={!batchExpiryInput || selectedIndices.size === 0}
                        className="px-2 py-0.5 bg-teal-800 text-white rounded font-medium disabled:opacity-40 text-xs hover:bg-teal-900 cursor-pointer"
                      >
                        ตั้งวันหมดอายุ
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        placeholder="เช่น A1-01"
                        value={batchShelfInput}
                        onChange={(e) => setBatchShelfInput(e.target.value)}
                        className="w-20 px-2 py-0.5 bg-white border border-slate-300 rounded text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleBatchSetShelf}
                        disabled={!batchShelfInput || selectedIndices.size === 0}
                        className="px-2 py-0.5 bg-teal-800 text-white rounded font-medium disabled:opacity-40 text-xs hover:bg-teal-900 cursor-pointer"
                      >
                        ตั้งชั้นวาง
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="p-2 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIndices.size === parsedRows.length && parsedRows.length > 0}
                              onChange={toggleSelectAll}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                          </th>
                          <th className="p-2 min-w-[180px]">ชื่อยา</th>
                          <th className="p-2 min-w-[70px]">Shelf</th>
                          <th className="p-2 min-w-[90px]">Lot No.</th>
                          <th className="p-2 min-w-[100px]">วันหมดอายุ</th>
                          <th className="p-2 min-w-[70px]">คงเหลือ</th>
                          <th className="p-2 min-w-[60px]">หน่วย</th>
                          <th className="p-2 min-w-[110px]">คลังย่อย</th>
                          <th className="p-2 min-w-[140px]">บริษัท</th>
                          <th className="p-2 w-10 text-center">ลบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((row, idx) => {
                          const isSelected = selectedIndices.has(idx);
                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-slate-50 transition ${
                                isSelected ? 'bg-emerald-50/30' : 'opacity-60 bg-white'
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectRow(idx)}
                                  className="rounded text-emerald-600 focus:ring-emerald-500"
                                />
                              </td>
                              <td className="p-2 font-medium text-slate-800">
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) => handleUpdateRowField(idx, 'name', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent"
                                />
                                {row.validationError && (
                                  <span className="text-[10px] text-rose-500 block">⚠️ {row.validationError}</span>
                                )}
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.shelf}
                                  onChange={(e) => handleUpdateRowField(idx, 'shelf', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.lot}
                                  onChange={(e) => handleUpdateRowField(idx, 'lot', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="date"
                                  value={row.expiryDate}
                                  onChange={(e) => handleUpdateRowField(idx, 'expiryDate', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent text-slate-700"
                                />
                                {row.isDateEstimated && (
                                  <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded block mt-0.5 font-medium">
                                    📅 ระบบช่วยประมาณวันหมดอายุ
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={row.quantity}
                                  onChange={(e) => handleUpdateRowField(idx, 'quantity', Number(e.target.value))}
                                  className="w-16 px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent font-bold text-slate-800"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.unit}
                                  onChange={(e) => handleUpdateRowField(idx, 'unit', e.target.value)}
                                  className="w-14 px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={row.subWarehouse}
                                  onChange={(e) => handleUpdateRowField(idx, 'subWarehouse', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent text-slate-700"
                                >
                                  <option value="OPD">OPD</option>
                                  <option value="IPD">IPD</option>
                                  <option value="ER">ER</option>
                                  <option value="คลังใหญ่ (Main)">คลังใหญ่</option>
                                </select>
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.company}
                                  onChange={(e) => handleUpdateRowField(idx, 'company', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePreviewRow(idx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  title="ลบรายการนี้"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Import Action Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    💡 ระบบจะทำการผสานข้อมูล (Smart Merge) ตามรหัสยา และชื่อ+Lot อัตโนมัติ พร้อมซิงค์ลง Google Sheet
                  </span>

                  <button
                    type="button"
                    onClick={handleConfirmImportExcel}
                    disabled={selectedIndices.size === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>นำเข้ารายการยาที่เลือก ({selectedIndices.size} รายการ) เข้าสู่คลังยา</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: PDF DOCUMENT IMPORT & AI EXTRACTION */}
        {/* ============================================================== */}
        {activeTab === 'pdf' && (
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            
            {/* Google Drive Header Notice */}
            <div className="bg-teal-50/70 p-3.5 rounded-xl border border-teal-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-teal-950 font-['Prompt'] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>ระบบ AI สกัดรายการยาจาก PDF (ใบส่งของ / ใบกำกับภาษี / ใบส่งมอบ GPO)</span>
                </h4>
                <p className="text-[11px] text-teal-800">
                  อัปโหลดไฟล์ PDF ระบบจะอ่านชื่อยา, Lot, วันหมดอายุ, จำนวน, และหน่วยนับให้อัตโนมัติ พร้อมจัดเก็บลง Google Drive Folder: {gasConfig.folderId}
                </p>
              </div>
              <a
                href={`https://drive.google.com/drive/folders/${gasConfig.folderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-xs text-teal-900 hover:underline font-semibold"
              >
                <span>เปิดโฟลเดอร์ Drive</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* PDF File Picker & Drop Zone */}
            <div className="border-2 border-dashed border-teal-300 bg-teal-50/30 hover:bg-teal-50/60 transition rounded-2xl p-5 text-center">
              <label className="cursor-pointer block space-y-2">
                <FileText className="w-10 h-10 text-teal-700 mx-auto" />
                <span className="text-xs sm:text-sm font-bold text-slate-800 font-['Prompt'] block">
                  {pdfFile ? pdfFile.name : 'คลิกเพื่อเลือกไฟล์เอกสาร PDF หรือลากไฟล์มาวาง'}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {pdfFile ? `${(pdfFile.size / 1024).toFixed(1)} KB` : 'รองรับไฟล์ PDF ใบส่งมอบยาจากองค์การเภสัชกรรม (GPO) หรือบริษัทยา'}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfFile}
                  className="sr-only"
                />
              </label>
            </div>

            {/* AI Parsing Indicator */}
            {isExtractingPdf && (
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-center space-x-3 text-teal-900">
                <Loader2 className="w-5 h-5 animate-spin text-teal-700" />
                <div className="text-xs">
                  <strong className="block">กำลังวิเคราะห์และสกัดรายการยาจากเอกสาร PDF ด้วย AI...</strong>
                  <span className="text-teal-700 text-[11px]">ระบบกำลังอ่านชื่อยา, เลข Lot, วันหมดอายุ และจำนวน จากเอกสาร</span>
                </div>
              </div>
            )}

            {/* Error */}
            {pdfError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{pdfError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPdfPasteTool(true)}
                  className="text-xs font-bold text-teal-900 underline"
                >
                  ใช้วิธีวางข้อความจาก PDF แทน
                </button>
              </div>
            )}

            {/* PDF Document Summary Card (if AI succeeded) */}
            {pdfDocInfo && (
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-teal-950 font-['Prompt'] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{pdfDocInfo.title || 'เอกสารรับเข้าคลังยา'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    {pdfDocInfo.vendor && <span>บริษัท: <strong className="text-slate-800">{pdfDocInfo.vendor}</strong></span>}
                    {pdfDocInfo.number && <span>เลขที่: <strong className="text-slate-800">{pdfDocInfo.number}</strong></span>}
                    {pdfDocInfo.date && <span>วันที่เอกสาร: <strong className="text-slate-800">{pdfDocInfo.date}</strong></span>}
                    <span>สกัดได้: <strong className="text-emerald-800">{pdfExtractedRows.length} รายการ</strong></span>
                  </div>
                </div>

                {/* Drive Upload Action */}
                <div>
                  {pdfUploadResult ? (
                    <a
                      href={pdfUploadResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg font-semibold text-xs transition"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>อัปโหลดเข้า Drive แล้ว (คลิกดูไฟล์)</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUploadPdfToDrive}
                      disabled={isUploadingPdf}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white rounded-lg font-semibold text-xs shadow-xs transition cursor-pointer"
                    >
                      {isUploadingPdf ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>กำลังอัปโหลดเข้า Drive...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>จัดเก็บเอกสารเข้า Google Drive Folder</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Paste Text Tool Toggle (Fallback) */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <button
                type="button"
                onClick={() => setShowPdfPasteTool(!showPdfPasteTool)}
                className="text-teal-800 hover:underline font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <span>{showPdfPasteTool ? '▲ ปิดเครื่องมือวางข้อความ' : '▼ ไม่สามารถอ่าน PDF ได้? คลิกเพื่อคัดลอกข้อความใน PDF มาวางตรงนี้ (Paste Text Table)'}</span>
              </button>
              {pdfExtractedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    setPdfExtractedRows([]);
                    setPdfSelectedIndices(new Set());
                    setPdfDocInfo(null);
                  }}
                  className="text-rose-600 hover:underline cursor-pointer"
                >
                  ล้างรายการที่สกัดและเลือกไฟล์ใหม่
                </button>
              )}
            </div>

            {showPdfPasteTool && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  คัดลอกตารางหรือข้อความจากเอกสาร PDF / ใบเสร็จ แล้วนำมาวางในช่องนี้:
                </label>
                <textarea
                  value={pdfPastedText}
                  onChange={(e) => setPdfPastedText(e.target.value)}
                  placeholder="ตัวอย่างการวาง:
Paracetamol 500mg	GPO6701	2026-12-31	500	เม็ด
Amoxicillin 500mg	AMX2401	2026-06-30	100	แคปซูล"
                  rows={4}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParsePastedText}
                    disabled={!pdfPastedText.trim()}
                    className="px-4 py-1.5 bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    แปลงข้อความเป็นรายการยา
                  </button>
                </div>
              </div>
            )}

            {/* Extracted Drugs Table Preview */}
            {!isExtractingPdf && pdfExtractedRows.length > 0 && (
              <div className="space-y-3">
                {/* Preview Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex items-center space-x-3 text-xs text-slate-700">
                    <button
                      onClick={toggleSelectAllPdf}
                      className="text-xs text-teal-800 hover:text-teal-950 underline font-semibold cursor-pointer"
                    >
                      {pdfSelectedIndices.size === pdfExtractedRows.length ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                    </button>
                    <span className="font-medium">
                      • เลือกแล้ว <strong className="text-teal-800 font-bold">{pdfSelectedIndices.size}</strong> จาก {pdfExtractedRows.length} รายการ
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs">
                    <span className="text-slate-500 font-medium">⚡ คลังย่อย:</span>
                    <button
                      type="button"
                      onClick={() => handleBatchChangePdfSubWarehouse('OPD')}
                      className="px-2 py-0.5 bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 rounded font-bold cursor-pointer"
                    >
                      OPD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchChangePdfSubWarehouse('IPD')}
                      className="px-2 py-0.5 bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 rounded font-bold cursor-pointer"
                    >
                      IPD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchChangePdfSubWarehouse('ER')}
                      className="px-2 py-0.5 bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 rounded font-bold cursor-pointer"
                    >
                      ER
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchChangePdfSubWarehouse('คลังใหญ่ (Main)')}
                      className="px-2 py-0.5 bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 rounded font-bold cursor-pointer"
                    >
                      คลังใหญ่
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="p-2 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={pdfSelectedIndices.size === pdfExtractedRows.length && pdfExtractedRows.length > 0}
                              onChange={toggleSelectAllPdf}
                              className="rounded text-teal-600 focus:ring-teal-500"
                            />
                          </th>
                          <th className="p-2 min-w-[180px]">ชื่อยา</th>
                          <th className="p-2 min-w-[70px]">Shelf</th>
                          <th className="p-2 min-w-[90px]">Lot No.</th>
                          <th className="p-2 min-w-[100px]">วันหมดอายุ</th>
                          <th className="p-2 min-w-[70px]">จำนวนรับ</th>
                          <th className="p-2 min-w-[60px]">หน่วย</th>
                          <th className="p-2 min-w-[110px]">คลังย่อย</th>
                          <th className="p-2 min-w-[140px]">บริษัท</th>
                          <th className="p-2 w-10 text-center">ลบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pdfExtractedRows.map((row, idx) => {
                          const isSelected = pdfSelectedIndices.has(idx);
                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-slate-50 transition ${
                                isSelected ? 'bg-teal-50/40' : 'opacity-60 bg-white'
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectPdfRow(idx)}
                                  className="rounded text-teal-600 focus:ring-teal-500"
                                />
                              </td>
                              <td className="p-2 font-medium text-slate-800">
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'name', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.shelf}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'shelf', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.lot}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'lot', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="date"
                                  value={row.expiryDate}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'expiryDate', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent text-slate-700"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={row.quantity}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'quantity', Number(e.target.value))}
                                  className="w-16 px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent font-bold text-slate-800"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.unit}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'unit', e.target.value)}
                                  className="w-14 px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={row.subWarehouse}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'subWarehouse', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent text-slate-700"
                                >
                                  <option value="OPD">OPD</option>
                                  <option value="IPD">IPD</option>
                                  <option value="ER">ER</option>
                                  <option value="คลังใหญ่ (Main)">คลังใหญ่</option>
                                </select>
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.company}
                                  onChange={(e) => handleUpdatePdfRowField(idx, 'company', e.target.value)}
                                  className="w-full px-1.5 py-0.5 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent text-slate-600"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePdfRow(idx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  title="ลบรายการนี้"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Import Action Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    💡 ข้อมูลที่นำเข้าจะถูกซิงค์ลง Google Sheet และแจ้งเตือน Telegram อัตโนมัติ
                  </span>

                  <button
                    type="button"
                    onClick={handleConfirmImportPdf}
                    disabled={pdfSelectedIndices.size === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-2.5 bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>นำเข้ารายการยาจาก PDF ที่เลือก ({pdfSelectedIndices.size} รายการ) เข้าสู่คลังยา</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
