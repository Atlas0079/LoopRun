# 圈界 LoopRun

真实跑步闭环产生 50 米六边形领地，服务器计算占领、加固、削弱和匹配。

当前交付目标为 **Android 内测 App + 独立 GPS 服务端**：React Native / TypeScript / Expo、MapLibre / OpenStreetMap 原生地图、Android 前台定位服务、本机 SQLite、Fastify 与 PostgreSQL / PostGIS。现有地理计算和规则继续复用。

## 项目入口

- apps/mobile/：Android 客户端与本地原生模块。
- server/：GPS 服务端、现有规则引擎和独立道路回放服务。
- shared/：50 米网格与共用地理计算。
- web/：浏览器道路回放和规则验证界面。
- [首版规则](docs/规则.md)
- [接入与部署](docs/接入与部署.md)

## 首轮目标

地图支持“我的领地 / 同池争夺”。实际 GPS 先写本机 SQLite，锁屏持续记录，断网保留，恢复后分批上传并幂等结算。跨池公开展示范围待确认。

安装包编译、接口联调与户外锁屏分别验证，不能以编译或道路回放替代真机结果。真机与远程 HTTPS 环境尚待配置。测试、辅助预览和验证记录仅本地保留。

## 浏览器道路回放

Node.js 24+，执行 npm install、npm run dev 后打开 http://localhost:4173 。既有回放库保持独立，不进入 GPS 内测库，页面明确标注非真人 GPS。

## Android 内测版

- APK：artifacts/LoopRun-0.3.0-android-arm64.apk，arm64、Android 7.0+。
- 本机数据库：npm run gps:db。
- GPS API：npm run gps:dev，默认 http://127.0.0.1:4180 。
- 重新打包：npm run android:build。

手机连接与邀请口令配置见[接入与部署](docs/接入与部署.md)。按本轮范围不部署公网；安装包编译与真机运行状态分别记录。
