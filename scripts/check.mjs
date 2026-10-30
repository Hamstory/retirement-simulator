import { spawnSync } from 'node:child_process';
import { build, root } from './build.mjs';
import { verifyPlan } from './test-plan.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkPrivacy } from './privacy-check.mjs';

const html = await build({ write: false });
if (await readFile(path.join(root, 'dist/index.html'), 'utf8') !== html) {
  throw new Error('Pages build is stale. Run npm run build and commit dist/index.html.');
}
await checkPrivacy();
await verifyPlan();
const result = spawnSync(process.execPath, ['--test',
  'tests/unit/finance.test.mjs', 'tests/structure.test.mjs', 'tests/regression.test.mjs',
], { cwd: root, stdio: 'inherit', timeout: 120000 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
