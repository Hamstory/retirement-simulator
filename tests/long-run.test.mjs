import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, monthlyMarketPath, stressRandom, simulateMonthly, stressConfig } from '../src/engine.js';

test('LNG-001 1000개 동일 월별 경로에서 세 전략을 60년간 검증한다', { timeout: 60000 }, () => {
  const c = { ...structuredClone(DEFAULTS), horizon: 60, severanceAmount: 2400, severanceTiming: 'year', severanceYear: 2060 }, random = stressRandom(42);
  for (let i = 0; i < 1000; i++) {
    c.stressReturnMode=i%2?'free':'anchored';c.stressWithdrawalCap=i%3===0;
    const path = monthlyMarketPath(c, random);
    for (const policy of ['none', 'annual', 'conditional']) {
      const rows = simulateMonthly(stressConfig(c), path, policy);
      assert.equal(rows.length, 71);
      for (const r of rows) {
        if (!r.working && r.elapsed>c.retireYears) {
          assert.ok(r.cash <= r.cashTarget + 1e-7);
          if (c.stressWithdrawalCap) assert.ok(r.income <= r.spendingCap + 1e-7);
          assert.ok(r.realWorkNeeded >= 0 && r.monthsNeedingWork >= 0 && r.monthsNeedingWork <= 12);
        }
        for (const key of ['total', 'vti', 'schd', 'cash', 'income', 'unfunded']) {
          assert.ok(Number.isFinite(r[key]) && r[key] >= 0, `${policy} ${r.year} ${key}`);
        }
      }
    }
  }
});
