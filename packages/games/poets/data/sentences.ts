/**
 * ประโยคของแต่ละโวหาร — ใช้ฝั่ง server เท่านั้น (ผ่าน root index.ts) ห้าม import จาก client
 *
 * `also` = โวหารอื่นที่ประโยคนี้เข้าได้ด้วย การแจกจะไม่ให้ประโยคนี้อยู่ฝั่งตรงข้ามกับโวหารเหล่านั้น
 * `note` = คำอธิบายที่แสดงตอนเฉลยเท่านั้น (ไม่อ่านออกเสียง เพราะบอกคำตอบ)
 */
import type { FigureDef } from '../rules/types';

export const SENTENCES: readonly FigureDef[] = [
  {
    id: 'simile',
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
  },
  {
    id: 'metaphor',
    sentences: [
      { id: 'metaphor-fire', text: 'ตอนเธอเป็นไฟ เขาก็กลายเป็นน้ำ' },
      { id: 'metaphor-leopard', text: 'เธอคือนังเสือดาว' },
      // "เท่า" ทำให้อ่านเป็นอุปมา/อวพจน์ได้ด้วย
      { id: 'metaphor-needle', text: 'ปากเท่ารูเข็ม', also: ['simile', 'understatement'] },
      { id: 'metaphor-sword', text: 'ปัญญาคือดาบสู้ดัสกร' },
      { id: 'metaphor-island', text: 'อันสตรีเป็นเกาะแก่งกีดกั้นกระแสกุศล' },
    ],
  },
  {
    id: 'onomatopoeia',
    sentences: [
      // "เป็นหยาดน้ำตาแห่งสวรรค์" เป็นอุปลักษณ์ด้วย
      {
        id: 'sound-dew',
        text: 'น้ำค้างหยดลงเผาะ ๆ เป็นหยาดน้ำตาแห่งสวรรค์',
        also: ['metaphor'],
      },
      // "ดัง" เป็นคำเปรียบของอุปมา
      { id: 'sound-thunderbolt', text: 'เปรี้ยง ๆ ดังเสียงฟ้าฟาด', also: ['simile'] },
      { id: 'sound-tap', text: 'ปิดน้ำหรือยัง ทำไมแม่ยังได้ยินเสียงดังจ๊อก ๆ อยู่' },
      {
        id: 'sound-baby',
        text: 'แม่ปริก รีบไปในห้องเร็ว ๆ เสียงคุณหนูร้องอุแว้ ๆ ดังลั่นแล้ว',
      },
      { id: 'sound-rumble', text: 'เมื่อคืนนอนไม่หลับ เพราะได้ยินเสียงฟ้าร้องครืน ๆ' },
    ],
  },
  {
    id: 'personification',
    sentences: [
      {
        id: 'person-field',
        text: 'ที่นาหายใจคล้ายคนร่อแร่จวนจะตาย',
        also: ['simile'],
      },
      { id: 'person-nature', text: 'ธรรมชาติรอบข้างต่างสลดหมดความคะนองทุกสิ่งทุกอย่าง' },
      { id: 'person-leaves', text: 'เมื่อลมพัดใบไม้สะบัดโบกมือเรียกเธอ' },
      { id: 'person-forest', text: 'ป่าห่มเสื้อสีเขียวขจีอย่างมีมนตร์' },
      { id: 'person-jar', text: 'เมื่อฝนตกหนักทีไร โอ่งที่บ้านฉันเป็นต้องสำลักน้ำทุกที' },
    ],
  },
  {
    id: 'hyperbole',
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
  },
  {
    id: 'understatement',
    sentences: [
      { id: 'under-shrimp', text: 'มีทองเท่าหนวดกุ้ง นอนสะดุ้งจนเรือนไหว' },
      { id: 'under-dust', text: 'เรื่องนี้เล็กเท่าขี้ผง' },
      { id: 'under-cat', text: 'กินข้าวเท่าแมวดม' },
      { id: 'under-sesame', text: 'โทษผู้ผิดเพียงเมล็ดงา' },
      { id: 'under-blink', text: 'พริบตาเดียวเท่านั้น' },
    ],
  },
  {
    id: 'symbol',
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
  },
  {
    id: 'metonymy',
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
  },
  {
    id: 'paradox',
    sentences: [
      { id: 'para-pain', text: 'ความสุขที่แสนจะเจ็บปวด' },
      { id: 'para-water', text: 'น้ำร้อนปลาเป็น น้ำเย็นปลาตาย' },
      { id: 'para-honey', text: 'น้ำผึ้งขม' },
      { id: 'para-hurry', text: 'ยิ่งรีบยิ่งช้า' },
      { id: 'para-heaven', text: 'สวรรค์บนดิน' },
    ],
  },
];
