import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './build.mjs';

const planPath = path.join(root, 'docs/test-cases.json');
export function renderPlan(cases) {
  let text = '# 테스트 케이스\n\n';
  text += '`docs/test-cases.json`이 기준이며 `npm run test:plan`으로 이 문서를 생성합니다. '; 
  text += '정의된 케이스와 실행 완료 여부는 별개입니다. 자동 케이스는 CI 실행 결과로 확인하고, 수동 케이스는 릴리스 체크리스트에 별도로 기록합니다.\n\n';
  text += '| ID | 구분 | 우선순위 | 검증 내용 |\n| --- | --- | --- | --- |\n';
  for (const c of cases) text += `| ${c.id} | ${c.mode === 'manual' ? '수동 · 미실행' : c.mode === 'long' ? '별도 장기 검증' : '자동'} | ${c.priority} | [${c.title}](#${c.id.toLowerCase()}) |\n`;
  for (const c of cases) {
    text += `\n<a id="${c.id.toLowerCase()}"></a>\n\n## ${c.id} ${c.title}\n\n`;
    text += `- 전제: ${c.precondition}\n- 실행: ${c.steps}\n- 기대 결과: ${c.expected}\n`;
    if (c.file) text += `- 검증 코드: [${c.file}](../${c.file})\n`;
    if (c.mode === 'manual') text += '- 상태: 미실행. 실제 브라우저에서 확인하고 릴리스 기록에 결과를 남깁니다.\n';
  }
  return text;
}
export async function verifyPlan() {
  const cases = JSON.parse(await readFile(planPath, 'utf8')), ids = new Set();
  for (const c of cases) {
    for (const key of ['id', 'title', 'priority', 'mode', 'precondition', 'steps', 'expected']) if (!c[key]) throw new Error(`TC 필드 누락: ${c.id} ${key}`);
    if (ids.has(c.id)) throw new Error(`중복 TC: ${c.id}`);
    ids.add(c.id);
    if (!['auto', 'manual', 'long'].includes(c.mode)) throw new Error(`TC 실행 방식: ${c.id}`);
    if (c.mode !== 'manual') {
      const source = await readFile(path.join(root, c.file), 'utf8');
      if (!source.includes(c.id)) throw new Error(`TC 코드 연결 누락: ${c.id}`);
    }
  }
  for (const file of ['tests/unit/finance.test.mjs', 'tests/structure.test.mjs', 'tests/regression.test.mjs', 'tests/long-run.test.mjs']) {
    const source = await readFile(path.join(root, file), 'utf8');
    for (const [id] of source.matchAll(/\b(?:TC|REG|STR|LNG)-\d{3}\b/g)) {
      if (!ids.has(id)) throw new Error(`정의되지 않은 TC ID: ${file} ${id}`);
    }
  }
  const documented = await readFile(path.join(root, 'docs/TEST_CASES.md'), 'utf8');
  if (documented !== renderPlan(cases)) throw new Error('TC 문서가 오래되었습니다. npm run test:plan을 실행하세요.');
  console.log(`Test plan verified: ${cases.filter(c => c.mode === 'auto').length} automated, ${cases.filter(c => c.mode === 'long').length} long-run, ${cases.filter(c => c.mode === 'manual').length} manual.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cases = JSON.parse(await readFile(planPath, 'utf8'));
  await writeFile(path.join(root, 'docs/TEST_CASES.md'), renderPlan(cases));
  await verifyPlan();
}
