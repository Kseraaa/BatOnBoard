import type { SVGAttributes } from 'react';

export interface PixelIconProps extends SVGAttributes<SVGSVGElement> {
  /** แต่ละแถวเป็นสตริง `#` = ช่องทึบ */
  rows: readonly string[];
}

/** วาด pixel art เป็น SVG สี currentColor — แต่ละช่องเว้นขอบบาง ๆ ให้เห็นเป็นตาราง */
export function PixelIcon({ rows, ...props }: PixelIconProps) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return (
    <svg
      viewBox={`0 0 ${width} ${rows.length}`}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden
      {...props}
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === '#' ? (
            <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} />
          ) : null,
        ),
      )}
    </svg>
  );
}
