import { useId, type CSSProperties } from "react";
import "./StereoCharacter.css";

export type StereoCharacterVariant = "primary" | "silent" | "cassette";
export type StereoCharacterMotion = "none" | "idle" | "working" | "wink";

interface Props {
  size?: number;
  color?: string;
  background?: string;
  variant?: StereoCharacterVariant;
  motion?: StereoCharacterMotion;
  className?: string;
  label?: string;
}

export function StereoCharacter({
  size = 80,
  color = "#3B78D8",
  background = "transparent",
  variant = "primary",
  motion = "none",
  className = "",
  label = "Stereo",
}: Props) {
  const maskId = `stereo-character-${useId().replace(/:/g, "")}`;
  const silent = variant === "silent";
  const cassette = variant === "cassette";
  const style = { "--stereo-character-color": color, "--stereo-character-bg": background } as CSSProperties;

  return (
    <svg
      className={`stereo-character motion-${motion} ${className}`}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {background !== "transparent" && <rect width="80" height="80" fill="var(--stereo-character-bg)" />}
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80">
          <g className="stereo-character-rig">
            <g fill="white">
              <path d="M28 16h24v2h4v10h-4v-8H28v8h-4V18h4z" />
              <rect x="10" y="26" width="60" height="26" />
              <rect className="left-leg" x="22" y="52" width="8" height="12" />
              <rect className="right-leg" x="50" y="52" width="8" height="12" />
            </g>
            <g className="left-eye">
              <path fill="black" d="M18 32h12v2h2v10h-2v2H18v-2h-2V34h2z" />
              <rect className="left-pupil" x="22" y="37" width="6" height="6" fill="white" />
            </g>
            <g className="right-eye">
              <path fill="black" d="M50 32h12v2h2v10h-2v2H50v-2h-2V34h2z" />
              <rect className="right-pupil" x="54" y="37" width="6" height="6" fill="white" />
            </g>
            {!silent && !cassette && <rect className="slot" x="28" y="48" width="24" height="2" fill="black" />}
            {cassette && (
              <g>
                <rect x="26" y="47" width="28" height="3" fill="black" />
                <rect x="31" y="48" width="5" height="1" fill="white" />
                <rect x="44" y="48" width="5" height="1" fill="white" />
              </g>
            )}
          </g>
        </mask>
      </defs>
      <rect width="80" height="80" fill="var(--stereo-character-color)" mask={`url(#${maskId})`} />
    </svg>
  );
}
