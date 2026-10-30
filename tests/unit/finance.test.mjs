import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, simulate, simulateMonthly, normalizeConfig, validateConfig, contributionFor,
  monthlyBudgetTotal, stressRandom, monthlyMarketPath, crashMarketPath, stressPathSummary, near,
} from '../helpers/engine.mjs';

const base = () => structuredClone(DEFAULTS);
const fixture = () => ({ ...base(), initialVti: 1000, initialSchd: 0, initialCash: 100,
  deployCash: 0, retireYears: 0, horizon: 3, annualSaving: 0,
  vtiPriceGrowth: 0, schdPriceGrowth: 0, vtiYield: 0, schdYield: 0,
  vtiDividendGrowth: 0, schdDividendGrowth: 0, cashYield: 0,
  inflation: 0, monthlyBudget: 10, stressCashCap: false, withdrawMode: 'budget' });

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
const compound = (path, key) => path.reduce((value, row) => value * (1 + row[key]), 1);
test('TC-025 최종 연복리 고정 경로는 ETF별 설정 주가에 도달한다', () => {
  for (const scope of ['all', 'retirement']) for (const seed of [1, 42, 937]) {
    const c = { ...base(), retireYears: 4, horizon: 8, stressScope: scope, vtiPriceGrowth: 7, schdPriceGrowth: -2 };
    const path = monthlyMarketPath(c, stressRandom(seed));
    for (const [key, rate] of [['vtiReturn', .07], ['schdReturn', -.02]]) {
      near(compound(path, key), (1 + rate) ** 12);
      near(compound(path.flatMap(r => r.months), key), (1 + rate) ** 12);
      if (scope === 'retirement') near(compound(path.slice(0, 4), key), (1 + rate) ** 4);
    }
  }
});
test('TC-026 고정된 최종값 사이의 월별 경로는 무작위로 달라진다', () => {
  const c = { ...base(), retireYears: 0, horizon: 12 };
  const a = monthlyMarketPath(c, stressRandom(42)), b = monthlyMarketPath(c, stressRandom(43));
  assert.notDeepEqual(a[0].months, b[0].months);
  near(compound(a, 'vtiReturn'), compound(b, 'vtiReturn'));
  assert.ok(a.flatMap(r => r.months).some(r => r.vtiReturn < 0));
  assert.ok(a.flatMap(r => r.months).some(r => r.vtiReturn > 0));
  const portfolio={...fixture(),horizon:12,initialVti:10000,initialCash:0,monthlyBudget:0};
  near(simulateMonthly(portfolio,a,'none').at(-1).total,simulateMonthly(portfolio,b,'none').at(-1).total);
  const spending={...portfolio,monthlyBudget:10};
  assert.ok(Math.abs(simulateMonthly(spending,a,'none').at(-1).total-simulateMonthly(spending,b,'none').at(-1).total)>1);
  for (const rho of [-100, 100]) {
    const settings = { ...c, stressCorr: rho };
    for (const m of monthlyMarketPath(settings, stressRandom(42)).flatMap(r => r.months)) {
      const zV=(Math.log1p(m.vtiReturn)-Math.log1p(c.vtiPriceGrowth/100)/12)/c.stressVtiVol;
      const zS=(Math.log1p(m.schdReturn)-Math.log1p(c.schdPriceGrowth/100)/12)/c.stressSchdVol;
      near(zV, zS * rho / 100);
    }
  }
});
test('TC-027 자유 경로의 최종 수익률은 달라지고 변동성 0은 기준선과 같다', () => {
  const c={...base(),retireYears:0,horizon:5,stressReturnMode:'free'};
  assert.notEqual(compound(monthlyMarketPath(c,stressRandom(42)),'vtiReturn'),compound(monthlyMarketPath(c,stressRandom(43)),'vtiReturn'));
  for (const mode of ['free','anchored']) {
    const zero={...c,stressReturnMode:mode,stressVtiVol:0,stressSchdVol:0};
    near(compound(monthlyMarketPath(zero,stressRandom(42)),'vtiReturn'),1.03**5);
  }
});
test('TC-028 초반·후반 급락 뒤 회복 경로의 최종 주가 수익률이 같다', () => {
  for (const horizon of [1,3,20]) for (const late of [false,true]) {
    const c={...base(),retireYears:2,horizon,vtiPriceGrowth:6,schdPriceGrowth:2};
    const path=crashMarketPath(c,late), months=path.slice(2).flatMap(r=>r.months);
    near(compound(path,'vtiReturn'),1.06**(horizon+2));near(compound(path,'schdReturn'),1.02**(horizon+2));
    const first=months.findIndex(r=>r.vtiReturn<0),last=months.findLastIndex(r=>r.vtiReturn<0);
    assert.ok(first>=0 && last<months.length-1);assert.ok(months[last+1].vtiReturn>.06/12);
    const flat=crashMarketPath({...c,stressCrash:0},late);
    flat.forEach(r=>near(r.vtiReturn,.06));
  }
});
test('TC-029 연말 안전자산 상한은 세 보충 전략과 추가 자산에 적용된다', () => {
  const c={...fixture(),stressCashCap:true,initialCash:4000,inflation:2};c.extraAssets[1]=2000;c.safeAllocations[1]=100;
  for (const policy of ['none','annual','conditional']) {
    let expected=5000;
    for (const r of simulateMonthly(c,[],policy).slice(1)) {
      expected+=r.extraAsset-r.income;near(r.total,expected);assert.ok(r.cash<=r.cashTarget+1e-7);
    }
  }
});
test('TC-030 안전자산 초과분은 해당 연도 주식 비율로 마지막 해에도 투자한다', () => {
  const c={...fixture(),stressCashCap:true,initialVti:0,initialCash:1000,horizon:1};c.allocations[0]=25;
  const r=simulateMonthly(c,[],'annual')[1];
  near(r.cashReinvested,520);near(r.vti,130);near(r.schd,390);near(r.cash,360);near(r.total,880);near(r.income,120);near(r.refillSold,0);
});
test('TC-031 생활비 0의 상한과 초과 배당도 자산을 없애지 않는다', () => {
  const c={...fixture(),stressCashCap:true,monthlyBudget:0,horizon:1,vtiYield:12,dividendTax:0};
  for (const policy of ['none','annual','conditional']) {
    const r=simulateMonthly(c,[],policy)[1];near(r.cash,0);near(r.cashReinvested,220);near(r.total,1220);near(r.income,0);near(r.netDividend,120);
  }
});
test('TC-032 기존 설정은 새 경로·상한 기본값으로 확장되고 잘못된 옵션을 거부한다', () => {
  const old=base();delete old.stressCashCap;delete old.stressReturnMode;
  const c=normalizeConfig(old);assert.equal(c.stressCashCap,true);assert.equal(c.stressReturnMode,'anchored');
  near(simulateMonthly({...fixture(),initialCash:1000,horizon:1,stressCashCap:false},[],'none')[1].cash,880);
  for (const patch of [{stressReturnMode:'wrong'},{stressCashCap:'true'}]) assert.ok(validateConfig({...base(),...patch}));
});
