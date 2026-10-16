'use client';

import { useSyncExternalStore } from 'react';
import { getRoomClient } from './room-client';
import type { RoomClient, RoomSnapshotState } from './room-client';

export function useRoom(): [RoomSnapshotState, RoomClient] {
  const client = getRoomClient();
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
  return [snapshot, client];
}
