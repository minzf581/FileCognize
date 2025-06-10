# 文件整理工具

一个现代化的文件整理工具，支持图片和PDF文件的智能识别，将内容转换为标准Excel表格。支持自定义模板，提供便捷的文件管理解决方案。

## ✨ 功能特性

### 🔍 智能识别
- **多格式支持**：支持图片文件（JPG、PNG、GIF、BMP、WEBP）和PDF文档
- **OCR识别**：使用Tesseract.js进行图片文字识别（支持中英文）
- **PDF解析**：自动提取PDF文档中的文本内容
- **智能解析**：自动识别订单号、供应商、商品信息等结构化数据

### 📋 模板管理
- **模板上传**：支持Excel和JSON格式的自定义模板
- **模板选择**：可选择不同的输出模板定义数据格式
- **模板复用**：一次上传，多次使用，提高工作效率

### 📊 数据处理
- **手动编辑**：支持对识别结果进行手动编辑和校正
- **结构化数据**：自动整理为订单号、供应商、商品清单等结构
- **数据验证**：自动计算总价和统计信息

### 💾 多格式导出
- **Excel导出**：生成标准Excel文件，支持多工作表
- **JSON导出**：导出标准JSON格式数据
- **自定义格式**：根据选择的模板生成对应格式的文件

### 🎨 用户体验
- **响应式设计**：支持PC和移动端访问
- **实时预览**：实时显示识别进度和结果预览
- **拖拽上传**：支持拖拽文件上传和相机拍摄
- **错误提示**：友好的错误提示和操作引导

## 🛠️ 技术栈

### 前端
- **React 18** + **TypeScript** - 现代化的前端框架
- **Tailwind CSS** - 原子化CSS框架
- **Tesseract.js** - 客户端OCR识别
- **xlsx.js** - Excel文件生成
- **react-dropzone** - 文件拖拽上传
- **react-hot-toast** - 消息提示组件

### 后端
- **Node.js** + **Express** - 轻量级服务器框架
- **Multer** - 文件上传处理
- **pdf-parse** - PDF文档解析
- **Helmet** - 安全中间件
- **CORS** - 跨域资源共享
- **express-rate-limit** - 请求频率限制

## 🚀 快速开始

### 环境要求
- Node.js 18.x 或更高版本
- npm 8.0.0 或更高版本

### 本地开发

1. **克隆项目**
```bash
git clone https://github.com/minzf581/FileCognize.git
cd FileCognize
```

2. **安装依赖**
```bash
npm install
cd client && npm install && cd ..
```

3. **启动开发服务器**
```bash
npm run dev
```

4. **访问应用**
- 前端：http://localhost:3000
- 后端：http://localhost:5000

### 生产部署

1. **构建前端**
```bash
cd client
npm run build
cd ..
```

2. **启动生产服务器**
```bash
NODE_ENV=production npm start
```

### Railway部署

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/your-template)

项目已配置好Railway部署，只需：
1. 连接GitHub仓库
2. 自动部署完成

## 📖 使用指南

### 基本使用流程

1. **上传文件**
   - 点击上传区域选择文件
   - 拖拽文件到上传区域
   - 使用相机拍摄（移动端）
   - 支持图片和PDF格式

2. **选择模板**（可选）
   - 上传Excel或JSON模板文件
   - 选择已有模板定义输出格式
   - 模板将影响最终导出的数据结构

3. **内容识别**
   - 图片文件自动进行OCR识别
   - PDF文件自动提取文本内容
   - 查看识别进度和结果

4. **编辑数据**
   - 手动编辑识别的文本内容
   - 修改解析后的结构化数据
   - 添加或删除商品项目

5. **导出文件**
   - 下载Excel格式文件
   - 导出JSON格式数据
   - 重新开始处理新文件

### 支持的文件格式

#### 输入文件
- **图片格式**：JPG、JPEG、PNG、GIF、BMP、WEBP
- **PDF文档**：标准PDF文件（支持文本提取）

#### 模板文件
- **Excel模板**：.xlsx、.xls格式
- **JSON模板**：.json格式

#### 输出文件
- **Excel文件**：.xlsx格式，包含多个工作表
- **JSON数据**：标准JSON格式，包含完整的结构化数据

### API端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/upload` | POST | 上传文件（图片/PDF/模板） |
| `/api/templates` | GET | 获取模板列表 |
| `/api/templates/:filename` | DELETE | 删除指定模板 |
| `/api/health` | GET | 健康检查 |

## 🔧 配置说明

### 环境变量

```bash
# 服务器端口
PORT=5000

# 运行环境
NODE_ENV=production

# 禁用生成源映射（生产环境）
GENERATE_SOURCEMAP=false

# 禁用CI模式（避免警告错误）
CI=false
```

### 文件限制

- **最大文件大小**：10MB
- **模板文件类型**：Excel (.xlsx, .xls), JSON (.json)
- **输入文件类型**：图片 (image/*), PDF (application/pdf)
- **临时文件清理**：30分钟自动删除

## 🏗️ 项目结构

```
FileCognize/
├── client/                 # 前端应用
│   ├── public/            # 静态资源
│   │   ├── components/    # React组件
│   │   │   ├── Header.tsx          # 应用头部
│   │   │   ├── ImageUploader.tsx   # 文件上传组件
│   │   │   ├── OCRProcessor.tsx    # 文件识别处理
│   │   │   ├── ExcelGenerator.tsx  # Excel生成组件
│   │   │   └── TemplateManager.tsx # 模板管理组件
│   │   ├── types/         # TypeScript类型定义
│   │   ├── App.tsx        # 主应用组件
│   │   └── index.tsx      # 应用入口
│   ├── package.json       # 前端依赖配置
│   └── tailwind.config.js # Tailwind配置
├── server/                # 后端服务
│   └── server.js          # Express服务器
├── docs/                  # 文档目录
├── package.json           # 项目配置
├── railway.json           # Railway部署配置
├── nixpacks.toml          # Nixpacks构建配置
└── README.md             # 项目说明
```

## 🤝 贡献指南

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 📝 更新日志

### v1.1.0 (2024-01-XX)
- 🆕 增加PDF文件支持
- 🆕 新增模板管理功能
- 🆕 支持自定义输出格式
- 💅 更新UI设计，改名为"文件整理"
- 🔧 优化文件处理流程
- 🐛 修复多项已知问题

### v1.0.0 (2024-01-XX)
- 🎉 初始版本发布
- ✨ 支持图片OCR识别
- ✨ Excel文件生成
- ✨ 响应式设计
- ✨ Railway部署支持

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🌟 致谢

- [Tesseract.js](https://tesseract.projectnaptha.com/) - 优秀的JavaScript OCR库
- [React](https://reactjs.org/) - 强大的前端框架
- [Tailwind CSS](https://tailwindcss.com/) - 现代化的CSS框架
- [Express](https://expressjs.com/) - 快速的Node.js服务器框架

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- GitHub Issues: [提交问题](https://github.com/minzf581/FileCognize/issues)
- 项目地址: https://github.com/minzf581/FileCognize

---

⭐ 如果这个项目对您有帮助，请给我们一个星标！ 