const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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
    const targetDir = uploadType === 'template' ? templatesDir : uploadsDir;
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const prefix = req.body.uploadType === 'template' ? 'template' : 'upload';
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
    
    if (uploadType === 'template') {
      // 模板文件支持Excel和JSON
      if (file.mimetype.includes('spreadsheet') || 
          file.mimetype.includes('excel') || 
          file.mimetype === 'application/json' ||
          file.originalname.match(/\.(xlsx|xls|json)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('模板文件只支持Excel(.xlsx, .xls)和JSON格式'), false);
      }
    } else {
      // 普通文件支持图片和PDF
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('只支持图片格式文件和PDF文件'), false);
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
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(pdfBuffer);
        fileInfo.extractedText = pdfData.text;
        fileInfo.pageCount = pdfData.numpages;
      } catch (pdfError) {
        console.error('PDF解析错误:', pdfError);
        fileInfo.extractedText = '';
        fileInfo.pdfError = 'PDF解析失败，请尝试其他文件';
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
      .filter(file => file.match(/\.(xlsx|xls|json)$/i))
      .map(file => {
        const filePath = path.join(templatesDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          originalname: file.replace(/^template_\d+_/, ''),
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

// 删除模板API
app.delete('/api/templates/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(templatesDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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