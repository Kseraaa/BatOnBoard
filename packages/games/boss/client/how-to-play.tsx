import { CARD_KINDS } from './logic';
import type { BossMessages } from './messages';

/** วิธีเล่นแบบย่อ พับเก็บได้ — ใช้ทั้งในล็อบบี้ (ตั้งค่าห้อง) และระหว่างเล่น */
export function HowToPlay({ m, defaultOpen = false }: { m: BossMessages; defaultOpen?: boolean }) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card px-3 py-2 text-sm"
      data-testid="how-to-play"
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between font-semibold">
        {m.help.title}
        <span aria-hidden className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-3 pb-2 pt-1">
        <p className="font-semibold">{m.help.goal}</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          {m.help.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="space-y-1">
          <p className="font-semibold">{m.help.cards}</p>
          <ul className="space-y-1">
            {CARD_KINDS.map((kind) => (
              <li key={kind}>
                <span className="font-semibold">{m.cards.kind[kind]}</span> — {m.cards.help[kind]}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">{m.help.tip}</p>
      </div>
    </details>
  );
}
