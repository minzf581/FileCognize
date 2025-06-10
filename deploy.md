# FileCognize 部署指南

## 🚀 Railway 部署

### 步骤1: 准备Railway账户
1. 访问 [Railway.app](https://railway.app)
2. 使用GitHub账户登录
3. 连接GitHub仓库权限

### 步骤2: 创建新项目
1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 选择 `minzf581/FileCognize` 仓库

### 步骤3: 配置环境变量
在Railway项目设置中添加以下环境变量：

```env
NODE_ENV=production
PORT=5000
```

### 步骤4: 部署设置
Railway会自动检测到：
- `package.json` - Node.js项目
- `railway.json` - 部署配置
- 自动运行 `npm run heroku-postbuild`
- 启动命令: `npm start`

### 步骤5: 验证部署
1. 等待部署完成（通常2-3分钟）
2. 访问分配的域名
3. 检查健康检查端点: `https://your-app.railway.app/api/health`

## 🔧 本地开发

### 开发环境启动
```bash
# 安装依赖
npm install
npm run install-client

# 启动开发服务器（前后端同时）
npm run dev

# 或分别启动
npm run server  # 后端 localhost:5000
npm run client  # 前端 localhost:3000
```

### 生产环境测试
```bash
# 构建前端
npm run build

# 启动生产服务器
npm start
```

## 📦 项目结构

```
FileCognize/
├── server/
│   ├── server.js           # Express后端服务器
│   └── uploads/            # 临时文件目录（自动创建）
├── client/                 # React前端应用
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── types/          # TypeScript类型定义
│   │   └── ...
│   ├── public/
│   └── build/              # 构建输出（生产环境）
├── package.json            # 后端依赖和脚本
├── railway.json           # Railway部署配置
├── README.md              # 项目说明文档
└── .gitignore             # Git忽略文件
```

## 🌐 功能特点

- ✅ 图片拖拽上传
- ✅ 相机拍摄支持
- ✅ OCR文字识别（中英文）
- ✅ 数据结构化解析
- ✅ Excel文件生成
- ✅ JSON数据导出
- ✅ 响应式设计（PC/移动端）
- ✅ 实时预览和进度显示
- ✅ 数据手动编辑校正
- ✅ 安全文件处理

## 🔍 故障排除

### 常见问题

1. **OCR识别速度慢**
   - 这是正常现象，Tesseract.js需要下载语言包
   - 首次使用会较慢，后续会有缓存

2. **文件上传失败**
   - 检查文件大小（最大10MB）
   - 确保文件格式支持（JPG, PNG等）

3. **Excel下载不工作**
   - 确保浏览器允许下载
   - 检查浏览器兼容性

4. **移动端相机不工作**
   - 需要HTTPS环境
   - 确保允许相机权限

### 部署问题

1. **Railway部署失败**
   - 检查 `package.json` 中的engines字段
   - 确保 `heroku-postbuild` 脚本正确

2. **静态文件访问404**
   - 确保 `npm run build` 成功执行
   - 检查build目录是否存在

## 📈 性能优化建议

1. **图片预处理**
   - 建议上传清晰、对比度高的图片
   - 避免过大的图片文件

2. **OCR优化**
   - 图片中文字应清晰可见
   - 避免复杂背景和手写字体

3. **服务器资源**
   - Railway免费版有内存限制
   - 考虑升级计划以获得更好性能

## 🛡️ 安全考虑

- 文件大小限制（10MB）
- 临时文件自动清理（30分钟）
- 请求频率限制
- CORS配置
- 安全头设置（Helmet）

---

**Happy Deploying! 🚀** 