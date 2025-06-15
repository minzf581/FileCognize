# 使用Node.js官方镜像
FROM node:18-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖和LibreOffice
RUN apt-get update && apt-get install -y \
    # LibreOffice和相关依赖
    libreoffice \
    # 字体支持
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    # 图像处理依赖
    imagemagick \
    # 其他必要工具
    curl \
    wget \
    ca-certificates \
    # 清理APT缓存
    && rm -rf /var/lib/apt/lists/*

# 设置LibreOffice环境变量
ENV LIBREOFFICE_HEADLESS=true
ENV SAL_USE_VCLPLUGIN=gen
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装Node.js依赖
RUN npm ci --only=production

# 复制应用程序文件
COPY . .

# 创建必要的目录
RUN mkdir -p server/uploads server/exports server/templates

# 确保LibreOffice可以在无头模式下运行
RUN libreoffice --headless --invisible --nodefault --nolockcheck --nologo --norestore --version

# 设置适当的权限
RUN chmod +x server/server.js

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["node", "server/server.js"] 