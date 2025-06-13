const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// 分析模板结构的辅助函数
function analyzeTemplateStructure(text) {
  try {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const structure = {
      headers: [],
      sections: [],
      tables: [],
      suggestedMapping: {}
    };

    // 查找表格标题和结构
    const tableHeaders = [];
    const tableIndicators = ['产品', '商品', '名称', '数量', '单价', '金额', '总计', '小计'];
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // 识别可能的表格标题
      if (tableIndicators.some(indicator => trimmedLine.includes(indicator))) {
        tableHeaders.push({
          line: trimmedLine,
          index: index,
          position: index
        });
      }
      
      // 识别章节标题
      if (trimmedLine.length < 50 && (
        trimmedLine.includes('信息') || 
        trimmedLine.includes('明细') ||
        trimmedLine.includes('汇总') ||
        trimmedLine.match(/^\d+[.\s]/))) {
        structure.sections.push({
          title: trimmedLine,
          position: index
        });
      }
    });

    structure.headers = tableHeaders;
    
    // 建议映射关系
    if (tableHeaders.length > 0) {
      structure.suggestedMapping = {
        productNameColumn: 'A',
        quantityColumn: 'B', 
        unitPriceColumn: 'C',
        totalPriceColumn: 'D',
        startRow: tableHeaders[0].position + 2
      };
    }

    return structure;
  } catch (error) {
    console.error('分析模板结构错误:', error);
    return {
      headers: [],
      sections: [],
      tables: [],
      suggestedMapping: {}
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

// 删除模板API
app.delete('/api/templates/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
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

// 生产环境下提供静态文件
if (process.env.NODE_ENV === 'production') {
  // 尝试多个可能的构建文件位置
  const buildPaths = [
    path.join(__dirname, '../build'),        // 根目录的build文件夹
    path.join(__dirname, '../client/build')  // client目录的build文件夹
  ];
  
  let buildPath = null;
  for (const testPath of buildPaths) {
    if (fs.existsSync(path.join(testPath, 'index.html'))) {
      buildPath = testPath;
      console.log(`找到构建文件在: ${buildPath}`);
      break;
    }
  }
  
  if (buildPath) {
    app.use(express.static(buildPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  } else {
    console.error('未找到构建文件，检查以下路径:');
    buildPaths.forEach(p => console.error(`- ${p}`));
    
    app.get('*', (req, res) => {
      res.status(404).json({ error: '前端文件未找到，请检查构建配置' });
    });
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