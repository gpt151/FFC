# LytPay 红包平台 (Lyt IT Pay Red Packet)

基于 **Next.js 16 + HeroUI v3 + Lyt IT Pay API** 构建的社交红包平台，支持一键部署至 **Vercel** 等 Serverless / 容器平台。

## 核心功能

1. **包红包生成收款链接 (`/`)**
   - 支持 **拼手气红包**（二倍均值随机算法）与 **普通等额红包**。
   - 支持自定义祝福语、署名、领取口令与有效期。
   - 内置 **5% 平台手续费**计算，自动结算至 `1218545105@qq.com`（支持外扣/内扣模式与后台动态配置）。
   - 调用 Lyt IT Pay `create_payment_link` 生成官方收银台链接与二维码。

2. **付款自动核验与激活码生成 (`/packet/[id]`)**
   - 自动轮询及手动触发 `get_payment_link_status` 核验付款状态。
   - 付款确认后立即将 5% 手续费结算至 `1218545105@qq.com`（若托管账户本身即为 `1218545105@qq.com`，则自动标记为同账户自留）。
   - 激活后展示专属 **红包激活码**（`LYT-XXXX-XXXX`）、**一键领取链接**、二维码与群聊分享文案。

3. **激活码/链接领红包 (`/claim` & `/claim/[code]`)**
   - 支持输入红包码或直接点击领取链接打开红包。
   - 支持 **Lyt IT Pay OAuth (`auth.php`) 一键授权领取**，也支持手动输入 Lyt IT Pay 注册邮箱领取（可在后台开关控制）。
   - 使用原子事务锁防止超领/并发冲突；若 Lyt IT Pay `transfer` 失败会自动回滚剩余份额。

4. **数据运营后台 (`/admin`)**
   - **KPI 统计**：累计流水、5% 手续费收益、已结算/待补发状态、红包池与领取人次、托管账户实时余额。
   - **14 天趋势图**：每日流水与手续费可视化柱状图。
   - **订单与流水明细**：支持搜索、状态筛选、查看单个红包全部领取明细、手动核验、补发失败手续费、撤销未付款链接及导出 CSV。
   - **官方对账**：直接读取 Lyt IT Pay `get_balance` 与 `get_transactions` 核对账目。

## Vercel 部署指南

1. 在 Vercel 导入本仓库 `FFC`。
2. 在 Vercel Marketplace / Storage 中绑定 **Neon** 或 **Postgres**（会自动注入 `DATABASE_URL` / `POSTGRES_URL`，应用启动时会自动初始化数据表）。
3. 配置以下环境变量：

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `LYT_MERCHANT_EMAIL` | 是 | Lyt IT Pay 托管收款/发款账户邮箱 |
| `LYT_MERCHANT_PASSWORD` | 是 | 托管账户密码（用于 `login` 与 `transfer`） |
| `FEE_RECIPIENT_EMAIL` | 否 | 手续费收款邮箱，默认 `1218545105@qq.com` |
| `FEE_RATE` | 否 | 手续费比例，默认 `0.05`（5%） |
| `FEE_MODE` | 否 | `sender_pays`（外扣，默认）或 `deduct_from_packet`（内扣） |
| `ADMIN_PASSWORD` | 是 | `/admin` 管理后台登录密码 |
| `SESSION_SECRET` | 是 | Cookie 签名密钥（建议 32 位以上随机字符串） |
| `DATABASE_URL` | 生产必填 | PostgreSQL 连接串（本地开发留空自动使用 `.data/store.json`） |

## 本地开发

```bash
cp .env.example .env.local
npm install
npm run dev
```
