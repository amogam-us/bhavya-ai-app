/**
 * Floor plan of the simulated home, in metres: x to the right, z towards the
 * viewer, the floor at y = 0. Each room is a slot that maps to a hub zone with
 * the same id (the default rooms).
 */

export type RoomSlot = 'restroom' | 'bedroom' | 'living_room' | 'kitchen';
/** Where the child is: a room, or outside the house (the hub then does not know). */
export type Place = RoomSlot | 'outside';
export type Point = readonly [x: number, z: number];

export interface Rect {
  x1: number;
  x2: number;
  z1: number;
  z2: number;
}

export interface Doorway {
  /** Just inside and just outside the room, for walking between rooms. */
  inside: Point;
  outside: Point;
  /** Door sensor position (x, y, z). */
  sensor: readonly [number, number, number];
}

export interface RoomPlan extends Rect {
  slot: RoomSlot;
  defaultName: string;
  /** Where the child stands after walking into the room. */
  spot: Point;
  /** Rooms off the living room have a door; the living room is the hallway. */
  door: Doorway | null;
}

export const SLOTS: readonly RoomSlot[] = ['restroom', 'bedroom', 'living_room', 'kitchen'];

export const ROOM_PLANS: Record<RoomSlot, RoomPlan> = {
  restroom: {
    slot: 'restroom',
    defaultName: 'Restroom',
    x1: -8,
    x2: -2,
    z1: -6,
    z2: -1,
    spot: [-5, -3.1],
    door: { inside: [-5, -1.9], outside: [-5, -0.2], sensor: [-5.66, 0.72, -1] },
  },
  bedroom: {
    slot: 'bedroom',
    defaultName: 'Bedroom',
    x1: -2,
    x2: 8,
    z1: -6,
    z2: -1,
    spot: [1.7, -2.6],
    door: { inside: [0, -1.9], outside: [0, -0.2], sensor: [-0.66, 0.72, -1] },
  },
  living_room: {
    slot: 'living_room',
    defaultName: 'Living room',
    x1: -8,
    x2: 2,
    z1: -1,
    z2: 6,
    spot: [-1.6, 2.2],
    door: null,
  },
  kitchen: {
    slot: 'kitchen',
    defaultName: 'Kitchen',
    x1: 2,
    x2: 8,
    z1: -1,
    z2: 6,
    spot: [4.2, 2.2],
    door: { inside: [2.9, 2.5], outside: [1.1, 2.5], sensor: [2, 1.08, 1.54] },
  },
};

export const HOUSE: Rect = { x1: -8, x2: 8, z1: -6, z2: 6 };

/** The front door in the living room. Walking out of it means the child is outside. */
export const FRONT_DOOR = {
  x1: -1.5,
  x2: -0.3,
  inside: [-0.9, 4.9] as Point,
  outside: [-0.9, 7.2] as Point,
  sensor: [-1.58, 1.08, 6] as const,
};
export const OUTSIDE_SPOT: Point = [-0.9, 7.5];

/** The child can walk in the garden around the house, but no further. */
export const WORLD: Rect = { x1: -11, x2: 11, z1: -8.5, z2: 10 };

/**
 * Where a point is. Inside a doorway band (within `margin` of a room edge) the
 * answer is null, so walking through a door does not flicker between rooms.
 */
export function locate(x: number, z: number, margin = 0.15): Place | null {
  for (const room of Object.values(ROOM_PLANS)) {
    if (
      x > room.x1 + margin &&
      x < room.x2 - margin &&
      z > room.z1 + margin &&
      z < room.z2 - margin
    ) {
      return room.slot;
    }
  }
  const nearHouse =
    x > HOUSE.x1 - margin &&
    x < HOUSE.x2 + margin &&
    z > HOUSE.z1 - margin &&
    z < HOUSE.z2 + margin;
  return nearHouse ? null : 'outside';
}

/** Waypoints from one place to another, through the doors. */
export function pathBetween(from: Place | null, to: Place): Point[] {
  if (from === to) return [spotOf(to)];
  const points: Point[] = [];
  if (from === 'outside') {
    points.push(FRONT_DOOR.outside, FRONT_DOOR.inside);
  } else if (from && from !== 'living_room') {
    const door = ROOM_PLANS[from].door;
    if (door) points.push(door.inside, door.outside);
  }
  if (to === 'outside') {
    points.push(FRONT_DOOR.inside, FRONT_DOOR.outside, OUTSIDE_SPOT);
  } else if (to === 'living_room') {
    points.push(ROOM_PLANS.living_room.spot);
  } else {
    const plan = ROOM_PLANS[to];
    if (plan.door) points.push(plan.door.outside, plan.door.inside);
    points.push(plan.spot);
  }
  return points;
}

export function spotOf(place: Place): Point {
  return place === 'outside' ? OUTSIDE_SPOT : ROOM_PLANS[place].spot;
}
