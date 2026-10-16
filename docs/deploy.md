# Deploy BatOnBoard

| ส่วน                        | ที่ deploy                                | ไฟล์ตั้งค่า                                           |
| --------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Game server (`apps/server`) | Fly.io เครื่องเดียว รันตลอด ภูมิภาค `sin` | `fly.toml`, `apps/server/Dockerfile`, `.dockerignore` |
| เว็บ (`apps/web`)           | Vercel                                    | `apps/web/vercel.json`                                |

ลำดับ: **deploy server ก่อน** (เพื่อให้ได้ URL ไปตั้งในเว็บ) → deploy เว็บ → กลับไปใส่โดเมนเว็บใน `WEB_ORIGIN` ของ server

---

## 0. เตรียม

1. push โค้ดขึ้น GitHub (`origin` = `github.com/Kseraaa/BatOnBoard`)
   ```bash
   git push -u origin main
   ```
2. สมัคร/ล็อกอิน [fly.io](https://fly.io) และ [vercel.com](https://vercel.com) (Fly.io ต้องใส่บัตรเครดิตก่อนสร้างเครื่อง)
3. ติดตั้ง flyctl บน Windows (PowerShell):
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```
   แล้ว `fly auth login`

---

## 1. Game server บน Fly.io

1. **ตั้งชื่อ app** — เปิด `fly.toml` แก้ `app = "batonboard-server"` เป็นชื่อที่ไม่ซ้ำ (เช่น `batonboard-kseraaa`) URL จะเป็น `https://<ชื่อ>.fly.dev`
2. **สร้าง app** (ที่ root ของ repo):
   ```bash
   fly apps create <ชื่อ-app>
   ```
3. **deploy แบบเครื่องเดียว** — สำคัญ: ห้องเก็บในหน่วยความจำ ถ้ามี 2 เครื่อง ผู้เล่นจะกระจายไปคนละเครื่องแล้วหาห้องกันไม่เจอ
   ```bash
   fly deploy --ha=false
   ```
   (Fly build image ให้บน remote builder — ไม่ต้องมี Docker ในเครื่อง)
4. **ตรวจ**:
   ```bash
   fly status
   curl https://<ชื่อ-app>.fly.dev/health
   ```
   ต้องเห็น `{"ok":true}` และ `fly status` มีเครื่องเดียว (ถ้ามีสองเครื่อง: `fly scale count 1`)

> `WEB_ORIGIN` ใน `fly.toml` ตั้งไว้เป็น `https://batonboard.vercel.app` — แก้ให้ตรงโดเมนจริงหลังทำข้อ 2 แล้ว `fly deploy` อีกครั้ง

---

## 2. เว็บบน Vercel

1. Vercel → **Add New… → Project** → import repo `BatOnBoard`
2. ตั้งค่าโปรเจกต์:
   - **Root Directory**: `apps/web` (เปิด "Include files outside the root directory" ไว้ — ค่าเริ่มต้นเปิดอยู่แล้ว)
   - Framework: Next.js (`vercel.json` กำหนดไว้แล้ว รวมถึงคำสั่ง install/build)
   - Node.js Version: 24.x
3. **Environment Variables** (Production และ Preview):

   | Name                     | Value                        |
   | ------------------------ | ---------------------------- |
   | `NEXT_PUBLIC_SERVER_URL` | `https://<ชื่อ-app>.fly.dev` |

   ค่านี้ถูกฝังตอน build — ถ้าเปลี่ยนต้อง redeploy เว็บ

4. กด **Deploy** แล้วจดโดเมน production (เช่น `https://batonboard.vercel.app` หรือชื่อที่ Vercel ให้)

---

## 3. ผูก CORS ของ server กับโดเมนเว็บ

แก้ `WEB_ORIGIN` ใน `fly.toml` ให้เป็นโดเมนจริง แล้ว deploy server อีกรอบ:

```toml
WEB_ORIGIN = "https://batonboard.vercel.app"
```

ถ้าอยากให้ **preview deploy** ของ Vercel ต่อ server ได้ด้วย ใส่แบบ wildcard ได้ (คั่นด้วย comma) — `*` แทนหนึ่งช่วงของชื่อ subdomain (ตัวอักษร/ตัวเลข/ขีด) ใส่ slug ทีมของคุณไว้ท้ายเสมอ เพื่อไม่ให้เว็บคนอื่นบน vercel.app ต่อได้:

```toml
WEB_ORIGIN = "https://batonboard.vercel.app,https://batonboard-*-<team-slug>.vercel.app"
```

```bash
fly deploy --ha=false
```

---

## 4. ทดสอบหลัง deploy

1. เปิดเว็บบนมือถือ สร้างห้อง แล้วส่งลิงก์ `/r/<CODE>` ให้เพื่อน 2–3 คน
2. เริ่มเกม → ทุกคนกดค้างดูการ์ด → มีสายลับคนเดียว
3. ลองล็อกจอ/สลับแอปแล้วกลับมา → ต้องกลับเข้าห้องเดิมเอง
4. ดู log ของ server: `fly logs`

---

## ข้อควรรู้

- **deploy server ใหม่ = ห้องที่เล่นอยู่หายหมด** (state อยู่ในหน่วยความจำ) — deploy ตอนไม่มีคนเล่น จะแก้ได้เมื่อย้ายไป Redis (เฟสหลัง)
- `auto_stop_machines = "off"` ใน `fly.toml` กันเครื่องหลับ (ถ้าหลับ ห้องหาย) — เครื่อง `shared-cpu-1x` 256MB รันตลอดเดือน มีค่าใช้จ่ายเล็กน้อยตามราคา Fly.io
- เว็บไม่ต้องตั้ง CORS อะไร server เป็นคนตรวจ origin
- รันทดสอบ bundle ของ server ในเครื่องได้โดยไม่ต้องมี Docker:
  ```bash
  pnpm --filter @batonboard/server build
  pnpm --filter @batonboard/server start:prod
  ```
