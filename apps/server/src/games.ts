import { createRegistry } from '@batonboard/engine';
import { spyfall } from '@batonboard/spyfall';

/**
 * ที่เดียวใน server ที่อ้างถึงเกม — เพิ่มเกมใหม่ด้วยการ register ที่นี่เท่านั้น
 * (กฎข้อ 4: platform ไม่รู้จักกติกาเกม)
 */
export function createGameRegistry() {
  const registry = createRegistry();
  registry.register(spyfall);
  return registry;
}
