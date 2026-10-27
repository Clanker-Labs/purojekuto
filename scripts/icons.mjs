/**
 * Render the app icons from the mark (src/components/brand.tsx geometry).
 *   npm run icons
 * iOS ignores SVG and transparency for home-screen icons, so the PNGs are
 * full-bleed squares; the maskable one keeps the mark inside the 80% safe zone.
 */
import fs from "node:fs";
import sharp from "sharp";

const mark = (pad = 0, rounded = true) => {
  const s = 64 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="${-pad} ${-pad} ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="${-pad}" x2="0" y2="${64 + pad}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1b2430"/><stop offset="1" stop-color="#0f1419"/></linearGradient></defs>
  <rect x="${-pad}" y="${-pad}" width="${s}" height="${s}" ${rounded ? 'rx="15"' : ""} fill="url(#g)"/>
  <rect x="12" y="14" width="11" height="36" rx="4" fill="none" stroke="#e8edf2" stroke-width="3.2"/>
  <rect x="26.5" y="14" width="11" height="25" rx="4" fill="none" stroke="#e8edf2" stroke-width="3.2"/>
  <rect x="41" y="14" width="11" height="15" rx="4" fill="#00d4aa"/>
  <circle cx="46.5" cy="44.5" r="4.6" fill="#00d4aa"/>
</svg>`;
};

fs.writeFileSync("public/icon.svg", mark(0, true));
const square = Buffer.from(mark(0, false));
const maskable = Buffer.from(mark(10, false));
await sharp(square, { density: 1200 }).resize(180, 180).png().toFile("public/apple-touch-icon.png");
await sharp(square, { density: 1200 }).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(square, { density: 1200 }).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(maskable, { density: 1200 }).resize(512, 512).png().toFile("public/icon-maskable-512.png");
await sharp(square, { density: 1200 }).resize(32, 32).png().toFile("src/app/favicon.png");
console.log("icons written");
