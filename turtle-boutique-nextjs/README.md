# 頑龜爬蟲 STReptile — 前台（Next.js + Supabase）

這是真正接資料庫的前台，取代原本純畫面的 demo。視覺設計完全沿用你之前確認過的版本，差別只是資料改成從 Supabase 即時抓。

## 部署前要做的事

### 1. 先在 Supabase 建好資料庫
打開你的 `turtle-boss` 專案 → 左側 **SQL Editor** → 新增一個 Query → 把 `../turtle-boutique-backend/schema.sql` 整份貼進去 → Run。
（這份 SQL 可以重複執行不會壞掉，裡面都有防呆判斷。）

### 2. 環境變數
專案裡已經有 `.env.local`（本機測試用，不會上傳到 GitHub），內容是：

```
NEXT_PUBLIC_SUPABASE_URL=https://ddhtaubxqklwydgokhju.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PGL7DIYRNiycFaWlv2zk9A_ZU4Dcz_X
```

部署到 Vercel 的時候，要在 Vercel 專案的 **Settings → Environment Variables** 把這兩個也加進去（名稱要一模一樣），不然線上版本會抓不到資料庫。這兩個值是「公開金鑰」，設計上就是可以讓瀏覽器看到的，不是密碼，放心加。

### 3. 部署方式（跟之前一樣）
1. 建一個新的 GitHub repo（跟 admin、跟你自己的 turtle-erp 都要分開）
2. 把這個資料夾整個上傳上去（不要上傳 `node_modules`、`.next`，`.gitignore` 已經排除了）
3. 到 Vercel「Import Project」選這個 repo，Framework 會自動偵測成 Next.js（不是之前的 Other）
4. 把上面的兩個環境變數加進去
5. Deploy

## 目前這版做到哪裡

- ✅ 分類、個體列表、個體詳情都是「真的」從 Supabase 讀的，不是假資料
- ✅ 成本／跑單價格這些敏感欄位，資料庫層級就不會透過這個網站拿到（詳見後端說明）
- ✅ 瀏覽個體詳情會呼叫 `record_turtle_view`，之後後台的瀏覽數據會是真的
- ⏳ 收藏、購物袋、會員登入、結帳 — 下一階段（Phase 2）再接，現在先讓「資料庫 + 龜隻展示」這個地基穩固
- ⏳ 一開始資料庫是空的（demo 假資料已經清掉了），要先在後台把老闆的真烏龜資料建進去，前台才會看到東西；在那之前前台會顯示「目前這個分類還沒有上架的個體」
