// Regenerates THIRD_PARTY.md from the installed runtime dependencies.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const root = join(import.meta.dirname, '..');
const dirs = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
  cwd: root,
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .slice(1);

const rows = new Map();
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license =
    typeof pkg.license === 'string'
      ? pkg.license
      : (pkg.license?.type ?? JSON.stringify(pkg.licenses ?? '?'));
  rows.set(`${pkg.name}@${pkg.version}`, [pkg.name, pkg.version, license]);
}

const table = [...rows.values()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, version, license]) => `| ${name} | ${version} | ${license} |`)
  .join('\n');

// Keep the prose above the table; replace the table.
const current = readFileSync(join(root, 'THIRD_PARTY.md'), 'utf8');
const head = current.slice(0, current.search(/^\| Package/m));
writeFileSync(
  join(root, 'THIRD_PARTY.md'),
  `${head}| Package | Version | License |\n|---|---|---|\n${table}\n`,
);
