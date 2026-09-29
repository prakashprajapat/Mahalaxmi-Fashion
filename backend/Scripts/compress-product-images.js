#!/usr/bin/env node
/*
 * Shrink the photos already on the server.
 *
 * Uploads are compressed in the browser from now on, but everything uploaded
 * before that is still sitting at whatever size the phone wrote it — several MB
 * each in places. next/image resizes them on the way out, so a shopper is not
 * downloading the whole file; what the big originals cost is disk, backup size,
 * and a slow first request for every size that has not been generated yet.
 *
 * Run it on the VPS:
 *   cd /var/www/mahalaxmi-nextjs/frontend
 *   node ../backend/Scripts/compress-product-images.js            # report only
 *   node ../backend/Scripts/compress-product-images.js --write    # do it
 *
 * What it does NOT touch:
 *   • the hero photos — read live from the site's own settings, by filename, so
 *     whichever six are set today are skipped;
 *   • anything that is not a photo, and GIFs, whose animation a re-encode loses;
 *   • a file that is already small, or one the new version would not shrink.
 *
 * The filename never changes. Every product row, every order already placed and
 * every row in the Google feed points at these names; a "cleaner" name would
 * quietly empty all of them.
 *
 * Originals are copied to product-images-backup-<date>/ before anything is
 * written. Delete that folder once the site looks right — not before.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(process.cwd(), 'public/product-images');
const WRITE = process.argv.includes('--write');
const MAX_EDGE = 1600;
const QUALITY = 82;
const SKIP_BELOW = 220 * 1024;

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not found. Run this from the frontend folder:\n  cd /var/www/mahalaxmi-nextjs/frontend');
  process.exit(1);
}

const bytes = n => (n / 1024 / 1024).toFixed(2) + ' MB';

async function heroFilenames() {
  // Asked of the running site rather than guessed, so the six that are set
  // today are the six that are spared.
  try {
    const res = await fetch('http://localhost:5000/api/settings');
    const { settings = {} } = await res.json();
    const keys = [...Array(6)].map((_, i) => `heroImg${i + 1}`).concat('seoOgImage', 'heroVideoUrl');
    return new Set(keys
      .map(k => (settings[k] || '').trim())
      .filter(Boolean)
      .map(v => path.basename(v.split('?')[0])));
  } catch {
    console.error('Could not read the site settings, so the hero photos cannot be identified.');
    console.error('Start the API first, or this would compress them along with the rest.');
    process.exit(1);
  }
}

(async () => {
  if (!fs.existsSync(DIR)) { console.error('No such folder: ' + DIR); process.exit(1); }

  const spare = await heroFilenames();
  console.log(`Sparing ${spare.size} hero/OG file(s): ${[...spare].join(', ') || '(none set)'}\n`);

  const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  let before = 0, after = 0, changed = 0, skipped = 0;

  let backupDir = null;
  if (WRITE) {
    backupDir = path.resolve(DIR, '..', `product-images-backup-${new Date().toISOString().slice(0, 10)}`);
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Originals are being copied to ${backupDir}\n`);
  }

  for (const name of files) {
    const full = path.join(DIR, name);
    const size = fs.statSync(full).size;

    if (spare.has(name)) { skipped++; continue; }
    if (size <= SKIP_BELOW) { skipped++; continue; }

    let out;
    try {
      const img = sharp(full, { failOn: 'none' });
      const meta = await img.metadata();
      const longest = Math.max(meta.width || 0, meta.height || 0);
      out = await img
        .resize({ width: longest > MAX_EDGE ? MAX_EDGE : undefined, withoutEnlargement: true })
        .rotate()                       // honour the phone's orientation before it is stripped
        .webp({ quality: QUALITY })
        .toBuffer();
    } catch (e) {
      console.log(`  ! ${name} — could not be read (${e.message}); left alone`);
      skipped++;
      continue;
    }

    if (out.length >= size) { skipped++; continue; }

    before += size; after += out.length; changed++;
    console.log(`  ${name}  ${bytes(size)} → ${bytes(out.length)}`);

    if (WRITE) {
      fs.copyFileSync(full, path.join(backupDir, name));
      // Same name, always. Everything that points at this photo points by name.
      fs.writeFileSync(full, out);
    }
  }

  console.log(`\n${changed} file(s) ${WRITE ? 'rewritten' : 'would shrink'}, ${skipped} left alone.`);
  console.log(`${bytes(before)} → ${bytes(after)}  (saves ${bytes(before - after)})`);
  if (!WRITE) console.log('\nNothing was changed. Add --write to do it.');
  else console.log(`\nOriginals kept in ${backupDir} — delete that folder only once the site looks right.`);
})();
