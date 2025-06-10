# FileCognize - 订购单识别转Excel工具

一个现代化的订购单图片识别和Excel转换工具，支持通过网页界面上传图片或调用摄像头拍摄订购单，自动识别内容并转换为Excel格式。

## 🚀 功能特点

### 核心功能
- **图片上传/相机调用**: 支持拖拽上传、文件选择和设备相机拍摄
- **OCR识别**: 使用Tesseract.js进行中英文文字识别
- **内容解析**: 智能提取订单号、供应商、商品信息等结构化数据
- **Excel生成**: 生成标准格式的Excel文件，支持自定义文件名和工作表名
- **数据校正**: 支持手动编辑识别结果，确保数据准确性

### 附加功能
- **实时预览**: 上传后即时预览图片和识别进度
- **多格式支持**: 支持JPG、PNG、GIF、BMP、WEBP等常见图片格式
- **响应式设计**: 支持PC和移动端访问
- **数据导出**: 支持Excel和JSON格式导出
- **安全性**: 临时文件自动清理，文件大小限制

## 🛠️ 技术栈

### 前端
- React 18 + TypeScript
- Tailwind CSS (样式框架)
- Tesseract.js (OCR识别)
- xlsx.js (Excel生成)
- react-dropzone (文件上传)
- react-hot-toast (消息提示)

### 后端
- Node.js + Express
- Multer (文件上传处理)
- Helmet (安全中间件)
- CORS (跨域支持)
- Rate Limiting (请求限制)

### 部署
- GitHub (代码托管)
- Railway (云部署)

## 📦 安装和运行

### 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0

### 本地开发

1. **克隆仓库**
```bash
git clone https://github.com/your-username/filecognize.git
cd filecognize
```

2. **安装依赖**
```bash
# 安装后端依赖
npm install

# 安装前端依赖
npm run install-client
```

3. **启动开发服务器**
```bash
# 同时启动前后端开发服务器
npm run dev

# 或分别启动
npm run server  # 后端 (端口5000)
npm run client  # 前端 (端口3000)
```

4. **访问应用**
   - 前端: http://localhost:3000
   - 后端API: http://localhost:5000

### 生产部署

1. **构建前端**
```bash
npm run build
```

2. **启动生产服务器**
```bash
npm start
```

## 🎯 使用说明

### 基本流程
1. **上传图片**: 拖拽图片到上传区域或点击选择文件，也可以使用相机拍摄
2. **OCR识别**: 系统自动进行文字识别，显示识别进度
3. **数据校正**: 检查并编辑识别结果，确保数据准确
4. **生成Excel**: 配置文件名和工作表名，下载Excel文件

### 支持的图片格式
- JPEG/JPG
- PNG
- GIF
- BMP
- WEBP

### 文件大小限制
- 最大文件大小: 10MB
- 建议图片清晰度高，文字内容清晰可见

## 📋 API文档

### 上传接口
```http
POST /api/upload
Content-Type: multipart/form-data

参数:
- image: 图片文件

响应:
{
  "success": true,
  "message": "文件上传成功",
  "file": {
    "filename": "upload_1234567890.jpg",
    "originalname": "order.jpg",
    "size": 1048576,
    "path": "/path/to/file"
  }
}
```

### 健康检查
```http
GET /api/health

响应:
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔧 配置说明

### 环境变量
```env
NODE_ENV=production
PORT=5000
ALLOWED_ORIGINS=https://your-domain.com
OCR_MAX_FILE_SIZE=10485760
TEMP_FILE_CLEANUP_TIME=30
```

### 安全特性
- 文件类型验证
- 文件大小限制
- 请求频率限制
- 自动清理临时文件
- CORS配置
- Helmet安全头

## 🚀 部署到Railway

1. **推送到GitHub**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **连接Railway**
   - 登录 [Railway](https://railway.app)
   - 创建新项目
   - 连接GitHub仓库

3. **配置环境变量**
   - 在Railway控制台设置环境变量
   - 设置 `NODE_ENV=production`

4. **自动部署**
   - Railway会自动检测并部署应用
   - 访问分配的域名

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## ⚠️ 注意事项

- OCR识别准确率取决于图片质量
- 建议上传清晰、对比度高的图片
- 复杂格式的订购单可能需要手动调整识别结果
- 临时文件会在30分钟后自动删除

## 📞 联系方式

- 项目地址: https://github.com/your-username/filecognize
- 问题反馈: https://github.com/your-username/filecognize/issues

---

**FileCognize** - 让订购单数字化变得简单高效！ 