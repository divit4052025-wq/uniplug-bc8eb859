/* ============================================================
   UniPlug Mascot Renderer · v3
   11 mascots. Same face vocabulary. Shape + colour = identity.
   New / improved:
     · Founder  (was The Plug) — refined speech bubble, brand mark
     · Climber  — egg + summit flag (the metaphor now reads)
     · Mentor   — cleaner halo + two chat-tails
     · Quill    — paper + fountain pen
     · Spark    — asymmetric live flame
     · Sprout   — seed + two leaves on a soil mound
     · Sports   — bouncing ball (split from Pulse)
     · Co-curric — creative star (split from Pulse)
   Animation-aware: bodies + accents carry classes the page can drive.
   ============================================================ */

(function () {
  const INK   = '#1A1A1A';
  const CHEEK = '#E89A8C';
  const CREAM = '#FFFCFB';

  // ---- palette + matched deeper shades ----
  const PALETTE = {
    ink:   '#1A1A1A',
    rose:  '#F4B5AA',
    lilac: '#D7C8EE',
    coral: '#ED7E4A',   // v3 tangerine
    cream: '#F8E8DD',
    paper: '#FAEFE3',
    sky:   '#C2D9EA',
    sand:  '#F2D098',
    teal:  '#9AD6C6',   // NEW — co-curricular
    plum:  '#B5A0D4',
    sage:  '#C5D9B0',
  };
  const ROSE_DEEP  = '#C4907F';
  const SAGE_DEEP  = '#95B07E';
  const CORAL_DEEP = '#BC4926';
  const GOLD       = '#E0B36A';
  const PAPER_SHADE= '#E8D5C2';
  const LILAC_DEEP = '#9D86C9';
  const SAND_DEEP  = '#D9A94E';
  const TEAL_DEEP  = '#5FA995';

  let FACE_INK = INK;
  let UID = 0;

  function isDark(hex) {
    if (!hex || !hex.startsWith('#')) return false;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.42;
  }
  function shade(hex, amt) {
    if (!hex || !hex.startsWith('#')) return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt * 255)));
    g = Math.max(0, Math.min(255, Math.round(g + amt * 255)));
    b = Math.max(0, Math.min(255, Math.round(b + amt * 255)));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // ============================================================
  // SHAPES — body path + face anchor + highlight. viewBox 240×280.
  // ============================================================
  const SHAPES = {
    // 1. FOUNDER — refined speech bubble + tail. Brand mark (ink only).
    founder: {
      path: `M 62 38 L 178 38 Q 210 38 210 70 L 210 150 Q 210 182 178 182
             L 128 182 L 92 220 L 104 182 L 62 182 Q 30 182 30 150 L 30 70 Q 30 38 62 38 Z`,
      face: { cx: 120, cy: 106 },
      hi:   { cx: 62, cy: 70, rx: 20, ry: 11 },
    },
    // 2. SPROUT — seed body (leaves + soil added in decoration).
    sprout: {
      path: `M 120 134 C 78 134, 60 162, 60 188 C 60 220, 90 234, 120 234
             C 150 234, 180 220, 180 188 C 180 162, 162 134, 120 134 Z`,
      face: { cx: 120, cy: 184 },
      hi:   { cx: 92, cy: 158, rx: 16, ry: 8 },
    },
    // 3. CLIMBER — snow-capped mountain + summit flag (decoration).
    climber: {
      path: `M 48 224
             C 60 184 86 120 108 76
             Q 119 54 130 76
             C 152 120 178 184 190 224
             L 48 224 Z`,
      face: { cx: 120, cy: 154 },
      hi:   { cx: 94, cy: 154, rx: 13, ry: 9 },
    },
    // 4. SPARK — asymmetric live flame (inner core in decoration).
    spark: {
      path: `M 56 234 C 30 226, 18 198, 30 168 C 42 140, 50 122, 50 106
             C 50 86,  42 68,  36 54 C 50 62,  64 74,  72 92
             C 78 80,  86 62,  94 44 C 102 28, 114 14, 126 12
             C 132 24, 136 42, 140 60 C 144 72, 150 82, 158 90
             C 160 76, 174 60, 188 50 C 188 66, 182 84, 180 102
             C 182 124, 192 142, 202 160 C 214 184, 218 214, 196 230
             C 168 246, 82 246, 56 234 Z`,
      face: { cx: 124, cy: 188 },
      hi:   { cx: 78, cy: 170, rx: 13, ry: 8 },
    },
    // 5. MENTOR — bigger bubble + two tails + halo (decoration).
    mentor: {
      path: `M 68 64 Q 34 64 34 96 L 34 198 Q 34 230 68 230
             L 128 230 L 98 256 L 156 230 L 172 230 Q 206 230 206 198
             L 206 96 Q 206 64 172 64 Z`,
      face: { cx: 120, cy: 140 },
      hi:   { cx: 64, cy: 96, rx: 19, ry: 11 },
    },
    // 6. QUILL — paper sheet (fold + pen in decoration).
    quill: {
      path: `M 50 60 L 158 60 L 196 98 L 196 232 Q 196 246 182 246
             L 64 246 Q 50 246 50 232 Z`,
      face: { cx: 112, cy: 150 },
      hi:   { cx: 78, cy: 98, rx: 14, ry: 8 },
    },
    // 7. GRID — rounded diamond.
    grid: {
      path: `M 120 38 Q 134 38 144 48 L 202 106 Q 212 116 212 130
             Q 212 144 202 154 L 144 212 Q 134 222 120 222
             Q 106 222 96 212 L 38 154 Q 28 144 28 130
             Q 28 116 38 106 L 96 48 Q 106 38 120 38 Z`,
      face: { cx: 120, cy: 130 },
      hi:   { cx: 80, cy: 96, rx: 16, ry: 8 },
    },
    // 8. SPORTS — bouncing ball (seam + motion in decoration).
    sports: {
      path: `M 120 42 C 173 42 213 82 213 134 C 213 187 173 226 120 226 C 67 226 27 187 27 134 C 27 82 67 42 120 42 Z`,
      face: { cx: 120, cy: 132 },
      hi:   { cx: 80, cy: 96, rx: 18, ry: 10 },
    },
    // 9. CO-CURRICULAR — creative rounded star.
    cocurricular: {
      path: starPath(120, 132, 92, 41),
      round: 13,
      face: { cx: 120, cy: 142 },
      hi:   { cx: 96, cy: 112, rx: 14, ry: 8 },
    },
    // 10. LENS — slim capsule.
    lens: {
      path: `M 88 50 Q 56 50 56 84 L 56 200 Q 56 234 88 234
             L 152 234 Q 184 234 184 200 L 184 84 Q 184 50 152 50 Z`,
      face: { cx: 120, cy: 132 },
      hi:   { cx: 82, cy: 90, rx: 14, ry: 9 },
    },
    // 11. LEAF — asymmetric leaf (vein in decoration).
    leaf: {
      path: `M 48 220 C 40 130 92 50 198 40
             C 206 40 204 132 134 208
             C 104 234 60 232 48 220 Z`,
      face: { cx: 116, cy: 148 },
      hi:   { cx: 96, cy: 116, rx: 14, ry: 8 },
    },
  };

  // 5-point star, top point up.
  function starPath(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r;
      const x = (cx + rad * Math.cos(a)).toFixed(1);
      const y = (cy + rad * Math.sin(a)).toFixed(1);
      d += (i === 0 ? 'M ' : 'L ') + x + ' ' + y + ' ';
    }
    return d + 'Z';
  }

  // ============================================================
  // FACE
  // ============================================================
  function makeFace(cx, cy, expr) {
    return `
      ${makeCheeks(cx, cy)}
      <g class="ax-blink" style="transform-box:fill-box;transform-origin:center;">
        ${makeEyes(cx, cy, expr)}
      </g>
      ${makeMouth(cx, cy, expr)}
      ${makeExtras(cx, cy, expr)}
    `;
  }

  function makeEyes(cx, cy, expr) {
    const dx = 18, lx = cx - dx, rx = cx + dx, y = cy, r = 5;
    const I = FACE_INK, SHINE = (I === INK) ? CREAM : INK;
    switch (expr) {
      case 'happy':
        return `<path d="M ${lx-6} ${y+2} Q ${lx} ${y-6} ${lx+6} ${y+2}" stroke="${I}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
                <path d="M ${rx-6} ${y+2} Q ${rx} ${y-6} ${rx+6} ${y+2}" stroke="${I}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
      case 'celebrating':
        return starAt(lx, y, 7, I) + starAt(rx, y, 7, I);
      case 'focused':
        return `<line x1="${lx-6}" y1="${y}" x2="${lx+6}" y2="${y}" stroke="${I}" stroke-width="3.2" stroke-linecap="round"/>
                <line x1="${rx-6}" y1="${y}" x2="${rx+6}" y2="${y}" stroke="${I}" stroke-width="3.2" stroke-linecap="round"/>`;
      case 'excited':
        return `<circle cx="${lx}" cy="${y}" r="${r+1.5}" fill="${I}"/><circle cx="${lx+1.5}" cy="${y-1.5}" r="2" fill="${SHINE}"/>
                <circle cx="${rx}" cy="${y}" r="${r+1.5}" fill="${I}"/><circle cx="${rx+1.5}" cy="${y-1.5}" r="2" fill="${SHINE}"/>`;
      case 'confused':
        return `<circle cx="${lx}" cy="${y}" r="${r}" fill="${I}"/>
                <line x1="${rx-6}" y1="${y+1}" x2="${rx+6}" y2="${y-2}" stroke="${I}" stroke-width="3.2" stroke-linecap="round"/>`;
      case 'stressed':
        return `<circle cx="${lx}" cy="${y}" r="6" fill="none" stroke="${I}" stroke-width="2.6"/><circle cx="${lx}" cy="${y}" r="1.6" fill="${I}"/>
                <circle cx="${rx}" cy="${y}" r="6" fill="none" stroke="${I}" stroke-width="2.6"/><circle cx="${rx}" cy="${y}" r="1.6" fill="${I}"/>`;
      case 'guiding':
        return `<path d="M ${lx-6} ${y-6} Q ${lx} ${y-9} ${lx+6} ${y-6}" stroke="${I}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.65"/>
                <circle cx="${lx}" cy="${y}" r="${r}" fill="${I}"/><circle cx="${rx}" cy="${y}" r="${r}" fill="${I}"/>`;
      case 'thinking':
        return `<circle cx="${lx}" cy="${y}" r="${r}" fill="${I}"/><circle cx="${rx-2}" cy="${y}" r="${r-1}" fill="${I}"/>`;
      default:
        return `<circle cx="${lx}" cy="${y}" r="${r}" fill="${I}"/><circle cx="${rx}" cy="${y}" r="${r}" fill="${I}"/>`;
    }
  }

  function makeMouth(cx, cy, expr) {
    const my = cy + 20, I = FACE_INK;
    switch (expr) {
      case 'happy':       return `<path d="M ${cx-10} ${my-2} Q ${cx} ${my+8} ${cx+10} ${my-2}" stroke="${I}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
      case 'celebrating': return `<path d="M ${cx-12} ${my-2} Q ${cx} ${my+14} ${cx+12} ${my-2} Q ${cx} ${my+6} ${cx-12} ${my-2} Z" fill="${I}"/>`;
      case 'focused':     return `<line x1="${cx-7}" y1="${my+1}" x2="${cx+7}" y2="${my+1}" stroke="${I}" stroke-width="3" stroke-linecap="round"/>`;
      case 'excited':     return `<path d="M ${cx-11} ${my-2} Q ${cx} ${my+12} ${cx+11} ${my-2} Q ${cx} ${my+5} ${cx-11} ${my-2} Z" fill="${I}"/>`;
      case 'confused':    return `<path d="M ${cx-8} ${my+2} Q ${cx-2} ${my-3} ${cx+4} ${my+1} Q ${cx+8} ${my+4} ${cx+10} ${my+1}" stroke="${I}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
      case 'stressed':    return `<path d="M ${cx-10} ${my+1} q 3 -4 6 0 t 6 0 t 4 0" stroke="${I}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
      case 'guiding':     return `<path d="M ${cx-9} ${my-1} Q ${cx-2} ${my+7} ${cx+10} ${my-1}" stroke="${I}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
      case 'thinking':    return `<line x1="${cx-6}" y1="${my+1}" x2="${cx+2}" y2="${my+1}" stroke="${I}" stroke-width="2.8" stroke-linecap="round"/>`;
      default:            return `<path d="M ${cx-7} ${my} Q ${cx} ${my+6} ${cx+9} ${my-2}" stroke="${I}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    }
  }

  function makeCheeks(cx, cy) {
    const y = cy + 14;
    return `<ellipse cx="${cx-30}" cy="${y}" rx="9" ry="5" fill="${CHEEK}" opacity="0.78"/>
            <ellipse cx="${cx+30}" cy="${y}" rx="9" ry="5" fill="${CHEEK}" opacity="0.78"/>`;
  }

  // Animated accents live inside the face extras.
  function makeExtras(cx, cy, expr) {
    const I = FACE_INK;
    switch (expr) {
      case 'stressed':
        return `<path class="ax-sweat" style="transform-box:fill-box;transform-origin:center top;"
                  d="M ${cx+44} ${cy-8} q 4 8 0 12 q -4 -4 0 -12 Z" fill="#5BA7D6"/>`;
      case 'celebrating':
        return `
          <g class="ax-confetti" style="transform-box:fill-box;transform-origin:center;">
            <circle cx="${cx-52}" cy="${cy-32}" r="2.6" fill="${I}" opacity="0.7"/>
            <circle cx="${cx+54}" cy="${cy-26}" r="2.6" fill="${CHEEK}"/>
            <rect x="${cx-44}" y="${cy-46}" width="4.5" height="4.5" fill="${I}" opacity="0.6" transform="rotate(20 ${cx-42} ${cy-44})"/>
            <rect x="${cx+46}" y="${cy-48}" width="4.5" height="4.5" fill="${CHEEK}" transform="rotate(-20 ${cx+48} ${cy-46})"/>
            <path d="M ${cx} ${cy-54} l 1.6 0 l 0 -1.6 l 1.6 0 l 0 1.6 l 1.6 0 l 0 1.6 l -1.6 0 l 0 1.6 l -1.6 0 l 0 -1.6 l -1.6 0 z" fill="${I}" opacity="0.55"/>
          </g>`;
      case 'excited':
        return `
          <g class="ax-sparkle" style="transform-box:fill-box;transform-origin:center;">
            <path d="M ${cx-48} ${cy-26} l 2 0 l 0 -2 l 2 0 l 0 2 l 2 0 l 0 2 l -2 0 l 0 2 l -2 0 l 0 -2 l -2 0 z" fill="${I}" opacity="0.7"/>
            <path d="M ${cx+44} ${cy-22} l 1.6 0 l 0 -1.6 l 1.6 0 l 0 1.6 l 1.6 0 l 0 1.6 l -1.6 0 l 0 1.6 l -1.6 0 l 0 -1.6 l -1.6 0 z" fill="${I}" opacity="0.7"/>
          </g>`;
      case 'thinking':
        return `
          <g class="ax-think">
            <circle cx="${cx+48}" cy="${cy-18}" r="1.8" fill="${I}" opacity="0.5" style="--d:0s"/>
            <circle cx="${cx+55}" cy="${cy-24}" r="2.4" fill="${I}" opacity="0.65" style="--d:.25s"/>
            <circle cx="${cx+64}" cy="${cy-31}" r="3.2" fill="${I}" opacity="0.8" style="--d:.5s"/>
          </g>`;
      default: return '';
    }
  }

  function starAt(cx, cy, r, color) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.42;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${color}"/>`;
  }

  function highlight(s) {
    if (!s.hi) return '';
    return `<ellipse cx="${s.hi.cx}" cy="${s.hi.cy}" rx="${s.hi.rx}" ry="${s.hi.ry}" fill="${CREAM}" opacity="0.40"/>`;
  }

  // ============================================================
  // DECORATIONS — the per-mascot defining details
  // ============================================================
  function decoration(name, s, color, expr) {
    let out = '';

    if (name === 'sprout') {
      // soil mound
      out += `<path d="M 36 234 Q 120 200 204 234 L 204 252 Q 120 244 36 252 Z" fill="${SAGE_DEEP}" opacity="0.85"/>`;
      out += `<circle cx="62" cy="248" r="2.4" fill="${INK}" opacity="0.6"/><circle cx="190" cy="244" r="2.2" fill="${INK}" opacity="0.6"/><circle cx="148" cy="250" r="1.6" fill="${INK}" opacity="0.5"/>`;
      // stem
      out += `<path d="M 120 134 L 120 88" stroke="${SAGE_DEEP}" stroke-width="4" stroke-linecap="round"/>`;
      // two leaves (sway as a pair)
      out += `<g class="ax-leaves" style="transform-box:fill-box;transform-origin:center bottom;">
        <path d="M 120 88 C 108 80,88 70,64 70 C 56 76,56 86,64 92 C 76 100,100 102,120 96 Z" fill="${PALETTE.sage}"/>
        <path d="M 118 92 Q 96 92 76 84" stroke="${SAGE_DEEP}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/>
        <path d="M 120 88 C 132 80,152 70,176 70 C 184 76,184 86,176 92 C 164 100,140 102,120 96 Z" fill="${PALETTE.sage}"/>
        <path d="M 122 92 Q 144 92 164 84" stroke="${SAGE_DEEP}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/>
        <circle cx="120" cy="86" r="3" fill="${SAGE_DEEP}"/>
      </g>`;
    }

    if (name === 'climber') {
      // snow cap = the mountain's own outline, clipped to the top with a jagged snow line.
      // Guarantees the white edges sit exactly on the slopes and the tip covers the peak.
      const cid = 'snowclip-' + (++UID);
      out += `<clipPath id="${cid}"><path d="M 0 0 L 240 0 L 240 92 L 142 92 L 133 86 L 126 95 L 119 87 L 112 95 L 105 86 L 96 92 L 0 92 Z"/></clipPath>`;
      out += `<path d="${s.path}" fill="${CREAM}" opacity="0.96" clip-path="url(#${cid})"/>`;
    }

    if (name === 'spark') {
      out += `<g class="ax-flame" style="transform-box:fill-box;transform-origin:center bottom;">
        <path d="M 94 206 C 80 188,84 162,96 140 C 106 122,116 100,122 78
                 C 128 96,134 116,140 134 C 148 152,156 180,144 202 C 132 216,108 218,94 206 Z"
              fill="${CORAL_DEEP}" opacity="0.5"/>
      </g>`;
      if (expr === 'excited' || expr === 'celebrating') {
        out += `<g class="ax-ember">
          <circle cx="200" cy="64" r="3.6" fill="${PALETTE.coral}" opacity="0.9" style="--d:0s"/>
          <circle cx="214" cy="46" r="2.2" fill="${CORAL_DEEP}" opacity="0.75" style="--d:.4s"/>
          <circle cx="208" cy="24" r="1.4" fill="${CORAL_DEEP}" opacity="0.6" style="--d:.8s"/>
        </g>`;
      }
    }

    if (name === 'mentor') {
      // refined halo — soft glow ring + crisp arc, two end caps
      out += `<g class="ax-halo" style="transform-box:fill-box;transform-origin:center;">
        <path d="M 72 42 Q 120 8 168 42" stroke="${PALETTE.sand}" stroke-width="11" stroke-linecap="round" fill="none" opacity="0.28"/>
        <path d="M 74 44 Q 120 12 166 44" stroke="${PALETTE.sand}" stroke-width="5" stroke-linecap="round" fill="none"/>
        <circle cx="74" cy="44" r="3.4" fill="${SAND_DEEP}"/><circle cx="166" cy="44" r="3.4" fill="${SAND_DEEP}"/>
      </g>`;
    }

    if (name === 'quill') {
      // smaller corner fold
      out += `<path d="M 158 60 L 158 98 L 196 98 Z" fill="${PAPER_SHADE}"/>`;
      out += `<path d="M 158 60 L 196 98" stroke="#D7C0AC" stroke-width="1.8" fill="none"/>`;
      // ink marks under the nib
      out += `<ellipse cx="118" cy="208" rx="6" ry="2" fill="${PALETTE.rose}" opacity="0.5"/>`;
      out += `<ellipse cx="126" cy="214" rx="3" ry="1.4" fill="${PALETTE.rose}" opacity="0.4"/>`;
      // fountain pen across upper-right
      out += `<g transform="translate(216 24) rotate(125)">
        <path d="M 132 -8 Q 138 0, 132 8 L 124 8 L 124 -8 Z" fill="${ROSE_DEEP}"/>
        <rect x="78" y="-8" width="46" height="16" rx="2" fill="${ROSE_DEEP}"/>
        <rect x="86" y="-10.5" width="34" height="3" rx="1" fill="${GOLD}"/>
        <circle cx="115" cy="-9" r="2" fill="${GOLD}"/>
        <rect x="74" y="-9" width="6" height="18" fill="${GOLD}"/>
        <rect x="38" y="-8" width="38" height="16" rx="1.5" fill="${ROSE_DEEP}"/>
        <rect x="40" y="-6" width="34" height="2.5" fill="${CREAM}" opacity="0.25"/>
        <path d="M 38 -8 L 22 -5.5 L 22 5.5 L 38 8 Z" fill="${INK}"/>
        <path d="M 22 -5 L 4 -1 L 0 0 L 4 1 L 22 5 Z" fill="${GOLD}"/>
        <path d="M 18 0 L 2 0" stroke="${ROSE_DEEP}" stroke-width="0.8"/>
        <circle cx="16" cy="0" r="1.2" fill="${ROSE_DEEP}"/>
      </g>`;
    }

    if (name === 'sports') {
      // motion arc lines (left) — sense of speed
      out += `<g class="ax-motion">
        <path d="M 18 116 Q 4 134 18 152" stroke="${SAND_DEEP}" stroke-width="3.4" stroke-linecap="round" fill="none" opacity="0.55"/>
        <path d="M 6 122 Q -6 134 6 146" stroke="${SAND_DEEP}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity="0.35"/>
      </g>`;
      // ball seam — a single curved line reads "ball"
      out += `<path d="M 120 42 C 150 70 150 198 120 226" stroke="${SAND_DEEP}" stroke-width="2.6" fill="none" opacity="0.5"/>`;
      out += `<path d="M 50 86 C 96 110 144 110 190 86" stroke="${SAND_DEEP}" stroke-width="2.2" fill="none" opacity="0.32"/>`;
    }

    if (name === 'cocurricular') {
      // creative sparkles near the points
      out += `<g class="ax-twinkle">
        <path d="M 196 70 l 1.6 4 l 4 1.6 l -4 1.6 l -1.6 4 l -1.6 -4 l -4 -1.6 l 4 -1.6 z" fill="${TEAL_DEEP}" opacity="0.85" style="--d:0s"/>
        <path d="M 44 78 l 1.3 3.4 l 3.4 1.3 l -3.4 1.3 l -1.3 3.4 l -1.3 -3.4 l -3.4 -1.3 l 3.4 -1.3 z" fill="${TEAL_DEEP}" opacity="0.7" style="--d:.6s"/>
      </g>`;
    }

    if (name === 'leaf') {
      out += `<path d="M 196 42 L 96 200" stroke="${shade(color, -0.18)}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.7"/>`;
      out += `<line x1="200" y1="38" x2="210" y2="26" stroke="${shade(color, -0.28)}" stroke-width="3" stroke-linecap="round"/>`;
    }

    return out;
  }

  // ============================================================
  // COMPOSE
  // ============================================================
  function makeMascot(cfg) {
    const {
      shape = 'founder', color, expression = 'default',
      shadow = true, noFace = false, noHighlight = false, noDecoration = false,
    } = cfg;
    const s = SHAPES[shape];
    if (!s) return '';
    const col = color || PALETTE.rose;
    FACE_INK = isDark(col) ? CREAM : INK;

    const shadowEl = shadow ? `<ellipse cx="120" cy="256" rx="66" ry="6" fill="${INK}" opacity="0.1"/>` : '';
    const bodyStroke = s.round ? ` stroke="${col}" stroke-width="${s.round}" stroke-linejoin="round"` : '';
    const decor = noDecoration ? '' : decoration(shape, s, col, expression);
    const hi = noHighlight ? '' : highlight(s);
    const faceMarkup = noFace ? '' : makeFace(s.face.cx, s.face.cy, expression);

    return `<svg viewBox="0 0 240 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="UniPlug mascot ${shape}">
      ${shadowEl}
      <path d="${s.path}" fill="${col}"${bodyStroke}/>
      ${decor}
      ${hi}
      ${faceMarkup}
    </svg>`;
  }

  // Face-only tile for the expression library.
  function makeFaceTile(expr) {
    FACE_INK = INK;
    return `<svg viewBox="0 60 240 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="50" y="80" width="140" height="120" rx="36" fill="${PALETTE.rose}"/>
      <ellipse cx="80" cy="106" rx="14" ry="8" fill="${CREAM}" opacity="0.45"/>
      ${makeFace(120, 130, expr)}
    </svg>`;
  }

  // Idle motion class by shape (the "resting animation").
  function idleClass(shape) {
    return ({
      founder: 'm-float', sprout: 'm-sway', climber: '', spark: 'm-flicker',
      mentor: 'm-float', quill: 'm-float', grid: 'm-wobble', sports: 'm-bounce',
      cocurricular: 'm-twirl', lens: 'm-float', leaf: 'm-sway',
    })[shape] || 'm-float';
  }
  // Motion class driven by an active expression (overrides idle when set).
  function exprClass(expr) {
    return ({
      celebrating: 'm-jump', excited: 'm-bounce', stressed: 'm-shake',
    })[expr] || '';
  }

  window.UniPlugMascot = {
    make: makeMascot,
    face: makeFaceTile,
    idleClass, exprClass,
    PALETTE,
    SHAPES: Object.keys(SHAPES),
    EXPRESSIONS: ['default','happy','thinking','confused','focused','guiding','celebrating','excited','stressed'],
  };
})();
