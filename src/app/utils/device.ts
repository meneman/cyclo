/**
 * True when the primary pointer is touch/coarse (phones, tablets) rather
 * than a mouse/trackpad — the standard UA-sniff-free way to tell touch and
 * desktop input apart. Used to show/hide the on-screen joystick and jump
 * button, which would otherwise just clutter a desktop keyboard-driven session.
 */
export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}
