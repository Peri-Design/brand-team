# PixVerse 品牌工作台

本地优先的多语言运营 Banner 延展工具，可根据同一主视觉生成 Web 与 App 首页 Banner，支持独立构图、批量调整、文字颜色、自动配色、工程备份及 PNG/ZIP 下载。

## 本地运行

```bash
npm install
npm start
```

打开 http://localhost:3000。服务同时提供 `/health` 健康检查接口。

## 部署

仓库使用 Express 托管 `public/` 下的静态文件，可直接部署到 Railway。生产环境会读取平台提供的 `PORT`。
