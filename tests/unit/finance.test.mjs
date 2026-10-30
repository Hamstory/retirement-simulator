import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, simulate, simulateMonthly, normalizeConfig, validateConfig, contributionFor,
  monthlyBudgetTotal, stressRandom, monthlyMarketPath, stressPathSummary, near,
} from '../helpers/engine.mjs';

const base = () => structuredClone(DEFAULTS);
const fixture = () => ({ ...base(), initialVti: 1000, initialSchd: 0, initialCash: 100,
  deployCash: 0, retireYears: 0, horizon: 3, annualSaving: 0,
  vtiPriceGrowth: 0, schdPriceGrowth: 0, vtiYield: 0, schdYield: 0,
  vtiDividendGrowth: 0, schdDividendGrowth: 0, cashYield: 0,
  inflation: 0, monthlyBudget: 10, withdrawMode: 'budget' });

test('TC-001 초기 현금 이동은 총자산을 늘리지 않는다', () => {
  const c = base(), r = simulate(c)[0];
  near(r.total, c.initialVti + c.initialSchd + c.initialCash);
  near(r.cash, c.initialCash - c.deployCash);
});
test('TC-002 저축 종료 다음 해부터 인출한다', () => {
  const c = base(), rows = simulate(c);
  assert.equal(rows[c.retireYears].working, true);
  assert.equal(rows[c.retireYears + 1].working, false);
});
test('TC-003 저축액의 정률·정액 증가를 구분한다', () => {
  near(contributionFor({ ...base(), annualSaving: 5000, savingGrowth: 5 }, 2), 5512.5);
  near(contributionFor({ ...base(), annualSaving: 5000, savingGrowthMode: 'fixed', savingGrowth: 100 }, 2), 5200);
});
test('TC-004 안전자산과 주식 내 비중으로 신규 자금을 나눈다', () => {
  const c = { ...fixture(), retireYears: 1, annualSaving: 5000 };
  c.safeAllocations[0] = 40;
  const r = simulate(c)[1];
  near(r.safeContribution, 2000); near(r.vtiContribution, 2400); near(r.schdContribution, 600);
});
test('TC-005 연도별 안전자산 공란은 기본 비중을 따른다', () => {
  const c = { ...fixture(), retireYears: 2, annualSaving: 1000, safeSavingPct: 20 };
  c.safeAllocations[1] = 100;
  const rows = simulate(c);
  near(rows[1].safeContribution, 200); near(rows[2].safeContribution, 1000);
  near(rows[2].vtiContribution + rows[2].schdContribution, 0);
});
test('TC-006 VTI 우선 매도 후 SCHD로 부족분을 충당한다', () => {
  const c = { ...fixture(), initialVti: 100, initialSchd: 200, initialCash: 50,
    withdrawMode: 'extra', annualWithdrawal: 150, withdrawSource: 'vtiFirst' };
  const r = simulate(c)[1];
  near(r.vti, 0); near(r.schd, 150); near(r.cash, 50);
});
test('TC-007 월간 생활비는 안전자산을 먼저 사용한다', () => {
  const r = simulateMonthly(fixture(), [], 'none')[1];
  near(r.cashUsed, 100); near(r.stockSold, 20); near(r.income, 120);
});
test('TC-008 월간 보충은 자산 이동이며 수입을 만들지 않는다', () => {
  for (const policy of ['none', 'annual', 'conditional']) {
    const rows = simulateMonthly(fixture(), [], policy);
    near(rows[1].income, 120); near(rows[3].total, 740);
  }
});
test('TC-009 매년 보충은 목표 잔액까지 매도한다', () => {
  const r = simulateMonthly(fixture(), [], 'annual')[1];
  near(r.refillSold, 360); near(r.cash, 360); near(r.cashTarget, 360);
});
test('TC-010 하락 중 조건부 보충은 최소 잔액까지만 채운다', () => {
  const r = simulateMonthly(fixture(), [{ vtiReturn: -.35, schdReturn: -.35 }], 'conditional')[1];
  assert.equal(r.refillEligible, false); near(r.refillSold, 120); near(r.cash, 120);
});
test('TC-011 소폭 반등만으로 이전 고점 회복으로 보지 않는다', () => {
  const path = [{ vtiReturn: -.35, schdReturn: -.35 }, { vtiReturn: .1, schdReturn: .1 }];
  const rows = simulateMonthly(fixture(), path, 'conditional');
  assert.equal(rows[2].refillEligible, false); near(rows[2].cash, 120);
  assert.equal(simulateMonthly({ ...fixture(), stressRecoveryDrawdown: 40 }, path, 'conditional')[2].refillEligible, true);
});
test('TC-012 보충 매도와 큰 현금 잔액은 시장 회복 지수를 바꾸지 않는다', () => {
  const path = [{ vtiReturn: -.35, schdReturn: -.35 }];
  const a = simulateMonthly(fixture(), path, 'conditional')[1];
  const b = simulateMonthly({ ...fixture(), initialCash: 5000 }, path, 'conditional')[1];
  near(a.marketDrawdown, b.marketDrawdown);
});
test('TC-013 마지막 계산 연말에는 다음 해를 위한 보충을 하지 않는다', () => {
  near(simulateMonthly(fixture(), [], 'annual').at(-1).refillSold, 0);
});
test('TC-014 연말 추가 자산은 받은 해 수익과 이전 생활비에 쓰이지 않는다', () => {
  const c = { ...fixture(), initialVti: 0, initialCash: 0, safeSavingPct: 100 };
  c.extraAssets[0] = 1000;
  const rows = simulateMonthly(c, [], 'none');
  near(rows[1].income, 0); near(rows[1].cash, 1000); near(rows[2].cash, 880);
  assert.equal(rows[1].firstGapMonth, 1);
});
test('TC-015 추가 자산과 저축을 같은 연도 비율로 배분한다', () => {
  const c = { ...fixture(), initialVti: 0, initialCash: 0, retireYears: 1, annualSaving: 5000 };
  c.extraAssets[0] = 10000; c.safeAllocations[0] = 40;
  const r = simulate(c)[1];
  near(r.cash, 6000); near(r.vti, 7200); near(r.schd, 1800);
});
test('TC-016 연말 회복해도 월 중 생활비 부족·소진 기록을 지우지 않는다', () => {
  const c = { ...fixture(), initialVti: 0, initialCash: 0, safeSavingPct: 100 };
  c.extraAssets[0] = 1000;
  const s = stressPathSummary(simulateMonthly(c, [], 'none'), c);
  assert.equal(s.firstGap.firstGapMonth, 1); assert.equal(s.firstEmpty.hadEmpty, true);
});
test('TC-017 자산이 없으면 보충으로 돈을 만들거나 잔액을 음수로 만들지 않는다', () => {
  const rows = simulateMonthly({ ...fixture(), initialVti: 0, initialCash: 0 }, [], 'annual');
  assert.ok(rows.slice(1).every(r => r.total === 0 && r.refillSold === 0 && r.unfunded > 0));
});
test('TC-018 12월 급락이 이전 월 배당을 소급 삭감하지 않는다', () => {
  const c = { ...fixture(), initialVti: 10000, initialCash: 0, monthlyBudget: 0, vtiYield: 12, dividendTax: 0, horizon: 1 };
  const months = Array.from({ length: 12 }, (_, i) => ({ vtiReturn: i === 11 ? -.4 : 0, schdReturn: 0 }));
  near(simulateMonthly(c, [{ vtiReturn: -.4, schdReturn: 0, months }], 'none')[1].netDividend, 1200);
});
test('TC-019 현재 가치 현금흐름은 월별 물가로 환산한다', () => {
  const c = { ...fixture(), initialVti: 10000, inflation: 3 };
  for (const r of simulateMonthly(c).slice(1)) {
    near(r.realIncome / 12, 10); near(r.realBudget / 12, 10);
  }
});
test('TC-020 같은 난수 번호는 같은 월별 시장 경로를 만든다', () => {
  const c = base();
  assert.deepEqual(monthlyMarketPath(c, stressRandom(42)), monthlyMarketPath(c, stressRandom(42)));
  assert.notDeepEqual(monthlyMarketPath(c, stressRandom(42)), monthlyMarketPath(c, stressRandom(43)));
});
test('TC-021 은퇴 후만 변동시키면 은퇴 시작 자산이 기본 계산과 같다', () => {
  const c = { ...base(), stressScope: 'retirement' };
  const rows = simulateMonthly(c, monthlyMarketPath(c, stressRandom(42)));
  near(rows[c.retireYears].total, simulate(c)[c.retireYears].total);
});
test('TC-022 이전 30년 비중 설정을 손실 없이 90년으로 확장한다', () => {
  const old = { ...base(), allocations: Array(30).fill(70), safeAllocations: Array(30).fill(null) };
  delete old.extraAssets;
  const c = normalizeConfig(old);
  assert.equal(c.allocations.length, 90); assert.equal(c.allocations[80], 70);
  assert.equal(c.extraAssets[80], 0); assert.equal(c.safeAllocations[80], null);
});
test('TC-023 월간·연간 생활비 항목을 월평균으로 합산한다', () => {
  near(monthlyBudgetTotal([{ amount: 30, frequency: 'monthly' }, { amount: 120, frequency: 'annual' }]), 40);
});
test('TC-024 잘못된 비중·추가 자산·보충 조건을 거부한다', () => {
  for (const patch of [{ allocations: [] }, { extraAssets: Array(90).fill(-1) },
    { stressBufferFloor: 4, stressBufferYears: 3 }, { stressCorr: 101 }, { annualSaving: NaN }]) {
    assert.ok(validateConfig({ ...base(), ...patch }));
  }
});
