// Builds the public copy (sub-folder base path, "concept" label, not indexed by search engines)
// and publishes it to the gh-pages branch, which GitHub Pages serves.
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = import.meta.dirname;
const OUT = path.join(os.tmpdir(), 'kingsdown-pages');
const BASE = '/kingsdown-school';
const git = (args, cwd = OUT) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

execFileSync(process.execPath, ['build.mjs'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, OUT, BASE, PUBLIC: '1' } });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const remote = git(['remote', 'get-url', 'origin'], ROOT);
const name = git(['config', 'user.name'], ROOT);
const email = git(['config', 'user.email'], ROOT);
const source = git(['rev-parse', '--short', 'HEAD'], ROOT);

git(['init', '-q']);
git(['config', 'core.longpaths', 'true']);
git(['config', 'core.autocrlf', 'false']);
git(['config', 'user.name', name]);
git(['config', 'user.email', email]);
git(['checkout', '-q', '-B', 'gh-pages']);
git(['add', '-A']);
git(['commit', '-q', '-m', `Publish preview from ${source}`]);
// gh-pages only ever holds the latest build, so it is replaced on each deploy
git(['push', '-q', '-f', remote, 'gh-pages']);
console.log(`Published ${source} to gh-pages: https://wipeduhr.github.io${BASE}/`);
