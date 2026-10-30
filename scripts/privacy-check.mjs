import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export function isPublicCommitEmail(email) {
  return email.endsWith('@users.noreply.github.com') || email === 'noreply@github.com';
}
export async function checkPrivacy() {
  // This is an explicitly fictional public starter, never a user's exported configuration.
  assert.deepEqual(
    [DEFAULTS.birthYear, DEFAULTS.initialVti, DEFAULTS.initialSchd, DEFAULTS.initialCash, DEFAULTS.deployCash, DEFAULTS.annualSaving, DEFAULTS.monthlyBudget],
    [1990, 0, 0, 0, 0, 1200, 200],
    'Public starter data must remain fictional. Review privacy before changing defaults.',
  );
  assert.equal(DEFAULTS.severanceAmount, 0);
  assert.deepEqual(DEFAULTS.budgetItems, []);
  assert.ok(DEFAULTS.extraAssets.every(value => value === 0));
  const problems = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'test-results', 'coverage', 'work', '.DS_Store'].includes(entry.name)) continue;
      const full = path.join(directory, entry.name), relative = path.relative(root, full);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile()) continue;
      const text = await readFile(full, 'utf8');
      if (/\.(?:personal|local)\.json$/.test(relative) || /(?:^|\/)exports\//.test(relative)) problems.push(`${relative}: private export`);
      const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
      if (emails.some(email => !isPublicCommitEmail(email) && !/@(?:example\.com|example\.test)$/.test(email))) problems.push(`${relative}: personal email`);
      if (/\/(?:Users|home)\/[^/\s'"<>]+\//.test(text)) problems.push(`${relative}: personal filesystem path`);
      if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(text)) problems.push(`${relative}: credential-like content`);
    }
  }
  await walk(root);
  let isGit = false;
  try { isGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true'; } catch {}
  if (isGit) {
    const emails = execFileSync('git', ['log', '--format=%ae%n%ce', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
    if (emails.some(email => !isPublicCommitEmail(email))) problems.push('Git history: use noreply author and committer emails');
  }
  if (problems.length) throw new Error('Privacy review failed (values intentionally omitted):\n' + problems.join('\n'));
  console.log('Privacy check passed: fictional starter, source/build scan, and available HEAD history. Manual review remains required.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkPrivacy();
