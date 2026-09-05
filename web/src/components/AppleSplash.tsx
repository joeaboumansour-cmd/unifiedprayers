/**
 * iOS shows a launch image for an installed PWA only if a matching
 * `apple-touch-startup-image` link exists for that exact device size.
 * Without one the app opens on a blank white screen.
 *
 * Next's Metadata API has no field for these, so they are rendered as plain
 * link elements — React hoists them into <head>.
 */

/** [css width, css height, device pixel ratio] for current and recent devices. */
const DEVICES: [number, number, number][] = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [1024, 1366, 2],
];

export default function AppleSplash() {
  return (
    <>
      {DEVICES.map(([w, h, dpr]) => (
        <link
          key={`${w}x${h}@${dpr}`}
          rel="apple-touch-startup-image"
          media={
            `(device-width: ${w}px) and (device-height: ${h}px) ` +
            `and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`
          }
          href={`/icons/splash/splash-${w}x${h}@${dpr}x.png`}
        />
      ))}
    </>
  );
}
