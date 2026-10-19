import type { ReactNode } from 'react';

/** หน้าเลือกเกมและห้อง: คอลัมน์เดียวขนาดมือถือ (หน้าหลักกว้างเต็มจอ จึงอยู่นอกกลุ่มนี้) */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
      {children}
    </main>
  );
}
