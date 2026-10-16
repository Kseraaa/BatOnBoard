# Deploy BatOnBoard (Vercel อย่างเดียว)

ทั้งเว็บและ API ของห้องอยู่ใน `apps/web` (Next.js) deploy เป็นโปรเจกต์ Vercel เดียว
ห้องเก็บใน **Upstash Redis** ซึ่งเชื่อมผ่าน Vercel Marketplace ได้ในไม่กี่คลิก

| ส่วน                    | ที่ deploy             | ไฟล์ตั้งค่า                                                   |
| ----------------------- | ---------------------- | ------------------------------------------------------------- |
| เว็บ + API (`apps/web`) | Vercel                 | `apps/web/vercel.json`                                        |
| ที่เก็บห้อง             | Upstash Redis (แผนฟรี) | env `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Vercel ใส่ให้เอง) |

---

## 1. สร้างโปรเจกต์บน Vercel

1. ล็อกอิน [vercel.com](https://vercel.com) ด้วยบัญชี GitHub
2. **Add New… → Project** แล้ว import repo `Kseraaa/BatOnBoard`
3. ตั้งค่าโปรเจกต์:
   - **Root Directory**: `apps/web` (ปล่อยตัวเลือก "Include files outside the root directory" เปิดไว้ตามค่าเริ่มต้น)
   - Framework Preset: Next.js (`vercel.json` กำหนดคำสั่ง install/build ไว้แล้ว)
   - Node.js Version: 24.x (Settings → General)
4. **ยังไม่ต้องกด Deploy** — ถ้ากดไปแล้วก็ไม่เป็นไร แต่ครั้งแรกจะใช้ไม่ได้จนกว่าจะทำข้อ 2 เพราะยังไม่มีที่เก็บห้อง

## 2. เชื่อม Upstash Redis

1. ในโปรเจกต์บน Vercel → แท็บ **Storage** (หรือ Integrations → Marketplace) → เลือก **Upstash** → **Redis**
2. สร้างฐานข้อมูลใหม่:
   - Plan: **Free**
   - Region: เลือกที่ใกล้ฟังก์ชันของ Vercel ที่สุด (ถ้าไม่แน่ใจ ใช้ Singapore `ap-southeast-1`)
3. กด **Connect** กับโปรเจกต์นี้ ให้ครบทุก environment (Production, Preview, Development)
   Vercel จะใส่ env `KV_REST_API_URL` และ `KV_REST_API_TOKEN` ให้เอง — ไม่ต้องคัดลอกเอง
4. **Redeploy** (Deployments → ⋯ → Redeploy) เพื่อให้ env ใหม่มีผล

> ถ้าลืมเชื่อม Upstash เว็บจะเปิดได้ แต่สร้างห้องไม่ได้ และ log ของ Vercel จะมีข้อความ
> `ต้องตั้ง Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN) ก่อน deploy`

## 3. Function Region

`apps/web/vercel.json` ตั้ง `"regions": ["sin1"]` (สิงคโปร์) ไว้แล้ว ให้ใกล้ผู้เล่นในไทยและใกล้ Redis ไม่ต้องตั้งเพิ่ม

## 4. ทดสอบหลัง deploy

1. เปิดโดเมนที่ Vercel ให้ (เช่น `https://batonboard.vercel.app`) บนมือถือ แล้วสร้างห้อง
2. ส่งลิงก์ `/r/<CODE>` ให้เพื่อน 2–3 คน แล้วเริ่มเกม → ทุกคนกดค้างดูการ์ด → มีสายลับคนเดียว
3. ลองล็อกจอหรือสลับแอปแล้วกลับมา → ต้องกลับมาอยู่ห้องเดิม
4. ลองกล่าวหา → โหวต → ทุกจอเห็นผลภายใน ~1 วินาที

ดู log ได้ที่ Vercel → Deployments → (deployment ล่าสุด) → **Logs**

---

## ข้อควรรู้

- **ฟรี:** แผน Hobby ของ Vercel และแผน Free ของ Upstash ใช้ได้โดยไม่ต้องผูกบัตร (ตรวจโควตาปัจจุบันที่หน้า pricing ของทั้งสองเจ้า)
- **โควตา Upstash:** แผนฟรีจำกัดจำนวนคำสั่งต่อเดือน — poll หนึ่งครั้งใช้ราว 1–2 คำสั่ง (ผู้เล่น 4 คน เล่น 1 ชั่วโมง ≈ 15,000–30,000 คำสั่ง) ดูการใช้งานได้ที่ dashboard ของ Upstash ถ้าใกล้เต็ม ตั้ง env `NEXT_PUBLIC_POLL_MS=2000` ใน Vercel แล้ว redeploy (ช้าลงแต่ใช้คำสั่งครึ่งหนึ่ง)
- **deploy ใหม่ไม่ทำให้ห้องหาย** ห้องอยู่ใน Redis ไม่ใช่ในเครื่อง — deploy ระหว่างมีคนเล่นได้ (แต่ถ้าแก้รูปแบบข้อมูลห้อง ห้องเก่าอาจใช้ไม่ได้)
- ห้องหมดอายุเองเมื่อไม่มีใครเข้าเลย 6 ชั่วโมง
- **Preview deploy** (ทุก branch/PR) ใช้ Redis ตัวเดียวกับ production ถ้าเชื่อม Upstash ให้ Preview ด้วย — รหัสห้องสุ่มจึงไม่ชนกันในทางปฏิบัติ
- รันในเครื่องโดยใช้ Redis จริง: คัดลอก env จาก Vercel (`vercel env pull` หรือคัดลอกจากหน้า Settings → Environment Variables) ไปไว้ที่ `apps/web/.env.local` — ถ้าไม่ตั้ง dev server จะเก็บห้องในหน่วยความจำ
