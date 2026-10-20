import { CanvasTexture, SRGBColorSpace } from 'three';

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.25, 0.25],
    [0.75, 0.75],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.25, 0.22],
    [0.75, 0.22],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.25, 0.78],
    [0.75, 0.78],
  ],
};

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, CanvasTexture>();

/** หน้าลูกเต๋าสีขาวจุดดำ (หน้า 1 เป็นจุดแดงใหญ่แบบลูกเต๋าไทย) */
export function dieFace(value: number): CanvasTexture {
  const key = `die-${value}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 128;
  const [c, g] = canvas(size);
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, size, size);
  for (const [x, y] of PIPS[value] ?? []) {
    g.beginPath();
    g.fillStyle = value === 1 ? '#d1343b' : '#1b1b1b';
    g.arc(x * size, y * size, value === 1 ? size * 0.13 : size * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  const t = texture(c);
  cache.set(key, t);
  return t;
}

/** หน้าเหรียญทองมีตัว $ */
export function coinFace(): CanvasTexture {
  const hit = cache.get('coin');
  if (hit) return hit;
  const size = 128;
  const [c, g] = canvas(size);
  g.fillStyle = '#f2b705';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = '#b07f00';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#7a5600';
  g.font = `900 ${size * 0.55}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', size / 2, size / 2 + 4);
  const t = texture(c);
  cache.set('coin', t);
  return t;
}
