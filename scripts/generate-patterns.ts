import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

const OUT = path.join(__dirname, '../assets/patterns');
fs.mkdirSync(OUT, { recursive: true });

const W = 1080, H = 1080;

function vignette() {
  return `<defs>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#vg)"/>`;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

const linesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#08080d"/>
  <defs>
    <pattern id="p" patternUnits="userSpaceOnUse" width="22" height="22" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="22" stroke="white" stroke-opacity="0.15" stroke-width="1.5"/>
    </pattern>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#p)"/>
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;

const crosshatchSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#080808"/>
  <defs>
    <pattern id="p1" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="20" stroke="white" stroke-opacity="0.10" stroke-width="1"/>
    </pattern>
    <pattern id="p2" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(-45)">
      <line x1="0" y1="0" x2="0" y2="20" stroke="white" stroke-opacity="0.10" stroke-width="1"/>
    </pattern>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#p1)"/>
  <rect width="${W}" height="${H}" fill="url(#p2)"/>
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;

const dotsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#09101a"/>
  <defs>
    <pattern id="p" patternUnits="userSpaceOnUse" width="28" height="28">
      <circle cx="14" cy="14" r="3" fill="white" fill-opacity="0.18"/>
    </pattern>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.65"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#p)"/>
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;

function buildWavesSvg(): string {
  const wavelength = 90, amplitude = 20, spacing = 38;
  const paths: string[] = [];
  for (let y = spacing / 2; y <= H + spacing; y += spacing) {
    let d = `M${-wavelength},${y}`;
    for (let x = -wavelength; x <= W + wavelength; x += wavelength) {
      d += ` C${x + wavelength * 0.25},${y - amplitude} ${x + wavelength * 0.75},${y + amplitude} ${x + wavelength},${y}`;
    }
    const op = (0.08 + (y / H) * 0.08).toFixed(2);
    paths.push(`<path d="${d}" stroke="white" stroke-opacity="${op}" stroke-width="1.5" fill="none"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#080e0e"/>
  <defs>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  ${paths.join('\n  ')}
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;
}

function buildStarsSvg(): string {
  const rand = rng(42);
  const stars: string[] = [];
  const cols = 11, rows = 11;
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.15 + rand() * 0.7) * cw;
      const cy = (r + 0.15 + rand() * 0.7) * ch;
      const size = 4 + rand() * 12;
      const op = (0.07 + rand() * 0.22).toFixed(2);
      const inner = size * 0.38;
      const pts: string[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const radius = i % 2 === 0 ? size : inner;
        pts.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
      }
      stars.push(`<polygon points="${pts.join(' ')}" fill="white" fill-opacity="${op}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#050510"/>
  <defs>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  ${stars.join('\n  ')}
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;
}

function buildGrainSvg(): string {
  const rand = rng(777);
  const els: string[] = [];
  for (let i = 0; i < 14000; i++) {
    const x = (rand() * W).toFixed(1);
    const y = (rand() * H).toFixed(1);
    const s = (0.4 + rand() * 2.2).toFixed(1);
    const op = (0.02 + rand() * 0.16).toFixed(2);
    els.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="white" fill-opacity="${op}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#090909"/>
  <defs>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.65"/>
    </radialGradient>
  </defs>
  ${els.join('')}
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;
}

function buildScratchedSvg(): string {
  const rand = rng(321);
  const lines: string[] = [];
  for (let i = 0; i < 400; i++) {
    const x = (rand() * W).toFixed(1);
    const w2 = (0.3 + rand() * 1.8).toFixed(1);
    const op = (0.04 + rand() * 0.20).toFixed(2);
    const y1 = (rand() * H * 0.4).toFixed(1);
    const y2 = (H * 0.6 + rand() * H * 0.4).toFixed(1);
    lines.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="white" stroke-opacity="${op}" stroke-width="${w2}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#08080c"/>
  <defs>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  ${lines.join('\n  ')}
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;
}

const meshSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0e0a14"/>
  <defs>
    <pattern id="grid" patternUnits="userSpaceOnUse" width="34" height="34" patternTransform="rotate(45)">
      <rect width="34" height="34" fill="none" stroke="white" stroke-opacity="0.10" stroke-width="1"/>
    </pattern>
    <radialGradient id="vg" cx="50%" cy="50%" r="72%">
      <stop offset="15%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.68"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>`;

const patterns: Array<{ id: string; svg: string }> = [
  { id: 'lines',      svg: linesSvg },
  { id: 'crosshatch', svg: crosshatchSvg },
  { id: 'dots',       svg: dotsSvg },
  { id: 'waves',      svg: buildWavesSvg() },
  { id: 'stars',      svg: buildStarsSvg() },
  { id: 'grain',      svg: buildGrainSvg() },
  { id: 'scratched',  svg: buildScratchedSvg() },
  { id: 'mesh',       svg: meshSvg },
];

async function main() {
  for (const { id, svg } of patterns) {
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, `${id}.png`));
    console.log(`✓ ${id}.png`);
  }
  console.log(`Done — ${patterns.length} patterns written to ${OUT}`);
}

main().catch(console.error);
