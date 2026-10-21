'use client';

/**
 * โต๊ะ 3D (React Three Fiber) — โหลดแบบ lazy เฉพาะตอนแสดงแบบ 3D
 * วาดจาก view อย่างเดียว ไม่มี state ของเกมในฉาก (กติกาอยู่ที่ server)
 * ใช้ frameloop="demand": วาดใหม่เฉพาะตอนมีอนิเมชัน / หมุนกล้อง / view เปลี่ยน
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { avatarFor } from '@batonboard/ui';
import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { Group, Mesh } from 'three';
import { Color, Vector3 } from 'three';
import { cardFamily } from '../../rules/cards';
import { FAMILIES } from '../../rules/constants';
import type { BossView } from '../../rules/types';
import type { Ctx } from '../ctx';
import {
  coinStacks,
  DIE_FACES,
  dieRotation,
  markerPath,
  seatPos,
  STEP,
  TABLE_RADIUS,
  TILE,
  TILE_H,
  tilePos,
} from './layout';
import type { Vec3 } from './layout';
import { coinFace, dieFace } from './textures';

export interface SceneProps {
  ctx: Ctx;
  selected: number | null;
  onSelect(space: number | null): void;
  reduced: boolean;
}

const GOLD = '#f2b705';
const TOP = TILE_H;

export default function Scene({ ctx, selected, onSelect, reduced }: SceneProps) {
  const { view } = ctx;
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const tileLabels = useRef<(HTMLDivElement | null)[]>([]);
  const meIndex = view.players.indexOf(view.me);
  const anchors = view.players.map((_, i): Vec3 => {
    const [x, , z] = seatPos(i, view.players.length, meIndex);
    return [x, 0.6, z];
  });
  // ป้ายเงินของแต่ละช่องอยู่ขอบล่างของช่อง (ไม่บังจุดสีตระกูล)
  const tileAnchors = ctx.board.spaces.map((_, i): Vec3 => {
    const [x, , z] = tilePos(i);
    return [x, TOP + 0.05, z + TILE * 0.32];
  });

  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 8.6, 6.4], fov: 45 }}
        onPointerMissed={() => onSelect(null)}
        data-testid="board-3d"
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 10, 6]} intensity={1.5} />
        <directionalLight position={[-6, 6, -4]} intensity={0.35} />
        <TableTop />
        {ctx.board.spaces.map((space, i) => (
          <Tile key={space.id} ctx={ctx} index={i} selected={selected === i} onSelect={onSelect} />
        ))}
        <DealStack view={ctx.view} />
        <Marker view={ctx.view} reduced={reduced} />
        <Die view={ctx.view} reduced={reduced} />
        <TableCards ctx={ctx} />
        <PendingCard view={ctx.view} reduced={reduced} />
        <Seats ctx={ctx} />
        <OrbitControls
          enablePan={false}
          minDistance={7}
          maxDistance={16}
          minPolarAngle={0.2}
          maxPolarAngle={1.1}
          minAzimuthAngle={-0.9}
          maxAzimuthAngle={0.9}
        />
        <TouchScroll />
        <LabelTracker anchors={anchors} labels={labels} />
        <LabelTracker anchors={tileAnchors} labels={tileLabels} />
      </Canvas>
      {/* เงินรวมของดีลแต่ละช่อง (ราคาหุ้นตอนนี้ × จำนวนหุ้น) */}
      {ctx.board.spaces.map((space, i) => {
        const closed = view.closed.includes(i);
        return (
          <div
            key={space.id}
            ref={(el) => {
              tileLabels.current[i] = el;
            }}
            data-tile={i}
            className={`pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded px-1 font-mono text-[10px] font-black leading-tight shadow-sm will-change-transform ${closed ? 'bg-neutral-500/80 text-white' : 'bg-white/90 text-neutral-900'}`}
            style={{ visibility: 'hidden' }}
          >
            {closed ? '✓' : view.price !== null ? ctx.money(view.price * space.shares) : ''}
          </div>
        );
      })}
      {/* ป้ายชื่อเป็น DOM ธรรมดา (ภาษาไทยคมชัด) ตำแหน่งตามที่นั่งถูกเขียนใน useFrame */}
      {view.players.map((p, i) => {
        const boss = view.deal?.boss === p;
        return (
          <div
            key={p}
            ref={(el) => {
              labels.current[i] = el;
            }}
            data-seat={ctx.nameOf(p)}
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-semibold shadow will-change-transform"
            style={{ visibility: 'hidden' }}
          >
            {boss && '👑 '}
            {ctx.nameOf(p)}
            <span className="ml-1 font-mono">{ctx.money(view.money[p] ?? 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** ฉายตำแหน่งที่นั่งลงจอ แล้วย้ายป้ายชื่อ (ไม่ผ่าน React state จึงไม่ render ซ้ำทุกเฟรม) */
function LabelTracker({
  anchors,
  labels,
}: {
  anchors: Vec3[];
  labels: RefObject<(HTMLDivElement | null)[]>;
}) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    anchors.forEach((a, i) => {
      const el = labels.current[i];
      if (!el) return;
      v.set(...a).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.visibility = v.z < 1 ? 'visible' : 'hidden';
    });
  });
  return null;
}

/**
 * มือถือ: ปัดขึ้นลงบนโต๊ะต้องเลื่อนหน้าได้ (ไม่งั้นโต๊ะกินพื้นที่จนเลื่อนไม่ได้) ปัดซ้ายขวาหมุนกล้อง
 * OrbitControls ตั้ง touch-action เป็น none ตอนต่อ จึงต้องตั้งทับหลังจากนั้น (อยู่หลัง controls ใน tree)
 */
function TouchScroll() {
  // OrbitControls ผูกกับ element ที่รับ event ของ R3F (div ที่ห่อ canvas) ถ้ามี
  const connected = useThree((s) => s.events.connected as HTMLElement | undefined);
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    for (const el of [connected, canvas]) if (el) el.style.touchAction = 'pan-y';
  });
  return null;
}

function TableTop() {
  return (
    <group>
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.3, 64]} />
        <meshStandardMaterial color="#1f5f46" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[TABLE_RADIUS, 0.14, 12, 64]} />
        <meshStandardMaterial color="#6b4423" roughness={0.6} />
      </mesh>
      {/* พื้นกระดานใต้ช่องทั้ง 16 */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[STEP * 5 + 0.2, 0.02, STEP * 5 + 0.2]} />
        <meshStandardMaterial color="#163f30" roughness={1} />
      </mesh>
    </group>
  );
}

function Tile({
  ctx,
  index,
  selected,
  onSelect,
}: {
  ctx: Ctx;
  index: number;
  selected: boolean;
  onSelect(space: number): void;
}) {
  const { view } = ctx;
  const space = ctx.board.spaces[index];
  const [x, , z] = tilePos(index);
  if (!space) return null;
  const closed = view.closed.includes(index);
  const inDeal = view.deal?.space === index;
  const here = view.marker === index && view.phase !== 'ended';
  const glow = inDeal ? '#f59e0b' : selected ? '#6366f1' : here ? '#fbbf24' : '#000000';
  const families = [
    ...space.required.map((f) => ({ f, optional: false })),
    ...(space.optional?.from ?? []).map((f) => ({ f, optional: true })),
  ];

  return (
    <group position={[x, TOP / 2 + 0.02, z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
      >
        <boxGeometry args={[TILE, TOP, TILE]} />
        <meshStandardMaterial
          color={closed ? '#8f8c82' : '#f4efe1'}
          emissive={glow}
          emissiveIntensity={glow === '#000000' ? 0 : 0.45}
          roughness={0.8}
        />
      </mesh>
      {families.map(({ f, optional }, k) => {
        const px = -0.36 + (k % 4) * 0.2;
        const pz = -0.3 + Math.floor(k / 4) * 0.2;
        const color = ctx.family(f).color;
        return optional ? (
          <mesh key={f} position={[px, TOP / 2 + 0.012, pz]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.06, 0.02, 8, 20]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ) : (
          <mesh key={f} position={[px, TOP / 2 + 0.015, pz]}>
            <cylinderGeometry args={[0.075, 0.075, 0.03, 20]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      {/* จำนวนหุ้น = เหรียญซ้อนที่มุมช่อง */}
      {Array.from({ length: space.shares }, (_, k) => (
        <mesh key={k} position={[0.3, TOP / 2 + 0.02 + k * 0.032, 0.28]}>
          <cylinderGeometry args={[0.1, 0.1, 0.028, 20]} />
          <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {closed && (
        <mesh position={[0, TOP / 2 + 0.03, 0]} rotation={[0, 0.15, 0]}>
          <boxGeometry args={[0.78, 0.05, 0.6]} />
          <meshStandardMaterial color="#c9a227" metalness={0.5} roughness={0.4} />
        </mesh>
      )}
    </group>
  );
}

/** ป้ายดีลที่เหลือซ้อนกันกลางกระดาน ยิ่งปิดดีลยิ่งเตี้ยลง */
function DealStack({ view }: { view: BossView }) {
  const left = Math.max(0, view.maxDeals - view.dealsDone);
  return (
    <group position={[-0.75, 0.04, -0.4]}>
      {Array.from({ length: left }, (_, k) => (
        <mesh key={k} position={[0, k * 0.05, 0]} rotation={[0, (k % 3) * 0.03, 0]}>
          <boxGeometry args={[0.85, 0.045, 0.6]} />
          <meshStandardMaterial color={k === left - 1 ? '#e8c547' : '#c9a227'} metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

const HOP_S = 0.22;
const MARKER_Y = TOP + 0.1;

function Marker({ view, reduced }: { view: BossView; reduced: boolean }) {
  const group = useRef<Group>(null);
  const shown = useRef(view.marker);
  const anim = useRef<{ path: number[]; from: Vec3; t: number } | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const top = useMemo(() => coinFace(), []);

  useEffect(() => {
    if (shown.current === view.marker) return;
    const path = reduced ? [] : markerPath(shown.current, view.marker, view.closed);
    anim.current = path.length > 0 ? { path, from: tilePos(shown.current), t: 0 } : null;
    shown.current = view.marker;
    if (anim.current === null && group.current) {
      const [x, , z] = tilePos(view.marker);
      group.current.position.set(x, MARKER_Y, z);
    }
    invalidate();
  }, [view.marker, view.closed, reduced, invalidate]);

  useFrame((_, dt) => {
    const a = anim.current;
    const g = group.current;
    if (!a || !g) return;
    a.t += dt / HOP_S;
    const hop = Math.floor(a.t);
    if (hop >= a.path.length) {
      const [x, , z] = tilePos(a.path[a.path.length - 1] as number);
      g.position.set(x, MARKER_Y, z);
      anim.current = null;
    } else {
      const from = hop === 0 ? a.from : tilePos(a.path[hop - 1] as number);
      const to = tilePos(a.path[hop] as number);
      const f = a.t - hop;
      g.position.set(
        from[0] + (to[0] - from[0]) * f,
        MARKER_Y + Math.sin(f * Math.PI) * 0.6,
        from[2] + (to[2] - from[2]) * f,
      );
    }
    invalidate();
  });

  const [x, , z] = tilePos(view.marker);
  if (view.phase === 'ended') return null;
  return (
    <group ref={group} position={[x, MARKER_Y, z]}>
      <mesh position={[0.18, 0.08, -0.18]}>
        <cylinderGeometry args={[0.26, 0.26, 0.09, 32]} />
        <meshStandardMaterial attach="material-0" color="#c99500" metalness={0.7} roughness={0.3} />
        <meshStandardMaterial attach="material-1" map={top} metalness={0.3} roughness={0.4} />
        <meshStandardMaterial attach="material-2" color="#c99500" />
      </mesh>
    </group>
  );
}

const ROLL_S = 1.1;
const DIE_SIZE = 0.5;
const DIE_REST: Vec3 = [0.75, DIE_SIZE / 2 + 0.03, 0.45];

function Die({ view, reduced }: { view: BossView; reduced: boolean }) {
  const mesh = useRef<Mesh>(null);
  const seq = useRef(view.lastRoll?.seq ?? 0);
  const t = useRef(1);
  const invalidate = useThree((s) => s.invalidate);
  const faces = useMemo(() => DIE_FACES.map((v) => dieFace(v)), []);
  const value = view.lastRoll?.value ?? 1;
  const yaw = ((view.lastRoll?.seq ?? 0) * 1.7) % (Math.PI * 2);

  useEffect(() => {
    const next = view.lastRoll?.seq ?? 0;
    if (next === seq.current) return;
    seq.current = next;
    t.current = reduced ? 1 : 0;
    invalidate();
  }, [view.lastRoll, reduced, invalidate]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const [rx, , rz] = dieRotation(value);
    if (t.current >= 1) {
      m.rotation.set(rx, yaw, rz);
      m.position.set(...DIE_REST);
      return;
    }
    t.current = Math.min(1, t.current + dt / ROLL_S);
    const e = 1 - (1 - t.current) ** 3;
    const spin = 1 - e;
    m.rotation.set(rx + spin * 9, yaw + spin * 5, rz + spin * 7);
    const bounce = Math.abs(Math.sin(t.current * Math.PI * 3)) * (1 - t.current) * 1.4;
    m.position.set(DIE_REST[0] - spin * 1.2, DIE_REST[1] + bounce, DIE_REST[2] + spin * 0.8);
    invalidate();
  });

  return (
    <mesh ref={mesh} position={DIE_REST} rotation-order="YXZ">
      <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
      {faces.map((map, k) => (
        <meshStandardMaterial key={k} attach={`material-${k}`} map={map} roughness={0.5} />
      ))}
    </mesh>
  );
}

/** ไพ่ตระกูลที่วางบนโต๊ะของดีลนี้ วางเรียงข้างช่องดีล */
function TableCards({ ctx }: { ctx: Ctx }) {
  const deal = ctx.view.deal;
  if (deal === null) return null;
  const [x, , z] = tilePos(deal.space);
  // เลื่อนเข้าหากลางกระดาน
  const cx = x * 0.62;
  const cz = z * 0.62;
  return (
    <group position={[cx, 0.06, cz]}>
      {deal.offered.map((o, k) => {
        const family = cardFamily(o.card);
        return (
          <mesh key={o.card} position={[(k - (deal.offered.length - 1) / 2) * 0.36, 0, 0]}>
            <boxGeometry args={[0.3, 0.02, 0.42]} />
            <meshStandardMaterial color={family ? ctx.family(family).color : '#999'} />
          </mesh>
        );
      })}
    </group>
  );
}

const PENDING_COLOR = { travel: '#38bdf8', takeover: '#f59e0b', recruit: '#22c55e' } as const;

/** ไพ่ที่รอผลลอยหมุนอยู่กลางโต๊ะ ให้ทุกคนเห็นว่ามีคนลงไพ่ */
function PendingCard({ view, reduced }: { view: BossView; reduced: boolean }) {
  const mesh = useRef<Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const pending = view.deal?.pending ?? view.pending ?? null;
  useFrame((state) => {
    if (!mesh.current || pending === null || reduced) return;
    mesh.current.rotation.y = state.clock.elapsedTime * 2;
    mesh.current.position.y = 1.6 + Math.sin(state.clock.elapsedTime * 3) * 0.12;
    invalidate();
  });
  if (pending === null) return null;
  return (
    <mesh ref={mesh} position={[0, 1.6, 0]} rotation={[0.3, 0, 0]}>
      <boxGeometry args={[0.6, 0.85, 0.03]} />
      <meshStandardMaterial
        color={PENDING_COLOR[pending.kind]}
        emissive={PENDING_COLOR[pending.kind]}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

function Seats({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const meIndex = view.players.indexOf(view.me);
  return (
    <>
      {view.players.map((p, i) => (
        <Seat key={p} ctx={ctx} player={p} position={seatPos(i, view.players.length, meIndex)} />
      ))}
    </>
  );
}

function Seat({ ctx, player, position }: { ctx: Ctx; player: string; position: Vec3 }) {
  const { view } = ctx;
  const name = ctx.nameOf(player);
  const hue = avatarFor(name).hue;
  const color = useMemo(() => new Color().setHSL(hue / 360, 0.55, 0.55), [hue]);
  const turn = view.current === player && view.phase !== 'ended';
  const boss = view.deal?.boss === player;
  const held = FAMILIES.filter((f) => view.investors[f] === player);
  const stacks = coinStacks(view.money[player] ?? 0);
  const cards = Math.min(12, view.handCounts[player] ?? 0);
  // หันหน้าเข้ากลางโต๊ะ (ด้าน -z ของที่นั่ง = ทางกลางโต๊ะ)
  const facing = Math.atan2(position[0], position[2]);

  return (
    <group position={position} rotation={[0, facing, 0]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.04, 40]} />
        <meshStandardMaterial
          color={color}
          emissive={turn ? '#fbbf24' : '#000000'}
          emissiveIntensity={turn ? 0.6 : 0}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* กองเหรียญ = เงิน */}
      {stacks.map((n, s) => (
        <group key={s} position={[-0.55 + s * 0.3, 0.05, -0.35]}>
          {Array.from({ length: n }, (_, k) => (
            <mesh key={k} position={[0, k * 0.045, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.04, 20]} />
              <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}
      {/* ไพ่บนมือ (คว่ำ) */}
      <group position={[0.45, 0.05, 0.1]} rotation={[0, 0.3, 0]}>
        {Array.from({ length: cards }, (_, k) => (
          <mesh key={k} position={[k * 0.012, k * 0.014, -k * 0.01]}>
            <boxGeometry args={[0.36, 0.012, 0.5]} />
            <meshStandardMaterial color="#27306b" />
          </mesh>
        ))}
      </group>
      {/* ป้ายนักลงทุนที่ถือ ตั้งหันเข้ากลางโต๊ะ */}
      {held.map((f, k) => (
        <mesh key={f} position={[-0.2 + k * 0.32, 0.22, -0.75]}>
          <boxGeometry args={[0.28, 0.38, 0.05]} />
          <meshStandardMaterial color={ctx.family(f).color} />
        </mesh>
      ))}
      {boss && (
        <mesh position={[0, 0.9, 0]}>
          <torusGeometry args={[0.18, 0.05, 8, 5]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.2} />
        </mesh>
      )}
    </group>
  );
}
