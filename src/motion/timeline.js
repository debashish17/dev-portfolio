import { seg, easeInOut } from '../components/primitives.jsx';

// Shared motion constants. These used to live as local literals inside each
// page; keeping them here means a zone edit moves the whole scene at once
// instead of drifting out of sync with what the page actually animates.

// Scroll spring. It exists to blend discrete wheel notches into continuous motion.
// The previous tune {110, 26, 0.5} was heavily overdamped (ζ≈1.75, slow pole
// −4.7/s): a notch took ~0.5 s to reach 90 % of its travel and ~1.2 s to settle,
// which read as floaty lag. ζ≈1.23 here is still overshoot-free and still blends
// notches ~60 ms apart, but reaches 90 % in ~0.28 s and settles in ~0.6 s.
export const SCROLL_SPRING = Object.freeze({ stiffness: 160, damping: 22, mass: 0.5, restDelta: 0.0005 });
export const POINTER_SPRING = Object.freeze({ stiffness: 140, damping: 18, mass: 0.4 });
// Studio grid snap. Deliberately under-damped (ζ≈0.73) so a dropped shape
// overshoots its cell by a few px and comes back — the "click" of a snap you
// can see. Settles in ~0.35 s.
export const SNAP_SPRING = Object.freeze({ stiffness: 380, damping: 22, mass: 0.6 });

// Transition zones on the 0–1 scroll progress. Everything between two zones is a
// hold plateau where the camera is parked and nothing moves but the pointer.
// The landing runs TWO acts now — the name, then the manifesto — so this is one
// transition zone, not the three the old four-act scroll had. Everything either
// side of the zone is a hold plateau where the camera is parked and nothing
// moves but the pointer.
export const HOME_ZONES = Object.freeze([[0.42, 0.58]]);

export const ABOUT_ZONES = Object.freeze([[0.20, 0.34], [0.56, 0.70]]);

// The exact sub-windows each page hands to seg(). Derived rather than retyped.
export const HOME_SEGS = Object.freeze({
  exit1:  HOME_ZONES[0],
  enter2: [HOME_ZONES[0][0] + 0.02, HOME_ZONES[0][1] + 0.02],
});

export const ABOUT_SEGS = Object.freeze({
  exit1:  ABOUT_ZONES[0],
  enter2: [ABOUT_ZONES[0][0] + 0.02, ABOUT_ZONES[0][1] + 0.02],
  exit2:  ABOUT_ZONES[1],
  enter3: [ABOUT_ZONES[1][0] + 0.02, ABOUT_ZONES[1][1] + 0.03],
});


// Camera math lifted out of the pages' useTransform callbacks, so the page
// builds its transform string from a named function rather than inline maths.

// Two planes: the name rests at z 0, the manifesto at z 600, and the camera
// parks exactly on each at its hold so a resting act renders 1:1 and centred —
// any offset would zoom or shift it through the perspective origin. Tilt is
// sin(pi*s), so it peaks mid-zone and is exactly 0 at both holds.
export function homeCamera(p) {
  const s1 = seg(p, HOME_ZONES[0][0], HOME_ZONES[0][1], easeInOut);
  return { z: s1 * 600, tilt: Math.sin(Math.PI * s1) * -5 };
}
export const homeCameraTransform = (p) => {
  const { z, tilt } = homeCamera(p);
  return `translateZ(${-z}px) rotateX(${tilt}deg)`;
};

// Scenes sit at y 0/100/200vh and z 0/300/600. Mobile only cranes vertically.
export function aboutCamera(p, isMobile = false) {
  const s1 = seg(p, ABOUT_ZONES[0][0], ABOUT_ZONES[0][1], easeInOut);
  const s2 = seg(p, ABOUT_ZONES[1][0], ABOUT_ZONES[1][1], easeInOut);
  const y = (s1 + s2) * 100;
  if (isMobile) return { y };
  const z = (s1 + s2) * 300;
  const tilt = (Math.sin(Math.PI * s1) + Math.sin(Math.PI * s2)) * -4;
  return { z, tilt, y };
}
export const aboutCameraTransform = (p, isMobile) => {
  const c = aboutCamera(p, isMobile);
  if (c.z === undefined) return `translateY(${-c.y}vh)`;
  return `translateZ(${-c.z}px) rotateX(${c.tilt}deg) translateY(${-c.y}vh)`;
};
