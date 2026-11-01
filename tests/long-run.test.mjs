import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, monthlyMarketPath, stressRandom, simulateMonthly, stressConfig } from '../src/engine.js';

test('LNG-001 1000개 동일 월별 경로에서 세 전략을 60년간 검증한다', { timeout: 60000 }, () => {
  const c = { ...structuredClone(DEFAULTS), horizon: 60, initialAor:1200,initialAoa:1800,allocations:Array(90).fill(40),aorAllocations:Array(90).fill(20),aoaAllocations:Array(90).fill(20),severanceAmount: 2400, severanceTiming: 'year', severanceYear: 2060 }, random = stressRandom(42);
  for (let i = 0; i < 1000; i++) {
    c.stressReturnMode=i%2?'free':'anchored';c.stressWithdrawalCap=i%3===0;c.finalSavingSafeOnly=i%2===0;
    c.severanceAllocation=i%2?'custom':'annual';c.severanceSafePct=50;c.severanceVtiPct=10;c.severanceAorPct=15;c.severanceAoaPct=15;
    const path = monthlyMarketPath(c, random);
    for (const policy of ['none', 'annual', 'conditional']) {
      const rows = simulateMonthly(stressConfig(c), path, policy);
      assert.equal(rows.length, 71);
      for (const r of rows) {
        assert.ok(Math.abs(r.total-r.vti-r.schd-r.aor-r.aoa-r.cash)<1e-7*Math.max(1,r.total));
        if (!r.working && r.elapsed>c.retireYears) {
          assert.ok(r.cash <= r.cashTarget + 1e-7);
          if (c.stressWithdrawalCap) assert.ok(r.income <= r.spendingCap + 1e-7);
          assert.ok(r.realWorkNeeded >= 0 && r.monthsNeedingWork >= 0 && r.monthsNeedingWork <= 12);
        }
        for (const key of ['total', 'vti', 'schd', 'aor', 'aoa', 'cash', 'income', 'unfunded']) {
          assert.ok(Number.isFinite(r[key]) && r[key] >= 0, `${policy} ${r.year} ${key}`);
        }
      }
    }
  }
});
