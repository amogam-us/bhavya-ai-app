import type { ChildProfile, Zone } from './domain';

export const DEFAULT_ZONES: Zone[] = [
  { id: 'restroom', name: 'Restroom', type: 'private', light: 'restroom_light' },
  { id: 'bedroom', name: 'Bedroom', type: 'private', light: 'bedroom_light' },
  { id: 'living_room', name: 'Living room', type: 'camera_ok', light: 'living_room_light' },
  { id: 'kitchen', name: 'Kitchen', type: 'camera_ok', light: null },
];

export const DEFAULT_PROFILE: ChildProfile = {
  name: 'Bhavya',
  language: 'English',
  readingLevel: 'simple',
  speechRate: 0.9,
  volume: 1,
  startLevel: 3,
  showText: true,
  calming: { breathing: true, music: true },
  glassesSuggestions: false,
};
