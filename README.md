# 圈界 LoopRun

真实跑步闭环产生 50 米六边形领地，服务器计算占领、加固、削弱和匹配。

当前客户端仅交付 **Android App**：React Native / TypeScript / Expo、MapLibre / OpenStreetMap 原生地图、Android 前台定位服务、本机 SQLite。服务端使用 Fastify、PostgreSQL / PostGIS，并复用现有地理计算与游戏规则。

## Android 用户体验

开发者模式默认关闭。普通模式提供真实 GPS 跑步、我的领地、同池争夺、跑友排名与私有跑步记录；途中断网保存在本机，联网后分批上传、幂等结算。

设置中开启开发者模式后，切换至独立开发测试账户与数据库，显示模拟路线、机器人路线预览、单独指定机器人跑步和 5 人自动测试。模拟跑步约 14 秒播放完成，再通过正常采样与结算接口提交。机器人使用相同用户类型、鉴权和业务规则，不预置领地或强制入池。

两套服务器连接和凭据分别保存在本机 Keystore 保护的配置中。切换前必须处理本机与服务器未完成活动；关闭后恢复普通账户视角，隐藏测试工具与测试记录。

## 本机启动

需要 Node.js 24+、PostgreSQL 18 / PostGIS、Android SDK 和 JDK。根目录与 apps/mobile/ 分别执行 npm ci。

1. npm run gps:db：准备本机普通 GPS 数据库。
2. npm run gps:dev：启动普通服务，默认 http://127.0.0.1:4180 。
3. npm run developer:db：在同一本机 PostgreSQL 实例内准备独立开发库。
4. npm run developer:dev：启动开发服务，默认 http://127.0.0.1:4182 。
5. npm run android:build：输出 artifacts/LoopRun-0.4.0-android-arm64.apk。

手机通过 USB 连接后，对 4180 和 4182 分别执行 adb reverse。App 设置中填写对应服务地址和各自的内测邀请口令。普通口令位于 .env.gps.local，开发口令位于 .env.development.local，不写入客户端或共享文档。

Android 模拟器构建可用 npm run android:build -- --architectures=arm64-v8a,x86_64，同时包含真机与模拟器架构。

## 项目入口

- apps/mobile/：唯一客户端交付与验收入口。
- server/gps.ts：普通 GPS 与独立开发服务，共用活动、采样及结算接口。
- server/replay-bots.mjs：通过正常 HTTP 接口运行的自动用户。
- shared/：50 米网格与共用地理计算。
- [首版规则](docs/规则.md)
- [接入与部署](docs/接入与部署.md)

安装包构建、模拟接口与真实户外 GPS 分别验证，不能互相替代。真机锁屏、耗电和弱网结果保持待验证；测试、截图与验证记录仅本地保留。浏览器源码保留，不作为当前交付或验收入口。
