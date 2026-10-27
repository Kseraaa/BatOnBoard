import { FIGURE_SET_ID } from './data/figures';
import { SENTENCES } from './data/sentences';
import { createPoets } from './rules';

/** เกมที่ server ลงทะเบียนใน registry (ประโยคอยู่ฝั่ง server เท่านั้น) */
export const poets = createPoets({ setId: FIGURE_SET_ID, figures: [...SENTENCES] });
