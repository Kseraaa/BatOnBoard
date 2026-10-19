# CLAUDE.md — BatOnBoard

**BatOnBoard** คือแพลตฟอร์มเล่นบอร์ดเกมออนไลน์ที่รวมหลายเกมไว้ในที่เดียว เกมแรกคือเกมสายลับแบบ Spyfall
เป้าหมายของเฟสแรก: เพื่อน 3–8 คนเปิดลิงก์ห้องเดียวกันแล้วเล่นจบรอบได้จริงบนมือถือ

> ชื่อ "Spyfall" ใช้เป็นชื่อเรียกภายในโค้ดเท่านั้น ห้ามใส่ชื่อนี้หรือรายการสถานที่จากเกมต้นฉบับลงใน UI หรือข้อมูลเกม
> ใช้ชื่อเกมที่แสดงต่อผู้ใช้เป็นตัวแปรเดียว (`GAME_DISPLAY_NAME`) และเขียนชุดสถานที่ขึ้นใหม่เองทั้งหมด

---

## กฎสถาปัตยกรรม (ห้ามละเมิด)

1. **Server เป็นผู้ตัดสินทุกอย่าง** — client ส่งแค่ action ห้ามคำนวณผลเกมฝั่ง client
2. **ข้อมูลลับไม่ออกจาก server** — ห้ามส่ง game state เต็มไป client ทุกครั้งที่ส่งข้อมูลเกมต้องผ่าน `playerView(state, viewerId)` และส่งแยกรายผู้เล่น ห้าม broadcast state เดียวให้ทั้งห้อง
3. **กติกาเป็นโค้ดบริสุทธิ์** — โค้ดใน `packages/games/*/rules` ห้าม import network, DB หรือ React ห้ามเรียก `Math.random()` หรือ `Date.now()` ให้ใช้ `rng` และ `now` ที่ถูกส่งเข้ามา
4. **Platform ไม่รู้จักกติกาเกม** — `packages/engine`, `packages/rooms` และ API ของ `apps/web` ห้ามมีโค้ดเฉพาะเกมใดเกมหนึ่ง การเพิ่มเกมใหม่ต้องทำได้ด้วยการเพิ่มโฟลเดอร์ใน `packages/games/` และลงทะเบียนใน registry เท่านั้น
5. **ห้ามเชื่อ input จาก client** — ทุก payload ต้องผ่าน Zod schema ก่อนเข้า `validate`

---

## Tech stack

| ส่วน | ใช้ |
| --- | --- |
| ภาษา | TypeScript (strict) ทั้งระบบ |
| Monorepo | pnpm workspaces |
| Frontend | Next.js (App Router) + React + Tailwind CSS + shadcn/ui |
| Game server | Next.js Route Handlers ใน `apps/web` (serverless บน Vercel) + polling ~1 วินาที ไม่มี WebSocket |
| ตรวจ input | Zod |
| State ห้อง | Upstash Redis (production) · หน่วยความจำของ `next dev` (dev/e2e) |
| Database | ยังไม่ใช้ใน MVP — เฟส 2: PostgreSQL + Drizzle ORM |
| ผู้เล่น | guest: ชื่อเล่น + `playerToken` แบบสุ่ม ไม่มีระบบสมัครใน MVP |
| Testing | Vitest (unit) + Playwright (e2e หลายผู้เล่น) |
| Deploy | Vercel อย่างเดียว (เว็บ + API) + Upstash Redis จาก Vercel Marketplace |

---

## โครงสร้างโปรเจกต์

```
batonboard/
├─ apps/
│  └─ web/              # Next.js: หน้าเว็บ + API ห้อง (src/app/api, src/server)
├─ packages/
│  ├─ engine/           # GameDefinition, type กลาง, game runner, registry
│  ├─ rooms/            # logic ห้องแบบบริสุทธิ์ + RoomService + RoomStore
│  ├─ protocol/         # HTTP API + Zod schema ที่ฝั่ง client และ server ใช้ร่วม
│  ├─ ui/               # component ใช้ร่วม (ปุ่ม, การ์ด, นาฬิกา)
│  └─ games/
│     ├─ spyfall/
│     │  ├─ rules/      # กติกาบริสุทธิ์ + unit test
│     │  ├─ client/     # หน้าจอเกม (React)
│     │  └─ data/       # ชุดสถานที่และบทบาท (เขียนเอง)
│     └─ boss/          # เกมที่ 2 "I'm Big Deal" (กำลังทำ ดู docs/boss-plan.md)
└─ e2e/                 # Playwright: เทสต์ผู้เล่นหลายคน
```

---

## Game interface (`packages/engine`)

```ts
export type PlayerId = string;

export interface Rng {
  next(): number;                 // [0, 1)
  int(maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[]; // คืน array ใหม่
}

export interface ActionContext {
  hostId: PlayerId;               // host ปัจจุบันของห้อง (ห้องเป็นคนส่งให้)
}

export interface GameDefinition<State, Action, View, Options = unknown> {
  id: string;                     // 'spyfall'
  minPlayers: number;
  maxPlayers: number;
  actionSchema: ZodType<Action>;  // ใช้ตรวจ payload จาก client
  optionsSchema: ZodType<Options>; // ตั้งค่าห้องก็มาจาก client ต้องตรวจเหมือนกัน
  defaultOptions: Options;
  setup(players: PlayerId[], options: Options, rng: Rng, now: number): State;
  validate(state: State, action: Action, by: PlayerId, ctx: ActionContext): string | null; // รหัส error เช่น 'not-host' หรือ null
  apply(state: State, action: Action, by: PlayerId, now: number, rng: Rng): State;
  playerView(state: State, viewer: PlayerId): View;  // ตัดข้อมูลลับออก
  nextDeadline?(state: State): number | null;        // เวลาที่ server ต้องปลุกเกม
  onDeadline?(state: State, now: number): State;     // เช่น หมดเวลาถาม
  onPlayerLeave?(state: State, player: PlayerId, now: number): State; // ถูกเตะ/ออกกลางเกม
  isOver(state: State): boolean;                     // true = ไม่รับ action ใด ๆ อีก (ห้องกลับล็อบบี้)
}
```

> `setup` รับ `now` เพราะต้องตั้ง `deadline` ของรอบแรก และ `apply` รับ `rng` เพราะ `NEXT_ROUND` ต้องสุ่มใหม่ (ดู "การตัดสินใจเชิงออกแบบ")

### Action pipeline (server)

```
POST /api/rooms/<code>/action → โหลดห้อง → tick (deadline ที่เลยมาแล้ว)
→ actionSchema.parse → validate → apply → เขียนกลับ (compare-and-set)
→ ตอบ snapshot = playerView(state, ผู้ส่ง) · คนอื่นได้ view ของตัวเองตอน poll
```

engine มี pipeline นี้เป็นฟังก์ชันบริสุทธิ์ใน `runner.ts` server ใช้ฟังก์ชันเหล่านี้ ไม่เรียก method ของเกมเอง:

| ฟังก์ชัน | หน้าที่ |
| --- | --- |
| `startGame(game, players, rawOptions, rng, now)` | ตรวจจำนวนผู้เล่น ชื่อซ้ำ และ `optionsSchema` แล้วเรียก `setup` |
| `dispatchAction(game, state, payload, by, ctx, now, rng)` | ตรวจว่าเกมยังไม่จบ → `safeParse` → `validate` → `apply` คืน `Result<State>` |
| `getDeadline(game, state)` | deadline ถัดไป (เป็น `null` เมื่อเกมจบ) |
| `fireDeadline(game, state, now)` | เรียก `onDeadline` เฉพาะเมื่อถึงเวลาจริง ถ้ายังไม่ถึงคืน object เดิม |
| `removePlayer(game, state, player, now)` | เรียก `onPlayerLeave` |
| `viewsFor(game, state, viewers)` | `Map<PlayerId, View>` แยกรายคน |

- รหัส error ของ engine อยู่ใน `EngineError`: `invalid-action`, `invalid-options`, `too-few-players`, `too-many-players`, `duplicate-players`, `game-over` ส่วนรหัสของแต่ละเกมกำหนดใน `validate` และ client เป็นคนแปลรหัสเป็นข้อความ
- `createRng(seed)` ใช้อัลกอริทึม mulberry32 ห้องสุ่ม seed ลับจาก `crypto` ตอนสร้าง แล้วแต่ละคำสั่งใช้ rng ที่ได้จาก seed กับ `version` ของห้อง จึงไม่ต้องเก็บสถานะ rng
- `createRegistry()` เป็น factory ไม่ใช่ singleton ห้าม id ซ้ำ และตรวจช่วงจำนวนผู้เล่น

---

## Spyfall (`packages/games/spyfall`)

แพลตฟอร์มทำหน้าที่แจกการ์ด จับเวลา และนับโหวต ผู้เล่นถามตอบกันเองนอกระบบ (ต่อหน้า หรือผ่าน Discord/LINE call) **ไม่ต้องทำแชตหรือระบบเสียงใน MVP**

### กติกา

- ผู้เล่น 3–8 คน สุ่มสายลับ 1 คน คนอื่นได้สถานที่เดียวกันและบทบาทคนละอย่าง
- สุ่มผู้เริ่มถามคนแรก แสดงให้ทุกคนเห็น
- ช่วงถามตอบมีเวลาจำกัด (ค่าเริ่มต้น 8 นาที ปรับได้ในตั้งค่าห้อง)
- ระหว่างถามตอบ ผู้เล่นแต่ละคนกล่าวหาคนอื่นได้ **1 ครั้งต่อรอบ** → หยุดเวลาและเข้าโหวต
- โหวตผ่านเมื่อทุกคน **ยกเว้นผู้ถูกกล่าวหา** เห็นด้วย ถ้าผ่าน → เปิดเผย ถ้าไม่ผ่าน → เวลาเดินต่อจากที่เหลือ
- ถ้าผู้ถูกกล่าวหาเป็นสายลับ ฝ่ายผู้เล่นชนะ ถ้าไม่ใช่ สายลับชนะ
- สายลับเปิดตัวเพื่อเดาสถานที่ได้ทุกเมื่อที่ไม่อยู่ระหว่างโหวต เดาถูก = สายลับชนะ เดาผิด = ฝ่ายผู้เล่นชนะ
- หมดเวลา → เข้า `final-vote`: ผู้เล่นเลือกคนที่สงสัย (รวมคนที่ใช้สิทธิ์ไปแล้ว) ใช้กติกาเอกฉันท์เหมือนเดิม ถ้าไม่มีใครถูกจับได้ สายลับชนะ
- MVP นับแค่ "ฝ่ายไหนชนะ" ระบบคะแนนหลายรอบทำในเฟส 2 โดยเป็น option ของห้อง

### State และ Action

```ts
type Phase = 'questioning' | 'voting' | 'final-vote' | 'reveal'; // ล็อบบี้เป็นของห้อง ไม่ใช่ของเกม

interface SpyfallState {
  phase: Phase;
  players: PlayerId[];
  spy: PlayerId;
  locationId: string;
  roles: Record<PlayerId, string>;      // บทบาทของคนที่ไม่ใช่สายลับ
  firstAsker: PlayerId;
  durationMs: number;                   // เวลาถามตอบจากตั้งค่าห้อง (ใช้ซ้ำตอน NEXT_ROUND)
  deadline: number | null;              // เวลาหมดของ questioning / final-vote (ms epoch)
  pausedRemaining: number | null;       // เวลาที่เหลือตอนหยุดเพื่อโหวต
  usedAccusation: PlayerId[];           // คนที่ใช้สิทธิ์กล่าวหาแล้ว (ช่วง questioning)
  finalTurns: PlayerId[];               // คนที่เสนอชื่อหรือ PASS ไปแล้วใน final-vote
  vote: {
    accuser: PlayerId;
    accused: PlayerId;
    ballots: Record<PlayerId, boolean>; // ผู้กล่าวหาถูกใส่ true อัตโนมัติ
    deadline: number;                   // หมดเวลาโหวต: คนที่ยังไม่โหวต = ไม่เห็นด้วย
  } | null;
  spyGuess: string | null;              // สถานที่ที่สายลับเดา (แสดงตอน reveal)
  result: { winner: 'spy' | 'agents' | null; reason: WinReason } | null; // null = คนไม่พอ
  scores: Record<PlayerId, number>;     // +1 ให้ทุกคนในฝ่ายที่ชนะ
}

type SpyfallAction =
  | { type: 'ACCUSE'; target: PlayerId }          // questioning: ครั้งเดียว/รอบ · final-vote: ครั้งเดียวในช่วงนี้
  | { type: 'BALLOT'; agree: boolean }
  | { type: 'PASS' }                              // final-vote เท่านั้น: ไม่เสนอชื่อใคร
  | { type: 'SPY_GUESS'; locationId: string }     // สายลับเท่านั้น
  | { type: 'NEXT_ROUND' };                       // host เท่านั้น (phase reveal)
// เริ่มรอบแรก = room:start → setup() ไม่มี START_ROUND
// หมดเวลา = onDeadline() ที่ server เรียกเอง (ตอนมี request หลัง deadline) ไม่ใช่ action จาก client
```

### playerView — ใครเห็นอะไร

| ข้อมูล | ผู้เล่นทั่วไป | สายลับ |
| --- | --- | --- |
| สถานที่ | เห็น | **ไม่เห็น** (เห็นรายชื่อสถานที่ทั้งหมดแทน) |
| บทบาทตัวเอง | เห็น | เห็นว่าตัวเองเป็นสายลับ |
| ใครคือสายลับ | เฉพาะ phase `reveal` | รู้อยู่แล้ว |
| บทบาทคนอื่น | เฉพาะ phase `reveal` | เฉพาะ phase `reveal` |
| เวลา, สถานะโหวต, ผล | เห็น | เห็น |

ทั้งผู้เล่นทั่วไปและสายลับเห็นรายชื่อสถานที่ทั้งหมดเป็นตัวช่วยจำ (เหมือนการ์ดอ้างอิงในเกมจริง)

---

## Real-time และห้อง (`packages/rooms` + `apps/web/src/app/api`)

- **ห้อง:** รหัส 6 ตัวอักษร (ตัด 0/O/1/I ที่สับสนง่าย) เข้าร่วมผ่าน `/r/<code>` คนสร้างห้องเป็น host: เริ่มเกม เปลี่ยนตั้งค่า เตะผู้เล่น ถ้า host ออก ให้โอนสิทธิ์ให้คนถัดไป
- **ตัวตน:** ตอนสร้างหรือเข้าห้อง server ออก `playerToken` แบบสุ่ม client เก็บไว้และส่ง `Authorization: Bearer <token>` ทุก request เมื่อรีเฟรชหรือเน็ตหลุด ส่ง token เดิมใน `join` → ผูกกับผู้เล่นเดิม
- **ไม่มี WebSocket:** client poll `GET /api/rooms/<code>?etag=…` ทุก ~1 วินาที (5 วินาทีเมื่อแท็บถูกซ่อน) server ตอบ `null` ถ้า etag ไม่เปลี่ยน คำสั่งทุกตัวตอบ snapshot ล่าสุดทันที
- **ออนไลน์/ออฟไลน์:** ดูจากเวลาล่าสุดที่ผู้เล่น poll (`lastSeen`) ไม่ได้ยินเกิน 15 วินาที = ออฟไลน์ ไม่ลบผู้เล่นทันที host เลือกเตะได้
- **Timer แบบ lazy:** ไม่มี timer บน server ทุก request เรียก `tick()` ซึ่งเรียก `onDeadline` ณ เวลา deadline จริงของทุก deadline ที่เลยมาแล้ว ส่ง `serverNow` ไปกับทุก snapshot ให้ client นับถอยหลังโดยชดเชยนาฬิกาเครื่อง
- **API** (path และ type อยู่ใน `api` ของ `@batonboard/protocol` ทุกคำตอบเป็น `Ack<T>` = `{ ok: true, value } | { ok: false, error: <รหัส> }`):
  - `POST /api/rooms` สร้างห้อง · `POST /api/rooms/<code>/join` เข้าหรือกลับเข้าห้อง → `JoinedMessage { code, playerId, token }`
  - `GET /api/rooms/<code>` poll → `RoomSnapshot { etag, room, view, serverNow } | null`
  - `POST /api/rooms/<code>/{leave,settings,start,lobby,kick,action}` → `RoomSnapshot`

---

## Testing (ต้องมีก่อนถือว่างานเสร็จ)

### Unit test (Vitest) — `packages/games/spyfall/rules`

เขียนเทสต์ข้อแรกก่อนข้ออื่น:

- [x] `JSON.stringify(playerView(state, spy))` ต้องไม่มี id หรือชื่อของสถานที่ปัจจุบัน และไม่มีบทบาทของคนอื่น — `rules/leak.test.ts` และ `index.test.ts` ที่ใช้ data จริงตรวจชื่อสถานที่และชื่อบทบาททั้งไทยและอังกฤษ
- [x] แจกการ์ดแล้วมีสายลับ 1 คนพอดี คนที่เหลือได้สถานที่เดียวกัน
- [x] ผู้เล่นกล่าวหาได้คนละ 1 ครั้งต่อรอบ
- [x] โหวตต้องเอกฉันท์ยกเว้นผู้ถูกกล่าวหา และผู้ถูกกล่าวหาโหวตไม่ได้
- [x] เวลาหยุดตอนโหวตและเดินต่อจาก `pausedRemaining`
- [x] สายลับเดาถูก/ผิด ให้ผลถูกฝ่าย และเดาไม่ได้ระหว่างโหวต
- [x] action ผิดคนหรือผิด phase ถูกปฏิเสธ (`validate` คืนข้อความ error)
- [x] ใช้ seeded `rng` แล้วผลลัพธ์ซ้ำได้

### E2E (Playwright) — `e2e/`

- [x] เปิด 4 browser context: สร้างห้อง → เข้าร่วมผ่านลิงก์ → เริ่มเกม → มีหน้าจอเดียวที่แสดงว่าเป็นสายลับ
- [x] กล่าวหา → โหวต → หน้า reveal ถูกต้อง
- [x] รีเฟรชกลางเกมแล้วกลับเข้ามาเห็น view เดิม

---

## Conventions

- ชื่อแพลตฟอร์มที่แสดงต่อผู้ใช้คือ "BatOnBoard" (ตัวพิมพ์ตามนี้ทุกที่) ใช้ `batonboard` สำหรับชื่อ repo, โดเมน และ identifier ส่วน package ใช้ scope `@batonboard/*` เช่น `@batonboard/engine`, `@batonboard/spyfall`
- TypeScript `strict: true` ห้ามใช้ `any` ในโค้ดกติกาและ type ที่ส่งผ่าน network
- State เป็น immutable: `apply` คืน object ใหม่เสมอ
- ข้อความ UI ทั้งหมดอยู่ในไฟล์ข้อความแยก (เตรียมรองรับไทย/อังกฤษ) ภาษาเริ่มต้นคือภาษาไทย
- ออกแบบ mobile-first: ผู้เล่นส่วนใหญ่ใช้มือถือ ปุ่มสำคัญต้องกดง่ายด้วยนิ้วเดียว
- หน้าบทบาทต้องซ่อนได้ (กดค้างเพื่อดู หรือปุ่มซ่อน) เพราะคนข้าง ๆ อาจมองเห็นจอ
- API อยู่โดเมนเดียวกับเว็บ (same-origin) จึงไม่ต้องตั้ง CORS
- รัน `pnpm test`, `pnpm typecheck` และ `pnpm lint` ให้ผ่านก่อนจบทุกงาน ถ้าแก้ UI หรือ flow ของห้องให้รัน `pnpm e2e` ด้วย
- CI (GitHub Actions, `.github/workflows/ci.yml`) รันเมื่อ push ไป `main` และทุก pull request มี 2 job: `check` (typecheck, lint, format:check, test และ `next build` ของเว็บ) กับ `e2e` (Playwright บน Chromium) ถ้าเพิ่มคำสั่งตรวจใหม่ ให้เพิ่มใน workflow ด้วย

---

## การตัดสินใจเชิงออกแบบ

บันทึก 2026-10-16 — แก้ส่วนที่กำกวมในสเปกก่อนเริ่มเขียนโค้ด

1. **สิทธิ์ host:** ห้องเป็นเจ้าของข้อมูล host แล้วส่ง `ctx: { hostId }` เข้า `validate` เกมใช้ข้อมูลนี้ตรวจ action ที่ host เท่านั้นทำได้ (เช่น `NEXT_ROUND`) แพลตฟอร์มไม่ต้องรู้ว่า action ไหนเป็นของ host
2. **ไม่มี phase `lobby` ในเกม:** ล็อบบี้เป็นสถานะของห้อง `room:start` เรียก `setup()` แล้วเข้า `questioning` ทันที ตัด `START_ROUND` ออก `NEXT_ROUND` (ทำได้ใน `reveal`) สุ่มสายลับ สถานที่ และบทบาทใหม่ด้วย `rng` ที่ส่งเข้า `apply`
3. **รายชื่อสถานที่อ้างอิงไม่อยู่ใน view:** client import รายชื่อจาก `spyfall/data` แบบ static ส่วน `playerView` ส่งแค่ `locationSetId` เพื่อให้เทสต์ "view ของสายลับไม่มี id สถานที่ปัจจุบัน" เป็นจริงได้ สถานที่ที่ host สร้างเองหรือปิดไว้ก็ส่งผ่าน `room.options` ใน snapshot ซึ่งเป็นข้อมูลสาธารณะ ไม่ส่งใน view (ดูหัวข้อ "เลือกและสร้างสถานที่เอง")
4. **กลไก `final-vote`:** ผู้เล่นทุกคนได้สิทธิ์ใหม่ 1 ครั้งในช่วงนี้ (ไม่สน `usedAccusation`) จะ `ACCUSE` หรือ `PASS` ก็ได้ เมื่อมีคนเสนอชื่อ จะเข้าโหวตเอกฉันท์เหมือนช่วงปกติ ถ้าผ่านก็ไป `reveal` ถ้าไม่ผ่านก็กลับ `final-vote` เมื่อทุกคนใช้สิทธิ์ครบ (`finalTurns` ครบ) แล้วยังไม่มีใครถูกจับ สายลับชนะ สายลับเดาสถานที่ใน `final-vote` ไม่ได้
5. **ใครต้องโหวต:** ผู้กล่าวหาถือว่าเห็นด้วยอัตโนมัติ ผู้ถูกกล่าวหาโหวตไม่ได้ ผู้เล่นที่เหลือต้องโหวต ถ้าโหวตไม่ผ่าน ผู้กล่าวหาเสียสิทธิ์ของรอบนั้น ถ้ามีคนกด "ไม่เห็นด้วย" ให้ตัดสินว่าไม่ผ่านทันทีโดยไม่ต้องรอคนที่เหลือ
6. **ผู้เล่นหลุดหรือถูกเตะกลางเกม:**
   - โหวตแต่ละครั้งมีเวลา 60 วินาที (`vote.deadline` ผ่าน `nextDeadline`/`onDeadline`) ถ้าหมดเวลาแล้วยังมีคนไม่โหวต ถือว่าไม่ผ่าน
   - ถ้าผู้เล่นถูกเตะหรือออก server เรียก `onPlayerLeave` ถ้าคนที่ออกเป็นสายลับ ฝ่ายผู้เล่นชนะ ถ้าผู้เล่นเหลือน้อยกว่า `minPlayers` จบรอบโดยไม่มีผู้ชนะ (`reason: 'not-enough-players'`) นอกจากนั้นให้ตัดคนที่ออกออกจากการโหวตแล้วตัดสินโหวตใหม่
7. **ชื่อผู้เล่น:** state ของเกมเก็บแค่ `PlayerId` ส่วนชื่อมาจาก `room` ใน snapshot แล้ว client เอามารวมกันเอง
8. **Vercel อย่างเดียว (2026-10-16):** เลิกใช้ `apps/server` (Fastify + Socket.IO บน Fly.io) เพื่อให้ deploy ฟรีบน Vercel ที่เดียว ห้องเก็บใน Upstash Redis และส่ง view ด้วย polling แทน WebSocket (ช้าสุด ~1 วินาที พอสำหรับเกมที่คุยกันนอกระบบ) กฎสถาปัตยกรรมทั้ง 5 ข้อยังเหมือนเดิม โค้ดเดิมดูได้ใน git ที่ commit `9bd009a`

### Monorepo

- package ทั้งหมด export ซอร์ส TypeScript ตรง ๆ (`"exports": "./src/index.ts"`) ไม่ต้อง build ตอนพัฒนา web ใช้ `transpilePackages`
- `pnpm typecheck` = `tsc --noEmit` ในทุก package ผ่าน `pnpm -r`
- `pnpm test` = Vitest ที่ root โดยแต่ละ package เป็น project ของตัวเอง (`vitest.config.ts`)
- `pnpm lint` บังคับกฎสถาปัตยกรรมข้อ 3–4 ด้วย ESLint: โฟลเดอร์ `rules/` ห้าม import socket/fastify/React/DB/Node และห้ามใช้ `Math.random`, `Date.now`, `new Date()` ส่วน `engine` และ `rooms` (ยกเว้นไฟล์เทสต์) ห้าม import เกมใด ๆ
- **ห้ามใช้ `pnpm -s typecheck`** เพราะ `-s` ร่วมกับ `-r --parallel` ซ่อน error ของ tsc ให้ดู exit code หรือรันแบบไม่มี `-s` แทน
- เวอร์ชัน: Node 24, pnpm 10, TypeScript **6.0** (ยังไม่ใช้ 7 เพราะ typescript-eslint รองรับแค่ `<6.1`) ใน TS 6 ค่าเริ่มต้นของ `types` คือ `[]` ดังนั้น package ไหนต้องใช้ Node API ให้ใส่ `"types": ["node"]` เอง

### Spyfall rules

- `rules/` ไม่ import `data/` แต่เป็น factory `createSpyfall({ locationSetId, locations })` เทสต์จึงใช้ชุดสถานที่จำลอง (`rules/fixtures.ts`) ได้ ส่วนเกมที่ลงทะเบียนจริงจะสร้างจาก data ในข้อ 4 factory ตรวจว่ามีอย่างน้อย 2 สถานที่ id ไม่ซ้ำ และแต่ละสถานที่มีบทบาทไม่ซ้ำอย่างน้อย 7 อย่าง (= `MAX_PLAYERS - 1`)
- ค่าคงที่: ถามตอบ 8 นาที (ปรับได้ 1–30 นาที), โหวต 60 วินาที (`VOTE_MS`), final-vote 90 วินาที (`FINAL_VOTE_MS`) final-vote หมดเวลาแล้วไม่มีใครถูกจับ = สายลับชนะ (`time-up`)
- `NEXT_ROUND` สุ่มสถานที่ใหม่ที่ไม่ซ้ำกับรอบก่อน (จาก `state.deck` เดิม) และเก็บคะแนนไว้
- **เลือกและสร้างสถานที่เอง (2026-10-19):** `SpyfallOptions` มี `disabled` (id ในชุดมาตรฐานที่ปิด) และ `custom` (`{ id: 'custom-<เลข>', name, roles }` ชื่อเป็นภาษาเดียวตามที่พิมพ์) ทั้งสองเป็น optional เพื่อให้ห้องเก่ายังใช้ได้
  - `optionsSchema` สร้างจากชุดมาตรฐานใน factory: ตัดช่องว่างหัวท้าย, ชื่อ/บทบาทยาวไม่เกิน 30 (`MAX_CUSTOM_TEXT`), สร้างเองได้ไม่เกิน 20 แห่ง, แห่งละ 1–15 บทบาทไม่ซ้ำ (`MAX_CUSTOM_ROLES`), ชื่อไม่ซ้ำ (ไม่สนตัวพิมพ์) และต้องเหลือสถานที่อย่างน้อย 2 แห่ง (`MIN_DECK_SIZE`) ไม่งั้นสายลับรู้คำตอบทันที
  - `setup` สร้าง `state.deck` ด้วย `buildDeck` (`rules/deck.ts` ไม่ import zod) ซึ่งเก็บแค่ id และไม่ส่งใน view id บทบาทของที่สร้างเองคือ `<locationId>/r<ลำดับ>` (`customRoleId`) ถ้าบทบาทน้อยกว่าจำนวนคนจะวนซ้ำ (ชุดมาตรฐานมีพอเสมอ ผล seeded rng จึงเหมือนเดิม) `SPY_GUESS` รับเฉพาะ id ใน `deck`
  - ตั้งค่าเปลี่ยนได้เฉพาะในล็อบบี้ `room.options` ระหว่างเล่นจึงตรงกับ `deck` เสมอ client ได้ options ผ่าน `GameScreenProps.options` แล้วหาชื่อด้วย `deckFor` (`client/deck.ts`)
  - หน้าตั้งค่า (`client/settings.tsx`) เก็บสำเนา options ในเครื่อง กดหลายครั้งติดกันจะได้ไม่ส่งค่าเก่าทับ และกันไม่ให้เหลือน้อยกว่า 2 แห่งก่อนส่ง (server ตรวจอีกชั้น) body ทั้งหมดยังต่ำกว่าเพดาน 16 KB
  - **จำชุดล่าสุด:** `client/saved-deck.ts` เก็บ `{ disabled, custom }` ของ host ใน localStorage (`batonboard:spyfall:deck`) เฉพาะเมื่อชุดมีสถานที่สร้างเอง (ปิด/เปิดชุดมาตรฐานอย่างเดียวจะไม่ทับชุดที่ตั้งใจทำ) ห้องใหม่ที่ยังไม่มีสถานที่สร้างเองจะมีปุ่ม "ใช้ชุดสถานที่ล่าสุดของคุณ" จำได้เฉพาะเบราว์เซอร์นั้น จนกว่าจะมีบัญชีในเฟส 3
  - **แชร์/นำเข้า:** `client/share.ts` แปลงชุดเป็นข้อความที่คนอ่านออก (บรรทัด `ไม่ใช้: ชื่อ, ชื่อ` + `# สถานที่` + `- บทบาท`) ส่งใน LINE แล้ววางกลับได้ หรือพิมพ์เองก็ได้ เลือกข้อความแทนไฟล์หรือ base64 เพราะคัดลอก/วางในแชตบนมือถือได้ง่ายสุดและเห็นเนื้อหาก่อนนำเข้า สถานที่มาตรฐานอ้างด้วยชื่อ (ไทยหรืออังกฤษ) จึงไม่ผูกกับ id ตอนนำเข้า id ของที่สร้างเองเรียงใหม่ ทุกคนกดคัดลอกหรือแชร์ได้ (`navigator.share` ถ้ามี) แต่นำเข้าได้เฉพาะ host ปุ่มคัดลอกใช้ `copyText` (`packages/ui`) ที่ลอง Clipboard API แล้วค่อย `execCommand('copy')` ถ้าไม่ได้ทั้งคู่ (เช่น in-app browser บางตัว) จะแสดงข้อความในกล่องให้กดค้างคัดลอกเอง ห้ามล้มเหลวเงียบ ๆ
- `isOver` เป็นจริงเฉพาะเมื่อ reveal แล้วคนไม่พอเล่นต่อ ระหว่าง reveal ปกติยังรับ `NEXT_ROUND`
- `SpyfallView` มี:
  - `you` เป็นหนึ่งใน `spy`, `agent` (มี `locationId`, `roleId`) หรือ `spectator`
  - `vote.voted` บอกแค่ว่าใครโหวตแล้ว ไม่บอกว่าโหวตอะไร
  - `lastVote` (2026-10-19) คือผลโหวตที่ตัดสินแล้วล่าสุดของรอบ รวมว่าแต่ละคนโหวตอะไร (`null` = ไม่ได้โหวต) เปิดเผยได้เพราะตัดสินแล้ว ล้างตอนแจกไพ่ใหม่และตอนจบรอบด้วยเหตุอื่นที่ไม่ใช่โหวต
  - `reveal` เป็น `null` จนถึง phase `reveal`
- รหัส error อยู่ใน `SpyfallError` (`not-host`, `accusation-used`, `wrong-phase` ฯลฯ)

### Spyfall data

- ชุด `batonboard-original-v1` (`data/original-v1.ts`) มี 26 สถานที่ แห่งละ 12 บทบาท มีชื่อทั้งไทยและอังกฤษ (`LocalizedText`) ส่วนใหญ่เป็นสถานที่ในชีวิตคนไทย
- `data/` เก็บชื่อที่แสดง แต่กติกาเห็นแค่ id (ผ่าน `toLocationDefs`) client หาชุดสถานที่จาก `locationSetId` ใน view ด้วย `getLocationSet`
- `@batonboard/spyfall` (root `index.ts`) export ตัวแปร `spyfall` ที่สร้างจากชุดเริ่มต้นแล้ว เป็นตัวที่ `apps/web/src/server/service.ts` ใช้ลงทะเบียนใน registry
- **บทบาทมากกว่าจำนวนคน (2026-10-19):** `deal` สับบทบาททั้งหมดแล้วแจกตามจำนวนคน บทบาทที่มากกว่า 7 จึงทำให้แต่ละรอบได้ชุดบทบาทต่างกัน ไม่จำเจ ชุดมาตรฐานจึงมีแห่งละ 12 และที่สร้างเองใส่ได้ถึง 15 (ตั้งค่าใหญ่สุดยังต่ำกว่าเพดาน body 16 KB มีเทสต์ตรวจ)
- `data.test.ts` ตรวจว่ามีอย่างน้อย 20 สถานที่ id เป็น slug ชื่อไม่ซ้ำ บทบาทอย่างน้อย 12 อย่าง (`MIN_STANDARD_ROLES`) มีชื่อไทย/อังกฤษครบ และ**ไม่ตรงกับสถานที่ของเกมต้นฉบับ** (เทียบกับรายการห้ามใช้ที่อยู่ในไฟล์เทสต์เท่านั้น ห้ามย้ายรายการนี้ไปไว้ใน data หรือ UI)
- จะเพิ่มชุดใหม่ ให้สร้างไฟล์ใน `data/` แล้วเพิ่มใน `locationSets` เทสต์ทุกข้อจะรันกับทุกชุดอัตโนมัติ

### ห้อง (`packages/rooms`) และ API

- `room.ts`: ห้องเป็น JSON ก้อนเดียว (`Room`) ทุกคำสั่งเป็นฟังก์ชันบริสุทธิ์ `(env, room, …) → Ack<Room>` ไม่รู้จัก HTTP, Redis หรือเกมใด (ได้ registry, `IdSource` และ `now` จาก `env`)
- `service.ts` (`RoomService`): ทุก request ทำ โหลด → `tick` → `authorize` → คำสั่ง → `store.put` แบบ compare-and-set ด้วย `rev` ถ้ามีคนเขียนก่อนก็ลองใหม่ (สูงสุด 5 ครั้ง แล้วตอบ `busy`)
- `version` เพิ่มเมื่อสิ่งที่ผู้เล่นเห็นเปลี่ยน (ใช้ทำ etag) ส่วน `rev` เพิ่มทุกครั้งที่เขียน รวมถึง `touch` ที่อัปเดต `lastSeen` ไม่บ่อยกว่าทุก 5 วินาที เพื่อลดการเขียน
- store: `MemoryRoomStore` (เทสต์, dev, e2e — ตรวจและเขียนใน tick เดียวกัน) และ `UpstashRoomStore` (`apps/web/src/server/upstash-store.ts` — Lua script ทำ CAS) ห้องหมดอายุเมื่อไม่มีใครแตะ 6 ชั่วโมง (`ROOM_TTL_SECONDS`)
- **ตัวตน:** `playerId` เป็นข้อมูลสาธารณะ ส่วน token เป็นความลับ store เก็บแค่ SHA-256 ของ token ผู้เล่นที่ถูกเตะได้ error `kicked` แท็บสองแท็บที่ใช้ token เดียวกันเป็นผู้เล่นคนเดียวกันและใช้ได้พร้อมกัน
- **ห้อง:** จำนวนคนไม่เกิน `maxPlayers` ของเกม ชื่อห้ามซ้ำโดยไม่สนตัวพิมพ์ (ยาว 1–20 ตัว) คนที่เข้ามากลางเกมเห็น view แบบ `spectator`
- **host:** ออกหรือถูกลบ = โอนให้คนถัดไปที่ออนไลน์ ออฟไลน์เกิน 30 วินาที (`HOST_GRACE_MS`) = โอนตอนมี request ถัดไป
- API: `apps/web/src/app/api/rooms/**/route.ts` เป็นแค่ตัวต่อ (อ่าน URL, Bearer และ JSON แล้วส่งให้ `RoomService`) จำกัด body 16 KB และตอบ `Cache-Control: no-store` ส่วน `apps/web/src/server/service.ts` เป็นที่เดียวฝั่ง server ที่อ้างชื่อเกม
- บน Vercel ถ้าไม่ได้ตั้ง Upstash env จะ throw ทันที (เก็บในหน่วยความจำไม่ได้เพราะแต่ละ request อาจไปคนละเครื่อง)

### Web (`apps/web`) และหน้าจอเกม

- Next.js 16 (App Router, Turbopack) + React 19 + Tailwind 4 คอมโพเนนต์แบบ shadcn/ui (cva + tailwind-merge) อยู่ใน `packages/ui` (เขียนเองตามแบบ shadcn ยังไม่ได้ใช้ CLI) ใช้ฟอนต์ Noto Sans Thai (ตัวละตินแบบ mono ใช้ IBM Plex Mono ผ่าน `font-mono`) และมีโหมดมืดตาม `prefers-color-scheme`
- `packages/ui/src/game-client.ts` เป็นสัญญาระหว่างเว็บกับหน้าจอเกม: `GameClient` มี `Screen` (ได้ `view: unknown` และ `options: unknown` ของห้อง แล้วแปลง type เอง), `Settings`, ชื่อ, จำนวนผู้เล่น, `mode` (`in-app` = เล่นบนจอได้เลย, `together` = ต้องคุยกันเอง อยู่ด้วยกันหรือ Discord/LINE) และ `icon` (pixel art เป็นแถวสตริง `#` วาดด้วย `PixelIcon`) เว็บลงทะเบียนเกมที่ `apps/web/src/games.ts` ที่เดียว
- ชื่อเกมที่แสดง `GAME_DISPLAY_NAME` อยู่ใน `packages/games/spyfall/client/messages.ts` ตอนนี้คือ "ใครคือสายลับ" / "Who's the Spy?" ข้อความของเกมอยู่ในไฟล์นั้น ข้อความของแพลตฟอร์มอยู่ที่ `apps/web/src/messages/{th,en}.ts` (เทสต์ตรวจว่า key ตรงกันและครอบคลุมรหัส error ทุกตัว)
- client import ค่าคงที่จาก `rules/constants.ts`, type จาก `rules/types.ts` และ `rules/deck.ts` เท่านั้น ไม่ import `rules/game.ts` เพื่อไม่ให้ zod ติดไปใน bundle
- **การเชื่อมต่อ:** `lib/room-client.ts` (ใช้กับ `useSyncExternalStore`) poll ห้องของแท็บนี้ เปลี่ยนหน้าแล้วไม่หลุด ความถี่ตั้งด้วย `NEXT_PUBLIC_POLL_MS` (ค่าเริ่มต้น 1000) `serverOffset = serverNow - เวลากึ่งกลางของ request` ใช้กับ `Countdown`
- **localStorage:** `batonboard:name` เก็บชื่อเล่น, `batonboard:room:<CODE>` เก็บ `{ token, playerId }` และ `batonboard:spyfall:deck` เก็บชุดสถานที่ล่าสุดของ host เปิดห้องเดิมในแท็บที่สองของเบราว์เซอร์เดียวกันจะเป็นผู้เล่นคนเดิม ถ้าจะทดสอบหลายผู้เล่นในเครื่องเดียวต้องใช้ browser context แยก
- **หน้า:** `/` หน้าหลัก (สไตล์ retro: พื้นเขียวเทาอ่อน หมึกเขียวเข้ม ตัวอักษร mono — สี `--landing-bg`/`--landing-ink` สลับกันในโหมดมืด มีแนะนำแพลตฟอร์ม, วิธีเล่น, ปุ่มเล่น, ช่องใส่รหัสห้อง และตารางเกมแยก 2 หมวดตาม `mode` เติมช่อง "เร็ว ๆ นี้" ให้เต็มแถว 4 ช่อง) → `/games` เลือกเกม + ใส่ชื่อ + สร้างห้อง (`?game=<id>` เลือกเกมไว้ให้) → `/r/<code>` ห้อง ช่องรหัสบนหน้าหลักไม่ถามชื่อ เพราะหน้าห้องถามเอง หน้าหลักกว้างเต็มจอ ส่วน `/games` และ `/r` อยู่ใน route group `(app)` ที่จำกัดกว้าง `max-w-md`
- **การ์ดบทบาท (2026-10-19):** `HoldToReveal` เป็นไพ่ 3D ด้วย CSS ล้วน (ไม่มี library) กดค้าง = พลิกดูหน้าไพ่ ปล่อย = พลิกกลับ มีปุ่มเปิดค้าง/ซ่อน ปุ่มสำคัญสูงอย่างน้อย 48px และหน้าจอกว้างไม่เกิน `max-w-md`
  - หลังไพ่ต้องเหมือนกันทุกคน (ลาย + `emblem` ของเกม + `backLabel` + `hint`) ห้ามใส่อะไรที่ขึ้นกับบทบาท หน้าไพ่ (children) อยู่ใน DOM เฉพาะตอนเปิดและระหว่างพลิกกลับ (`FLIP_MS`)
  - เอียงตามนิ้ว/เมาส์ และตาม `deviceorientation` เฉพาะเครื่องที่ไม่ต้องขอ permission (Android) iOS ต้องกดอนุญาตจึงข้าม ค่าเอียงเขียนลง CSS variable (`--rx`, `--ry`, `--gx`, `--gy`) ผ่าน `requestAnimationFrame` ไม่ผ่าน React state
  - แจกไพ่ (Web Animations API) ตอน mount ซึ่งเกิดทุกต้นรอบเพราะหน้า reveal ถอดการ์ดออก
  - `prefers-reduced-motion`: ไม่เอียง ไม่แจก ไม่มีแสงสะท้อน และพลิกทันที
  - icon ของ spyfall อยู่ที่ `client/icon.ts` ใช้ทั้งใน `GameClient.icon` และบนไพ่
- **ไพ่และอนิเมชันที่ใช้ร่วมกัน (`packages/ui`):** `FlipCard` (ไพ่สองหน้า), `CardBack`, `CardFace`, `PixelAvatar` และ `prefersReducedMotion()` ห้ามใส่ `filter` (เช่น `drop-shadow`) ที่ `FlipCard` เพราะทำให้ 3D แบนจนเห็นหลังไพ่ตลอด ให้ใส่ที่ wrapper keyframes `animate-scan`, `animate-rise` และ `animate-stamp` อยู่ใน `apps/web/src/app/globals.css` ทุกที่ที่ใช้ต้องมี `motion-reduce:animate-none`
- **อวตาร:** `avatarFor(name)` สร้าง pixel art 8x8 + สีจาก hash ของชื่อ (ไม่สนตัวพิมพ์) จึงไม่ต้องเก็บใน server ใช้ในล็อบบี้และหน้าเกม
- **ธีมแฟ้มลับ (spyfall):** พื้นหลังตาราง + เส้นสแกน (`Backdrop` เป็น fixed เนื้อหาจึงต้องอยู่ใน wrapper ที่เป็น `relative`) แผงข้อมูลเป็น `Dossier` (Card + แถบชื่อแบบแฟ้ม) และ phase เป็นตราประทับ
- **ผลโหวตและฉากเฉลย (spyfall):** โหวตไม่ผ่าน = แผง `LastVotePanel` พลิกบัตรโหวตทีละใบ (`BALLOT_STEP_MS`) ปิดได้ ส่วน reveal เป็นลำดับ `votes` (ถ้าจบด้วยโหวต) → `suspense` → `spy` (ไพ่พลิกเห็นสายลับ) → `done` (ผลและรายละเอียด) รวมราว 5 วินาที มีปุ่มข้าม reduced motion ข้ามไป `done` ทันที `reveal-winner` จึงโผล่หลังลำดับจบ (e2e รอได้เพราะ expect timeout 15 วินาที)
- **รัน dev:** `pnpm --filter @batonboard/web dev` (หรือ `web` ใน `.claude/launch.json` พอร์ต 3000) ไม่ต้องตั้งอะไร ห้องอยู่ในหน่วยความจำของ `next dev` ถ้าอยากใช้ Redis จริงให้ตั้ง Upstash env ใน `apps/web/.env.local` (ดู `apps/web/.env.example`)

### E2E (`e2e/`)

- รัน `pnpm e2e` ได้ Playwright จะเปิด `next dev` ที่พอร์ต 3100 (`distDir` เป็น `.next-e2e`, store ในหน่วยความจำ, poll ทุก 300ms) เอง จึงรันพร้อม dev server ปกติได้
- ใช้ viewport แบบ Pixel 7 ผู้เล่นแต่ละคนเป็น browser context แยก ในเครื่อง dev ใช้ Chrome ที่ติดตั้งอยู่ (`channel: 'chrome'`) ส่วน CI ใช้ Chromium ของ Playwright (ต้องรัน `pnpm --filter @batonboard/e2e exec playwright install --with-deps chromium` ก่อน)
- เทสต์อ่านข้อความจากไฟล์ข้อความจริง (`apps/web/src/messages/th.ts` และ `spyfall/client/messages.ts`) ใช้ `exact: true` กับชื่อปุ่มทุกครั้ง เพราะ "เห็นด้วย" เป็น substring ของ "ไม่เห็นด้วย" และหาองค์ประกอบด้วย `data-testid` (`room-code`, `role-spy`/`role-agent`/`role-location`/`role-name`, `spy-guess`, `reveal-winner`/`reveal-spy`, `data-phase`)
- ปุ่มบนหน้าหลักและหน้าเลือกเกมกดได้หลัง hydrate แล้วเท่านั้น (state `ready`) กันกรณีกดก่อน JS พร้อมแล้วปุ่มไม่ทำอะไร ซึ่งเจอทั้งใน e2e และบนมือถือที่ช้า
- `next-env.d.ts` และ `apps/web/AGENTS.md` เป็นไฟล์ที่ Next สร้างเองและอยู่ใน `.gitignore` คำสั่ง `typecheck` ของเว็บรัน `next typegen` ก่อน `tsc`
- job `e2e` ใน CI ตั้ง `CI=true` (ใช้ Chromium, retries 1, ไม่ reuse server) ถ้าเทสต์ล้มจะอัปโหลด `e2e/playwright-report` และ `e2e/test-results` (มี trace) เป็น artifact ชื่อ `playwright-report`

### เกมที่ 2: "I'm Big Deal" (`packages/games/boss`, 2026-10-19)

- เกมเจรจาดีลแบบ I'm the Boss! (Sid Sackson) แผนเต็ม ลำดับงาน B0–B6 และเหตุผลอยู่ใน `docs/boss-plan.md` ชื่อ "I'm the Boss" ใช้ในโค้ด/เอกสารเท่านั้น ห้ามใส่ใน UI หรือ data ชื่อที่แสดงคือ "I'm Big Deal" กระดาน ค่าดีล ชื่อตระกูล และชื่อไพ่เขียนเองทั้งหมด
- ตัดสินใจแล้ว: หน้าจอใช้ React Three Fiber (3D เฉพาะโต๊ะ/กระดาน/ตัวเงิน/ลูกเต๋า ส่วนไพ่บนมือ แผงดีล และเงินเป็น 2D และมีกระดาน 2D สำรอง), `mode: 'together'`, จบเกมตามต้นฉบับ (สุ่มจบหลังดีลที่ 10–14 จบแน่นอนที่ 15, "เกมสั้น" เป็นตัวเลือก = 10 ดีล), poll ทุก 1 วินาทีเหมือนเดิม, เวลาเจรจาต่อดีลเริ่มต้น 5 นาที host ปรับได้ 1–30 นาทีหรือไม่จำกัด (`negotiationMs: null`)
- `rules/` เป็น factory `createBoss({ boardId, spaces, dealValues, endFaces })` เหมือน spyfall เทสต์ใช้กระดานจำลองใน `rules/fixtures.ts` ตระกูลเป็น id สี (`FAMILIES`) ส่วนชื่อที่แสดงจะอยู่ใน `data/`
- id ไพ่ไม่ซ้ำทุกใบ (`clan-red-1`, `travel-any-2`, `stop-10` …) เทสต์รั่วจึงค้นด้วย `"<id>"` ที่มีเครื่องหมายคำพูด view ส่งไพ่บนมือเฉพาะของตัวเอง ของคนอื่นส่งแค่จำนวน ไม่ส่งกองจั่ว
- **แผนดีลผูกมัด:** บอส `PROPOSE` ว่าตระกูลไหนมาจากนักลงทุนหรือไพ่ตระกูลใบไหน และให้ใครเท่าไหร่ (บอสได้ส่วนที่เหลือ) ผู้ร่วมดีลทุกคน `RESPOND` ตกลง → นับถอยหลัง `CLOSE_MS` 5 วินาทีแล้วปิดดีลผ่าน `onDeadline` เสนอใหม่หรือมีคนไม่ตกลงจะล้างการนับ `rules/plan.ts` (ไม่ import zod) ใช้ร่วมกับ client ได้
- ไพ่ตระกูลที่วางบนโต๊ะอยู่จนจบดีล ใช้แล้วลงกองทิ้ง ที่ไม่ได้ใช้กลับมือ จั่วไม่เกิน 12 ใบบนมือ (จั่วได้น้อยกว่า 3 ถ้าเกิน แทนการให้ทิ้ง)
- แต้มทอยสุ่มจบเกมสุ่มไว้ตอน `DECLARE` (`deal.endRoll` ไม่อยู่ใน view) เพราะดีลปิดใน `onDeadline` ซึ่งไม่มี `rng` แล้วเปิดเผยผ่าน `lastRoll` (`kind: 'end'`) ตอนปิดดีล
- B0–B1 เสร็จ (แกนกติกา ยังไม่มีไพ่ไปเที่ยว/ซื้อตัว/ยึดดีล/เบรก) ยังไม่ได้ลงทะเบียนใน registry จนกว่าจะมี `data/` และ client (B3–B4)

### Deploy

- ขั้นตอนทั้งหมดอยู่ใน `docs/deploy.md`: Vercel โปรเจกต์เดียว Root Directory `apps/web` (`apps/web/vercel.json`) + Upstash Redis จาก Vercel Marketplace (ใส่ `KV_REST_API_URL` และ `KV_REST_API_TOKEN` ให้เอง)
- ใช้ Vercel CLI ได้ด้วย `npx vercel …` (ลิงก์ไว้ที่ `apps/web` ด้วย `vercel link --project bat-on-board`) บน Windows ถ้า PowerShell บล็อก `npx.ps1` ให้ใช้ `npx.cmd` แทน
- แผนฟรีของ Upstash จำกัดจำนวนคำสั่งต่อเดือน poll หนึ่งครั้งใช้ราว 1–2 คำสั่ง ถ้าเล่นเยอะจนใกล้โควตาให้เพิ่ม `NEXT_PUBLIC_POLL_MS`

---

## Roadmap

### เฟส 1 — MVP (ทำตามลำดับ)

- [x] ตั้ง monorepo (pnpm workspaces, TypeScript, Vitest, ESLint/Prettier)
- [x] `packages/engine`: `GameDefinition`, `Rng`, game runner, registry
- [x] `packages/games/spyfall/rules` + unit test ทั้งหมดข้างบน
- [x] `packages/games/spyfall/data`: ชุดสถานที่และบทบาทที่เขียนเอง อย่างน้อย 20 สถานที่
- [x] Game server: ห้อง, token, action pipeline, playerView, timer, reconnect (ย้ายจาก `apps/server` ไป `packages/rooms` + API ของ Next.js แล้ว)
- [x] `apps/web`: หน้าแรก, สร้าง/เข้าห้อง, ล็อบบี้, หน้าเล่น, หน้า reveal
- [x] Playwright e2e 4 ผู้เล่น
- [x] Deploy (Vercel + Upstash) — https://batonboard.vercel.app (โปรเจกต์ `bat-on-board` ผูกกับ GitHub: push ไป `main` = deploy production อัตโนมัติ)

### เฟส 2 — ขัดเกลา

ระบบคะแนนหลายรอบ, ~~ชุดสถานที่ที่ผู้เล่นสร้างเอง~~ (ทำแล้ว 2026-10-19), สลับภาษาไทย/อังกฤษ, เสียงและการสั่นบนมือถือ

### เฟส 3 — แพลตฟอร์ม

เกมที่สอง (เพื่อพิสูจน์ว่า `GameDefinition` ใช้ได้จริง — กำลังทำ "I'm Big Deal" ดู `docs/boss-plan.md`), บัญชีผู้ใช้, ประวัติการเล่น, PostgreSQL

---

## วิธีทำงานใน repo นี้

- เริ่มงานใหม่: อ่านไฟล์นี้ แล้วเลือกข้อถัดไปที่ยังไม่ติ๊กใน Roadmap
- ทำทีละข้อ จบแต่ละข้อด้วยเทสต์ที่ผ่าน แล้วติ๊ก `[x]` ในไฟล์นี้
- ถ้างานไหนต้องละเมิด "กฎสถาปัตยกรรม" ให้หยุดและถามก่อน
- ถ้ามีการตัดสินใจเชิงออกแบบใหม่ ให้บันทึกเพิ่มในไฟล์นี้
