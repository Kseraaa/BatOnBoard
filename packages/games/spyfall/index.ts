import { DEFAULT_LOCATION_SET_ID, getLocationSet, toLocationDefs } from './data';
import { createSpyfall } from './rules';

const set = getLocationSet(DEFAULT_LOCATION_SET_ID);
if (!set) throw new Error(`missing location set ${DEFAULT_LOCATION_SET_ID}`);

/** เกมที่ server ลงทะเบียนใน registry */
export const spyfall = createSpyfall({
  locationSetId: set.id,
  locations: toLocationDefs(set),
});
