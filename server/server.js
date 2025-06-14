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
const ocrService = require('./ocr-service');
require('dotenv').config();

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

    // 2. 提取Quantità (长度) - 写入QUANTITA列
    console.log('提取Quantita...');
    const quantitaPatterns = [
      /MT\s*\|\s*([0-9]+[,.]?[0-9]*)\s*\|/i,        // MT | 105,00 | 格式
      /\|\s*([0-9]+[,.]?[0-9]*)\s*\|\s*$/m,         // 行末的数字
      /quantità[:\s]*\|\s*([^|\n]+)\s*\|/i,         // quantità列
      /VARIE\s+MISURE[^|]*\|\s*([0-9]+[,.]?[0-9]*)\s*\|/i  // VARIE MISURE后的数字
    ];
    
    for (const pattern of quantitaPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && parseFloat(match[1].replace(',', '.')) > 1) {
        structure.extractedData['Quantita'] = match[1].trim();
        console.log('✅ 找到Quantita:', match[1].trim());
        break;
      }
    }

    // 3. 提取Descrizione Articolo (加工内容) - 写入DESCRIZIONE DEI BENI列
    console.log('提取Descrizione Articolo...');
    
    // 四种可能的加工内容
    const targetDescriptions = [
      'NS .CERNIERE A SCORCIARE',
      'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS', 
      'CERNIERE A MONTARE CURSORE',
      'CERNIERE A MONTARE TIRETTO'
    ];

    let foundDescription = null;
    
    // 首先尝试精确匹配预定义的描述
    for (const target of targetDescriptions) {
      const regex = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (regex.test(text)) {
        foundDescription = target;
        console.log('✅ 精确匹配到:', target);
        break;
      }
    }

    // 如果没有精确匹配，尝试模糊匹配关键词
    if (!foundDescription) {
      console.log('尝试模糊匹配...');
      
      if (/CATENA.*CONTINUA.*METALLO/i.test(text)) {
        foundDescription = 'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS';
        console.log('✅ 模糊匹配到: CATENA CONTINUA METALLO');
      } else if (/NS.*CERNIERE.*SCORCIARE/i.test(text)) {
        foundDescription = 'NS .CERNIERE A SCORCIARE';
        console.log('✅ 模糊匹配到: NS CERNIERE A SCORCIARE');
      } else if (/CERNIERE.*CURSORE/i.test(text)) {
        foundDescription = 'CERNIERE A MONTARE CURSORE';
        console.log('✅ 模糊匹配到: CERNIERE CURSORE');
      } else if (/CERNIERE.*TIRETTO/i.test(text)) {
        foundDescription = 'CERNIERE A MONTARE TIRETTO';
        console.log('✅ 模糊匹配到: CERNIERE TIRETTO');
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
    
    // 使用多语言OCR识别
    const ocrResult = await ocrService.recognizeMultiLanguage(req.file.path);
    
    if (!ocrResult.success) {
      return res.status(500).json({
        success: false,
        error: 'OCR识别失败: ' + ocrResult.error
      });
    }

    // 分析文本结构并提取数据
    const structure = analyzeTemplateStructure(ocrResult.text);
    const processedData = processDefaultTemplate(structure.extractedData);
    
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
        extractedData: structure.extractedData,
        processedData: processedData,
        ocrResult: ocrResult,
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
      return res.status(400).json({ error: '没有上传PDF文件' });
    }

    console.log('开始PDF OCR识别并处理:', req.file.originalname);
    
    // 检查文件类型
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: '只支持PDF文件' });
    }

    const sessionId = req.query.sessionId;
    
    // 读取PDF文件并提取文本
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    
    console.log('PDF文本提取完成，文本长度:', pdfData.text.length);
    
    let finalText = pdfData.text;
    
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
          const tempImagePath = req.file.path.replace('.pdf', '_page1.png');
          fs.writeFileSync(tempImagePath, firstPageBuffer);
          
          console.log('PDF转图片成功，开始OCR识别:', tempImagePath);
          
          // 使用OCR识别图片
          const ocrResult = await ocrService.recognizeMultiLanguage(tempImagePath);
          
          if (ocrResult.success && ocrResult.text.length > finalText.length) {
            finalText = ocrResult.text;
            console.log('OCR识别成功，文本长度:', finalText.length);
          }
          
          // 清理临时图片文件
          setTimeout(() => {
            if (fs.existsSync(tempImagePath)) {
              fs.unlinkSync(tempImagePath);
            }
          }, 1000);
        }
      } catch (ocrError) {
        console.error('PDF OCR处理失败:', ocrError);
        // 继续使用原始PDF文本
      }
    }
    
    // 分析文本结构并提取数据
    const structure = analyzeTemplateStructure(finalText);
    const processedData = processDefaultTemplate(structure.extractedData);
    
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
        extractedData: structure.extractedData,
        processedData: processedData,
        pdfText: finalText,
        originalPdfText: pdfData.text,
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

    // 只返回提取的三个字段，简化输出
    const simplifiedResult = {
      'Numero Documento': structure.extractedData['Numero Documento'] || '',
      'Quantita': structure.extractedData['Quantita'] || '',
      'Descrizione Articolo': structure.extractedData['Descrizione Articolo'] || ''
    };

    res.json({
      success: true,
      message: 'PDF识别完成，提取到3个字段',
      extractedFields: simplifiedResult,
      mapping: {
        'Numero Documento': 'IMPORTO列 (G列)',
        'Quantita': 'QUANTITA列 (A列)', 
        'Descrizione Articolo': 'DESCRIZIONE DEI BENI列 (B列)'
      },
      sessionId: sessionId,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('PDF OCR处理API错误:', error);
    res.status(500).json({ 
      success: false,
      error: 'PDF处理服务错误: ' + error.message 
    });
  }
});

// 导出Excel文件 - 严格按照output.xlsx模板，保持所有原始格式
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

    // 读取原始模板
    const originalWorkbook = XLSX.readFile(templatePath);
    const sheetName = originalWorkbook.SheetNames[0];
    const originalWorksheet = originalWorkbook.Sheets[sheetName];

    // 创建新工作簿，完全复制原始模板
    const exportWorkbook = XLSX.utils.book_new();
    
    // 深度复制工作表，保持所有格式、合并单元格等
    const exportWorksheet = {};
    Object.keys(originalWorksheet).forEach(key => {
      exportWorksheet[key] = JSON.parse(JSON.stringify(originalWorksheet[key]));
    });

    console.log(`📋 使用模板: ${sheetName}`);
    console.log(`📊 准备写入 ${sessionData.documents.length} 条记录`);

    // 从第12行开始写入数据 (A11是表头，A12开始是数据)
    let currentRow = 12;
    
    sessionData.documents.forEach((item, index) => {
      if (item.extractedData) {
        console.log(`✍️ 写入第${index + 1}条记录到第${currentRow}行:`);
        
        // A列: QUANTITA
        if (item.extractedData['Quantita']) {
          const cellA = `A${currentRow}`;
          exportWorksheet[cellA] = { v: item.extractedData['Quantita'], t: 's' };
          console.log(`  ${cellA}: ${item.extractedData['Quantita']}`);
        }
        
        // B列: DESCRIZIONE DEI BENI
        if (item.extractedData['Descrizione Articolo']) {
          const cellB = `B${currentRow}`;
          exportWorksheet[cellB] = { v: item.extractedData['Descrizione Articolo'], t: 's' };
          console.log(`  ${cellB}: ${item.extractedData['Descrizione Articolo']}`);
        }
        
        // G列: IMPORTO (Numero Documento)
        if (item.extractedData['Numero Documento']) {
          const cellG = `G${currentRow}`;
          exportWorksheet[cellG] = { v: item.extractedData['Numero Documento'], t: 's' };
          console.log(`  ${cellG}: ${item.extractedData['Numero Documento']}`);
        }
        
        currentRow++;
      }
    });

    // 确保工作表范围包含所有数据，包括A1单元格
    const originalRange = XLSX.utils.decode_range(originalWorksheet['!ref']);
    
    // 扩展范围以包含A1单元格（如果存在）
    let finalRange = {
      s: { c: 0, r: 0 }, // 从A1开始
      e: { c: originalRange.e.c, r: Math.max(originalRange.e.r, currentRow - 1) }
    };
    
    // 如果有新数据行，扩展范围
    if (currentRow - 1 > originalRange.e.r) {
      finalRange.e.r = currentRow - 1;
    }
    
    exportWorksheet['!ref'] = XLSX.utils.encode_range(finalRange);

    // 添加工作表到新工作簿
    XLSX.utils.book_append_sheet(exportWorkbook, exportWorksheet, sheetName);

    // 生成文件
    const filename = `FileCognize_Export_${sessionId}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    const filepath = path.join(__dirname, 'exports', filename);
    
    // 确保exports目录存在
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // 写入文件，保持所有原始格式
    XLSX.writeFile(exportWorkbook, filepath);

    console.log(`✅ 导出完成: ${filename}`);
    console.log(`📊 成功导出 ${sessionData.documents.length} 条记录到模板`);
    
    // 验证合并单元格是否保持
    if (exportWorksheet['!merges']) {
      console.log(`🔗 保持了 ${exportWorksheet['!merges'].length} 个合并单元格`);
    }

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