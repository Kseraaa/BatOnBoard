import { describe, expect, it } from 'vitest';
import { loadConfig, parseOrigin } from './config';

describe('loadConfig', () => {
  it('ค่าเริ่มต้นสำหรับ dev', () => {
    expect(loadConfig({})).toEqual({
      port: 4000,
      host: '0.0.0.0',
      webOrigins: ['http://localhost:3000'],
    });
  });

  it('อ่าน PORT และ WEB_ORIGIN หลายค่า (ตัด / ท้าย)', () => {
    const config = loadConfig({
      PORT: '8080',
      WEB_ORIGIN: 'https://batonboard.vercel.app/, https://batonboard.app',
    });
    expect(config.port).toBe(8080);
    expect(config.webOrigins).toEqual(['https://batonboard.vercel.app', 'https://batonboard.app']);
  });

  it('ปฏิเสธ PORT ที่ผิด', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});

describe('parseOrigin แบบ wildcard', () => {
  const preview = parseOrigin('https://batonboard-*-myteam.vercel.app') as RegExp;

  it('รับ preview deploy ของทีมตัวเอง', () => {
    expect(preview.test('https://batonboard-git-main-myteam.vercel.app')).toBe(true);
    expect(preview.test('https://batonboard-abc123-myteam.vercel.app')).toBe(true);
  });

  it('ไม่รับโดเมนอื่นที่หน้าตาคล้ายกัน', () => {
    expect(preview.test('https://batonboard-x-myteam.vercel.app.evil.com')).toBe(false);
    expect(preview.test('https://evil.com/?https://batonboard-x-myteam.vercel.app')).toBe(false);
    expect(preview.test('https://batonboard-a.b-myteam.vercel.app')).toBe(false);
    expect(preview.test('http://batonboard-x-myteam.vercel.app')).toBe(false);
    expect(preview.test('https://batonboard-x-myteamXvercel.app')).toBe(false);
  });
});
