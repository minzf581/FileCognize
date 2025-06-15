const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
// pdf-to-img将在需要时动态导入
const XLSX = require('xlsx');
const ExcelJS = require('exceljs'); // 添加ExcelJS库以更好地保持格式
// 移除libreoffice-convert库，改用命令行方式
const { promisify } = require('util');
const { ocrService, DESCRIZIONE_OPTIONS } = require('./ocr-service');
require('dotenv').config();

// Excel到PDF转换函数
async function convertExcelToPDF(excelPath, pdfPath) {
  try {
    console.log(`📄 开始将Excel转换为PDF: ${excelPath} -> ${pdfPath}`);
    
    // 首先尝试修复Excel文件中的字体设置
    await fixExcelFonts(excelPath);
    
    // 使用命令行方式调用LibreOffice，确保字符编码正确
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // 构建LibreOffice命令，设置环境变量确保字体正确
    const outputDir = path.dirname(pdfPath);
    
    // 设置环境变量以确保字体正确显示
    const env = {
      ...process.env,
      'LC_ALL': 'en_US.UTF-8',
      'LANG': 'en_US.UTF-8',
      'SAL_USE_VCLPLUGIN': 'gen'
    };
    
    const command = `/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf --outdir "${outputDir}" "${excelPath}"`;
    
    console.log(`🔧 执行命令: ${command}`);
    console.log(`📁 输出目录: ${outputDir}`);
    console.log(`📄 输入文件: ${excelPath}`);
    
    // 执行转换命令，使用设置的环境变量
    const { stdout, stderr } = await execAsync(command, { env });
    
    if (stderr) {
      console.log(`⚠️ LibreOffice警告: ${stderr}`);
    }
    
    if (stdout) {
      console.log(`📝 LibreOffice输出: ${stdout}`);
    }
    
    // 检查PDF文件是否生成成功
    const expectedPdfPath = path.join(outputDir, path.basename(excelPath, path.extname(excelPath)) + '.pdf');
    
    if (fs.existsSync(expectedPdfPath)) {
      // 如果生成的PDF文件名与期望的不同，重命名它
      if (expectedPdfPath !== pdfPath) {
        fs.renameSync(expectedPdfPath, pdfPath);
      }
      console.log(`✅ Excel转PDF完成: ${pdfPath}`);
      return true;
    } else {
      throw new Error('PDF文件生成失败');
    }
    
  } catch (error) {
    console.error('❌ Excel转PDF失败:', error);
    throw error;
  }
}

// 修复Excel文件中的字体设置
async function fixExcelFonts(excelPath) {
  try {
    console.log(`🔧 修复Excel文件字体设置: ${excelPath}`);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    
    // 遍历所有工作表
    workbook.eachSheet((worksheet) => {
      // 遍历所有行
      worksheet.eachRow((row) => {
        // 遍历所有单元格
        row.eachCell((cell) => {
          if (cell.value && typeof cell.value === 'string') {
            // 设置字体为支持中文的字体
            cell.font = {
              name: 'Arial Unicode MS', // 支持多语言的字体
              size: cell.font?.size || 11,
              bold: cell.font?.bold || false,
              italic: cell.font?.italic || false
            };
          }
        });
      });
    });
    
    // 保存修改后的文件
    await workbook.xlsx.writeFile(excelPath);
    console.log(`✅ Excel字体设置修复完成`);
    
  } catch (error) {
    console.log(`⚠️ Excel字体修复失败，继续使用原文件: ${error.message}`);
  }
}

// 全局错误处理 - 防止进程崩溃
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message);
  console.error('堆栈:', error.stack);
  console.error('时间:', new Date().toISOString());
  
  // 如果是Tesseract.js相关错误，记录详细信息
  if (error.message.includes('SetImageFile') || error.message.includes('tesseract')) {
    console.error('🔍 检测到Tesseract.js相关错误');
    console.error('错误类型:', error.constructor.name);
    console.error('错误代码:', error.code);
  }
  
  // 不退出进程，继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
  console.error('时间:', new Date().toISOString());
  
  // 如果是Tesseract.js相关错误，记录详细信息
  if (reason && reason.message && (reason.message.includes('SetImageFile') || reason.message.includes('tesseract'))) {
    console.error('🔍 检测到Tesseract.js相关Promise拒绝');
    console.error('拒绝原因类型:', reason.constructor.name);
  }
  
  // 不退出进程，继续运行
});

const app = express();
const PORT = process.env.PORT || 5000;

// 缺省模板配置
const DEFAULT_TEMPLATE = {
  name: 'default_template',
  description: '缺省运输单据模板',
  outputFile: 'output.xlsx',
  mapping: {
    // 从输入图片中提取的字段映射到输出Excel的位置
    'Numero Documento': { // 录单号
      outputColumn: 'G', // IMPORTO列
      outputRow: 11, // 第11行开始
      description: '录单号写入IMPORTO列'
    },
    'Quantita': { // 长度
      outputColumn: 'A', // QUANTITA列  
      outputRow: 11,
      description: '长度写入QUANTITA列'
    },
    'Descrizione Articolo': { // 加工内容
      outputColumn: 'B', // DESCRIZIONE DEI BENI列
      outputRow: 11,
      description: '加工内容写入DESCRIZIONE DEI BENI列',
      valueMapping: {
        'NS .CERNIERE A SCORCIARE': 'NS .CERNIERE A SCORCIARE',
        'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS': 'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS',
        'CERNIERE A MONTARE CURSORE': 'CERNIERE A MONTARE CURSORE',
        'CERNIERE A MONTARE TIRETTO': 'CERNIERE A MONTARE TIRETTO'
      }
    }
  }
};

// 格式化识别数据函数
function formatRecognizedData(extractedFields) {
  const formatted = { ...extractedFields };
  
  console.log('🔧 开始格式化识别数据:', Object.keys(formatted));
  
  // 1. Quantita前面加上"N'"表示根数
  if (formatted['Quantita'] && formatted['Quantita'] !== '未识别') {
    const quantita = formatted['Quantita'].toString().trim();
    if (quantita && !quantita.startsWith('N\'')) {
      const oldValue = formatted['Quantita'];
      formatted['Quantita'] = `N' ${quantita}`;
      console.log(`📊 格式化Quantita: ${oldValue} → ${formatted['Quantita']}`);
    }
  }
  
  // 2. Descrizione Articolo 特殊处理
  if (formatted['Descrizione Articolo'] && formatted['Descrizione Articolo'] !== '未识别') {
    let descrizione = formatted['Descrizione Articolo'].toString().trim();
    const originalDescrizione = descrizione;
    
    // 替换 "A SCORCIARE" 为 "DA SCORCIARE"
    if (descrizione.includes('A SCORCIARE')) {
      descrizione = descrizione.replace(/A SCORCIARE/g, 'DA SCORCIARE');
      console.log(`📝 替换内容: A SCORCIARE → DA SCORCIARE`);
    }
    
    // 后面加上"DDT"表示单据
    if (!descrizione.endsWith(' DDT')) {
      descrizione = `${descrizione} DDT`;
      console.log(`📝 添加DDT标识`);
    }
    
    if (descrizione !== originalDescrizione) {
      formatted['Descrizione Articolo'] = descrizione;
      console.log(`📝 Descrizione最终结果: ${originalDescrizione} → ${descrizione}`);
    }
  }
  
  console.log('✅ 数据格式化完成');
  return formatted;
}

// 分析模板结构的辅助函数 - 精确提取指定字段
function analyzeTemplateStructure(text) {
  try {
    console.log('开始精确提取数据...');
    
    const structure = {
      headers: [],
      sections: [],
      tables: [],
      suggestedMapping: {},
      extractedData: {}
    };

    // 查找意大利语表格标题和结构
    const tableIndicators = ['Numero Documento', 'Quantita', 'Descrizione Articolo', 'QUANTITA', 'DESCRIZIONE', 'IMPORTO'];
    
    // 1. 提取Numero Documento (录单号) - 写入IMPORTO列
    console.log('提取Numero Documento...');
    const numeroPatterns = [
      /\|\s*([0-9]+\/[a-zA-Z]+)\s*\|\s*[0-9]{2}\/[0-9]{2}\/[0-9]{4}/i, // | 549/s | 10/03/2025 格式
      /\[01107\s*\|\s*([^|\s]+\/[^|\s]+)\s*\|/i,   // 匹配 [01107 | 549/s | 格式
      /\|\s*([0-9]+\/[a-zA-Z]+)\s*\|\s*[0-9]/i,   // 匹配 | 549/s | 日期 格式
      /\|\s*\d+\s*\|\s*([^|\s]+\/[^|\s]+)\s*\|/i, // 匹配表格中的 | 数字 | 549/s | 格式
      /([0-9]+\/[a-zA-Z]+)\s+[0-9]{2}\/[0-9]{2}\/[0-9]{4}/i, // 549/s 10/03/2025 格式
      /Numero\s+Documento[:\s]*([^\s\n|]+)/i       // 标准格式
    ];
    
    for (const pattern of numeroPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1] !== 'Data' && match[1].includes('/')) {
        structure.extractedData['Numero Documento'] = match[1].trim();
        console.log('✅ 找到Numero Documento:', match[1].trim());
        break;
      }
    }

    // 2. 提取Quantità (数量) - 写入QUANTITA列
    console.log('提取Quantita...');
    const quantitaPatterns = [
      /VARIE\s+MISURE\s+PZ\s+[0-9]+\s+MT\s*["|']\s*([0-9]+[,.]?[0-9]*)\s*["|']/i, // VARIE MISURE PZ 246 MT " 105,00 '
      /MT\s*["|']\s*([0-9]+[,.]?[0-9]*)\s*["|']/i,        // MT " 105,00 '
      /PZ\s+[0-9]+\s+MT\s*["|']\s*([0-9]+[,.]?[0-9]*)/i,  // PZ 246 MT " 105,00
      /\|\s*([0-9]+[,.]?[0-9]*)\s*\|\s*$/m,         // 行末的数字
      /quantità[:\s]*\|\s*([^|\n]+)\s*\|/i,         // quantità列
      /([0-9]+[,.]?[0-9]*)\s*["|']\s*$/m            // 行末带引号的数字
    ];
    
    for (const pattern of quantitaPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        const numValue = parseFloat(value.replace(',', '.'));
        if (numValue > 1) { // 确保是有意义的数量
          structure.extractedData['Quantita'] = value;
          console.log('✅ 找到Quantita:', value);
          break;
        }
      }
    }

    // 3. 提取Descrizione Articolo (加工内容) - 写入DESCRIZIONE DEI BENI列
    console.log('提取Descrizione Articolo...');
    
    // 从真实OCR结果中提取描述
    const descrizionePatterns = [
      /METALLOFIS\s+(CATENA\s+CONTINUA\s+METALLO[^"|']*)/i, // METALLOFIS CATENA CONTINUA METALLO...
      /(CATENA\s+CONTINUA\s+METALLO[^"|']*?)(?:\s+PZ|\s+MT|\s*["|'])/i, // CATENA CONTINUA METALLO... 直到PZ或MT
      /(NS\s*\.?\s*CERNIERE\s+A\s+SCORCIARE)/i,           // NS .CERNIERE A SCORCIARE
      /(CERNIERE\s+A\s+MONTARE\s+CURSORE)/i,              // CERNIERE A MONTARE CURSORE
      /(CERNIERE\s+A\s+MONTARE\s+TIRETTO)/i               // CERNIERE A MONTARE TIRETTO
    ];

    let foundDescription = null;
    
    for (const pattern of descrizionePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        foundDescription = match[1].trim();
        console.log('✅ 找到Descrizione Articolo:', foundDescription);
        break;
      }
    }

    // 如果没有找到完整描述，尝试标准化匹配
    if (!foundDescription) {
      console.log('尝试标准化匹配...');
      
      if (/CATENA.*CONTINUA.*METALLO/i.test(text)) {
        foundDescription = 'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS';
        console.log('✅ 标准化匹配到: CATENA CONTINUA METALLO');
      } else if (/NS.*CERNIERE.*SCORCIARE/i.test(text)) {
        foundDescription = 'NS .CERNIERE A SCORCIARE';
        console.log('✅ 标准化匹配到: NS CERNIERE A SCORCIARE');
      } else if (/CERNIERE.*CURSORE/i.test(text)) {
        foundDescription = 'CERNIERE A MONTARE CURSORE';
        console.log('✅ 标准化匹配到: CERNIERE CURSORE');
      } else if (/CERNIERE.*TIRETTO/i.test(text)) {
        foundDescription = 'CERNIERE A MONTARE TIRETTO';
        console.log('✅ 标准化匹配到: CERNIERE TIRETTO');
      }
    }

    if (foundDescription) {
      structure.extractedData['Descrizione Articolo'] = foundDescription;
    } else {
      console.log('❌ 未找到匹配的Descrizione Articolo');
    }

    // 使用缺省模板的映射关系
    structure.suggestedMapping = DEFAULT_TEMPLATE.mapping;
    
    console.log('📊 最终提取的数据:', structure.extractedData);
    
    return structure;
  } catch (error) {
    console.error('分析模板结构错误:', error);
    return {
      headers: [],
      sections: [],
      tables: [],
      suggestedMapping: {},
      extractedData: {}
    };
  }
}

// 处理缺省模板数据的函数
function processDefaultTemplate(extractedData) {
  try {
    const result = {
      success: true,
      data: [],
      mapping: DEFAULT_TEMPLATE.mapping
    };
    
    // 处理Descrizione Articolo的值映射
    let descrizioneValue = extractedData['Descrizione Articolo'] || '';
    if (descrizioneValue) {
      // 检查是否匹配预定义的加工内容
      const valueMapping = DEFAULT_TEMPLATE.mapping['Descrizione Articolo'].valueMapping;
      for (const [key, value] of Object.entries(valueMapping)) {
        if (descrizioneValue.includes(key) || descrizioneValue.toLowerCase().includes(key.toLowerCase())) {
          descrizioneValue = value;
          break;
        }
      }
    }
    
    // 构建输出数据
    const outputData = {
      'Numero Documento': extractedData['Numero Documento'] || '',
      'Quantita': extractedData['Quantita'] || '',
      'Descrizione Articolo': descrizioneValue
    };
    
    result.data.push(outputData);
    return result;
  } catch (error) {
    console.error('处理缺省模板数据错误:', error);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false // 为了支持前端资源加载
}));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100 // 限制每个IP 15分钟内最多100个请求
});
app.use(limiter);

// CORS配置
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? true  // 允许所有来源，因为域名可能变化
    : ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务 - 提供新的前端页面
app.use(express.static('public'));

// 创建uploads目录
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 创建templates目录
const templatesDir = path.join(__dirname, 'templates');
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}

// Multer配置 - 文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.body.uploadType || 'upload';
    let targetDir;
    
    switch (uploadType) {
      case 'template':
      case 'template_input':
      case 'template_output':
        targetDir = templatesDir;
        break;
      default:
        targetDir = uploadsDir;
    }
    
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const uploadType = req.body.uploadType || 'upload';
    
    let prefix;
    switch (uploadType) {
      case 'template':
        prefix = 'template';
        break;
      case 'template_input':
        prefix = 'template_input';
        break;
      case 'template_output':
        prefix = 'template_output';
        break;
      default:
        prefix = 'upload';
    }
    
    cb(null, `${prefix}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    const uploadType = req.body.uploadType || 'upload';
    
    if (uploadType === 'template' || uploadType === 'template_output') {
      // 模板文件支持Excel、JSON和PDF
      if (file.mimetype.includes('spreadsheet') || 
          file.mimetype.includes('excel') || 
          file.mimetype === 'application/json' ||
          file.mimetype === 'application/pdf' ||
          file.originalname.match(/\.(xlsx|xls|json|pdf)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('模板文件只支持Excel(.xlsx, .xls)、JSON和PDF格式'), false);
      }
    } else if (uploadType === 'template_input') {
      // 输入文件支持图片和PDF
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('输入文件只支持图片格式和PDF文件'), false);
      }
    } else {
      // 普通文件支持图片、PDF和Excel文件
      if (file.mimetype.startsWith('image/') || 
          file.mimetype === 'application/pdf' ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.match(/\.(xlsx|xls)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('只支持图片格式文件、PDF文件和Excel文件(.xlsx, .xls)'), false);
      }
    }
  }
});

// 文件上传API
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const fileInfo = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      mimetype: req.file.mimetype
    };

    // 如果是PDF文件，尝试提取文本
    if (req.file.mimetype === 'application/pdf') {
      try {
        console.log('开始解析PDF文件:', req.file.originalname);
        const pdfBuffer = fs.readFileSync(req.file.path);
        console.log('PDF文件大小:', pdfBuffer.length, 'bytes');
        
        const pdfData = await pdfParse(pdfBuffer);
        console.log('PDF解析结果:');
        console.log('- 页数:', pdfData.numpages);
        console.log('- 文本长度:', pdfData.text.length);
        console.log('- 前200个字符:', pdfData.text.substring(0, 200));
        console.log('- 是否为空:', pdfData.text.trim().length === 0);
        
        fileInfo.extractedText = pdfData.text;
        fileInfo.pageCount = pdfData.numpages;
        
        // 如果文本为空，提供提示
        if (pdfData.text.trim().length === 0) {
          fileInfo.pdfError = 'PDF文件为扫描版或无法提取文本内容，请尝试使用包含可选择文本的PDF文件';
          console.log('警告: PDF文本提取为空');
        }
        
        // 如果是输出模板PDF，额外提取结构信息
        if (req.body.uploadType === 'template_output') {
          fileInfo.templateStructure = analyzeTemplateStructure(pdfData.text);
          console.log('模板结构分析完成:', fileInfo.templateStructure);
        }
      } catch (pdfError) {
        console.error('PDF解析错误:', pdfError);
        fileInfo.extractedText = '';
        fileInfo.pdfError = 'PDF解析失败: ' + pdfError.message;
      }
    }

    // 如果是Excel文件，尝试提取数据
    if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        req.file.mimetype === 'application/vnd.ms-excel' ||
        req.file.originalname.match(/\.(xlsx|xls)$/i)) {
      try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetNames = workbook.SheetNames;
        const sheetsData = {};
        
        sheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          sheetsData[sheetName] = jsonData;
        });
        
        fileInfo.excelData = sheetsData;
        fileInfo.sheetNames = sheetNames;
        fileInfo.sheetCount = sheetNames.length;
      } catch (excelError) {
        console.error('Excel解析错误:', excelError);
        fileInfo.excelData = {};
        fileInfo.excelError = 'Excel解析失败，请尝试其他文件';
      }
    }

    res.json({
      success: true,
      message: '文件上传成功',
      file: fileInfo
    });

    // 清理临时文件 - 30分钟后删除
    setTimeout(() => {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }, 30 * 60 * 1000);

  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({ error: '文件上传失败' });
  }
});

// 获取缺省模板配置API
app.get('/api/default-template', (req, res) => {
  try {
    res.json({
      success: true,
      template: DEFAULT_TEMPLATE,
      outputFile: path.join(__dirname, '../output.xlsx')
    });
  } catch (error) {
    console.error('获取缺省模板错误:', error);
    res.status(500).json({ error: '获取缺省模板失败' });
  }
});

// 处理缺省模板数据API - 支持单个文档处理
app.post('/api/process-default-template', async (req, res) => {
  try {
    const { extractedText, imageData, sessionId } = req.body;
    
    if (!extractedText && !imageData) {
      return res.status(400).json({ error: '需要提供提取的文本或图像数据' });
    }
    
    // 分析文本结构并提取数据
    const structure = analyzeTemplateStructure(extractedText || '');
    const processedData = processDefaultTemplate(structure.extractedData);
    
    // 使用会话ID来管理连续输入，如果没有提供则创建新的
    const currentSessionId = sessionId || `session_${Date.now()}`;
    
    res.json({
      success: true,
      message: '文档数据提取完成',
      sessionId: currentSessionId,
      extractedData: structure.extractedData,
      processedData: processedData
    });
    
  } catch (error) {
    console.error('处理缺省模板错误:', error);
    res.status(500).json({ error: '处理缺省模板失败: ' + error.message });
  }
});

// 批量处理多个文档API
app.post('/api/process-multiple-documents', async (req, res) => {
  try {
    const { documents, sessionId } = req.body;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: '需要提供文档数组' });
    }
    
    console.log(`开始批量处理 ${documents.length} 个文档`);
    
    // 读取输出模板文件
    const outputPath = path.join(__dirname, '../output.xlsx');
    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({ error: '输出模板文件不存在' });
    }
    
    // 记录数据信息（用于前端显示和打印）
    const processedResults = [];
    
    // 处理每个文档
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`处理第 ${i + 1} 个文档`);
      
      try {
        // 分析文本结构并提取数据
        const structure = analyzeTemplateStructure(doc.extractedText || '');
        const processedData = processDefaultTemplate(structure.extractedData);
        
        if (processedData.success && processedData.data.length > 0) {
          const data = processedData.data[0];
          
          processedResults.push({
            documentIndex: i + 1,
            row: 11 + i, // 从第11行开始
            extractedData: structure.extractedData,
            processedData: data,
            success: true
          });
          
          console.log(`📝 批量文档 ${i + 1}:`);
          console.log(`  QUANTITA: ${data['Quantita'] || '无'}`);
          console.log(`  DESCRIZIONE: ${data['Descrizione Articolo'] || '无'}`);
          console.log(`  NUMERO DOCUMENTO: ${data['Numero Documento'] || '无'}`);
        } else {
          processedResults.push({
            documentIndex: i + 1,
            row: 11 + i,
            error: '数据提取失败',
            success: false
          });
        }
      } catch (docError) {
        console.error(`处理第 ${i + 1} 个文档时出错:`, docError);
        processedResults.push({
          documentIndex: i + 1,
          row: 11 + i,
          error: docError.message,
          success: false
        });
      }
    }
    
    // 生成新的Excel文件 - 使用文件复制保持格式
    const timestamp = Date.now();
    const outputFilename = `batch_processed_${timestamp}.xlsx`;
    const outputFilePath = path.join(uploadsDir, outputFilename);
    
    // 复制原始模板文件，保持100%原始格式
    const templatePath = path.join(__dirname, '../output.xlsx');
    fs.copyFileSync(templatePath, outputFilePath);
    console.log(`📋 批量处理：已复制原始模板保持格式`);
    
    const successCount = processedResults.filter(r => r.success).length;
    const failCount = processedResults.length - successCount;
    
    res.json({
      success: true,
      message: `批量处理完成: ${successCount} 个成功, ${failCount} 个失败`,
      sessionId: sessionId || `batch_${timestamp}`,
      totalDocuments: documents.length,
      successCount: successCount,
      failCount: failCount,
      results: processedResults,
      outputFile: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`
    });
    
  } catch (error) {
    console.error('批量处理错误:', error);
    res.status(500).json({ error: '批量处理失败: ' + error.message });
  }
});

// 添加文档到会话API
app.post('/api/add-document-to-session', async (req, res) => {
  try {
    const { extractedText, imageData, sessionId } = req.body;
    
    if (!extractedText && !imageData) {
      return res.status(400).json({ error: '需要提供提取的文本或图像数据' });
    }
    
    if (!sessionId) {
      return res.status(400).json({ error: '需要提供会话ID' });
    }
    
    // 分析文本结构并提取数据
    const structure = analyzeTemplateStructure(extractedText || '');
    const processedData = processDefaultTemplate(structure.extractedData);
    
    // 将数据存储到会话中（这里使用内存存储，生产环境建议使用数据库）
    if (!global.documentSessions) {
      global.documentSessions = {};
    }
    
    if (!global.documentSessions[sessionId]) {
      global.documentSessions[sessionId] = {
        documents: [],
        createdAt: new Date(),
        lastUpdated: new Date()
      };
    }
    
    global.documentSessions[sessionId].documents.push({
      extractedData: structure.extractedData,
      processedData: processedData,
      addedAt: new Date()
    });
    
    global.documentSessions[sessionId].lastUpdated = new Date();
    
    const documentCount = global.documentSessions[sessionId].documents.length;
    
    res.json({
      success: true,
      message: `文档已添加到会话，当前共有 ${documentCount} 个文档`,
      sessionId: sessionId,
      documentCount: documentCount,
      extractedData: structure.extractedData,
      processedData: processedData
    });
    
  } catch (error) {
    console.error('添加文档到会话错误:', error);
    res.status(500).json({ error: '添加文档失败: ' + error.message });
  }
});

// 生成会话Excel文件API
app.post('/api/generate-session-excel', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: '需要提供会话ID' });
    }
    
    if (!global.documentSessions || !global.documentSessions[sessionId]) {
      return res.status(404).json({ error: '会话不存在' });
    }
    
    const session = global.documentSessions[sessionId];
    const documents = session.documents;
    
    if (documents.length === 0) {
      return res.status(400).json({ error: '会话中没有文档' });
    }
    
    console.log(`为会话 ${sessionId} 生成Excel文件，包含 ${documents.length} 个文档`);
    
    // 读取输出模板文件
    const outputPath = path.join(__dirname, '../output.xlsx');
    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({ error: '输出模板文件不存在' });
    }
    
    // 记录数据信息（用于前端显示和打印）
    const processedResults = [];
    
    // 处理每个文档
    documents.forEach((doc, index) => {
      if (doc.processedData.success && doc.processedData.data.length > 0) {
        const data = doc.processedData.data[0];
        
        processedResults.push({
          documentIndex: index + 1,
          row: 11 + index, // 从第11行开始
          data: data,
          success: true
        });
        
        console.log(`📝 会话文档 ${index + 1}:`);
        console.log(`  QUANTITA: ${data['Quantita'] || '无'}`);
        console.log(`  DESCRIZIONE: ${data['Descrizione Articolo'] || '无'}`);
        console.log(`  NUMERO DOCUMENTO: ${data['Numero Documento'] || '无'}`);
      }
    });
    
    // 生成新的Excel文件 - 使用文件复制保持格式
    const timestamp = Date.now();
    const outputFilename = `session_${sessionId}_${timestamp}.xlsx`;
    const outputFilePath = path.join(uploadsDir, outputFilename);
    
    // 复制原始模板文件，保持100%原始格式
    fs.copyFileSync(outputPath, outputFilePath);
    console.log(`📋 会话Excel：已复制原始模板保持格式`);
    
    // 清理会话数据（可选）
    // delete global.documentSessions[sessionId];
    
    res.json({
      success: true,
      message: `会话Excel文件生成完成，包含 ${processedResults.length} 个文档`,
      sessionId: sessionId,
      documentCount: documents.length,
      processedCount: processedResults.length,
      results: processedResults,
      outputFile: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`
    });
    
  } catch (error) {
    console.error('生成会话Excel错误:', error);
    res.status(500).json({ error: '生成Excel失败: ' + error.message });
  }
});

// 获取会话信息API
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    if (!global.documentSessions || !global.documentSessions[sessionId]) {
      return res.status(404).json({ error: '会话不存在' });
    }
    
    const session = global.documentSessions[sessionId];
    
    res.json({
      success: true,
      sessionId: sessionId,
      documentCount: session.documents.length,
      createdAt: session.createdAt,
      lastUpdated: session.lastUpdated,
      documents: session.documents.map((doc, index) => ({
        index: index + 1,
        extractedData: doc.extractedData,
        addedAt: doc.addedAt,
        hasData: doc.processedData && doc.processedData.success
      }))
    });
    
  } catch (error) {
    console.error('获取会话信息错误:', error);
    res.status(500).json({ error: '获取会话信息失败' });
  }
});

// 获取所有会话列表API
app.get('/api/sessions', (req, res) => {
  try {
    if (!global.documentSessions) {
      return res.json({ sessions: [] });
    }
    
    const sessions = Object.keys(global.documentSessions).map(sessionId => {
      const session = global.documentSessions[sessionId];
      return {
        sessionId: sessionId,
        documentCount: session.documents.length,
        createdAt: session.createdAt,
        lastUpdated: session.lastUpdated
      };
    });
    
    // 按最后更新时间排序
    sessions.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    
    res.json({ sessions });
    
  } catch (error) {
    console.error('获取会话列表错误:', error);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

// 获取特定会话数据API
app.get('/api/sessions/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    if (!global.documentSessions || !global.documentSessions[sessionId]) {
      return res.status(404).json({ error: '会话不存在' });
    }
    
    const sessionData = global.documentSessions[sessionId];
    
    res.json({
      sessionId: sessionId,
      documents: sessionData.documents,
      createdAt: sessionData.createdAt,
      lastUpdated: sessionData.lastUpdated
    });
    
  } catch (error) {
    console.error('获取会话数据错误:', error);
    res.status(500).json({ error: '获取会话数据失败' });
  }
});

// 删除会话API
app.delete('/api/session/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    if (!global.documentSessions || !global.documentSessions[sessionId]) {
      return res.status(404).json({ error: '会话不存在' });
    }
    
    delete global.documentSessions[sessionId];
    
    res.json({
      success: true,
      message: '会话删除成功'
    });
    
  } catch (error) {
    console.error('删除会话错误:', error);
    res.status(500).json({ error: '删除会话失败' });
  }
});

// 模板管理API
app.get('/api/templates', (req, res) => {
  try {
    const templates = fs.readdirSync(templatesDir)
      .filter(file => file.match(/\.(xlsx|xls|json|pdf)$/i) && !file.endsWith('_config.json'))
      .map(file => {
        const filePath = path.join(templatesDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          originalname: file.replace(/^template_(input_|output_)?\d+_/, ''),
          size: stats.size,
          uploadTime: stats.mtime
        };
      });
    
    // 添加缺省模板到列表
    templates.unshift({
      filename: 'default_template',
      originalname: '缺省运输单据模板',
      size: 0,
      uploadTime: new Date(),
      isDefault: true
    });
    
    res.json({ templates });
  } catch (error) {
    console.error('获取模板列表错误:', error);
    res.status(500).json({ error: '获取模板列表失败' });
  }
});

// 保存模板配置API
app.post('/api/templates', (req, res) => {
  try {
    const { templateData } = req.body;
    
    if (!templateData || !templateData.filename) {
      return res.status(400).json({ error: '模板数据不完整' });
    }

    // 保存模板配置到JSON文件
    const configPath = path.join(templatesDir, `${templateData.filename}_config.json`);
    fs.writeFileSync(configPath, JSON.stringify(templateData, null, 2));
    
    res.json({ 
      success: true, 
      message: '模板保存成功',
      template: templateData
    });
  } catch (error) {
    console.error('保存模板错误:', error);
    res.status(500).json({ error: '保存模板失败' });
  }
});

// OCR识别API
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传图片文件' });
    }

    console.log('开始OCR识别:', req.file.originalname);
    
    // 检查文件类型
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: '只支持图片文件' });
    }

    const { language = 'auto', multiLanguage = false } = req.body;
    
    let ocrResult;
    
    if (multiLanguage === 'true' || language === 'ita+eng+chi_sim') {
      // 使用多语言识别（意大利语+英语+中文）
      ocrResult = await ocrService.recognizeMultiLanguage(req.file.path);
    } else {
      // 使用默认识别（中文+英语）
      ocrResult = await ocrService.recognizeImage(req.file.path);
    }

    // 清理临时文件
    setTimeout(() => {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }, 5 * 60 * 1000); // 5分钟后删除

    if (ocrResult.success) {
      // 分析文本结构并提取数据
      const structure = analyzeTemplateStructure(ocrResult.text);
      
      // 只返回提取的三个字段，简化输出
      const simplifiedResult = {
        'Numero Documento': structure.extractedData['Numero Documento'] || '',
        'Quantita': structure.extractedData['Quantita'] || '',
        'Descrizione Articolo': structure.extractedData['Descrizione Articolo'] || ''
      };

      res.json({
        success: true,
        message: 'OCR识别完成，提取到3个字段',
        extractedFields: simplifiedResult,
        mapping: {
          'Numero Documento': 'IMPORTO列 (G列)',
          'Quantita': 'QUANTITA列 (A列)', 
          'Descrizione Articolo': 'DESCRIZIONE DEI BENI列 (B列)'
        },
        confidence: ocrResult.confidence,
        language: ocrResult.language || 'chi_sim+eng',
        filename: req.file.originalname
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'OCR识别失败: ' + ocrResult.error,
        extractedFields: {
          'Numero Documento': '',
          'Quantita': '',
          'Descrizione Articolo': ''
        },
        confidence: 0
      });
    }

  } catch (error) {
    console.error('OCR API错误:', error);
    res.status(500).json({ 
      success: false,
      error: 'OCR服务错误: ' + error.message 
    });
  }
});

// OCR识别并直接处理缺省模板API
app.post('/api/ocr-and-process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传图片文件' });
    }

    console.log('开始OCR识别并处理:', req.file.originalname);
    
    // 检查文件类型
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: '只支持图片文件' });
    }

    const sessionId = req.query.sessionId;
    const source = req.body.source; // 文件来源：camera 或 upload
    const enhanced = req.body.enhanced === 'true'; // 是否已经过前端增强
    
    console.log(`📱 文件来源: ${source || 'upload'}, 预处理状态: ${enhanced ? '已增强' : '原始'}`);
    console.log(`📁 文件信息: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`);
    
    // 使用新的固定区域OCR识别，为拍照文件提供特殊优化
    let extractedData;
    try {
      if (source === 'camera') {
        console.log('🔍 使用拍照优化模式进行OCR识别...');
        extractedData = await ocrService.recognizeDocument(req.file.path, {
          source: 'camera',
          enhanced: enhanced,
          retries: 3 // 拍照文件允许更多重试
        });
      } else {
        console.log('🔍 使用标准模式进行OCR识别...');
        extractedData = await ocrService.recognizeDocument(req.file.path);
      }
      
      console.log(`📊 识别结果: 提取到 ${Object.keys(extractedData).length} 个字段`);
      if (Object.keys(extractedData).length > 0) {
        console.log('📄 提取的字段:', Object.keys(extractedData));
        
        // 应用数据格式化规则
        extractedData = formatRecognizedData(extractedData);
      }
    } catch (ocrError) {
      console.error('❌ OCR识别失败:', ocrError.message);
      
      // 为拍照文件提供更友好的错误信息
      if (source === 'camera') {
        return res.status(500).json({
          success: false,
          error: '拍照识别失败，建议：1.确保文档清晰 2.光线充足 3.文字清楚可见',
          suggestion: '请尝试重新拍照或调整拍摄角度',
          extractedFields: {}
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'OCR识别失败: ' + ocrError.message,
          extractedFields: {}
        });
      }
    }
    
    // 如果提供了sessionId，添加到会话中
    if (sessionId) {
      if (!global.documentSessions) {
        global.documentSessions = {};
      }
      
      if (!global.documentSessions[sessionId]) {
        global.documentSessions[sessionId] = {
          documents: [],
          createdAt: new Date(),
          lastUpdated: new Date()
        };
      }
      
      global.documentSessions[sessionId].documents.push({
        extractedData: extractedData, // 已经格式化过的数据
        filename: req.file.originalname,
        addedAt: new Date()
      });
      
      global.documentSessions[sessionId].lastUpdated = new Date();
    }

    // 清理临时文件
    setTimeout(() => {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }, 5 * 60 * 1000);

    res.json({
      success: true,
      message: `OCR识别完成，提取到${Object.keys(extractedData).length}个字段`,
      extractedFields: extractedData,
      mapping: {
        'Numero Documento': 'IMPORTO列 (G列)',
        'Quantita': 'QUANTITA列 (A列)', 
        'Descrizione Articolo': 'DESCRIZIONE DEI BENI列 (B列)'
      },
      sessionId: sessionId,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('OCR处理API错误:', error);
    res.status(500).json({ 
      success: false,
      error: 'OCR处理服务错误: ' + error.message 
    });
  }
});

// PDF OCR识别并处理API
app.post('/api/pdf-ocr-and-process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    console.log('开始OCR识别并处理:', req.file.originalname);
    
    // 检查文件类型 - 支持PDF和图片文件
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!supportedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: '只支持PDF、JPG、PNG文件' });
    }

    const sessionId = req.query.sessionId;
    
    // 处理不同文件类型
    if (req.file.mimetype === 'application/pdf') {
      // PDF文件处理
      const pdfBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(pdfBuffer);
      
      console.log('PDF文本提取完成，文本长度:', pdfData.text.length);
      
      // 如果PDF文本提取结果很少（可能是扫描版PDF），使用OCR
      if (pdfData.text.length < 50) {
      console.log('PDF文本内容较少，可能是扫描版PDF，尝试OCR识别...');
      
      try {
        // 动态导入pdf-to-img
        const { pdf } = await import('pdf-to-img');
        
        // 将PDF转换为PNG图片
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfDocument = await pdf(pdfBuffer, {
          outputType: 'buffer',
          viewportScale: 2.0
        });
        
        if (pdfDocument && pdfDocument.length > 0) {
          // 获取第一页
          const firstPageBuffer = await pdfDocument.getPage(1);
          
          // 将buffer保存为临时图片文件
          const tempImagePath = req.file.path.replace(/\.[^.]+$/, '_page1.png');
          fs.writeFileSync(tempImagePath, firstPageBuffer);
          
          console.log('PDF转图片成功，开始OCR识别:', tempImagePath);
          
          // 确保图片文件存在
          if (!fs.existsSync(tempImagePath)) {
            throw new Error('临时图片文件创建失败');
          }
          
          // 使用新的固定区域OCR识别图片
          let extractedData = await ocrService.recognizeDocument(tempImagePath);
          
          if (Object.keys(extractedData).length > 0) {
            console.log('OCR识别成功，提取到字段:', Object.keys(extractedData));
            
            // 应用数据格式化规则
            extractedData = formatRecognizedData(extractedData);
            
            // 如果提供了sessionId，直接添加到会话中
            if (sessionId) {
              if (!global.documentSessions) {
                global.documentSessions = {};
              }
              
              if (!global.documentSessions[sessionId]) {
                global.documentSessions[sessionId] = {
                  documents: [],
                  createdAt: new Date(),
                  lastUpdated: new Date()
                };
              }
              
              global.documentSessions[sessionId].documents.push({
                extractedData: extractedData,
                filename: req.file.originalname,
                addedAt: new Date()
              });
              
              global.documentSessions[sessionId].lastUpdated = new Date();
            }

            // 清理临时图片文件
            setTimeout(() => {
              if (fs.existsSync(tempImagePath)) {
                fs.unlinkSync(tempImagePath);
              }
            }, 1000);

            // 清理PDF文件
            setTimeout(() => {
              if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
              }
            }, 5 * 60 * 1000);

            // 返回标准格式的数据
            return res.json({
              success: true,
              message: `OCR识别完成，提取到${Object.keys(extractedData).length}个字段`,
              extractedFields: {
                'Numero Documento': extractedData['Numero Documento'] || 'N/A',
                'Quantita': extractedData['Quantita'] || 'N/A',
                'Descrizione Articolo': extractedData['Descrizione Articolo'] || 'N/A'
              },
              mapping: {
                'Numero Documento': 'IMPORTO列 (G列)',
                'Quantita': 'QUANTITA列 (A列)', 
                'Descrizione Articolo': 'DESCRIZIONE DEI BENI列 (B列)'
              },
              sessionId: sessionId,
              filename: req.file.originalname
            });
          }
          
        } else {
          console.log('PDF转图片失败，使用原始PDF文本');
        }
      } catch (ocrError) {
        console.error('PDF OCR处理失败:', ocrError);
        // 如果OCR失败，返回错误
        return res.status(500).json({
          success: false,
          error: 'PDF OCR处理失败: ' + ocrError.message
        });
      }
      } else {
        // PDF文本内容足够，但我们仍然需要使用固定区域识别
        console.log('PDF文本内容充足，但仍需要结构化提取');
        return res.status(400).json({
          success: false,
          error: 'PDF文件包含文本但需要图像OCR处理，请转换为图片格式后上传'
        });
      }
    } else {
      // 图片文件直接处理
      console.log('处理图片文件:', req.file.originalname);
      
      try {
        // 直接使用OCR识别图片
        let extractedData = await ocrService.recognizeDocument(req.file.path);
        
        // 应用数据格式化规则
        if (Object.keys(extractedData).length > 0) {
          console.log('图片OCR识别成功，提取到字段:', Object.keys(extractedData));
          extractedData = formatRecognizedData(extractedData);
          
          // 如果提供了sessionId，直接添加到会话中
          if (sessionId) {
            if (!global.documentSessions) {
              global.documentSessions = {};
            }
            
            if (!global.documentSessions[sessionId]) {
              global.documentSessions[sessionId] = {
                documents: [],
                createdAt: new Date(),
                lastUpdated: new Date()
              };
            }
            
            global.documentSessions[sessionId].documents.push({
              extractedData: extractedData,
              filename: req.file.originalname,
              addedAt: new Date()
            });
            
            global.documentSessions[sessionId].lastUpdated = new Date();
          }

          // 清理图片文件
          setTimeout(() => {
            if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
          }, 5 * 60 * 1000);

                      // 返回标准格式的数据
            return res.json({
              success: true,
              message: `OCR识别完成，提取到${Object.keys(extractedData).length}个字段`,
              extractedFields: {
                'Numero Documento': extractedData['Numero Documento'] || 'N/A',
                'Quantita': extractedData['Quantita'] || 'N/A',
                'Descrizione Articolo': extractedData['Descrizione Articolo'] || 'N/A'
              },
              mapping: {
                'Numero Documento': 'IMPORTO列 (G列)',
                'Quantita': 'QUANTITA列 (A列)', 
                'Descrizione Articolo': 'DESCRIZIONE DEI BENI列 (B列)'
              },
              sessionId: sessionId,
              filename: req.file.originalname
            });
        } else {
          return res.json({
            success: true,
            message: 'OCR识别完成，但未提取到字段',
            extractedFields: {
              'Numero Documento': 'N/A',
              'Quantita': 'N/A',
              'Descrizione Articolo': 'N/A'
            },
            mapping: {
              'Numero Documento': 'IMPORTO列 (G列)',
              'Quantita': 'QUANTITA列 (A列)', 
              'Descrizione Articolo': 'DESCRIZIONE DEI BENI列 (B列)'
            },
            sessionId: sessionId,
            filename: req.file.originalname
          });
        }
        
      } catch (ocrError) {
        console.error('图片OCR处理失败:', ocrError);
        return res.status(500).json({
          success: false,
          error: '图片OCR处理失败: ' + ocrError.message
        });
      }
    }

  } catch (error) {
    console.error('PDF OCR处理API错误:', error);
    res.status(500).json({ 
      success: false,
      error: 'PDF处理服务错误: ' + error.message 
    });
  }
});

// 辅助函数：安全获取Excel单元格值
function getCellValue(worksheet, cellAddress) {
  try {
    if (worksheet.getCell) {
      // ExcelJS格式
      const cell = worksheet.getCell(cellAddress);
      return cell.value ? String(cell.value) : '';
    } else {
      // XLSX格式
      const cell = worksheet[cellAddress];
      return cell && cell.v ? String(cell.v) : '';
    }
  } catch (error) {
    console.warn(`获取单元格 ${cellAddress} 值失败:`, error.message);
    return '';
  }
}

// 辅助函数：使用文件复制保持完整格式的导出
function exportWithFormat(templatePath, outputPath, dataRows) {
  try {
    console.log(`📋 复制原始模板保持格式: ${templatePath}`);
    
    // 直接复制原始模板文件，保持100%原始格式
    fs.copyFileSync(templatePath, outputPath);
    console.log(`📋 已复制原始模板: output.xlsx`);
    console.log(`📊 准备的数据记录: ${dataRows.length} 条`);
    
    // 记录数据信息（用于前端显示和打印）
    dataRows.forEach((data, index) => {
      if (data) {
        console.log(`📝 记录 ${index + 1}:`);
        console.log(`  QUANTITA: ${data['Quantita'] || '无'}`);
        console.log(`  DESCRIZIONE: ${data['Descrizione Articolo'] || '无'}`);
        console.log(`  NUMERO DOCUMENTO: ${data['Numero Documento'] || '无'}`);
      }
    });

    console.log(`✅ 导出完成: ${outputPath}`);
    console.log(`🎨 完全保持了原始Excel格式（字体、颜色、单元格大小、合并单元格等）`);
    console.log(`📋 注意：数据需要手动填入Excel文件，或使用打印功能查看完整内容`);
    
    return true;
  } catch (error) {
    console.error('导出失败:', error);
    throw error;
  }
}

// 使用ExcelJS精确导出会话数据 - 最大程度保持原始格式
async function exportSessionWithExcelJS(templatePath, outputPath, sessionData) {
  try {
    console.log(`📋 精确复制模板: ${templatePath} -> ${outputPath}`);
    
    // 第一步：直接复制模板文件以保持最大兼容性
    fs.copyFileSync(templatePath, outputPath);
    console.log('✅ 模板文件复制完成，保持100%原始格式');
    
    // 第二步：只修改特定单元格的值，使用最小干预方式
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error('无法读取工作表');
    }
    
    console.log(`📊 准备写入 ${sessionData.documents.length} 条记录`);
    
    // 从第12行开始写入数据，使用最直接的方式
    let currentRow = 12;
    sessionData.documents.forEach((item, index) => {
      if (item.extractedData) {
        const quantita = item.extractedData['Quantita'] || '';
        const descrizione = item.extractedData['Descrizione Articolo'] || '';
        const numeroDoc = item.extractedData['Numero Documento'] || '';
        
        // 使用最直接的方式设置单元格值，最小化格式干预
        const cellA = worksheet.getCell(`A${currentRow}`);
        const cellB = worksheet.getCell(`B${currentRow}`);
        const cellG = worksheet.getCell(`G${currentRow}`);
        
        // 直接设置值，不创建新的样式对象
        cellA.value = quantita;
        cellB.value = descrizione;
        cellG.value = numeroDoc;
        
        console.log(`✍️ 写入第${index + 1}条记录到第${currentRow}行:`);
        console.log(`  A${currentRow}: ${quantita}`);
        console.log(`  B${currentRow}: ${descrizione}`);
        console.log(`  G${currentRow}: ${numeroDoc}`);
        
        currentRow++;
      }
    });
    
    // 使用ExcelJS保存文件，保持原始格式
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`✅ 精确ExcelJS导出完成: ${outputPath}`);
    console.log(`🎨 采用模板复制+精确修改方式，最大程度保持原始Excel格式`);
    console.log(`📝 注意：仍可能存在微小的内部格式差异，但不影响实际显示效果`);
    
    return true;
  } catch (error) {
    console.error('ExcelJS导出失败:', error);
    throw error;
  }
}

// 导出Excel文件 - 使用ExcelJS完全保持output.xlsx原始格式
app.get('/api/export/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const sessionData = global.documentSessions?.[sessionId];
    
    if (!sessionData || !sessionData.documents || sessionData.documents.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '未找到会话数据或没有处理过的数据' 
      });
    }

    console.log(`📤 开始导出会话 ${sessionId} 的数据...`);

    // 读取output.xlsx模板
    const templatePath = path.join(__dirname, '..', 'output.xlsx');
    if (!fs.existsSync(templatePath)) {
      throw new Error('找不到output.xlsx模板文件');
    }

    // 生成目标文件路径
    const filename = `FileCognize_Export_${sessionId}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    const filepath = path.join(__dirname, 'exports', filename);
    
    // 确保exports目录存在
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // 使用ExcelJS进行导出，完全保持原始格式
    await exportSessionWithExcelJS(templatePath, filepath, sessionData);
    
    console.log(`📊 成功导出 ${sessionData.documents.length} 条记录到模板`);

    // 发送文件
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('文件下载失败:', err);
        res.status(500).json({ success: false, message: '文件下载失败' });
      } else {
        // 下载完成后删除临时文件
        setTimeout(() => {
          try {
            fs.unlinkSync(filepath);
            console.log(`🗑️ 临时文件已删除: ${filename}`);
          } catch (deleteErr) {
            console.error('删除临时文件失败:', deleteErr);
          }
        }, 5000);
      }
    });

  } catch (error) {
    console.error('导出失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '导出失败: ' + error.message 
    });
  }
});

// 使用ExcelJS精确导出选中记录 - 最大程度保持原始格式
async function exportSelectedWithExcelJS(templatePath, outputPath, records) {
  try {
    console.log(`📋 精确复制模板: ${templatePath} -> ${outputPath}`);
    
    // 第一步：直接复制模板文件以保持最大兼容性
    fs.copyFileSync(templatePath, outputPath);
    console.log('✅ 模板文件复制完成，保持100%原始格式');
    
    // 第二步：只修改特定单元格的值，使用最小干预方式
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error('无法读取工作表');
    }
    
    console.log(`📊 准备写入 ${records.length} 条记录`);
    
    // 从第12行开始写入数据，使用最直接的方式
    let currentRow = 12;
    records.forEach((record, index) => {
      if (record.extractedFields) {
        const quantita = record.extractedFields['Quantita'] || '';
        const descrizione = record.extractedFields['Descrizione Articolo'] || '';
        const numeroDoc = record.extractedFields['Numero Documento'] || '';
        
        // 使用最直接的方式设置单元格值，最小化格式干预
        const cellA = worksheet.getCell(`A${currentRow}`);
        const cellB = worksheet.getCell(`B${currentRow}`);
        const cellG = worksheet.getCell(`G${currentRow}`);
        
        // 直接设置值，不创建新的样式对象
        cellA.value = quantita;
        cellB.value = descrizione;
        cellG.value = numeroDoc;
        
        console.log(`✍️ 写入第${index + 1}条记录到第${currentRow}行:`);
        console.log(`  A${currentRow}: ${quantita}`);
        console.log(`  B${currentRow}: ${descrizione}`);
        console.log(`  G${currentRow}: ${numeroDoc}`);
        
        currentRow++;
      }
    });
    
    // 使用ExcelJS保存文件，保持原始格式
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`✅ 精确ExcelJS导出完成: ${outputPath}`);
    console.log(`🎨 采用模板复制+精确修改方式，最大程度保持原始Excel格式`);
    console.log(`📝 注意：仍可能存在微小的内部格式差异，但不影响实际显示效果`);
    
    return true;
  } catch (error) {
    console.error('ExcelJS导出失败:', error);
    throw error;
  }
}

// 导出选中记录 - 使用ExcelJS完全保持原始格式
app.post('/api/export-selected', async (req, res) => {
  try {
    const { sessionId, records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '没有选中的记录' 
      });
    }

    console.log(`🔄 开始导出选中的 ${records.length} 条记录...`);

    // 读取output.xlsx模板
    const templatePath = path.join(__dirname, '..', 'output.xlsx');
    if (!fs.existsSync(templatePath)) {
      throw new Error('找不到output.xlsx模板文件');
    }

    // 生成导出文件路径
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `FileCognize_Selected_${timestamp}.xlsx`;
    const filepath = path.join(__dirname, 'exports', filename);
    
    // 确保exports目录存在
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // 使用ExcelJS进行导出，完全保持原始格式
    await exportSelectedWithExcelJS(templatePath, filepath, records);
    
    console.log(`📊 成功导出 ${records.length} 条记录到模板`);

    // 发送文件
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('文件下载失败:', err);
        res.status(500).json({ success: false, message: '文件下载失败' });
      } else {
        console.log(`📤 文件下载成功: ${filename}`);
        console.log(`📁 文件保留用于验证: ${filepath}`);
      }
    });

  } catch (error) {
    console.error('导出失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '导出失败: ' + error.message 
    });
  }
});

// 打印PDF预览 - 基于output.xlsx模板 + 会话数据，先导出Excel再转PDF
app.get('/api/print/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const sessionData = global.documentSessions?.[sessionId];
    
    if (!sessionData || !sessionData.documents || sessionData.documents.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '未找到会话数据或没有处理过的数据' 
      });
    }

    console.log(`🖨️ 开始准备PDF打印会话 ${sessionId} 的数据...`);

    // 读取output.xlsx模板
    const templatePath = path.join(__dirname, '..', 'output.xlsx');
    if (!fs.existsSync(templatePath)) {
      throw new Error('找不到output.xlsx模板文件');
    }

    // 生成临时Excel文件路径
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const tempExcelFilename = `Print_Session_${sessionId}_${timestamp}.xlsx`;
    const tempExcelPath = path.join(__dirname, 'exports', tempExcelFilename);
    
    // 生成PDF文件路径
    const pdfFilename = `Print_Session_${sessionId}_${timestamp}.pdf`;
    const pdfPath = path.join(__dirname, 'exports', pdfFilename);
    
    // 确保exports目录存在
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // 使用ExcelJS导出会话数据到Excel
    await exportSessionWithExcelJS(templatePath, tempExcelPath, sessionData);
    
    // 将Excel转换为PDF
    await convertExcelToPDF(tempExcelPath, pdfPath);
    
    // 设置响应头为PDF文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFilename}"`);
    
    // 发送PDF文件
    res.sendFile(pdfPath, (err) => {
      if (err) {
        console.error('PDF文件发送失败:', err);
        res.status(500).json({ success: false, message: 'PDF文件发送失败' });
      } else {
        console.log(`📤 PDF打印文件发送成功: ${pdfFilename}`);
        
        // 延迟删除临时文件
        setTimeout(() => {
          try {
            if (fs.existsSync(tempExcelPath)) {
              fs.unlinkSync(tempExcelPath);
              console.log(`🗑️ 临时Excel文件已删除: ${tempExcelFilename}`);
            }
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
              console.log(`🗑️ 临时PDF文件已删除: ${pdfFilename}`);
            }
          } catch (deleteErr) {
            console.error('删除临时文件失败:', deleteErr);
          }
        }, 60000); // 60秒后删除，给用户足够时间查看
      }
    });

  } catch (error) {
    console.error('PDF打印准备失败:', error);
    res.status(500).json({ 
      success: false, 
      message: 'PDF打印准备失败: ' + error.message 
    });
  }
});

// 打印选中记录 - 将Excel导出转PDF打印，与导出的Excel文件格式完全一致
app.post('/api/print-selected', async (req, res) => {
  try {
    const { sessionId, records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '没有选中的记录' 
      });
    }

    console.log(`🖨️ 开始准备PDF打印选中的 ${records.length} 条记录...`);

    // 读取output.xlsx模板
    const templatePath = path.join(__dirname, '..', 'output.xlsx');
    if (!fs.existsSync(templatePath)) {
      throw new Error('找不到output.xlsx模板文件');
    }

    // 生成临时Excel文件路径
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const tempExcelFilename = `Print_Selected_${timestamp}.xlsx`;
    const tempExcelPath = path.join(__dirname, 'exports', tempExcelFilename);
    
    // 生成PDF文件路径
    const pdfFilename = `Print_Selected_${timestamp}.pdf`;
    const pdfPath = path.join(__dirname, 'exports', pdfFilename);
    
    // 确保exports目录存在
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // 使用ExcelJS导出选中记录到Excel
    await exportSelectedWithExcelJS(templatePath, tempExcelPath, records);
    
    // 将Excel转换为PDF
    await convertExcelToPDF(tempExcelPath, pdfPath);
    
    console.log(`✅ PDF打印文件准备完成: ${pdfPath}`);
    
    // 设置响应头为PDF文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFilename}"`);
    
    // 发送PDF文件
    res.sendFile(pdfPath, (err) => {
      if (err) {
        console.error('PDF文件发送失败:', err);
        res.status(500).json({ success: false, message: 'PDF文件发送失败' });
      } else {
        console.log(`📤 PDF打印文件发送成功: ${pdfFilename}`);
        console.log(`📊 包含 ${records.length} 条选中记录`);
        
        // 延迟删除临时文件
        setTimeout(() => {
          try {
            if (fs.existsSync(tempExcelPath)) {
              fs.unlinkSync(tempExcelPath);
              console.log(`🗑️ 临时Excel文件已删除: ${tempExcelFilename}`);
            }
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
              console.log(`🗑️ 临时PDF文件已删除: ${pdfFilename}`);
            }
          } catch (deleteErr) {
            console.error('删除临时文件失败:', deleteErr);
          }
        }, 60000); // 60秒后删除，给用户足够时间查看
      }
    });

  } catch (error) {
    console.error('PDF打印准备失败:', error);
    res.status(500).json({ 
      success: false, 
      message: 'PDF打印准备失败: ' + error.message 
    });
  }
});

// 下载打印文件API (保持向后兼容)
app.get('/api/download-print/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'exports', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '打印文件不存在' });
    }
    
    // 设置响应头，让浏览器直接打开文件用于打印
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // 发送文件
    res.sendFile(filePath, (err) => {
      if (!err) {
        // 文件发送完成后延迟删除临时文件
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑️ 打印临时文件已删除: ${filename}`);
          } catch (deleteErr) {
            console.error('删除打印临时文件失败:', deleteErr);
          }
        }, 30000); // 30秒后删除，给用户足够时间打印
      }
    });
    
  } catch (error) {
    console.error('下载打印文件错误:', error);
    res.status(500).json({ error: '下载打印文件失败' });
  }
});

// 文件下载API
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 设置下载头
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // 发送文件
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('文件下载错误:', error);
    res.status(500).json({ error: '文件下载失败' });
  }
});

// 删除模板API
app.delete('/api/templates/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 不允许删除缺省模板
    if (filename === 'default_template') {
      return res.status(400).json({ error: '不能删除缺省模板' });
    }
    
    const filePath = path.join(templatesDir, filename);
    const configPath = path.join(templatesDir, `${filename}_config.json`);
    
    let deleted = false;
    
    // 删除模板文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }
    
    // 删除配置文件
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      deleted = true;
    }
    
    if (deleted) {
      res.json({ success: true, message: '模板删除成功' });
    } else {
      res.status(404).json({ error: '模板文件不存在' });
    }
  } catch (error) {
    console.error('删除模板错误:', error);
    res.status(500).json({ error: '删除模板失败' });
  }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 调试端点 - 检查文件路径
app.get('/api/debug/paths', (req, res) => {
  const paths = {
    __dirname: __dirname,
    'process.cwd()': process.cwd(),
    'NODE_ENV': process.env.NODE_ENV,
    'PORT': process.env.PORT,
    publicPaths: [
      path.join(__dirname, '../public'),
      path.join(process.cwd(), 'public'),
      path.join(__dirname, '../../public'),
      '/app/public'
    ].map(p => ({
      path: p,
      exists: fs.existsSync(p),
      indexExists: fs.existsSync(path.join(p, 'index.html'))
    })),
    buildPaths: [
      path.join(__dirname, '../build'),
      path.join(__dirname, '../client/build')
    ].map(p => ({
      path: p,
      exists: fs.existsSync(p),
      indexExists: fs.existsSync(path.join(p, 'index.html'))
    }))
  };
  
  res.json(paths);
});


// 下载打印文件API
app.get('/api/download-print/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'exports', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '打印文件不存在' });
    }
    
    // 设置响应头，让浏览器直接打开文件用于打印
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // 发送文件
    res.sendFile(filePath, (err) => {
      if (!err) {
        // 文件发送完成后延迟删除临时文件
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑️ 打印临时文件已删除: ${filename}`);
          } catch (deleteErr) {
            console.error('删除打印临时文件失败:', deleteErr);
          }
        }, 30000); // 30秒后删除，给用户足够时间打印
      }
    });
    
  } catch (error) {
    console.error('下载打印文件错误:', error);
    res.status(500).json({ error: '下载打印文件失败' });
  }
});

// 文件下载API
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 设置下载头
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // 发送文件
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('文件下载错误:', error);
    res.status(500).json({ error: '文件下载失败' });
  }
});

// 删除模板API
app.delete('/api/templates/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 不允许删除缺省模板
    if (filename === 'default_template') {
      return res.status(400).json({ error: '不能删除缺省模板' });
    }
    
    const filePath = path.join(templatesDir, filename);
    const configPath = path.join(templatesDir, `${filename}_config.json`);
    
    let deleted = false;
    
    // 删除模板文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }
    
    // 删除配置文件
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      deleted = true;
    }
    
    if (deleted) {
      res.json({ success: true, message: '模板删除成功' });
    } else {
      res.status(404).json({ error: '模板文件不存在' });
    }
  } catch (error) {
    console.error('删除模板错误:', error);
    res.status(500).json({ error: '删除模板失败' });
  }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 调试端点 - 检查文件路径
app.get('/api/debug/paths', (req, res) => {
  const paths = {
    __dirname: __dirname,
    'process.cwd()': process.cwd(),
    'NODE_ENV': process.env.NODE_ENV,
    'PORT': process.env.PORT,
    publicPaths: [
      path.join(__dirname, '../public'),
      path.join(process.cwd(), 'public'),
      path.join(__dirname, '../../public'),
      '/app/public'
    ].map(p => ({
      path: p,
      exists: fs.existsSync(p),
      indexExists: fs.existsSync(path.join(p, 'index.html'))
    })),
    buildPaths: [
      path.join(__dirname, '../build'),
      path.join(__dirname, '../client/build')
    ].map(p => ({
      path: p,
      exists: fs.existsSync(p),
      indexExists: fs.existsSync(path.join(p, 'index.html'))
    }))
  };
  
  res.json(paths);
});

// 生产环境下提供静态文件 - 优先使用新的前端页面
if (process.env.NODE_ENV === 'production') {
  // 尝试多个可能的public目录路径
  const publicPaths = [
    path.join(__dirname, '../public'),     // 相对于server目录
    path.join(process.cwd(), 'public'),    // 相对于项目根目录
    path.join(__dirname, '../../public'),  // 如果server在子目录中
    '/app/public'                          // Railway的绝对路径
  ];
  
  let publicPath = null;
  let publicIndexPath = null;
  
  for (const testPath of publicPaths) {
    const indexPath = path.join(testPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      publicPath = testPath;
      publicIndexPath = indexPath;
      console.log(`✅ 使用新的前端页面: ${publicPath}`);
      break;
    }
  }
  
  if (publicPath && publicIndexPath) {
    // 提供静态文件服务
    app.use(express.static(publicPath));
    
    // 为所有非API路由返回新的前端页面
    app.get('*', (req, res) => {
      // 如果是API请求，跳过
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: '接口不存在' });
      }
      res.sendFile(publicIndexPath);
    });
  } else {
    console.error('❌ 未找到public目录，尝试的路径:');
    publicPaths.forEach(p => console.error(`  - ${p}`));
    
    // 回退到旧的构建文件
    const buildPaths = [
      path.join(__dirname, '../build'),        // 根目录的build文件夹
      path.join(__dirname, '../client/build')  // client目录的build文件夹
    ];
    
    let buildPath = null;
    for (const testPath of buildPaths) {
      if (fs.existsSync(path.join(testPath, 'index.html'))) {
        buildPath = testPath;
        console.log(`⚠️ 回退到旧构建文件: ${buildPath}`);
        break;
      }
    }
    
    if (buildPath) {
      app.use(express.static(buildPath));
      
      app.get('*', (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
      });
    } else {
      console.error('❌ 未找到任何前端文件');
      
      app.get('*', (req, res) => {
        res.status(404).json({ error: '前端文件未找到，请检查构建配置' });
      });
    }
  }
}

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制(10MB)' });
    }
  }
  
  console.error('服务器错误:', error);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`文件整理服务器运行在端口 ${PORT}`);
});

module.exports = app; 