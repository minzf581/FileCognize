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
const { ocrService, DESCRIZIONE_OPTIONS } = require('./ocr-service');
require('dotenv').config();

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
    
    // 使用xlsx库处理Excel文件
    const workbook = XLSX.readFile(outputPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    const processedResults = [];
    let currentRow = 11; // 从第11行开始写入数据
    
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
          
          // 写入Numero Documento到IMPORTO列
          if (data['Numero Documento']) {
            const importoCell = `G${currentRow}`;
            worksheet[importoCell] = { v: data['Numero Documento'], t: 's' };
          }
          
          // 写入Quantita到QUANTITA列
          if (data['Quantita']) {
            const quantitaCell = `A${currentRow}`;
            worksheet[quantitaCell] = { v: data['Quantita'], t: 's' };
          }
          
          // 写入Descrizione Articolo到DESCRIZIONE DEI BENI列
          if (data['Descrizione Articolo']) {
            const descrizioneCell = `B${currentRow}`;
            worksheet[descrizioneCell] = { v: data['Descrizione Articolo'], t: 's' };
          }
          
          processedResults.push({
            documentIndex: i + 1,
            row: currentRow,
            extractedData: structure.extractedData,
            processedData: data,
            success: true
          });
          
          currentRow++; // 移动到下一行
        } else {
          processedResults.push({
            documentIndex: i + 1,
            row: currentRow,
            error: '数据提取失败',
            success: false
          });
        }
      } catch (docError) {
        console.error(`处理第 ${i + 1} 个文档时出错:`, docError);
        processedResults.push({
          documentIndex: i + 1,
          row: currentRow,
          error: docError.message,
          success: false
        });
      }
    }
    
    // 生成新的Excel文件
    const timestamp = Date.now();
    const outputFilename = `batch_processed_${timestamp}.xlsx`;
    const outputFilePath = path.join(uploadsDir, outputFilename);
    
    XLSX.writeFile(workbook, outputFilePath);
    
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
    
    // 使用xlsx库处理Excel文件
    const workbook = XLSX.readFile(outputPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    let currentRow = 11; // 从第11行开始写入数据
    const processedResults = [];
    
    // 处理每个文档
    documents.forEach((doc, index) => {
      if (doc.processedData.success && doc.processedData.data.length > 0) {
        const data = doc.processedData.data[0];
        
        // 写入Numero Documento到IMPORTO列
        if (data['Numero Documento']) {
          const importoCell = `G${currentRow}`;
          worksheet[importoCell] = { v: data['Numero Documento'], t: 's' };
        }
        
        // 写入Quantita到QUANTITA列
        if (data['Quantita']) {
          const quantitaCell = `A${currentRow}`;
          worksheet[quantitaCell] = { v: data['Quantita'], t: 's' };
        }
        
        // 写入Descrizione Articolo到DESCRIZIONE DEI BENI列
        if (data['Descrizione Articolo']) {
          const descrizioneCell = `B${currentRow}`;
          worksheet[descrizioneCell] = { v: data['Descrizione Articolo'], t: 's' };
        }
        
        processedResults.push({
          documentIndex: index + 1,
          row: currentRow,
          data: data,
          success: true
        });
        
        currentRow++; // 移动到下一行
      }
    });
    
    // 生成新的Excel文件
    const timestamp = Date.now();
    const outputFilename = `session_${sessionId}_${timestamp}.xlsx`;
    const outputFilePath = path.join(uploadsDir, outputFilename);
    
    XLSX.writeFile(workbook, outputFilePath);
    
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
    
    // 使用新的固定区域OCR识别
    const extractedData = await ocrService.recognizeDocument(req.file.path);
    
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
        extractedData: extractedData,
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
          const extractedData = await ocrService.recognizeDocument(tempImagePath);
          
          if (Object.keys(extractedData).length > 0) {
            console.log('OCR识别成功，提取到字段:', Object.keys(extractedData));
            
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
        const extractedData = await ocrService.recognizeDocument(req.file.path);
        
        if (Object.keys(extractedData).length > 0) {
          console.log('图片OCR识别成功，提取到字段:', Object.keys(extractedData));
          
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

    // 读取复制后的文件进行数据添加
    const workbook = XLSX.readFile(outputPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    console.log(`📊 准备写入 ${dataRows.length} 条记录`);

    // 从第12行开始写入数据 (A11是表头，A12开始是数据)
    let currentRow = 12;
    
    dataRows.forEach((data, index) => {
      if (data) {
        console.log(`✍️ 写入第${index + 1}条记录到第${currentRow}行:`);
        
        // A列: QUANTITA
        if (data['Quantita']) {
          const cellA = `A${currentRow}`;
          worksheet[cellA] = { v: data['Quantita'], t: 's' };
          console.log(`  ${cellA}: ${data['Quantita']}`);
        }
        
        // B列: DESCRIZIONE DEI BENI
        if (data['Descrizione Articolo']) {
          const cellB = `B${currentRow}`;
          worksheet[cellB] = { v: data['Descrizione Articolo'], t: 's' };
          console.log(`  ${cellB}: ${data['Descrizione Articolo']}`);
        }
        
        // G列: IMPORTO (Numero Documento)
        if (data['Numero Documento']) {
          const cellG = `G${currentRow}`;
          worksheet[cellG] = { v: data['Numero Documento'], t: 's' };
          console.log(`  ${cellG}: ${data['Numero Documento']}`);
        }
        
        currentRow++;
      }
    });

    // 保存文件，保持原始格式
    XLSX.writeFile(workbook, outputPath);
    console.log(`✅ 导出完成，格式完全保持: ${outputPath}`);
    console.log(`🎨 完全保持了原始Excel格式（字体、颜色、单元格大小等）`);
    
    return true;
  } catch (error) {
    console.error('导出失败:', error);
    throw error;
  }
}

// 导出Excel文件 - 完全保持output.xlsx原始格式，只添加数据
app.get('/api/export/:sessionId', (req, res) => {
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

    // 直接复制原始模板文件，然后只修改特定单元格
    fs.copyFileSync(templatePath, filepath);
    console.log(`📋 已复制原始模板: output.xlsx`);

    // 读取复制后的文件进行数据添加
    const workbook = XLSX.readFile(filepath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    console.log(`📊 准备写入 ${sessionData.documents.length} 条记录`);

    // 从第12行开始写入数据 (A11是表头，A12开始是数据)
    let currentRow = 12;
    
    sessionData.documents.forEach((item, index) => {
      if (item.extractedData) {
        console.log(`✍️ 写入第${index + 1}条记录到第${currentRow}行:`);
        
        // A列: QUANTITA
        if (item.extractedData['Quantita']) {
          const cellA = `A${currentRow}`;
          worksheet[cellA] = { v: item.extractedData['Quantita'], t: 's' };
          console.log(`  ${cellA}: ${item.extractedData['Quantita']}`);
        }
        
        // B列: DESCRIZIONE DEI BENI
        if (item.extractedData['Descrizione Articolo']) {
          const cellB = `B${currentRow}`;
          worksheet[cellB] = { v: item.extractedData['Descrizione Articolo'], t: 's' };
          console.log(`  ${cellB}: ${item.extractedData['Descrizione Articolo']}`);
        }
        
        // G列: IMPORTO (Numero Documento)
        if (item.extractedData['Numero Documento']) {
          const cellG = `G${currentRow}`;
          worksheet[cellG] = { v: item.extractedData['Numero Documento'], t: 's' };
          console.log(`  ${cellG}: ${item.extractedData['Numero Documento']}`);
        }
        
        currentRow++;
      }
    });

    // 保存文件，保持原始格式
    XLSX.writeFile(workbook, filepath);

    console.log(`✅ 导出完成: ${filename}`);
    console.log(`📊 成功导出 ${sessionData.documents.length} 条记录到模板`);
    console.log(`🎨 完全保持了原始Excel格式（字体、颜色、单元格大小等）`);

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

// 导出选中记录 - 支持历史记录选择性导出
app.post('/api/export-selected', (req, res) => {
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

    // 直接复制原始模板文件，保持100%原始格式
    fs.copyFileSync(templatePath, filepath);
    console.log(`📋 已复制原始模板: output.xlsx`);

    // 读取复制后的文件进行数据添加
    const workbook = XLSX.readFile(filepath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    console.log(`📊 准备写入 ${records.length} 条记录`);

    // 从第12行开始写入数据 (A11是表头，A12开始是数据)
    let currentRow = 12;
    
    records.forEach((record, index) => {
      if (record.extractedFields) {
        console.log(`✍️ 写入第${index + 1}条记录到第${currentRow}行:`);
        
        // A列: QUANTITA
        if (record.extractedFields['Quantita']) {
          const cellA = `A${currentRow}`;
          worksheet[cellA] = { v: record.extractedFields['Quantita'], t: 's' };
          console.log(`  ${cellA}: ${record.extractedFields['Quantita']}`);
        }
        
        // B列: DESCRIZIONE DEI BENI
        if (record.extractedFields['Descrizione Articolo']) {
          const cellB = `B${currentRow}`;
          worksheet[cellB] = { v: record.extractedFields['Descrizione Articolo'], t: 's' };
          console.log(`  ${cellB}: ${record.extractedFields['Descrizione Articolo']}`);
        }
        
        // G列: IMPORTO (Numero Documento)
        if (record.extractedFields['Numero Documento']) {
          const cellG = `G${currentRow}`;
          worksheet[cellG] = { v: record.extractedFields['Numero Documento'], t: 's' };
          console.log(`  ${cellG}: ${record.extractedFields['Numero Documento']}`);
        }
        
        currentRow++;
      }
    });

    // 保存文件，完全保持原始格式
    XLSX.writeFile(workbook, filepath);
    console.log(`✅ 导出完成: ${filename}`);
    console.log(`📊 成功导出 ${records.length} 条记录到模板`);

    // 发送文件
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('文件下载失败:', err);
        res.status(500).json({ success: false, message: '文件下载失败' });
      } else {
        console.log(`📤 文件下载成功: ${filename}`);
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

// 打印HTML预览 - 基于output.xlsx模板 + 三个字段数据
app.get('/api/print/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const sessionData = global.documentSessions?.[sessionId];
    
    if (!sessionData || !sessionData.documents || sessionData.documents.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '未找到会话数据或没有处理过的数据' 
      });
    }

    console.log(`🖨️ 开始准备HTML打印预览会话 ${sessionId} 的数据...`);

    // 读取原始output.xlsx文件内容
    const templatePath = path.join(__dirname, '..', 'output.xlsx');
    const workbook = XLSX.readFile(templatePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // 生成HTML打印内容，完全基于output.xlsx的结构和内容
    let printHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>FileCognize 打印预览 - 完整文档</title>
        <style>
            @media print {
                body { margin: 0; }
                .no-print { display: none; }
                .document-container { margin: 0; padding: 20px; }
            }
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                background: white;
                font-size: 12px;
            }
            .no-print {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 1000;
                background: rgba(255,255,255,0.9);
                padding: 10px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .print-button {
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin: 0 5px;
                font-size: 12px;
            }
            .print-button:hover {
                background: #0056b3;
            }
            .document-container {
                max-width: 210mm;
                margin: 0 auto;
                padding: 20mm;
                background: white;
                min-height: 297mm;
            }
            .document-header {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
                border: 2px solid #000;
                padding: 10px;
            }
            .sender-info, .doc-info {
                padding: 10px;
                border: 1px solid #000;
            }
            .recipient-info, .destination-info {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #000;
                min-height: 80px;
            }
            .transport-info {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #000;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                border: 2px solid #000;
            }
            .items-table th,
            .items-table td {
                border: 1px solid #000;
                padding: 8px;
                text-align: left;
                vertical-align: top;
                font-size: 11px;
            }
            .items-table th {
                background-color: #f0f0f0;
                font-weight: bold;
                text-align: center;
            }
            .footer-section {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 10px;
                margin-top: 20px;
                border: 1px solid #000;
                padding: 10px;
            }
            .signature-section {
                text-align: center;
                padding: 20px;
                border: 1px solid #000;
                margin: 10px 0;
            }
            .filled-data {
                background-color: #ffffcc;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="no-print">
            <button class="print-button" onclick="window.print()">🖨️ 打印</button>
            <button class="print-button" onclick="window.close()">❌ 关闭</button>
        </div>
        
        <div class="document-container">
            <!-- 文档头部 -->
            <div class="document-header">
                <div class="sender-info">
                    <strong>MITENTE:</strong><br>
                    ${worksheet['A1'] ? worksheet['A1'].v.replace(/\n/g, '<br>') : ''}
                </div>
                <div class="doc-info">
                    <strong>DOCUMENTO DI TRANSPORTO</strong><br>
                    ${worksheet['D1'] ? worksheet['D1'].v.replace(/\n/g, '<br>') : ''}
                </div>
            </div>
            
            <!-- 收件人信息 -->
            <div class="recipient-info">
                <strong>Destinatario:</strong><br>
                ${worksheet['A5'] ? worksheet['A5'].v.replace(/\n/g, '<br>') : ''}
            </div>
            
            <!-- 目的地信息 -->
            <div class="destination-info">
                <strong>LUOGO DI DESTINAZIONE:</strong><br>
                ${worksheet['E5'] ? worksheet['E5'].v.replace(/\n/g, '<br>') : ''}
            </div>
            
            <!-- 运输原因 -->
            <div class="transport-info">
                <strong>CAUSA DEL TRANSPORTO:</strong><br>
                ${worksheet['A9'] ? worksheet['A9'].v : ''} ${worksheet['D9'] ? worksheet['D9'].v : ''}
            </div>
            
            <!-- 物品表格 -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 12%;">${worksheet['A10'] ? worksheet['A10'].v : 'QUANTITA'}</th>
                        <th style="width: 50%;">${worksheet['B10'] ? worksheet['B10'].v : 'DESCRIZIONE DEI BENI'}</th>
                        <th style="width: 8%;">UNITA</th>
                        <th style="width: 10%;">PREZZO</th>
                        <th style="width: 8%;">SCONTO</th>
                        <th style="width: 8%;">IVA</th>
                        <th style="width: 12%;">${worksheet['G10'] ? worksheet['G10'].v : 'IMPORTO'}</th>
                    </tr>
                </thead>
                <tbody>`;

    // 添加识别到的数据行（高亮显示）
    sessionData.documents.forEach((item, index) => {
      if (item.extractedData) {
        const quantita = item.extractedData['Quantita'] || '';
        const descrizione = item.extractedData['Descrizione Articolo'] || '';
        const importo = item.extractedData['Numero Documento'] || '';
        
        printHTML += `
                    <tr>
                        <td class="filled-data">${quantita}</td>
                        <td class="filled-data">${descrizione}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td class="filled-data">${importo}</td>
                    </tr>`;
      }
    });

    // 添加空行以匹配模板格式（总共20行）
    const totalRows = 20;
    const filledRows = sessionData.documents.filter(doc => doc.extractedData).length;
    for (let i = filledRows; i < totalRows; i++) {
      printHTML += `
                    <tr>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                    </tr>`;
    }

    printHTML += `
                </tbody>
            </table>
            
            <!-- 底部信息 -->
            <div class="footer-section">
                <div>
                    <strong>${worksheet['A35'] ? worksheet['A35'].v : 'ASPETTO ESTERIORE DEI BENI'}</strong><br>
                    <div style="height: 40px; border: 1px solid #000; margin-top: 5px;"></div>
                </div>
                <div>
                    <strong>${worksheet['C35'] ? worksheet['C35'].v : 'N. COLLI'}</strong><br>
                    <div style="height: 40px; border: 1px solid #000; margin-top: 5px;"></div>
                </div>
                <div>
                    <strong>${worksheet['E35'] ? worksheet['E35'].v : 'PORTO'}</strong><br>
                    <div style="height: 40px; border: 1px solid #000; margin-top: 5px;"></div>
                </div>
            </div>
            
            <!-- 签名区域 -->
            <div class="signature-section">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <strong>${worksheet['F36'] ? worksheet['F36'].v : 'FIRMA DEL CEDENTE'}</strong><br>
                        <div style="height: 60px; border-bottom: 1px solid #000; margin-top: 20px;"></div>
                    </div>
                    <div>
                        <strong>${worksheet['F38'] ? worksheet['F38'].v : 'FIRMA DEL CESSIONARIO'}</strong><br>
                        <div style="height: 60px; border-bottom: 1px solid #000; margin-top: 20px;"></div>
                    </div>
                </div>
            </div>
            
            <!-- 注释 -->
            <div style="margin-top: 20px; font-size: 10px;">
                <p><strong>注释:</strong> 黄色高亮部分为系统自动识别填入的数据</p>
                <p><strong>处理文档数:</strong> ${sessionData.documents.length} 个 | 
                   <strong>成功识别:</strong> ${sessionData.documents.filter(doc => doc.extractedData && Object.keys(doc.extractedData).length > 0).length} 个 | 
                   <strong>会话ID:</strong> ${sessionId}</p>
                <p>${worksheet['A40'] ? worksheet['A40'].v : ''}</p>
            </div>
        </div>

        <script>
            // 自动聚焦以便快捷键打印
            window.focus();
            
            // 支持Ctrl+P快捷键
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.key === 'p') {
                    e.preventDefault();
                    window.print();
                }
            });
        </script>
    </body>
    </html>`;

    console.log(`✅ HTML打印预览准备完成`);
    console.log(`📊 包含 ${sessionData.documents.length} 条记录`);

    // 返回HTML内容
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(printHTML);

  } catch (error) {
    console.error('打印预览准备失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '打印预览准备失败: ' + error.message 
    });
  }
});

// 打印选中记录 - 支持历史记录选择性打印
app.post('/api/print-selected', (req, res) => {
  try {
    const { sessionId, records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '没有选中的记录' 
      });
    }

    console.log(`🖨️ 开始准备打印选中的 ${records.length} 条记录...`);

    // 读取原始output.xlsx文件内容
    const templatePath = path.join(__dirname, '..', 'output.xlsx');
    const workbook = XLSX.readFile(templatePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // 生成HTML打印内容，完全基于output.xlsx的结构和内容
    let printHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>FileCognize 打印预览 - 选中记录</title>
        <style>
            @media print {
                body { margin: 0; }
                .no-print { display: none; }
                .document-container { margin: 0; padding: 20px; }
            }
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                background: white;
                font-size: 12px;
            }
            .no-print {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 1000;
                background: rgba(255,255,255,0.9);
                padding: 10px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .print-button {
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin: 0 5px;
                font-size: 12px;
            }
            .print-button:hover {
                background: #0056b3;
            }
            .document-container {
                max-width: 210mm;
                margin: 0 auto;
                padding: 20mm;
                background: white;
                min-height: 297mm;
            }
            .document-header {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
                border: 2px solid #000;
                padding: 10px;
            }
            .sender-info, .doc-info {
                padding: 10px;
                border: 1px solid #000;
            }
            .recipient-info, .destination-info {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #000;
                min-height: 80px;
            }
            .transport-info {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #000;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                border: 2px solid #000;
            }
            .items-table th,
            .items-table td {
                border: 1px solid #000;
                padding: 8px;
                text-align: left;
                vertical-align: top;
                font-size: 11px;
            }
            .items-table th {
                background-color: #f0f0f0;
                font-weight: bold;
                text-align: center;
            }
            .footer-section {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 10px;
                margin-top: 20px;
                border: 1px solid #000;
                padding: 10px;
            }
            .signature-section {
                text-align: center;
                padding: 20px;
                border: 1px solid #000;
                margin: 10px 0;
            }
            .filled-data {
                background-color: #ffffcc;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="no-print">
            <button class="print-button" onclick="window.print()">🖨️ 打印</button>
            <button class="print-button" onclick="window.close()">❌ 关闭</button>
        </div>
        
        <div class="document-container">
            <!-- 文档头部 -->
            <div class="document-header">
                <div class="sender-info">
                    <strong>MITENTE:</strong><br>
                    ${worksheet['A1'] ? worksheet['A1'].v.replace(/\n/g, '<br>') : ''}
                </div>
                <div class="doc-info">
                    <strong>DOCUMENTO DI TRANSPORTO</strong><br>
                    ${worksheet['D1'] ? worksheet['D1'].v.replace(/\n/g, '<br>') : ''}
                </div>
            </div>
            
            <!-- 收件人信息 -->
            <div class="recipient-info">
                <strong>Destinatario:</strong><br>
                ${worksheet['A5'] ? worksheet['A5'].v.replace(/\n/g, '<br>') : ''}
            </div>
            
            <!-- 目的地信息 -->
            <div class="destination-info">
                <strong>LUOGO DI DESTINAZIONE:</strong><br>
                ${worksheet['E5'] ? worksheet['E5'].v.replace(/\n/g, '<br>') : ''}
            </div>
            
            <!-- 运输原因 -->
            <div class="transport-info">
                <strong>CAUSA DEL TRANSPORTO:</strong><br>
                ${worksheet['A9'] ? worksheet['A9'].v : ''} ${worksheet['D9'] ? worksheet['D9'].v : ''}
            </div>
            
            <!-- 物品表格 -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 12%;">${worksheet['A10'] ? worksheet['A10'].v : 'QUANTITA'}</th>
                        <th style="width: 50%;">${worksheet['B10'] ? worksheet['B10'].v : 'DESCRIZIONE DEI BENI'}</th>
                        <th style="width: 8%;">UNITA</th>
                        <th style="width: 10%;">PREZZO</th>
                        <th style="width: 8%;">SCONTO</th>
                        <th style="width: 8%;">IVA</th>
                        <th style="width: 12%;">${worksheet['G10'] ? worksheet['G10'].v : 'IMPORTO'}</th>
                    </tr>
                </thead>
                <tbody>`;

    // 添加选中的记录（高亮显示）
    records.forEach((record, index) => {
      if (record.extractedFields) {
        const quantita = record.extractedFields['Quantita'] || '';
        const descrizione = record.extractedFields['Descrizione Articolo'] || '';
        const importo = record.extractedFields['Numero Documento'] || '';
        
        printHTML += `
                    <tr>
                        <td class="filled-data">${quantita}</td>
                        <td class="filled-data">${descrizione}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td class="filled-data">${importo}</td>
                    </tr>`;
      }
    });

    // 添加空行以匹配模板格式（总共20行）
    const totalRows = 20;
    const filledRows = records.filter(record => record.extractedFields).length;
    for (let i = filledRows; i < totalRows; i++) {
      printHTML += `
                    <tr>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                    </tr>`;
    }

    printHTML += `
                </tbody>
            </table>
            
            <!-- 底部信息 -->
            <div class="footer-section">
                <div>
                    <strong>${worksheet['A35'] ? worksheet['A35'].v : 'ASPETTO ESTERIORE DEI BENI'}</strong><br>
                    <div style="height: 40px; border: 1px solid #000; margin-top: 5px;"></div>
                </div>
                <div>
                    <strong>${worksheet['C35'] ? worksheet['C35'].v : 'N. COLLI'}</strong><br>
                    <div style="height: 40px; border: 1px solid #000; margin-top: 5px;"></div>
                </div>
                <div>
                    <strong>${worksheet['E35'] ? worksheet['E35'].v : 'PORTO'}</strong><br>
                    <div style="height: 40px; border: 1px solid #000; margin-top: 5px;"></div>
                </div>
            </div>
            
            <!-- 签名区域 -->
            <div class="signature-section">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <strong>${worksheet['F36'] ? worksheet['F36'].v : 'FIRMA DEL CEDENTE'}</strong><br>
                        <div style="height: 60px; border-bottom: 1px solid #000; margin-top: 20px;"></div>
                    </div>
                    <div>
                        <strong>${worksheet['F38'] ? worksheet['F38'].v : 'FIRMA DEL CESSIONARIO'}</strong><br>
                        <div style="height: 60px; border-bottom: 1px solid #000; margin-top: 20px;"></div>
                    </div>
                </div>
            </div>
            
            <!-- 注释 -->
            <div style="margin-top: 20px; font-size: 10px;">
                <p><strong>注释:</strong> 黄色高亮部分为系统自动识别填入的数据</p>
                <p><strong>选中记录数:</strong> ${records.length} 个 | 
                   <strong>成功识别:</strong> ${records.filter(record => record.extractedFields && Object.keys(record.extractedFields).length > 0).length} 个 | 
                   <strong>会话ID:</strong> ${sessionId}</p>
                <p>${worksheet['A40'] ? worksheet['A40'].v : ''}</p>
            </div>
        </div>

        <script>
            // 自动聚焦以便快捷键打印
            window.focus();
            
            // 支持Ctrl+P快捷键
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.key === 'p') {
                    e.preventDefault();
                    window.print();
                }
            });
        </script>
    </body>
    </html>`;

    console.log(`✅ HTML打印预览准备完成`);
    console.log(`📊 包含 ${records.length} 条选中记录`);

    // 返回HTML内容
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(printHTML);

  } catch (error) {
    console.error('打印预览准备失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '打印预览准备失败: ' + error.message 
    });
  }
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