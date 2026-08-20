// src/core/slots.ts
//
// Which agent does a given key show? The answer is the key's *position*, not a setting:
// keys fill in reading order (left-to-right, top-to-bottom), so placing three Agent Slot
// keys shows herdr rows 1-3 with nothing to configure. See ADR 0002.

export type SlotKey = {
  id: string; // Stream Deck action instance id
  deviceId: string;
  row: number;
  column: number;
};

export type SlotAssignment = {
  indexById: Map<string, number>;
  // How many agents fit on a page, or null when no key has reported a position yet —
  // nothing is placed, so nothing is paged. `pageCount`/`pageSlice` treat null as unpaged.
  pageSize: number | null;
};

// Each device is ranked independently and shows the *same* agents (a mirror, not an
// extension). Ordering across devices would have to key off `deviceId`, which is an opaque
// id — so which deck got the low indices would be arbitrary and could change between
// sessions. Mirroring is deterministic instead.
//
// Page size is therefore the largest per-device count, not the total: the store holds one
// page and one page size, so taking the max lets a 5-key deck show agents 0-4 while a
// 3-key deck shows 0-2 of the same page. Taking the total would page in strides no single
// deck can display; taking the min would leave the larger deck's keys permanently empty.
export function assignSlots(keys: SlotKey[]): SlotAssignment {
  const byDevice = new Map<string, SlotKey[]>();
  for (const key of keys) {
    const group = byDevice.get(key.deviceId);
    if (group) group.push(key);
    else byDevice.set(key.deviceId, [key]);
  }

  const indexById = new Map<string, number>();
  let pageSize: number | null = null;

  for (const group of byDevice.values()) {
    group
      .slice()
      .sort((a, b) => a.row - b.row || a.column - b.column)
      .forEach((key, index) => indexById.set(key.id, index));
    pageSize = Math.max(pageSize ?? 0, group.length);
  }

  return { indexById, pageSize };
}
