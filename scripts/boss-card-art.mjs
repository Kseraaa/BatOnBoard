// สร้างภาพไพ่อิทธิพลของ I'm Big Deal แบบ low poly (SVG)
// node scripts/boss-card-art.mjs apps/web/public/games/boss/cards
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 300;
const H = 400;
const out = process.argv[2];
mkdirSync(out, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) =>
  '#' +
  c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const mix = (a, b, t) => hex(a).map((v, i) => v + (hex(b)[i] - v) * t);
const shade = (c, f) => toHex((typeof c === 'string' ? hex(c) : c).map((v) => v * f));
const poly = (pts, fill) =>
  `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="0.7" stroke-linejoin="round"/>`;

/** พื้นหลัง: ตารางจุดเขย่าแล้วแบ่งสามเหลี่ยม ไล่สีจากบนลงล่าง */
function background(top, bottom, seed) {
  const r = rng(seed);
  const cols = 6;
  const rows = 8;
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    const row = [];
    for (let i = 0; i <= cols; i++) {
      const edgeX = i === 0 || i === cols;
      const edgeY = j === 0 || j === rows;
      const x = (i / cols) * W + (edgeX ? 0 : (r() - 0.5) * (W / cols) * 0.8);
      const y = (j / rows) * H + (edgeY ? 0 : (r() - 0.5) * (H / rows) * 0.8);
      row.push([x, y]);
    }
    pts.push(row);
  }
  const tris = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = pts[j][i];
      const b = pts[j][i + 1];
      const c = pts[j + 1][i];
      const d = pts[j + 1][i + 1];
      const flip = r() < 0.5;
      for (const t of flip
        ? [
            [a, b, d],
            [a, d, c],
          ]
        : [
            [a, b, c],
            [b, d, c],
          ]) {
        const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const base = mix(top, bottom, cy / H);
        tris.push(poly(t, shade(base, 0.9 + r() * 0.2)));
      }
    }
  }
  return tris.join('');
}

/**
 * เติมรูปหลายเหลี่ยมนูนแบบเพชร: วงนอก + วงใน + กลาง แต่ละเหลี่ยมแรเงาตามทิศแสง (บนซ้าย)
 */
function facet(pts, color, seed, depth = 0.5) {
  const r = rng(seed);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const inner = pts.map(([x, y]) => [cx + (x - cx) * depth, cy + (y - cy) * depth]);
  const light = [-0.6, -0.8];
  const lit = (tri, strength) => {
    const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3 - cx;
    const my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3 - cy;
    const len = Math.hypot(mx, my) || 1;
    const dot = (mx / len) * light[0] + (my / len) * light[1];
    return shade(color, 1 + dot * strength + (r() - 0.5) * 0.06);
  };
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const qa = inner[i];
    const qb = inner[(i + 1) % pts.length];
    for (const t of [
      [a, b, qa],
      [qa, b, qb],
    ])
      out.push(poly(t, lit(t, 0.28)));
    out.push(poly([[cx, cy], qa, qb], lit([[cx, cy], qa, qb], 0.1)));
  }
  return out.join('');
}

const tf = (pts, { x = 0, y = 0, rot = 0, s = 1 }) => {
  const c = Math.cos(rot);
  const n = Math.sin(rot);
  return pts.map(([px, py]) => [x + (px * c - py * n) * s, y + (px * n + py * c) * s]);
};

function ngon(n, rx, ry = rx, phase = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry];
  });
}

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>\n`;

// ---------- ไปเที่ยว: เครื่องบินเหนือภูเขาและเมฆ ----------
function travel() {
  let b = background('#bae6fd', '#0369a1', 11);
  // ภูเขาด้านล่าง
  const mountains = [
    [
      [-20, 400],
      [70, 270],
      [160, 400],
    ],
    [
      [90, 400],
      [200, 245],
      [320, 400],
    ],
    [
      [200, 400],
      [290, 300],
      [340, 400],
    ],
  ];
  mountains.forEach((m, i) => {
    b += facet(m, i === 1 ? '#1e3a5f' : '#25507a', 20 + i, 0.55);
    const [l, top, rgt] = m;
    const cap = [
      top,
      [top[0] + (l[0] - top[0]) * 0.28, top[1] + (l[1] - top[1]) * 0.28],
      [top[0] + (rgt[0] - top[0]) * 0.28, top[1] + (rgt[1] - top[1]) * 0.28],
    ];
    b += facet(cap, '#f1f5f9', 30 + i, 0.4);
  });
  // เมฆ
  for (const [x, y, s] of [
    [70, 120, 1],
    [235, 95, 0.75],
  ]) {
    for (const [dx, dy, rr] of [
      [-22, 6, 20],
      [0, -6, 26],
      [24, 6, 19],
    ]) {
      b += facet(tf(ngon(7, rr), { x: x + dx * s, y: y + dy * s, s }), '#ffffff', x + dx, 0.5);
    }
  }
  // เครื่องบิน (มุมมองจากบน) หันขึ้นขวา
  const at = { x: 150, y: 205, rot: -Math.PI / 4.2, s: 1.05 };
  const wing = (sgn) =>
    tf(
      [
        [-12, 0],
        [24, 0],
        [-14, 82 * sgn],
        [-36, 82 * sgn],
      ],
      at,
    );
  const tail = (sgn) =>
    tf(
      [
        [-88, 0],
        [-70, 0],
        [-92, 34 * sgn],
        [-104, 34 * sgn],
      ],
      at,
    );
  for (const sgn of [1, -1]) {
    b += facet(wing(sgn), '#e2e8f0', 40 + sgn, 0.45);
    b += facet(tail(sgn), '#e2e8f0', 50 + sgn, 0.45);
  }
  b += facet(
    tf(
      [
        [-98, -9],
        [55, -14],
        [98, 0],
        [55, 14],
        [-98, 9],
      ],
      at,
    ),
    '#f8fafc',
    60,
    0.5,
  );
  b += facet(
    tf(
      [
        [60, -7],
        [86, 0],
        [60, 7],
      ],
      at,
    ),
    '#0ea5e9',
    61,
    0.5,
  );
  b += facet(
    tf(
      [
        [-40, -5],
        [-20, -5],
        [-20, 5],
        [-40, 5],
      ],
      at,
    ),
    '#f97316',
    62,
    0.5,
  );
  return svg(b);
}

// ---------- ยึดดีล: มงกุฎทอง ----------
function takeover() {
  let b = background('#6d28d9', '#1e1b4b', 21);
  // รัศมีด้านหลัง
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const a2 = a + 0.13;
    b += poly(
      [
        [150, 200],
        [150 + Math.cos(a) * 190, 200 + Math.sin(a) * 190],
        [150 + Math.cos(a2) * 190, 200 + Math.sin(a2) * 190],
      ],
      i % 2 ? '#fde68a22' : '#fbbf2433',
    );
  }
  const gold = '#fbbf24';
  // แหลมมงกุฎ 5 ยอด (สามเหลี่ยมนูนแต่ละอัน)
  const base = 230;
  const spikes = [
    [-95, -10, 165],
    [-48, -35, 145],
    [0, -90, 125],
    [48, -35, 145],
    [95, -10, 165],
  ];
  spikes.forEach(([dx, , topY], i) => {
    const w = i === 2 ? 34 : 30;
    b += facet(
      [
        [150 + dx - w, base],
        [150 + dx, topY],
        [150 + dx + w, base],
      ],
      gold,
      70 + i,
      0.45,
    );
  });
  b += facet(
    [
      [52, base - 8],
      [248, base - 8],
      [240, 275],
      [60, 275],
    ],
    '#f59e0b',
    80,
    0.5,
  );
  b += facet(
    [
      [60, 275],
      [240, 275],
      [236, 295],
      [64, 295],
    ],
    '#b45309',
    81,
    0.5,
  );
  // อัญมณี
  const gems = [
    ['#ef4444', 150, 252, 13],
    ['#22c55e', 100, 252, 10],
    ['#3b82f6', 200, 252, 10],
  ];
  for (const [c, x, y, rr] of gems) b += facet(tf(ngon(4, rr * 0.8, rr), { x, y }), c, x, 0.4);
  for (const [dx, , topY] of spikes)
    b += facet(tf(ngon(6, 8), { x: 150 + dx, y: topY - 4 }), '#fef3c7', dx + 300, 0.4);
  return svg(b);
}

// ---------- ซื้อตัว: แม่เหล็กดูดนักลงทุน ----------
function recruit() {
  let b = background('#c4b5fd', '#4c1d95', 31);
  // แม่เหล็กเกือกม้า เปิดลงล่าง (สร้างจากส่วนโค้งนูนทีละช่วง)
  const cx = 150;
  const cy = 170;
  const R = 82;
  const r = 44;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const a0 = Math.PI + (i / steps) * Math.PI;
    const a1 = Math.PI + ((i + 1) / steps) * Math.PI;
    const seg = [
      [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R],
      [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r],
      [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r],
    ];
    b += facet(seg, '#dc2626', 90 + i, 0.6);
  }
  for (const sgn of [-1, 1]) {
    const x0 = cx + sgn * r;
    const x1 = cx + sgn * R;
    const [l, rr] = sgn < 0 ? [x1, x0] : [x0, x1];
    b += facet(
      [
        [l, cy],
        [rr, cy],
        [rr, cy + 42],
        [l, cy + 42],
      ],
      '#dc2626',
      100 + sgn,
      0.6,
    );
    b += facet(
      [
        [l, cy + 42],
        [rr, cy + 42],
        [rr, cy + 70],
        [l, cy + 70],
      ],
      '#e5e7eb',
      110 + sgn,
      0.6,
    );
  }
  // เส้นแรงดูด
  for (const [x, y, w] of [
    [110, 268, 22],
    [150, 262, 30],
    [190, 268, 22],
  ]) {
    b += poly(
      [
        [x - w / 2, y],
        [x + w / 2, y],
        [x + w / 2 - 3, y + 6],
        [x - w / 2 + 3, y + 6],
      ],
      '#fde68a',
    );
  }
  // นักลงทุน (หัว + ลำตัวใส่สูท)
  b += facet(tf(ngon(7, 19), { x: 150, y: 300 }), '#fcd34d', 120, 0.5);
  b += facet(
    [
      [118, 372],
      [128, 326],
      [172, 326],
      [182, 372],
    ],
    '#1f2937',
    121,
    0.5,
  );
  b += facet(
    [
      [144, 326],
      [156, 326],
      [150, 350],
    ],
    '#f8fafc',
    122,
    0.5,
  );
  return svg(b);
}

// ---------- เบรก!: ป้ายหยุดแปดเหลี่ยม + ฝ่ามือ ----------
function stop() {
  let b = background('#fdba74', '#7f1d1d', 41);
  b += facet(tf(ngon(8, 112, 112, Math.PI / 8), { x: 150, y: 200 }), '#f8fafc', 130, 0.92);
  b += facet(tf(ngon(8, 100, 100, Math.PI / 8), { x: 150, y: 200 }), '#dc2626', 131, 0.5);
  // ฝ่ามือ: นิ้ว 4 นิ้ว + นิ้วโป้ง + ฝ่ามือ (สี่เหลี่ยมนูนทั้งหมด)
  const white = '#fff7ed';
  const fingers = [
    [104, 150, 18],
    [126, 138, 19],
    [149, 136, 19],
    [172, 146, 18],
  ];
  for (const [x, top, w] of fingers) {
    b += facet(
      [
        [x, top + 8],
        [x + 4, top],
        [x + w - 4, top],
        [x + w, top + 8],
        [x + w, 205],
        [x, 205],
      ],
      white,
      x,
      0.5,
    );
  }
  b += facet(
    [
      [104, 200],
      [190, 200],
      [192, 248],
      [176, 270],
      [118, 270],
      [102, 246],
    ],
    white,
    140,
    0.55,
  );
  b += facet(
    [
      [190, 214],
      [212, 190],
      [226, 198],
      [204, 236],
      [190, 248],
    ],
    white,
    141,
    0.5,
  );
  return svg(b);
}

const cards = { travel, takeover, recruit, stop };
for (const [name, make] of Object.entries(cards)) {
  writeFileSync(join(out, `${name}.svg`), make());
  console.log(name);
}
