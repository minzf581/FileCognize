# 使用Node 18官方镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV CI=false
ENV GENERATE_SOURCEMAP=false

# 复制package文件
COPY package*.json ./

# 安装后端依赖
RUN npm ci --only=production

# 复制前端package文件
COPY client/package*.json ./client/

# 进入client目录并安装前端依赖
WORKDIR /app/client
RUN npm ci

# 回到根目录
WORKDIR /app

# 复制所有源代码
COPY . .

# 构建前端应用
WORKDIR /app/client
RUN npm run build

# 回到根目录
WORKDIR /app

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["npm", "start"] 