export interface LocalizedText {
  th: string;
  en: string;
}

export interface RoleData {
  /** slug ไม่ซ้ำภายในสถานที่เดียวกัน */
  id: string;
  name: LocalizedText;
}

export interface LocationData {
  /** slug ไม่ซ้ำทั้งชุด */
  id: string;
  name: LocalizedText;
  roles: RoleData[];
}

export interface LocationSet {
  id: string;
  name: LocalizedText;
  locations: LocationData[];
}
