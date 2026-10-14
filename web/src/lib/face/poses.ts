// The guided capture sequence on /enroll. Small turns only — a live scan
// at a door or kiosk sees people roughly facing it, so references within
// ~15-20 degrees of front are what actually help matching; a full profile
// shot would just add a candidate nothing ever matches.
//
// `guide` is how that pose looks ON SCREEN, for the wireframe overlay
// (FaceGuideOverlay). The camera feed isn't mirrored, so turning to your
// own left shows up as the face turning toward the screen's right (+yaw).
export const ENROLL_POSES = [
  { id: "front", label: "Straight ahead", hint: "Look straight at the camera, neutral face.", guide: { yaw: 0, pitch: 0 } },
  { id: "left", label: "Slight left", hint: "Turn your head a little to your left — about a quarter turn, eyes still visible.", guide: { yaw: 22, pitch: 0 } },
  { id: "right", label: "Slight right", hint: "Turn your head a little to your right — about a quarter turn, eyes still visible.", guide: { yaw: -22, pitch: 0 } },
  { id: "up", label: "Chin up", hint: "Tilt your chin up slightly, still facing the camera.", guide: { yaw: 0, pitch: 15 } },
  { id: "down", label: "Chin down", hint: "Tilt your chin down slightly, still facing the camera.", guide: { yaw: 0, pitch: -15 } },
] as const;

export type PoseId = (typeof ENROLL_POSES)[number]["id"];
