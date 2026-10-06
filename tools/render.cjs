#!/usr/bin/env node
/*
 * Offline renderer: drives index.html?render in headless Chromium and pipes
 * PNG frames straight into ffmpeg (no intermediate files).
 *
 *   node tools/render.cjs                         # full reel → dist/showreel.mp4
 *   node tools/render.cjs --stills 0.5,2.9,...    # PNG stills → dist/stills/
 *
 * Options: --samples N (motion-blur sub-frames, default 8)  --workers N (default 4)
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SAMPLES = +arg('--samples', 8);
const WORKERS = +arg('--workers', 4);
const STILLS = arg('--stills', null);
const OUT = arg('--out', path.join(ROOT, 'dist/showreel.mp4'));
const AUDIO = arg('--audio', path.join(ROOT, 'dist/soundtrack.wav'));

async function openPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?render');
  await page.evaluate(() => window.READY);
  return page;
}

async function grab(page, t, samples) {
  await page.evaluate(([t, s]) => REEL.drawFrame(t, s), [t, samples]);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

(async () => {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  if (STILLS) {
    const page = await openPage(browser);
    const dir = path.join(ROOT, 'dist/stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of STILLS.split(',')) {
      const t = +s;
      fs.writeFileSync(path.join(dir, `t${t.toFixed(3)}.png`), await grab(page, t, SAMPLES));
      console.log('still', t);
    }
    await browser.close();
    return;
  }

  const fps = 60, total = 900;
  const pages = await Promise.all(Array.from({ length: WORKERS }, () => openPage(browser)));
  const hasAudio = fs.existsSync(AUDIO);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...(hasAudio ? ['-i', AUDIO] : []),
    '-vf', 'format=yuv420p,noise=c0s=6:c0f=t+u',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
    '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const started = Date.now();
  for (let f = 0; f < total; f += WORKERS) {
    const batch = await Promise.all(pages.map((p, w) => (f + w < total ? grab(p, (f + w) / fps, SAMPLES) : null)));
    for (const buf of batch) if (buf && !ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f / WORKERS) % 25 === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`frame ${f + WORKERS}/${total}  ${el.toFixed(0)}s  eta ${((el / (f + WORKERS)) * (total - f - WORKERS)).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log('wrote', OUT, `${((Date.now() - started) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
