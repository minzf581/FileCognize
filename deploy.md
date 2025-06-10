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
CI=false
NODE_OPTIONS=--max_old_space_size=1024
```

### 步骤4: 部署设置
Railway会自动检测到：
- `.nvmrc` - Node.js版本 (18.18.0)
- `nixpacks.toml` - 构建配置
- `railway.json` - 部署配置
- 自动运行 `npm run railway-build`
- 启动命令: `npm start`

### 步骤5: 验证部署
1. 等待部署完成（通常3-5分钟）
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
├── nixpacks.toml          # Nixpacks构建配置
├── .nvmrc                 # Node.js版本
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

### 构建失败问题

1. **内存不足错误 (Exit code 249)**
   - ✅ 已优化：添加了 `--max_old_space_size=1024` 内存限制
   - ✅ 已优化：设置 `CI=false` 跳过警告检查
   - ✅ 已优化：使用 `--legacy-peer-deps` 解决依赖冲突

2. **依赖安装失败**
   - 检查网络连接稳定性
   - Railway会自动重试失败的构建

3. **TypeScript编译错误**
   - ✅ 已优化：构建时跳过严格模式检查
   - 本地运行 `npm run build` 检查编译问题

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

1. **Railway部署超时**
   - ✅ 已优化：增加了健康检查超时时间
   - ✅ 已优化：优化了构建过程和内存使用

2. **静态文件访问404**
   - 确保 `npm run railway-build` 成功执行
   - 检查build目录是否存在

3. **部署后服务不响应**
   - 检查Railway日志中的错误信息
   - 确保PORT环境变量正确设置

## 📈 性能优化建议

1. **构建优化**
   - ✅ 使用增量构建
   - ✅ 内存限制优化
   - ✅ 依赖缓存优化

2. **图片预处理**
   - 建议上传清晰、对比度高的图片
   - 避免过大的图片文件

3. **OCR优化**
   - 图片中文字应清晰可见
   - 避免复杂背景和手写字体

4. **服务器资源**
   - Railway免费版有内存限制
   - 考虑升级计划以获得更好性能

## 🛡️ 安全考虑

- 文件大小限制（10MB）
- 临时文件自动清理（30分钟）
- 请求频率限制
- CORS配置
- 安全头设置（Helmet）

## 🔄 重新部署步骤

如果之前部署失败，按以下步骤重新部署：

1. **推送最新代码到GitHub**
   ```bash
   git add .
   git commit -m "优化Railway部署配置"
   git push origin main
   ```

2. **在Railway控制台**
   - 进入项目设置
   - 点击 "Redeploy" 或 "Deploy Latest"
   - 监控构建日志

3. **验证部署**
   - 等待构建完成（现在应该成功）
   - 访问应用URL
   - 测试上传和OCR功能

---

**Happy Deploying! 🚀** 