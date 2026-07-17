import { useId } from "react";

export type StereoBrandMotion = "none" | "idle" | "working" | "wink";

interface Props {
  motion: StereoBrandMotion;
  color?: string;
  className?: string;
}

export function StereoBrandCharacter({ motion, color = "var(--stereo-blue)", className = "" }: Props) {
  const maskId = `stereo-brand-${useId().replace(/:/g, "")}`;

  return (
    <svg
      className={`stereo-brand-character motion-${motion} ${className}`}
      viewBox="0 0 80 80"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80">
          <g className="stereo-brand-rig">
            <g fill="white">
              <path d="M28 16h24v2h4v10h-4v-8H28v8h-4V18h4z" />
              <rect x="10" y="26" width="60" height="26" />
              <rect className="stereo-brand-left-leg" x="22" y="52" width="8" height="12" />
              <rect className="stereo-brand-right-leg" x="50" y="52" width="8" height="12" />
            </g>
            <g className="stereo-brand-left-eye">
              <path fill="black" d="M18 32h12v2h2v10h-2v2H18v-2h-2V34h2z" />
              <rect className="stereo-brand-left-pupil" x="22" y="37" width="6" height="6" fill="white" />
            </g>
            <g>
              <path fill="black" d="M50 32h12v2h2v10h-2v2H50v-2h-2V34h2z" />
              <rect className="stereo-brand-right-pupil" x="54" y="37" width="6" height="6" fill="white" />
            </g>
            <rect className="stereo-brand-mouth" x="28" y="48" width="24" height="2" fill="black" />
          </g>
        </mask>
      </defs>
      <rect width="80" height="80" fill={color} mask={`url(#${maskId})`} />
    </svg>
  );
}
