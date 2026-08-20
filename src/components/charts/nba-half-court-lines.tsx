import {
  backboardPath,
  courtBoundaryPath,
  freeThrowCirclePath,
  freeThrowLinePath,
  hoopCircle,
  lanePath,
  restrictedPath,
  threePointPath,
} from "@/lib/nba-court";

/** NBA half-court marks: 23.75 ft arc, 22 ft corners, 13.75 ft free-throw line. */
export function NbaHalfCourtLines() {
  const hoop = hoopCircle();
  return (
    <g fill="none" stroke="currentColor" strokeOpacity="0.45">
      <path d={courtBoundaryPath()} />
      <path d={lanePath()} />
      <path d={freeThrowLinePath()} strokeWidth="1.75" />
      <path d={freeThrowCirclePath()} />
      <path d={threePointPath()} />
      <path d={restrictedPath()} />
      <path d={backboardPath()} strokeWidth="2.5" />
      <circle cx={hoop.cx} cy={hoop.cy} r={hoop.r} strokeWidth="2" />
    </g>
  );
}
