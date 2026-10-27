/**
 * หมู่บ้านทั้ง 6 (หนึ่งรอบของต้นฉบับ) — ใช้ฝั่ง server เท่านั้น (ผ่าน root index.ts) ห้าม import จาก client
 *
 * แต่ละหมู่บ้าน: ประโยคที่ถูก 5 ประโยค + ข้อหลอก 1 ข้อของกวีฆาตกร (โวหารตามที่ครูกำกับ)
 * `also` = โวหารอื่นที่ประโยคนี้เข้าได้ด้วย ("ได้สองอัน") แสดงตอนเฉลย
 * `note` = คำอธิบายที่แสดงตอนเฉลยเท่านั้น (ไม่อ่านออกเสียง เพราะบอกคำตอบ)
 */
import type { VillageDef } from '../rules/types';

export const VILLAGES: readonly VillageDef[] = [
  {
    id: 'simile',
    figure: 'simile',
    sentences: [
      { id: 'simile-queen', text: 'ท่าทางหล่อนดุจดังนางพญา' },
      { id: 'simile-lychee', text: 'ธิดาลิ้นจี่ปีนี้สวยราวกับนางฟ้า' },
      {
        id: 'simile-rose',
        text: 'ริมฝีปากได้รูปกระจับสีชมพูอมแดงเฉกเช่นดอกกุหลาบนั้น ข้ารู้สึกหลงใหลมันเหลือเกิน',
      },
      { id: 'simile-ruby', text: 'ทนต์แดงดั่งแสงทับทิม เพริศพริ้มเพรารับกับขนง' },
      { id: 'simile-deer', text: 'ตาเหมือนเนื้อทรายซึ่งระแวงภัย' },
    ],
    decoys: [{ id: 'decoy-needle', text: 'ปากเท่ารูเข็ม', figure: 'metaphor' }],
  },
  {
    id: 'onomatopoeia',
    figure: 'onomatopoeia',
    sentences: [
      { id: 'sound-dew', text: 'น้ำค้างหยดลงเผาะ ๆ เป็นหยาดน้ำตาแห่งสวรรค์' },
      { id: 'sound-thunderbolt', text: 'เปรี้ยง ๆ ดังเสียงฟ้าฟาด' },
      { id: 'sound-tap', text: 'ปิดน้ำหรือยัง ทำไมแม่ยังได้ยินเสียงดังจ๊อก ๆ อยู่' },
      {
        id: 'sound-baby',
        text: 'แม่ปริก รีบไปในห้องเร็ว ๆ เสียงคุณหนูร้องอุแว้ ๆ ดังลั่นแล้ว',
      },
      { id: 'sound-rumble', text: 'เมื่อคืนนอนไม่หลับ เพราะได้ยินเสียงฟ้าร้องครืน ๆ' },
    ],
    decoys: [
      {
        id: 'decoy-sunlight',
        text: 'แสงสุรีย์สาดส่องต้องผืนน้ำเป็นประกายดุจเกล็ดแก้วพร่างพราย',
        figure: 'simile',
      },
    ],
  },
  {
    id: 'personification',
    figure: 'personification',
    sentences: [
      { id: 'person-field', text: 'ที่นาหายใจคล้ายคนร่อแร่จวนจะตาย', also: ['simile'] },
      { id: 'person-nature', text: 'ธรรมชาติรอบข้างต่างสลดหมดความคะนองทุกสิ่งทุกอย่าง' },
      { id: 'person-leaves', text: 'เมื่อลมพัดใบไม้สะบัดโบกมือเรียกเธอ' },
      { id: 'person-forest', text: 'ป่าห่มเสื้อสีเขียวขจีอย่างมีมนตร์' },
      { id: 'person-jar', text: 'เมื่อฝนตกหนักทีไร โอ่งที่บ้านฉันเป็นต้องสำลักน้ำทุกที' },
    ],
    decoys: [{ id: 'decoy-honey', text: 'น้ำผึ้งขม', figure: 'paradox' }],
  },
  {
    id: 'hyperbole',
    figure: 'hyperbole',
    sentences: [
      { id: 'hyper-elephant', text: 'ฉันหิวจนจะกินช้างได้ทั้งตัวแล้ว' },
      {
        id: 'hyper-pillar',
        text: 'ให้อายุยืนหมื่นเท่าเสาศิลา อยู่คู่ฟ้าได้ดังใจปอง',
        also: ['simile'],
      },
      { id: 'hyper-bones', text: 'หนาวจนกระดูกจะหลุด' },
      { id: 'hyper-tears', text: 'เขาร้องไห้จนน้ำตาเป็นสายเลือด' },
      { id: 'hyper-earth', text: 'แสงศรค้นหาคนรักแทบพลิกแผ่นดิน' },
    ],
    decoys: [{ id: 'decoy-sesame', text: 'โทษผู้ผิดเพียงเมล็ดงา', figure: 'understatement' }],
  },
  {
    id: 'symbol',
    figure: 'symbol',
    sentences: [
      { id: 'symbol-hair', text: 'เขาพูดอะไรไม่เคยนึกถึงหัวหงอกหัวดำ' },
      { id: 'symbol-smog', text: 'ชีวิตคนเราไม่ได้เจอหมอกควันอยู่ตลอดเวลา' },
      {
        id: 'symbol-swan',
        text: 'กาลวงว่าหงส์ให้ปลงใจ ด้วยมิได้ดูหงอนแต่ก่อนมา',
        also: ['personification'],
      },
      { id: 'symbol-diamond', text: 'เขามีเพชรอยู่ในมือแต่ปล่อยให้หลุดมือไปได้' },
      { id: 'symbol-sky-flower', text: 'เด็ดดอกฟ้า' },
    ],
    decoys: [{ id: 'decoy-dust', text: 'เรื่องนี้เล็กเท่าขี้ผง', figure: 'understatement' }],
  },
  {
    id: 'metonymy',
    figure: 'metonymy',
    sentences: [
      {
        id: 'meto-yamo',
        text: 'พรุ่งนี้พวกเราจะเดินทางไปเมืองย่าโม',
        note: 'เมืองย่าโม หมายถึง นครราชสีมา',
      },
      {
        id: 'meto-windmill',
        text: 'ที่แน่ ๆ ฉันว่าทีมกังหันลมต้องชนะการแข่งขันครั้งนี้',
        note: 'ทีมกังหันลม หมายถึง ทีมชาติเนเธอร์แลนด์',
      },
      {
        id: 'meto-glass-screen',
        text: 'ย่าว่าหลานเลิกดูจอแก้วได้แล้ว เอาเวลาไปทำการบ้านดีกว่า',
        note: 'จอแก้ว หมายถึง โทรทัศน์',
      },
      {
        id: 'meto-jar-city',
        text: 'ดูจากการแต่งตัวแล้ว ฉันว่าเธอมาจากเมืองโอ่ง',
        note: 'เมืองโอ่ง หมายถึง จังหวัดราชบุรี',
      },
      {
        id: 'meto-chair',
        text: 'เขารักเก้าอี้ยิ่งกว่าชื่อเสียง',
        note: 'เก้าอี้ หมายถึง ตำแหน่งหน้าที่การงานของผู้บริหาร',
      },
    ],
    decoys: [{ id: 'decoy-heaven', text: 'สวรรค์บนดิน', figure: 'paradox' }],
  },
];
