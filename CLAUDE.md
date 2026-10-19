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
│     └─ spyfall/
│        ├─ rules/      # กติกาบริสุทธิ์ + unit test
│        ├─ client/     # หน้าจอเกม (React)
│        └─ data/       # ชุดสถานที่และบทบาท (เขียนเอง)
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
3. **รายชื่อสถานที่อ้างอิงไม่อยู่ใน view:** client import รายชื่อจาก `spyfall/data` แบบ static ส่วน `playerView` ส่งแค่ `locationSetId` เพื่อให้เทสต์ "view ของสายลับไม่มี id สถานที่ปัจจุบัน" เป็นจริงได้ ถ้าเฟส 2 มีชุดสถานที่ที่ผู้เล่นสร้างเอง ให้ส่งรายชื่อผ่าน `room` ใน snapshot ซึ่งเป็นข้อมูลสาธารณะ ไม่ส่งใน view
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
- `NEXT_ROUND` สุ่มสถานที่ใหม่ที่ไม่ซ้ำกับรอบก่อน และเก็บคะแนนไว้
- `isOver` เป็นจริงเฉพาะเมื่อ reveal แล้วคนไม่พอเล่นต่อ ระหว่าง reveal ปกติยังรับ `NEXT_ROUND`
- `SpyfallView` มี:
  - `you` เป็นหนึ่งใน `spy`, `agent` (มี `locationId`, `roleId`) หรือ `spectator`
  - `vote.voted` บอกแค่ว่าใครโหวตแล้ว ไม่บอกว่าโหวตอะไร
  - `reveal` เป็น `null` จนถึง phase `reveal`
- รหัส error อยู่ใน `SpyfallError` (`not-host`, `accusation-used`, `wrong-phase` ฯลฯ)

### Spyfall data

- ชุด `batonboard-original-v1` (`data/original-v1.ts`) มี 26 สถานที่ แห่งละ 7 บทบาท มีชื่อทั้งไทยและอังกฤษ (`LocalizedText`) ส่วนใหญ่เป็นสถานที่ในชีวิตคนไทย
- `data/` เก็บชื่อที่แสดง แต่กติกาเห็นแค่ id (ผ่าน `toLocationDefs`) client หาชุดสถานที่จาก `locationSetId` ใน view ด้วย `getLocationSet`
- `@batonboard/spyfall` (root `index.ts`) export ตัวแปร `spyfall` ที่สร้างจากชุดเริ่มต้นแล้ว เป็นตัวที่ `apps/web/src/server/service.ts` ใช้ลงทะเบียนใน registry
- `data.test.ts` ตรวจว่ามีอย่างน้อย 20 สถานที่ id เป็น slug ชื่อไม่ซ้ำ บทบาทพอ 7 อย่าง มีชื่อไทย/อังกฤษครบ และ**ไม่ตรงกับสถานที่ของเกมต้นฉบับ** (เทียบกับรายการห้ามใช้ที่อยู่ในไฟล์เทสต์เท่านั้น ห้ามย้ายรายการนี้ไปไว้ใน data หรือ UI)
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
- `packages/ui/src/game-client.ts` เป็นสัญญาระหว่างเว็บกับหน้าจอเกม: `GameClient` มี `Screen` (ได้ `view: unknown` แล้วแปลง type เอง), `Settings`, ชื่อ, จำนวนผู้เล่น, `mode` (`in-app` = เล่นบนจอได้เลย, `together` = ต้องคุยกันเอง อยู่ด้วยกันหรือ Discord/LINE) และ `icon` (pixel art เป็นแถวสตริง `#` วาดด้วย `PixelIcon`) เว็บลงทะเบียนเกมที่ `apps/web/src/games.ts` ที่เดียว
- ชื่อเกมที่แสดง `GAME_DISPLAY_NAME` อยู่ใน `packages/games/spyfall/client/messages.ts` ตอนนี้คือ "ใครคือสายลับ" / "Who's the Spy?" ข้อความของเกมอยู่ในไฟล์นั้น ข้อความของแพลตฟอร์มอยู่ที่ `apps/web/src/messages/{th,en}.ts` (เทสต์ตรวจว่า key ตรงกันและครอบคลุมรหัส error ทุกตัว)
- client import ค่าคงที่จาก `rules/constants.ts` และ type จาก `rules/types.ts` เท่านั้น ไม่ import `rules/game.ts` เพื่อไม่ให้ zod ติดไปใน bundle
- **การเชื่อมต่อ:** `lib/room-client.ts` (ใช้กับ `useSyncExternalStore`) poll ห้องของแท็บนี้ เปลี่ยนหน้าแล้วไม่หลุด ความถี่ตั้งด้วย `NEXT_PUBLIC_POLL_MS` (ค่าเริ่มต้น 1000) `serverOffset = serverNow - เวลากึ่งกลางของ request` ใช้กับ `Countdown`
- **localStorage:** `batonboard:name` เก็บชื่อเล่น และ `batonboard:room:<CODE>` เก็บ `{ token, playerId }` เปิดห้องเดิมในแท็บที่สองของเบราว์เซอร์เดียวกันจะเป็นผู้เล่นคนเดิม ถ้าจะทดสอบหลายผู้เล่นในเครื่องเดียวต้องใช้ browser context แยก
- **หน้า:** `/` หน้าหลัก (สไตล์ retro: พื้นเขียวเทาอ่อน หมึกเขียวเข้ม ตัวอักษร mono — สี `--landing-bg`/`--landing-ink` สลับกันในโหมดมืด มีแนะนำแพลตฟอร์ม, วิธีเล่น, ปุ่มเล่น, ช่องใส่รหัสห้อง และตารางเกมแยก 2 หมวดตาม `mode` เติมช่อง "เร็ว ๆ นี้" ให้เต็มแถว 4 ช่อง) → `/games` เลือกเกม + ใส่ชื่อ + สร้างห้อง (`?game=<id>` เลือกเกมไว้ให้) → `/r/<code>` ห้อง ช่องรหัสบนหน้าหลักไม่ถามชื่อ เพราะหน้าห้องถามเอง หน้าหลักกว้างเต็มจอ ส่วน `/games` และ `/r` อยู่ใน route group `(app)` ที่จำกัดกว้าง `max-w-md`
- **การ์ดบทบาท:** `HoldToReveal` กดค้างเพื่อดู มีปุ่มเปิดค้าง/ซ่อน ปุ่มสำคัญสูงอย่างน้อย 48px และหน้าจอกว้างไม่เกิน `max-w-md`
- **รัน dev:** `pnpm --filter @batonboard/web dev` (หรือ `web` ใน `.claude/launch.json` พอร์ต 3000) ไม่ต้องตั้งอะไร ห้องอยู่ในหน่วยความจำของ `next dev` ถ้าอยากใช้ Redis จริงให้ตั้ง Upstash env ใน `apps/web/.env.local` (ดู `apps/web/.env.example`)

### E2E (`e2e/`)

- รัน `pnpm e2e` ได้ Playwright จะเปิด `next dev` ที่พอร์ต 3100 (`distDir` เป็น `.next-e2e`, store ในหน่วยความจำ, poll ทุก 300ms) เอง จึงรันพร้อม dev server ปกติได้
- ใช้ viewport แบบ Pixel 7 ผู้เล่นแต่ละคนเป็น browser context แยก ในเครื่อง dev ใช้ Chrome ที่ติดตั้งอยู่ (`channel: 'chrome'`) ส่วน CI ใช้ Chromium ของ Playwright (ต้องรัน `pnpm --filter @batonboard/e2e exec playwright install --with-deps chromium` ก่อน)
- เทสต์อ่านข้อความจากไฟล์ข้อความจริง (`apps/web/src/messages/th.ts` และ `spyfall/client/messages.ts`) ใช้ `exact: true` กับชื่อปุ่มทุกครั้ง เพราะ "เห็นด้วย" เป็น substring ของ "ไม่เห็นด้วย" และหาองค์ประกอบด้วย `data-testid` (`room-code`, `role-spy`/`role-agent`/`role-location`/`role-name`, `spy-guess`, `reveal-winner`/`reveal-spy`, `data-phase`)
- ปุ่มบนหน้าหลักและหน้าเลือกเกมกดได้หลัง hydrate แล้วเท่านั้น (state `ready`) กันกรณีกดก่อน JS พร้อมแล้วปุ่มไม่ทำอะไร ซึ่งเจอทั้งใน e2e และบนมือถือที่ช้า
- `next-env.d.ts` และ `apps/web/AGENTS.md` เป็นไฟล์ที่ Next สร้างเองและอยู่ใน `.gitignore` คำสั่ง `typecheck` ของเว็บรัน `next typegen` ก่อน `tsc`
- job `e2e` ใน CI ตั้ง `CI=true` (ใช้ Chromium, retries 1, ไม่ reuse server) ถ้าเทสต์ล้มจะอัปโหลด `e2e/playwright-report` และ `e2e/test-results` (มี trace) เป็น artifact ชื่อ `playwright-report`

### Deploy

- ขั้นตอนทั้งหมดอยู่ใน `docs/deploy.md`: Vercel โปรเจกต์เดียว Root Directory `apps/web` (`apps/web/vercel.json`) + Upstash Redis จาก Vercel Marketplace (ใส่ `KV_REST_API_URL` และ `KV_REST_API_TOKEN` ให้เอง)
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
- [ ] Deploy (Vercel + Upstash) — ไฟล์ตั้งค่าพร้อมแล้ว รอ deploy จริงตาม `docs/deploy.md` แล้วค่อยติ๊ก

### เฟส 2 — ขัดเกลา

ระบบคะแนนหลายรอบ, ชุดสถานที่ที่ผู้เล่นสร้างเอง, สลับภาษาไทย/อังกฤษ, เสียงและการสั่นบนมือถือ

### เฟส 3 — แพลตฟอร์ม

เกมที่สอง (เพื่อพิสูจน์ว่า `GameDefinition` ใช้ได้จริง), บัญชีผู้ใช้, ประวัติการเล่น, PostgreSQL

---

## วิธีทำงานใน repo นี้

- เริ่มงานใหม่: อ่านไฟล์นี้ แล้วเลือกข้อถัดไปที่ยังไม่ติ๊กใน Roadmap
- ทำทีละข้อ จบแต่ละข้อด้วยเทสต์ที่ผ่าน แล้วติ๊ก `[x]` ในไฟล์นี้
- ถ้างานไหนต้องละเมิด "กฎสถาปัตยกรรม" ให้หยุดและถามก่อน
- ถ้ามีการตัดสินใจเชิงออกแบบใหม่ ให้บันทึกเพิ่มในไฟล์นี้
