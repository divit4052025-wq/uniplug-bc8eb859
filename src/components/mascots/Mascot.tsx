// UniPlug Mascot System v3 — renderer ported to typed React JSX SVG.
// Source: ~/Downloads "UniPlug App Mascots (Remix).zip" → mascot-renderer-v3.js.
//
// Faithful port with three deliberate changes for a production React app:
//   1. Real JSX SVG — NO dangerouslySetInnerHTML.
//   2. The one generated DOM id (Climber's snow clip-path) uses React.useId(),
//      so server and client markup match (no hydration mismatch).
//   3. Animation classes (.mascot-anim / .m-* / .ax-*) are emitted as-is; the
//      keyframes + the prefers-reduced-motion guard live in src/styles.css.
//
// Identity is shape + colour; the face is shared and interchangeable. Do not give
// mascots distinct facial features to tell them apart.

import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type MascotShape =
  | "founder"
  | "sprout"
  | "climber"
  | "spark"
  | "mentor"
  | "quill"
  | "grid"
  | "sports"
  | "cocurricular"
  | "lens"
  | "leaf";

export type MascotExpression =
  | "default"
  | "happy"
  | "thinking"
  | "confused"
  | "focused"
  | "guiding"
  | "celebrating"
  | "excited"
  | "stressed";

const INK = "#1A1A1A";
const CHEEK = "#E89A8C";
const CREAM = "#FFFCFB";

// Accent fills used inside decorations.
const C = { rose: "#F4B5AA", coral: "#ED7E4A", sand: "#F2D098", sage: "#C5D9B0" };
// Matched deeper shades.
const ROSE_DEEP = "#C4907F";
const SAGE_DEEP = "#95B07E";
const CORAL_DEEP = "#BC4926";
const GOLD = "#E0B36A";
const PAPER_SHADE = "#E8D5C2";
const SAND_DEEP = "#D9A94E";
const TEAL_DEEP = "#5FA995";

const FILL_CENTER = { transformBox: "fill-box", transformOrigin: "center" } as CSSProperties;
const FILL_BOTTOM = { transformBox: "fill-box", transformOrigin: "center bottom" } as CSSProperties;
const FILL_TOP = { transformBox: "fill-box", transformOrigin: "center top" } as CSSProperties;

function isDark(hex: string): boolean {
  if (!hex || !hex.startsWith("#")) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.42;
}

function shade(hex: string, amt: number): string {
  if (!hex || !hex.startsWith("#")) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt * 255)));
  g = Math.max(0, Math.min(255, Math.round(g + amt * 255)));
  b = Math.max(0, Math.min(255, Math.round(b + amt * 255)));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

// 5-point star, top point up.
function starPath(cx: number, cy: number, R: number, r: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    const x = (cx + rad * Math.cos(a)).toFixed(1);
    const y = (cy + rad * Math.sin(a)).toFixed(1);
    d += (i === 0 ? "M " : "L ") + x + " " + y + " ";
  }
  return d + "Z";
}

function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

interface ShapeDef {
  path: string;
  round?: number;
  face: { cx: number; cy: number };
  hi?: { cx: number; cy: number; rx: number; ry: number };
}

const SHAPES: Record<MascotShape, ShapeDef> = {
  founder: {
    path: `M 62 38 L 178 38 Q 210 38 210 70 L 210 150 Q 210 182 178 182
           L 128 182 L 92 220 L 104 182 L 62 182 Q 30 182 30 150 L 30 70 Q 30 38 62 38 Z`,
    face: { cx: 120, cy: 106 },
    hi: { cx: 62, cy: 70, rx: 20, ry: 11 },
  },
  sprout: {
    path: `M 120 134 C 78 134, 60 162, 60 188 C 60 220, 90 234, 120 234
           C 150 234, 180 220, 180 188 C 180 162, 162 134, 120 134 Z`,
    face: { cx: 120, cy: 184 },
    hi: { cx: 92, cy: 158, rx: 16, ry: 8 },
  },
  climber: {
    path: `M 48 224 C 60 184 86 120 108 76 Q 119 54 130 76
           C 152 120 178 184 190 224 L 48 224 Z`,
    face: { cx: 120, cy: 154 },
    hi: { cx: 94, cy: 154, rx: 13, ry: 9 },
  },
  spark: {
    path: `M 56 234 C 30 226, 18 198, 30 168 C 42 140, 50 122, 50 106
           C 50 86,  42 68,  36 54 C 50 62,  64 74,  72 92
           C 78 80,  86 62,  94 44 C 102 28, 114 14, 126 12
           C 132 24, 136 42, 140 60 C 144 72, 150 82, 158 90
           C 160 76, 174 60, 188 50 C 188 66, 182 84, 180 102
           C 182 124, 192 142, 202 160 C 214 184, 218 214, 196 230
           C 168 246, 82 246, 56 234 Z`,
    face: { cx: 124, cy: 188 },
    hi: { cx: 78, cy: 170, rx: 13, ry: 8 },
  },
  mentor: {
    path: `M 68 64 Q 34 64 34 96 L 34 198 Q 34 230 68 230
           L 128 230 L 98 256 L 156 230 L 172 230 Q 206 230 206 198
           L 206 96 Q 206 64 172 64 Z`,
    face: { cx: 120, cy: 140 },
    hi: { cx: 64, cy: 96, rx: 19, ry: 11 },
  },
  quill: {
    path: `M 50 60 L 158 60 L 196 98 L 196 232 Q 196 246 182 246
           L 64 246 Q 50 246 50 232 Z`,
    face: { cx: 112, cy: 150 },
    hi: { cx: 78, cy: 98, rx: 14, ry: 8 },
  },
  grid: {
    path: `M 120 38 Q 134 38 144 48 L 202 106 Q 212 116 212 130
           Q 212 144 202 154 L 144 212 Q 134 222 120 222
           Q 106 222 96 212 L 38 154 Q 28 144 28 130
           Q 28 116 38 106 L 96 48 Q 106 38 120 38 Z`,
    face: { cx: 120, cy: 130 },
    hi: { cx: 80, cy: 96, rx: 16, ry: 8 },
  },
  sports: {
    path: `M 120 42 C 173 42 213 82 213 134 C 213 187 173 226 120 226 C 67 226 27 187 27 134 C 27 82 67 42 120 42 Z`,
    face: { cx: 120, cy: 132 },
    hi: { cx: 80, cy: 96, rx: 18, ry: 10 },
  },
  cocurricular: {
    path: starPath(120, 132, 92, 41),
    round: 13,
    face: { cx: 120, cy: 142 },
    hi: { cx: 96, cy: 112, rx: 14, ry: 8 },
  },
  lens: {
    path: `M 88 50 Q 56 50 56 84 L 56 200 Q 56 234 88 234
           L 152 234 Q 184 234 184 200 L 184 84 Q 184 50 152 50 Z`,
    face: { cx: 120, cy: 132 },
    hi: { cx: 82, cy: 90, rx: 14, ry: 9 },
  },
  leaf: {
    path: `M 48 220 C 40 130 92 50 198 40 C 206 40 204 132 134 208
           C 104 234 60 232 48 220 Z`,
    face: { cx: 116, cy: 148 },
    hi: { cx: 96, cy: 116, rx: 14, ry: 8 },
  },
};

// Idle ("resting") motion class per shape. Climber stays still by design.
const IDLE: Record<MascotShape, string> = {
  founder: "m-float",
  sprout: "m-sway",
  climber: "",
  spark: "m-flicker",
  mentor: "m-float",
  quill: "m-float",
  grid: "m-wobble",
  sports: "m-bounce",
  cocurricular: "m-twirl",
  lens: "m-float",
  leaf: "m-sway",
};

// An active expression can override the idle motion.
function exprClass(expr: MascotExpression): string {
  if (expr === "celebrating") return "m-jump";
  if (expr === "excited") return "m-bounce";
  if (expr === "stressed") return "m-shake";
  return "";
}

interface FaceProps {
  cx: number;
  cy: number;
  expr: MascotExpression;
  ink: string;
}

function Cheeks({ cx, cy }: { cx: number; cy: number }) {
  const y = cy + 14;
  return (
    <>
      <ellipse cx={cx - 30} cy={y} rx={9} ry={5} fill={CHEEK} opacity={0.78} />
      <ellipse cx={cx + 30} cy={y} rx={9} ry={5} fill={CHEEK} opacity={0.78} />
    </>
  );
}

function Eyes({ cx, cy, expr, ink }: FaceProps) {
  const dx = 18;
  const lx = cx - dx;
  const rx = cx + dx;
  const y = cy;
  const r = 5;
  const shine = ink === INK ? CREAM : INK;
  switch (expr) {
    case "happy":
      return (
        <>
          <path
            d={`M ${lx - 6} ${y + 2} Q ${lx} ${y - 6} ${lx + 6} ${y + 2}`}
            stroke={ink}
            strokeWidth={3.2}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M ${rx - 6} ${y + 2} Q ${rx} ${y - 6} ${rx + 6} ${y + 2}`}
            stroke={ink}
            strokeWidth={3.2}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case "celebrating":
      return (
        <>
          <polygon points={starPoints(lx, y, 7)} fill={ink} />
          <polygon points={starPoints(rx, y, 7)} fill={ink} />
        </>
      );
    case "focused":
      return (
        <>
          <line
            x1={lx - 6}
            y1={y}
            x2={lx + 6}
            y2={y}
            stroke={ink}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <line
            x1={rx - 6}
            y1={y}
            x2={rx + 6}
            y2={y}
            stroke={ink}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        </>
      );
    case "excited":
      return (
        <>
          <circle cx={lx} cy={y} r={r + 1.5} fill={ink} />
          <circle cx={lx + 1.5} cy={y - 1.5} r={2} fill={shine} />
          <circle cx={rx} cy={y} r={r + 1.5} fill={ink} />
          <circle cx={rx + 1.5} cy={y - 1.5} r={2} fill={shine} />
        </>
      );
    case "confused":
      return (
        <>
          <circle cx={lx} cy={y} r={r} fill={ink} />
          <line
            x1={rx - 6}
            y1={y + 1}
            x2={rx + 6}
            y2={y - 2}
            stroke={ink}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        </>
      );
    case "stressed":
      return (
        <>
          <circle cx={lx} cy={y} r={6} fill="none" stroke={ink} strokeWidth={2.6} />
          <circle cx={lx} cy={y} r={1.6} fill={ink} />
          <circle cx={rx} cy={y} r={6} fill="none" stroke={ink} strokeWidth={2.6} />
          <circle cx={rx} cy={y} r={1.6} fill={ink} />
        </>
      );
    case "guiding":
      return (
        <>
          <path
            d={`M ${lx - 6} ${y - 6} Q ${lx} ${y - 9} ${lx + 6} ${y - 6}`}
            stroke={ink}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
            opacity={0.65}
          />
          <circle cx={lx} cy={y} r={r} fill={ink} />
          <circle cx={rx} cy={y} r={r} fill={ink} />
        </>
      );
    case "thinking":
      return (
        <>
          <circle cx={lx} cy={y} r={r} fill={ink} />
          <circle cx={rx - 2} cy={y} r={r - 1} fill={ink} />
        </>
      );
    default:
      return (
        <>
          <circle cx={lx} cy={y} r={r} fill={ink} />
          <circle cx={rx} cy={y} r={r} fill={ink} />
        </>
      );
  }
}

function Mouth({ cx, cy, expr, ink }: FaceProps) {
  const my = cy + 20;
  switch (expr) {
    case "happy":
      return (
        <path
          d={`M ${cx - 10} ${my - 2} Q ${cx} ${my + 8} ${cx + 10} ${my - 2}`}
          stroke={ink}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      );
    case "celebrating":
      return (
        <path
          d={`M ${cx - 12} ${my - 2} Q ${cx} ${my + 14} ${cx + 12} ${my - 2} Q ${cx} ${my + 6} ${cx - 12} ${my - 2} Z`}
          fill={ink}
        />
      );
    case "focused":
      return (
        <line
          x1={cx - 7}
          y1={my + 1}
          x2={cx + 7}
          y2={my + 1}
          stroke={ink}
          strokeWidth={3}
          strokeLinecap="round"
        />
      );
    case "excited":
      return (
        <path
          d={`M ${cx - 11} ${my - 2} Q ${cx} ${my + 12} ${cx + 11} ${my - 2} Q ${cx} ${my + 5} ${cx - 11} ${my - 2} Z`}
          fill={ink}
        />
      );
    case "confused":
      return (
        <path
          d={`M ${cx - 8} ${my + 2} Q ${cx - 2} ${my - 3} ${cx + 4} ${my + 1} Q ${cx + 8} ${my + 4} ${cx + 10} ${my + 1}`}
          stroke={ink}
          strokeWidth={2.8}
          strokeLinecap="round"
          fill="none"
        />
      );
    case "stressed":
      return (
        <path
          d={`M ${cx - 10} ${my + 1} q 3 -4 6 0 t 6 0 t 4 0`}
          stroke={ink}
          strokeWidth={2.8}
          strokeLinecap="round"
          fill="none"
        />
      );
    case "guiding":
      return (
        <path
          d={`M ${cx - 9} ${my - 1} Q ${cx - 2} ${my + 7} ${cx + 10} ${my - 1}`}
          stroke={ink}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      );
    case "thinking":
      return (
        <line
          x1={cx - 6}
          y1={my + 1}
          x2={cx + 2}
          y2={my + 1}
          stroke={ink}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      );
    default:
      return (
        <path
          d={`M ${cx - 7} ${my} Q ${cx} ${my + 6} ${cx + 9} ${my - 2}`}
          stroke={ink}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      );
  }
}

function Extras({ cx, cy, expr, ink }: FaceProps) {
  switch (expr) {
    case "stressed":
      return (
        <path
          className="ax-sweat"
          style={FILL_TOP}
          d={`M ${cx + 44} ${cy - 8} q 4 8 0 12 q -4 -4 0 -12 Z`}
          fill="#5BA7D6"
        />
      );
    case "celebrating":
      return (
        <g className="ax-confetti" style={FILL_CENTER}>
          <circle cx={cx - 52} cy={cy - 32} r={2.6} fill={ink} opacity={0.7} />
          <circle cx={cx + 54} cy={cy - 26} r={2.6} fill={CHEEK} />
          <rect
            x={cx - 44}
            y={cy - 46}
            width={4.5}
            height={4.5}
            fill={ink}
            opacity={0.6}
            transform={`rotate(20 ${cx - 42} ${cy - 44})`}
          />
          <rect
            x={cx + 46}
            y={cy - 48}
            width={4.5}
            height={4.5}
            fill={CHEEK}
            transform={`rotate(-20 ${cx + 48} ${cy - 46})`}
          />
          <path
            d={`M ${cx} ${cy - 54} l 1.6 0 l 0 -1.6 l 1.6 0 l 0 1.6 l 1.6 0 l 0 1.6 l -1.6 0 l 0 1.6 l -1.6 0 l 0 -1.6 l -1.6 0 z`}
            fill={ink}
            opacity={0.55}
          />
        </g>
      );
    case "excited":
      return (
        <g className="ax-sparkle" style={FILL_CENTER}>
          <path
            d={`M ${cx - 48} ${cy - 26} l 2 0 l 0 -2 l 2 0 l 0 2 l 2 0 l 0 2 l -2 0 l 0 2 l -2 0 l 0 -2 l -2 0 z`}
            fill={ink}
            opacity={0.7}
          />
          <path
            d={`M ${cx + 44} ${cy - 22} l 1.6 0 l 0 -1.6 l 1.6 0 l 0 1.6 l 1.6 0 l 0 1.6 l -1.6 0 l 0 1.6 l -1.6 0 l 0 -1.6 l -1.6 0 z`}
            fill={ink}
            opacity={0.7}
          />
        </g>
      );
    case "thinking":
      return (
        <g className="ax-think">
          <circle
            cx={cx + 48}
            cy={cy - 18}
            r={1.8}
            fill={ink}
            opacity={0.5}
            style={{ "--d": "0s" } as CSSProperties}
          />
          <circle
            cx={cx + 55}
            cy={cy - 24}
            r={2.4}
            fill={ink}
            opacity={0.65}
            style={{ "--d": ".25s" } as CSSProperties}
          />
          <circle
            cx={cx + 64}
            cy={cy - 31}
            r={3.2}
            fill={ink}
            opacity={0.8}
            style={{ "--d": ".5s" } as CSSProperties}
          />
        </g>
      );
    default:
      return null;
  }
}

interface DecorationProps {
  shape: MascotShape;
  def: ShapeDef;
  color: string;
  expr: MascotExpression;
  clipId: string;
}

function Decoration({ shape, def, color, expr, clipId }: DecorationProps) {
  switch (shape) {
    case "sprout":
      return (
        <>
          <path
            d="M 36 234 Q 120 200 204 234 L 204 252 Q 120 244 36 252 Z"
            fill={SAGE_DEEP}
            opacity={0.85}
          />
          <circle cx={62} cy={248} r={2.4} fill={INK} opacity={0.6} />
          <circle cx={190} cy={244} r={2.2} fill={INK} opacity={0.6} />
          <circle cx={148} cy={250} r={1.6} fill={INK} opacity={0.5} />
          <path d="M 120 134 L 120 88" stroke={SAGE_DEEP} strokeWidth={4} strokeLinecap="round" />
          <g className="ax-leaves" style={FILL_BOTTOM}>
            <path
              d="M 120 88 C 108 80,88 70,64 70 C 56 76,56 86,64 92 C 76 100,100 102,120 96 Z"
              fill={C.sage}
            />
            <path
              d="M 118 92 Q 96 92 76 84"
              stroke={SAGE_DEEP}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
              opacity={0.6}
            />
            <path
              d="M 120 88 C 132 80,152 70,176 70 C 184 76,184 86,176 92 C 164 100,140 102,120 96 Z"
              fill={C.sage}
            />
            <path
              d="M 122 92 Q 144 92 164 84"
              stroke={SAGE_DEEP}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
              opacity={0.6}
            />
            <circle cx={120} cy={86} r={3} fill={SAGE_DEEP} />
          </g>
        </>
      );
    case "climber":
      return (
        <>
          <clipPath id={clipId}>
            <path d="M 0 0 L 240 0 L 240 92 L 142 92 L 133 86 L 126 95 L 119 87 L 112 95 L 105 86 L 96 92 L 0 92 Z" />
          </clipPath>
          <path d={def.path} fill={CREAM} opacity={0.96} clipPath={`url(#${clipId})`} />
        </>
      );
    case "spark":
      return (
        <>
          <g className="ax-flame" style={FILL_BOTTOM}>
            <path
              d="M 94 206 C 80 188,84 162,96 140 C 106 122,116 100,122 78 C 128 96,134 116,140 134 C 148 152,156 180,144 202 C 132 216,108 218,94 206 Z"
              fill={CORAL_DEEP}
              opacity={0.5}
            />
          </g>
          {(expr === "excited" || expr === "celebrating") && (
            <g className="ax-ember">
              <circle
                cx={200}
                cy={64}
                r={3.6}
                fill={C.coral}
                opacity={0.9}
                style={{ "--d": "0s" } as CSSProperties}
              />
              <circle
                cx={214}
                cy={46}
                r={2.2}
                fill={CORAL_DEEP}
                opacity={0.75}
                style={{ "--d": ".4s" } as CSSProperties}
              />
              <circle
                cx={208}
                cy={24}
                r={1.4}
                fill={CORAL_DEEP}
                opacity={0.6}
                style={{ "--d": ".8s" } as CSSProperties}
              />
            </g>
          )}
        </>
      );
    case "mentor":
      return (
        <g className="ax-halo" style={FILL_CENTER}>
          <path
            d="M 72 42 Q 120 8 168 42"
            stroke={C.sand}
            strokeWidth={11}
            strokeLinecap="round"
            fill="none"
            opacity={0.28}
          />
          <path
            d="M 74 44 Q 120 12 166 44"
            stroke={C.sand}
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={74} cy={44} r={3.4} fill={SAND_DEEP} />
          <circle cx={166} cy={44} r={3.4} fill={SAND_DEEP} />
        </g>
      );
    case "quill":
      return (
        <>
          <path d="M 158 60 L 158 98 L 196 98 Z" fill={PAPER_SHADE} />
          <path d="M 158 60 L 196 98" stroke="#D7C0AC" strokeWidth={1.8} fill="none" />
          <ellipse cx={118} cy={208} rx={6} ry={2} fill={C.rose} opacity={0.5} />
          <ellipse cx={126} cy={214} rx={3} ry={1.4} fill={C.rose} opacity={0.4} />
          <g transform="translate(216 24) rotate(125)">
            <path d="M 132 -8 Q 138 0, 132 8 L 124 8 L 124 -8 Z" fill={ROSE_DEEP} />
            <rect x={78} y={-8} width={46} height={16} rx={2} fill={ROSE_DEEP} />
            <rect x={86} y={-10.5} width={34} height={3} rx={1} fill={GOLD} />
            <circle cx={115} cy={-9} r={2} fill={GOLD} />
            <rect x={74} y={-9} width={6} height={18} fill={GOLD} />
            <rect x={38} y={-8} width={38} height={16} rx={1.5} fill={ROSE_DEEP} />
            <rect x={40} y={-6} width={34} height={2.5} fill={CREAM} opacity={0.25} />
            <path d="M 38 -8 L 22 -5.5 L 22 5.5 L 38 8 Z" fill={INK} />
            <path d="M 22 -5 L 4 -1 L 0 0 L 4 1 L 22 5 Z" fill={GOLD} />
            <path d="M 18 0 L 2 0" stroke={ROSE_DEEP} strokeWidth={0.8} />
            <circle cx={16} cy={0} r={1.2} fill={ROSE_DEEP} />
          </g>
        </>
      );
    case "sports":
      return (
        <>
          <g className="ax-motion">
            <path
              d="M 18 116 Q 4 134 18 152"
              stroke={SAND_DEEP}
              strokeWidth={3.4}
              strokeLinecap="round"
              fill="none"
              opacity={0.55}
            />
            <path
              d="M 6 122 Q -6 134 6 146"
              stroke={SAND_DEEP}
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
              opacity={0.35}
            />
          </g>
          <path
            d="M 120 42 C 150 70 150 198 120 226"
            stroke={SAND_DEEP}
            strokeWidth={2.6}
            fill="none"
            opacity={0.5}
          />
          <path
            d="M 50 86 C 96 110 144 110 190 86"
            stroke={SAND_DEEP}
            strokeWidth={2.2}
            fill="none"
            opacity={0.32}
          />
        </>
      );
    case "cocurricular":
      return (
        <g className="ax-twinkle">
          <path
            d="M 196 70 l 1.6 4 l 4 1.6 l -4 1.6 l -1.6 4 l -1.6 -4 l -4 -1.6 l 4 -1.6 z"
            fill={TEAL_DEEP}
            opacity={0.85}
            style={{ "--d": "0s" } as CSSProperties}
          />
          <path
            d="M 44 78 l 1.3 3.4 l 3.4 1.3 l -3.4 1.3 l -1.3 3.4 l -1.3 -3.4 l -3.4 -1.3 l 3.4 -1.3 z"
            fill={TEAL_DEEP}
            opacity={0.7}
            style={{ "--d": ".6s" } as CSSProperties}
          />
        </g>
      );
    case "leaf":
      return (
        <>
          <path
            d="M 196 42 L 96 200"
            stroke={shade(color, -0.18)}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
          <line
            x1={200}
            y1={38}
            x2={210}
            y2={26}
            stroke={shade(color, -0.28)}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      );
    default:
      return null;
  }
}

export interface MascotProps {
  shape: MascotShape;
  /** Identity fill. Defaults to the shape's canonical colour table entry isn't bundled here, so pass it from mascot-data. */
  color: string;
  expression?: MascotExpression;
  /** Rendered width in px; height derives from the 240×280 viewBox. */
  size?: number;
  /** Play the resting idle animation. Reduced-motion is handled in CSS. */
  idle?: boolean;
  shadow?: boolean;
  /** Decorative instances are hidden from assistive tech (aria-hidden). */
  decorative?: boolean;
  /** Accessible label for non-decorative instances. */
  title?: string;
  className?: string;
}

export function Mascot({
  shape,
  color,
  expression = "default",
  size = 160,
  idle = true,
  shadow = true,
  decorative = false,
  title,
  className,
}: MascotProps) {
  // Stable across SSR + client so the Climber snow clip-path never mismatches.
  const clipId = useId();
  const def = SHAPES[shape];
  const faceInk = isDark(color) ? CREAM : INK;
  const animClass = idle ? exprClass(expression) || IDLE[shape] : "";
  const height = Math.round((size * 280) / 240);
  const label = title ?? `UniPlug mascot: ${shape}`;

  return (
    <svg
      viewBox="0 0 240 280"
      width={size}
      height={height}
      className={cn("mascot-anim", animClass, className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      xmlns="http://www.w3.org/2000/svg"
    >
      {shadow && <ellipse cx={120} cy={256} rx={66} ry={6} fill={INK} opacity={0.1} />}
      <path
        d={def.path}
        fill={color}
        {...(def.round
          ? { stroke: color, strokeWidth: def.round, strokeLinejoin: "round" as const }
          : {})}
      />
      <Decoration shape={shape} def={def} color={color} expr={expression} clipId={clipId} />
      {def.hi && (
        <ellipse
          cx={def.hi.cx}
          cy={def.hi.cy}
          rx={def.hi.rx}
          ry={def.hi.ry}
          fill={CREAM}
          opacity={0.4}
        />
      )}
      <g>
        <Cheeks cx={def.face.cx} cy={def.face.cy} />
        <g className="ax-blink" style={FILL_CENTER}>
          <Eyes cx={def.face.cx} cy={def.face.cy} expr={expression} ink={faceInk} />
        </g>
        <Mouth cx={def.face.cx} cy={def.face.cy} expr={expression} ink={faceInk} />
        <Extras cx={def.face.cx} cy={def.face.cy} expr={expression} ink={faceInk} />
      </g>
    </svg>
  );
}
