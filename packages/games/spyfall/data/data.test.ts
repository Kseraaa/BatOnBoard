import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../rules';
import { DEFAULT_LOCATION_SET_ID, getLocationSet, locationSets, toLocationDefs } from './index';

/**
 * สถานที่ของเกมต้นฉบับ — ใช้เป็นรายการห้ามใช้เท่านั้น ห้ามนำไปแสดงหรือใส่ใน data
 * (เทียบแบบตรงตัวหลัง normalize ไม่ได้เทียบ substring)
 */
const BANNED_EN = [
  'airplane',
  'bank',
  'beach',
  'broadway theater',
  'casino',
  'cathedral',
  'circus tent',
  'corporate party',
  'crusader army',
  'day spa',
  'embassy',
  'hospital',
  'hotel',
  'military base',
  'movie studio',
  'ocean liner',
  'passenger train',
  'pirate ship',
  'polar station',
  'police station',
  'restaurant',
  'school',
  'service station',
  'space station',
  'submarine',
  'supermarket',
  'university',
  'amusement park',
  'art museum',
  'candy factory',
  'cat show',
  'cemetery',
  'coal mine',
  'construction site',
  'gaming convention',
  'gas station',
  'harbor docks',
  'ice hockey stadium',
  'jail',
  'jazz club',
  'library',
  'night club',
  'race track',
  'retirement home',
  'rock concert',
  'sightseeing bus',
  'stadium',
  'subway',
  'the u.n.',
  'vineyard',
  'wedding',
  'zoo',
];
const BANNED_TH = [
  'เครื่องบิน',
  'ธนาคาร',
  'ชายหาด',
  'โรงละคร',
  'คาสิโน',
  'โบสถ์',
  'ละครสัตว์',
  'งานเลี้ยงบริษัท',
  'สปา',
  'สถานทูต',
  'โรงพยาบาล',
  'โรงแรม',
  'ฐานทัพ',
  'สตูดิโอภาพยนตร์',
  'เรือสำราญ',
  'รถไฟ',
  'เรือโจรสลัด',
  'สถานีขั้วโลก',
  'สถานีตำรวจ',
  'ร้านอาหาร',
  'โรงเรียน',
  'สถานีอวกาศ',
  'เรือดำน้ำ',
  'ซูเปอร์มาร์เก็ต',
  'มหาวิทยาลัย',
  'สวนสนุก',
  'พิพิธภัณฑ์ศิลปะ',
  'โรงงานขนม',
  'สุสาน',
  'เหมืองถ่านหิน',
  'ไซต์ก่อสร้าง',
  'ปั๊มน้ำมัน',
  'ท่าเรือ',
  'คุก',
  'เรือนจำ',
  'ห้องสมุด',
  'ไนต์คลับ',
  'สนามแข่งรถ',
  'บ้านพักคนชรา',
  'คอนเสิร์ต',
  'รถบัสนำเที่ยว',
  'สนามกีฬา',
  'รถไฟใต้ดิน',
  'ไร่องุ่น',
  'งานแต่งงาน',
  'สวนสัตว์',
];

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe.each(Object.values(locationSets))('ชุดสถานที่ $id', (set) => {
  it('มีอย่างน้อย 20 สถานที่', () => {
    expect(set.locations.length).toBeGreaterThanOrEqual(20);
  });

  it('id และชื่อสถานที่ไม่ซ้ำ', () => {
    const ids = set.locations.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lang of ['th', 'en'] as const) {
      const names = set.locations.map((l) => normalize(l.name[lang]));
      expect(new Set(names).size, lang).toBe(names.length);
    }
  });

  it('ทุก id เป็น slug', () => {
    for (const l of set.locations) {
      expect(l.id).toMatch(SLUG);
      for (const r of l.roles) expect(r.id, l.id).toMatch(SLUG);
    }
  });

  it('ทุกสถานที่มีบทบาทพอให้ผู้เล่นสูงสุดได้คนละอย่าง และไม่ซ้ำ', () => {
    for (const l of set.locations) {
      expect(l.roles.length, l.id).toBeGreaterThanOrEqual(MAX_PLAYERS - 1);
      expect(new Set(l.roles.map((r) => r.id)).size, l.id).toBe(l.roles.length);
      for (const lang of ['th', 'en'] as const) {
        const names = l.roles.map((r) => normalize(r.name[lang]));
        expect(new Set(names).size, `${l.id} ${lang}`).toBe(names.length);
      }
    }
  });

  it('มีชื่อทั้งไทยและอังกฤษครบ', () => {
    const texts = [
      set.name,
      ...set.locations.flatMap((l) => [l.name, ...l.roles.map((r) => r.name)]),
    ];
    for (const t of texts) {
      expect(t.th.trim()).not.toBe('');
      expect(t.en.trim()).not.toBe('');
      expect(t.th).toMatch(/[฀-๿]/);
    }
  });

  it('ไม่มีสถานที่จากเกมต้นฉบับ', () => {
    const bannedEn = new Set(BANNED_EN.map(normalize));
    const bannedTh = new Set(BANNED_TH.map(normalize));
    for (const l of set.locations) {
      expect(bannedEn.has(normalize(l.name.en)), l.name.en).toBe(false);
      expect(bannedTh.has(normalize(l.name.th)), l.name.th).toBe(false);
    }
  });

  it('toLocationDefs ตัดชื่อออก เหลือแค่ id', () => {
    const defs = toLocationDefs(set);
    expect(defs).toHaveLength(set.locations.length);
    expect(JSON.stringify(defs)).not.toContain(set.locations[0]?.name.en as string);
  });
});

describe('getLocationSet', () => {
  it('หาชุดเริ่มต้นเจอ และคืน undefined ถ้าไม่มี', () => {
    expect(getLocationSet(DEFAULT_LOCATION_SET_ID)?.id).toBe(DEFAULT_LOCATION_SET_ID);
    expect(getLocationSet('nope')).toBeUndefined();
  });
});
