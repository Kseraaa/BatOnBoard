import { cn } from '@batonboard/ui';
import type { Family } from '../rules/types';
import { SYMBOLS } from './ctx';
import type { Ctx } from './ctx';

/** วงกลมสีประจำตระกูล + สัญลักษณ์ `outline` = ตระกูลให้เลือก */
export function FamilyDot({
  ctx,
  id,
  outline = false,
  size = 'sm',
  className,
}: {
  ctx: Ctx;
  id: Family;
  outline?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const f = ctx.family(id);
  return (
    <span
      title={f.name[ctx.locale]}
      aria-label={f.name[ctx.locale]}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full leading-none',
        size === 'xs' && 'size-3 text-[7px]',
        size === 'sm' && 'size-5 text-[10px]',
        size === 'md' && 'size-7 text-sm',
        outline ? 'border-2 bg-transparent' : 'text-white',
        className,
      )}
      style={outline ? { borderColor: f.color } : { backgroundColor: f.color }}
    >
      {size !== 'xs' && <span aria-hidden>{SYMBOLS[f.symbol] ?? ''}</span>}
    </span>
  );
}

export function FamilyName({ ctx, id }: { ctx: Ctx; id: Family }) {
  const f = ctx.family(id);
  return (
    <span className="inline-flex items-center gap-1.5">
      <FamilyDot ctx={ctx} id={id} />
      <span className="font-semibold" style={{ color: f.color }}>
        {f.name[ctx.locale]}
      </span>
    </span>
  );
}
