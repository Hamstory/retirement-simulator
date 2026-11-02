import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, monthlyMarketPath, stressRandom, simulateMonthly, stressConfig, newFund, fundKeys } from '../src/engine.js';

test('LNG-001 1000개 동일 월별 경로에서 세 전략을 60년간 검증한다', { timeout: 60000 }, () => {
  const c = { ...structuredClone(DEFAULTS), horizon: 60, initialQqq:1200,qqqAllocations:Array(90).fill(10),initialAor:1200,initialAoa:1800,allocations:Array(90).fill(20),aorAllocations:Array(90).fill(20),aoaAllocations:Array(90).fill(20),severanceAmount: 2400, severanceTiming: 'year', severanceYear: 2060 }, random = stressRandom(42);
  c.customFunds=[{...newFund('fund_long_a','가상 장기 종목 A'),initial:400,yield:4,allocations:Array(90).fill(10)},{...newFund('fund_long_b','가상 장기 종목 B'),initial:600,yield:3,tax:0,allocations:Array(90).fill(10)}];
  for (let i = 0; i < 1000; i++) {
    c.stressReturnMode=i%2?'free':'anchored';c.stressWithdrawalCap=i%3===0;c.finalSavingSafeOnly=i%2===0;
    c.severanceAllocation=i%2?'custom':'annual';c.severanceSafePct=50;c.severanceVtiPct=10;c.severanceAorPct=15;c.severanceAoaPct=10;c.severanceQqqPct=5;c.customFunds[0].severancePct=5;c.customFunds[1].severancePct=5;
    const path = monthlyMarketPath(c, random);
    for (const policy of ['none', 'annual', 'conditional']) {
      const rows = simulateMonthly(stressConfig(c), path, policy);
      assert.equal(rows.length, 71);
      for (const r of rows) {
        assert.ok(Math.abs(r.total-fundKeys(c).reduce((sum,k)=>sum+r[k],r.cash))<1e-7*Math.max(1,r.total));
        assert.ok(Math.abs(r.netDividend-fundKeys(c).reduce((sum,k)=>sum+r[k+'NetDividend'],0))<1e-7*Math.max(1,r.netDividend));
        if (!r.working && r.elapsed>c.retireYears) {
          assert.ok(r.cash <= r.cashTarget + 1e-7);
          if (c.stressWithdrawalCap) assert.ok(r.income <= r.spendingCap + 1e-7);
          assert.ok(r.realWorkNeeded >= 0 && r.monthsNeedingWork >= 0 && r.monthsNeedingWork <= 12);
        }
        for (const key of ['total', ...fundKeys(c), ...fundKeys(c).map(k=>k+'NetDividend'), 'cash', 'income', 'unfunded']) {
          assert.ok(Number.isFinite(r[key]) && r[key] >= 0, `${policy} ${r.year} ${key}`);
        }
      }
    }
  }
});
