# 使用Node 18官方镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS="--max_old_space_size=512"

# 复制package文件
COPY package*.json ./

# 安装后端依赖（仅生产依赖）
RUN npm ci --only=production --no-audit --no-fund

# 复制前端package文件
COPY client/package*.json ./client/

# 安装前端依赖
WORKDIR /app/client
RUN npm ci --no-audit --no-fund

# 回到根目录并复制源代码
WORKDIR /app
COPY . .

# 构建前端应用（在后端目录运行）
RUN cd client && NODE_OPTIONS="--max_old_space_size=512" npm run build

# 清理前端依赖以减少镜像大小
RUN rm -rf client/node_modules

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["npm", "start"] 