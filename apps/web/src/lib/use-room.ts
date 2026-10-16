'use client';

import { useSyncExternalStore } from 'react';
import { getRoomClient } from './room-client';
import type { RoomClient, RoomSnapshot } from './room-client';

export function useRoom(): [RoomSnapshot, RoomClient] {
  const client = getRoomClient();
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
  return [snapshot, client];
}
