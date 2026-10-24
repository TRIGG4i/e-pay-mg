// Rend un SVG en PNG avec Chromium (playwright-core du dépôt).
// usage : node brand/render.mjs <svg> <png> <largeur> [fond]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const [src, out, width, bg = 'transparent'] = process.argv.slice(2);
const svg = readFileSync(src, 'utf8');
const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
const w = Number(width), h = Math.round(w * Number(vb[2]) / Number(vb[1]));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:${bg}">${svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`)}</body></html>`);
await page.screenshot({ path: out, omitBackground: bg === 'transparent', clip: { x: 0, y: 0, width: w, height: h } });
await browser.close();
