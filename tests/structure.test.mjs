import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULTS, simulate } from '../src/engine.js';
import { checkPrivacy } from '../scripts/privacy-check.mjs';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style>[\s\S]*?<\/style>/gi, '');
test('STR-001 모듈 엔진과 빌드된 HTML 엔진의 기본 계산이 같다', () => {
  const source = html.match(/<script id="calculation-engine">([\s\S]*?)<\/script>/)[1];
  const context = { structuredClone }; vm.createContext(context);
  vm.runInContext(source + ';globalThis.result=simulate(DEFAULTS);', context);
  assert.equal(JSON.stringify(context.result), JSON.stringify(simulate(DEFAULTS)));
  new vm.Script(html.match(/<script id="interface">([\s\S]*?)<\/script>/)[1]);
});
test('STR-002 DOM ID는 유일하고 모든 label과 기본 필드의 대상이 존재한다', () => {
  const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of body.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(id), id);
  for (const key of Object.keys(DEFAULTS).filter(k => !['allocations', 'safeAllocations', 'budgetItems', 'extraAssets'].includes(k))) assert.ok(ids.includes(key), key);
});
test('STR-003 HTML은 외부 런타임 없이 완성된 한 파일이다', () => {
  assert.ok(!/<!-- (STYLES|ENGINE|APP) -->/.test(html));
  assert.ok(!/<script\b[^>]*\bsrc\s*=/.test(html));
  assert.ok(!/<link[^>]+rel=["']stylesheet/.test(body));
  assert.ok(html.includes('<script id="interface">'));
});
test('STR-004 정적 HTML 요소의 열림·닫힘 구조가 맞는다', () => {
  const stack = [], voids = new Set(['meta', 'input', 'br', 'hr', 'link', 'img', 'source', 'area', 'base', 'embed', 'param', 'track', 'wbr']);
  for (const m of body.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][\w-]*)(?:\s[^<>]*?)?\s*\/?>/gi)) {
    const tag = m[2].toLowerCase();
    if (voids.has(tag)) continue;
    if (m[1]) assert.equal(stack.pop(), tag); else stack.push(tag);
  }
  assert.deepEqual(stack, []);
});
test('STR-005 커밋한 Pages HTML은 현재 소스 빌드와 일치한다', () => {
  assert.equal(fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8'), html);
  assert.ok(fs.existsSync(new URL('../docs/.nojekyll', import.meta.url)));
});
test('STR-006 공개 기본값·소스·빌드·사용 가능한 커밋 이력이 개인정보 검사를 통과한다', async () => {
  await checkPrivacy();
});
