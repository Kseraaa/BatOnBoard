import type { Locale, LocalizedText } from '@batonboard/ui';
import type { SpyfallErrorCode } from '../rules/constants';
import type { Phase, WinReason } from '../rules/types';

/**
 * ชื่อเกมที่แสดงต่อผู้ใช้ — เปลี่ยนที่นี่ที่เดียว
 * (ห้ามใช้ชื่อเกมต้นฉบับ ชื่อนั้นใช้เป็นชื่อภายในโค้ดเท่านั้น)
 */
export const GAME_DISPLAY_NAME: LocalizedText = {
  th: 'ใครคือสายลับ',
  en: "Who's the Spy?",
};

export const GAME_DESCRIPTION: LocalizedText = {
  th: 'ทุกคนอยู่ที่เดียวกัน ยกเว้นสายลับหนึ่งคน ถามตอบกันเพื่อหาตัวสายลับให้เจอ',
  en: 'Everyone shares a location except one spy. Ask questions to find them.',
};

const th = {
  phase: {
    questioning: 'ช่วงถามตอบ',
    voting: 'กำลังโหวต',
    'final-vote': 'โหวตรอบสุดท้าย',
    reveal: 'เฉลย',
  } satisfies Record<Phase, string>,
  paused: 'หยุดเวลา',
  firstAsker: (name: string) => `${name} เริ่มถามก่อน`,
  card: {
    hint: 'กดค้างเพื่อดูการ์ดของคุณ',
    show: 'เปิดการ์ดค้างไว้',
    hide: 'ซ่อนการ์ด',
    youAreSpy: 'คุณคือสายลับ!',
    spyHint: 'ฟังคำถามให้ดี เดาให้ได้ว่าทุกคนอยู่ที่ไหน โดยไม่ให้ใครจับได้',
    location: 'สถานที่',
    role: 'บทบาทของคุณ',
    spectator: 'คุณกำลังดูเกมรอบนี้ จะได้เล่นรอบถัดไปหลังกลับล็อบบี้',
  },
  players: 'ผู้เล่น',
  you: 'คุณ',
  offline: 'ออฟไลน์',
  accuse: 'กล่าวหา',
  accuseUsed: 'ใช้สิทธิ์แล้ว',
  confirmAccuse: (name: string) => `กล่าวหาว่า ${name} คือสายลับ?`,
  accuseHelp: 'แต่ละคนกล่าวหาได้ 1 ครั้งต่อรอบ ถ้าทุกคน (ยกเว้นผู้ถูกกล่าวหา) เห็นด้วย จะเฉลยทันที',
  confirm: 'ยืนยัน',
  cancel: 'ยกเลิก',
  vote: {
    title: (accuser: string, accused: string) => `${accuser} กล่าวหาว่า ${accused} คือสายลับ`,
    question: 'คุณเห็นด้วยไหม?',
    agree: 'เห็นด้วย',
    disagree: 'ไม่เห็นด้วย',
    youAreAccused: 'คุณถูกกล่าวหา! รอผลโหวต',
    waiting: 'คุณโหวตแล้ว รอคนอื่น',
    progress: (n: number, total: number) => `โหวตแล้ว ${n}/${total}`,
    help: 'ต้องเห็นด้วยทุกคน มีคนไม่เห็นด้วยคนเดียวก็ไม่ผ่าน',
  },
  final: {
    title: 'หมดเวลา! โหวตรอบสุดท้าย',
    help: 'แต่ละคนเสนอชื่อคนที่สงสัยได้ 1 คน หรือกดผ่าน ถ้าไม่มีใครถูกจับ สายลับชนะ',
    pass: 'ผ่าน ไม่เสนอชื่อ',
    done: 'คุณใช้สิทธิ์แล้ว รอคนอื่น',
  },
  spy: {
    guess: 'เปิดตัวและเดาสถานที่',
    guessTitle: 'เลือกสถานที่ที่คิดว่าใช่',
    guessHelp: 'เดาถูก สายลับชนะ เดาผิด ฝ่ายผู้เล่นชนะ (เดาได้ครั้งเดียว)',
    confirmGuess: (location: string) => `เดาว่าเป็น "${location}"?`,
  },
  locations: {
    title: 'สถานที่ทั้งหมด',
    help: 'แตะเพื่อขีดฆ่าสถานที่ที่ตัดทิ้งได้ (เห็นแค่คุณ)',
  },
  reveal: {
    agentsWin: 'ฝ่ายผู้เล่นชนะ!',
    spyWins: 'สายลับชนะ!',
    noWinner: 'จบรอบ',
    spyWas: 'สายลับคือ',
    locationWas: 'สถานที่คือ',
    spyGuessed: (location: string) => `สายลับเดาว่า "${location}"`,
    roles: 'บทบาทของทุกคน',
    spyRole: 'สายลับ',
    nextRound: 'เล่นรอบต่อไป',
    waitingHost: 'รอ host เริ่มรอบใหม่',
    wins: 'ชนะ',
    reasons: {
      'spy-caught': 'จับสายลับได้สำเร็จ',
      'innocent-convicted': 'โหวตจับผิดคน',
      'spy-guessed': 'สายลับเดาสถานที่ถูก',
      'spy-guessed-wrong': 'สายลับเดาสถานที่ผิด',
      'spy-survived': 'ไม่มีใครจับสายลับได้',
      'time-up': 'หมดเวลาโหวตรอบสุดท้าย',
      'spy-left': 'สายลับออกจากห้อง',
      'not-enough-players': 'ผู้เล่นเหลือไม่พอ',
    } satisfies Record<WinReason, string>,
  },
  settings: {
    duration: 'เวลาถามตอบ',
    minutes: (m: number) => `${m} นาที`,
  },
  errors: {
    'not-a-player': 'คุณไม่ได้อยู่ในรอบนี้',
    'wrong-phase': 'ตอนนี้ทำแบบนั้นไม่ได้',
    'unknown-player': 'ไม่พบผู้เล่นคนนี้',
    'cannot-accuse-self': 'กล่าวหาตัวเองไม่ได้',
    'accusation-used': 'คุณใช้สิทธิ์กล่าวหารอบนี้ไปแล้ว',
    'final-turn-used': 'คุณใช้สิทธิ์ไปแล้ว',
    'accused-cannot-vote': 'ผู้ถูกกล่าวหาโหวตไม่ได้',
    'already-voted': 'คุณโหวตไปแล้ว',
    'not-spy': 'เฉพาะสายลับเท่านั้น',
    'unknown-location': 'ไม่รู้จักสถานที่นี้',
    'not-host': 'เฉพาะ host เท่านั้น',
    'not-enough-players': 'ผู้เล่นไม่พอเล่นรอบต่อไป',
  } satisfies Record<SpyfallErrorCode, string>,
};

export type SpyfallMessages = typeof th;

const en: SpyfallMessages = {
  phase: {
    questioning: 'Questions',
    voting: 'Voting',
    'final-vote': 'Final vote',
    reveal: 'Reveal',
  },
  paused: 'Paused',
  firstAsker: (name) => `${name} asks first`,
  card: {
    hint: 'Press and hold to see your card',
    show: 'Keep card open',
    hide: 'Hide card',
    youAreSpy: 'You are the spy!',
    spyHint: 'Listen closely and figure out where everyone is without getting caught.',
    location: 'Location',
    role: 'Your role',
    spectator: 'You are watching this round. You will play after returning to the lobby.',
  },
  players: 'Players',
  you: 'you',
  offline: 'offline',
  accuse: 'Accuse',
  accuseUsed: 'Used',
  confirmAccuse: (name) => `Accuse ${name} of being the spy?`,
  accuseHelp:
    'Each player may accuse once per round. If everyone else (except the accused) agrees, the round ends.',
  confirm: 'Confirm',
  cancel: 'Cancel',
  vote: {
    title: (accuser, accused) => `${accuser} accuses ${accused} of being the spy`,
    question: 'Do you agree?',
    agree: 'Agree',
    disagree: 'Disagree',
    youAreAccused: 'You are accused! Waiting for the vote',
    waiting: 'You voted. Waiting for others',
    progress: (n, total) => `Voted ${n}/${total}`,
    help: 'Must be unanimous. One "disagree" stops the vote.',
  },
  final: {
    title: "Time's up! Final vote",
    help: 'Everyone may nominate one suspect or pass. If nobody is caught, the spy wins.',
    pass: 'Pass',
    done: 'You have used your turn. Waiting for others',
  },
  spy: {
    guess: 'Reveal and guess the location',
    guessTitle: 'Pick the location you think it is',
    guessHelp: 'Right: the spy wins. Wrong: the agents win. One guess only.',
    confirmGuess: (location) => `Guess "${location}"?`,
  },
  locations: {
    title: 'All locations',
    help: 'Tap to cross out locations (only you see this)',
  },
  reveal: {
    agentsWin: 'Agents win!',
    spyWins: 'The spy wins!',
    noWinner: 'Round over',
    spyWas: 'The spy was',
    locationWas: 'The location was',
    spyGuessed: (location) => `The spy guessed "${location}"`,
    roles: "Everyone's roles",
    spyRole: 'Spy',
    nextRound: 'Play next round',
    waitingHost: 'Waiting for the host to start the next round',
    wins: 'wins',
    reasons: {
      'spy-caught': 'The spy was caught',
      'innocent-convicted': 'An innocent player was voted out',
      'spy-guessed': 'The spy guessed the location',
      'spy-guessed-wrong': 'The spy guessed wrong',
      'spy-survived': 'Nobody caught the spy',
      'time-up': 'The final vote ran out of time',
      'spy-left': 'The spy left the room',
      'not-enough-players': 'Not enough players left',
    },
  },
  settings: {
    duration: 'Question time',
    minutes: (m) => `${m} min`,
  },
  errors: {
    'not-a-player': 'You are not in this round',
    'wrong-phase': "You can't do that right now",
    'unknown-player': 'Player not found',
    'cannot-accuse-self': "You can't accuse yourself",
    'accusation-used': 'You already accused someone this round',
    'final-turn-used': 'You already used your turn',
    'accused-cannot-vote': 'The accused cannot vote',
    'already-voted': 'You already voted',
    'not-spy': 'Spy only',
    'unknown-location': 'Unknown location',
    'not-host': 'Host only',
    'not-enough-players': 'Not enough players for another round',
  },
};

export const spyfallMessages: Record<Locale, SpyfallMessages> = { th, en };
