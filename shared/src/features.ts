/**
 * Feature switches shared by the hub and the web apps. A switched-off feature keeps
 * its code but is hidden in every app and refused by the hub.
 */
export const FEATURES: { objectFinder: boolean } = {
  /** "Object to find": highlighting a step's object with SAM 3.1. Off by request. */
  objectFinder: false,
};
