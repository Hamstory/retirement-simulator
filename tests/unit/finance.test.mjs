import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, simulate, simulateMonthly, normalizeConfig, validateConfig, contributionFor,
  monthlyBudgetTotal, stressRandom, randomMarketPath, monthlyMarketPath, crashMarketPath, stressPathSummary, severanceYearFor, near,
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
test('TC-033 퇴직금과 기타 추가 자산은 수령 연말에 각각 한 번 반영된다', () => {
  const c={...fixture(),initialVti:0,initialCash:0,retireYears:2,annualSaving:100,monthlyBudget:0,severanceAmount:1000};
  c.extraAssets[1]=300;c.safeAllocations[1]=40;
  for(const rows of [simulate(c),simulateMonthly(c,[],'none')]){
    near(rows[1].severance,0);near(rows[2].extraAsset,1300);near(rows[2].severance,1000);
    near(rows[2].vti,736);near(rows[2].schd,184);near(rows[2].cash,580);near(rows.at(-1).total,1500);
    near(rows.reduce((sum,r)=>sum+r.severance,0),1000);
  }
  const growing={...c,annualSaving:0,vtiPriceGrowth:12,schdPriceGrowth:8};
  near(simulate(growing)[2].total,1300);near(simulateMonthly(growing)[2].total,1300);
  assert.equal(c.extraAssets[1],300);
});
test('TC-034 즉시 퇴직 또는 시작 연도 수령은 초기 자산에 반영된다', () => {
  for(const patch of [{retireYears:0},{retireYears:2,severanceTiming:'year',severanceYear:2026}]){
    const c={...fixture(),initialVti:0,initialCash:0,monthlyBudget:0,severanceAmount:800,safeSavingPct:25,...patch};c.allocations[0]=60;
    for(const rows of [simulate(c),simulateMonthly(c)]){
      near(rows[0].vti,360);near(rows[0].schd,240);near(rows[0].cash,200);near(rows[0].extraAsset,800);
      near(rows.reduce((sum,r)=>sum+r.severance,0),800);near(rows.at(-1).total,800);
    }
  }
});
test('TC-035 늦게 받는 퇴직금은 이전 생활비 부족을 메우지 않는다', () => {
  const c={...fixture(),initialVti:0,initialCash:0,horizon:4,severanceAmount:1000,severanceTiming:'year',severanceYear:2029,safeSavingPct:100};
  const rows=simulateMonthly(c,[],'none');
  near(rows[3].income,0);near(rows[3].cash,1000);near(rows[3].severance,1000);near(rows[4].cash,880);near(rows[4].income,120);
  assert.equal(rows[3].firstGapMonth,1);assert.equal(stressPathSummary(rows,c).firstUnfunded.year,2027);
  const capped=simulateMonthly({...c,stressCashCap:true},[],'none')[3];near(capped.cash,360);near(capped.cashReinvested,640);near(capped.total,1000);near(capped.income,0);
});
test('TC-036 퇴직금 설정은 이전 기록과 호환되고 유효 범위를 검사한다', () => {
  const old=base();for(const key of ['severanceAmount','severanceTiming','severanceYear'])delete old[key];
  const migrated=normalizeConfig(old);assert.equal(migrated.severanceAmount,0);near(simulate(migrated).at(-1).total,simulate(base()).at(-1).total);
  assert.equal(severanceYearFor({...base(),retireYears:4}),2030);
  assert.equal(severanceYearFor({...base(),retireYears:8}),2034);
  for(const patch of [{severanceAmount:-1},{severanceAmount:Infinity},{severanceAmount:'100'},{severanceTiming:'wrong'},
    {severanceTiming:'year',severanceYear:2025},{severanceTiming:'year',severanceYear:2027.5},{severanceTiming:'year',severanceYear:2300}])assert.ok(validateConfig({...base(),...patch}));
  const linked={...base(),startYear:2030,retireYears:2,severanceAmount:500};assert.equal(validateConfig(linked),'');near(simulate(linked)[2].severance,500);
});
test('TC-037 인출 상한은 배당·이자 포함 생활비 총액을 연초 자산 비율 이하로 제한한다', () => {
  const c={...fixture(),initialVti:10000,initialCash:0,monthlyBudget:100,stressWithdrawalCap:true,stressMaxWithdrawalRate:5};
  const rows=simulateMonthly(c,[],'none');
  near(rows[1].income,500);near(rows[1].total,9500);near(rows[1].workNeeded,700);near(rows[1].capReduction,700);near(rows[1].unfunded,0);
  assert.equal(rows[1].monthsNeedingWork,12);assert.equal(rows[1].hadLivingGap,true);assert.equal(rows[1].hadUnfunded,false);
  for(const r of rows.slice(1)){assert.ok(r.income<=r.spendingCap+1e-7);near(r.spendingRate,5);near(r.spendingCap,r.withdrawalBase*.05);}
});
test('TC-038 상한을 넘는 배당·이자는 소비하지 않고 자산에 보존한다', () => {
  const c={...fixture(),initialVti:10000,initialCash:0,monthlyBudget:100,horizon:1,vtiYield:12,dividendTax:0,stressWithdrawalCap:true};
  let r=simulateMonthly(c,[],'none')[1];near(r.netDividend,1200);near(r.income,500);near(r.cash,700);near(r.total,10700);near(r.stockSold,0);
  r=simulateMonthly({...c,initialVti:0,initialCash:10000,vtiYield:0,cashYield:12,cashTax:0},[],'none')[1];
  near(r.income,500);near(r.total,10000+r.netInterest-r.income);assert.ok(r.netInterest>500);near(r.withdrawal,0);
  r=simulateMonthly({...c,vtiYield:0,horizon:2},[],'annual')[1];near(r.income,500);near(r.spendingRate,5);near(r.refillSold,3600);near(r.total,9500);
});
test('TC-039 인출 상한은 매년 재계산하며 연말 퇴직금은 다음 해 기준에 반영한다', () => {
  const c={...fixture(),initialVti:0,initialCash:0,horizon:4,severanceAmount:1000,severanceTiming:'year',severanceYear:2028,safeSavingPct:100,stressWithdrawalCap:true};c.extraAssets[2]=500;
  const rows=simulateMonthly(c,[],'none');near(rows[2].spendingCap,0);near(rows[2].income,0);near(rows[2].total,1000);
  near(rows[3].withdrawalBase,1000);near(rows[3].income,50);near(rows[3].total,1450);near(rows[4].spendingCap,72.5);near(rows[4].income,72.5);
  const immediate={...c,severanceTiming:'retirement'};near(simulateMonthly(immediate,[],'none')[1].spendingCap,50);
});
test('TC-040 상한 해제·정액 인출·목표 충당·기존 설정을 구분한다', () => {
  const old=base();delete old.stressWithdrawalCap;delete old.stressMaxWithdrawalRate;const migrated=normalizeConfig(old);assert.equal(migrated.stressWithdrawalCap,false);assert.equal(migrated.stressMaxWithdrawalRate,5);
  const c={...fixture(),initialVti:1000,initialCash:0,horizon:1,withdrawMode:'extra',annualWithdrawal:120,stressWithdrawalCap:true};
  let r=simulateMonthly(c,[],'none')[1];near(r.income,50);near(r.workNeeded,70);near(r.unfunded,0);
  r=simulateMonthly({...c,monthlyBudget:1},[],'none')[1];near(r.capReduction,70);near(r.workNeeded,0);assert.equal(r.monthsNeedingWork,0);
  r=simulateMonthly({...c,stressWithdrawalCap:false},[],'none')[1];near(r.income,120);near(r.capReduction,0);assert.equal(r.spendingCap,null);
  r=simulateMonthly({...c,stressMaxWithdrawalRate:0},[],'none')[1];near(r.total,1000);near(r.income,0);
  const months=Array.from({length:12},(_,i)=>({vtiReturn:i===0?-.9999:0,schdReturn:0}));r=simulateMonthly(c,[{vtiReturn:-.9999,schdReturn:0,months}],'none')[1];assert.ok(r.unfunded>0);assert.ok(r.workNeeded>r.capReduction);assert.equal(r.hadEmpty,true);
  for(const patch of [{stressMaxWithdrawalRate:-1},{stressMaxWithdrawalRate:101},{stressMaxWithdrawalRate:NaN},{stressWithdrawalCap:'true'}])assert.ok(validateConfig({...base(),...patch}));
});
test('TC-041 퇴직금 별도 배분은 저축·기타 자산 비율을 바꾸지 않는다', () => {
  const c={...fixture(),initialVti:0,initialCash:0,retireYears:2,annualSaving:100,monthlyBudget:0,severanceAmount:1000,severanceAllocation:'custom',severanceSafePct:50,severanceVtiPct:20};
  c.extraAssets[1]=300;c.safeAllocations[1]=40;
  const before=JSON.stringify(c);
  for(const rows of [simulate(c),simulateMonthly(c,[],'none')]){
    near(rows[2].vti,456);near(rows[2].schd,364);near(rows[2].cash,680);near(rows[2].extraAsset,1300);
    near(rows[2].vtiContribution,48);near(rows[2].schdContribution,12);near(rows[2].safeContribution,40);
    near(rows.at(-1).total,1500);near(rows.reduce((sum,r)=>sum+r.severance,0),1000);
  }
  assert.equal(JSON.stringify(c),before);
  // The payment buys units at receipt prices, with no receipt-year return.
  const growing={...c,annualSaving:0,vtiPriceGrowth:12,schdPriceGrowth:8};
  for(const rows of [simulate(growing),simulateMonthly(growing,[],'none')]){
    near(rows[2].vti,344);near(rows[2].schd,336);near(rows[2].cash,620);near(rows[2].total,1300);
    near(rows[3].vti,344*1.12);near(rows[3].schd,336*1.08);
  }
});
test('TC-042 별도 퇴직금 배분은 초기·은퇴 중 수령과 안전자산 상한에 적용된다', () => {
  for(const [safe,vti] of [[50,20],[100,0],[0,100],[0,0],[12.5,32.5]]){
    const c={...fixture(),initialVti:0,initialCash:0,monthlyBudget:0,severanceAmount:800,severanceAllocation:'custom',severanceSafePct:safe,severanceVtiPct:vti};
    for(const timing of [{},{retireYears:2,severanceTiming:'year',severanceYear:2026},{severanceTiming:'year',severanceYear:2028}]){
      const config={...c,...timing},at=timing.severanceYear===2028?2:0;
      for(const rows of [simulate(config),simulateMonthly(config,[],'none')]){
        near(rows[at].vti,800*vti/100);near(rows[at].schd,800*(100-safe-vti)/100);near(rows[at].cash,800*safe/100);
        near(rows.at(-1).total,800);near(rows.reduce((sum,r)=>sum+r.severance,0),800);
      }
    }
  }
  const late={...fixture(),initialVti:0,initialCash:0,severanceAmount:1000,severanceTiming:'year',severanceYear:2028,severanceAllocation:'custom',severanceSafePct:100,severanceVtiPct:0};
  const r=simulateMonthly(late,[],'none')[2];near(r.income,0);near(r.cash,1000);assert.equal(r.firstGapMonth,1);
  const capped=simulateMonthly({...late,stressCashCap:true},[],'none')[2];near(capped.cash,360);near(capped.cashReinvested,640);near(capped.vti,512);near(capped.schd,128);near(capped.total,1000);
});
test('TC-043 별도 배분 설정은 기존 기록과 호환되고 잘못된 비율을 거부한다', () => {
  const old={...fixture(),severanceAmount:800};for(const key of ['severanceAllocation','severanceSafePct','severanceVtiPct'])delete old[key];
  const migrated=normalizeConfig(old);assert.equal(migrated.severanceAllocation,'annual');
  assert.deepEqual(simulate(migrated),simulate({...fixture(),severanceAmount:800}));
  for(const patch of [{severanceAllocation:'wrong'},{severanceSafePct:-1},{severanceSafePct:101},{severanceVtiPct:NaN},{severanceVtiPct:Infinity},{severanceVtiPct:'20'},{severanceSafePct:60,severanceVtiPct:50}]){
    assert.ok(validateConfig({...base(),severanceAllocation:'custom',...patch}));
  }
  // Inactive custom inputs never affect the inherited allocation or trap switching back.
  const inherited={...fixture(),severanceAllocation:'annual',severanceSafePct:NaN,severanceVtiPct:120};
  assert.equal(validateConfig(inherited),'');assert.deepEqual(simulate(inherited),simulate(fixture()));
});

const fourFixture=()=>({...fixture(),aorPriceGrowth:0,aoaPriceGrowth:0,aorYield:0,aoaYield:0,aorDividendGrowth:0,aoaDividendGrowth:0});
test('TC-044 네 ETF의 초기 투자·저축·추가 자산·퇴직금 배분을 보존한다',()=>{
 const c={...fourFixture(),initialVti:100,initialSchd:200,initialAor:300,initialAoa:400,initialCash:1000,deployCash:500,retireYears:1,annualSaving:1000,monthlyBudget:0,severanceAmount:1000,severanceAllocation:'custom',severanceVtiPct:10,severanceAorPct:20,severanceAoaPct:30,severanceSafePct:40};
 c.allocations.fill(10);c.aorAllocations.fill(30);c.aoaAllocations.fill(40);c.extraAssets[0]=500;
 for(const rows of [simulate(c),simulateMonthly(c,[],'none')]){
  for(const [key,value] of Object.entries({vti:150,schd:300,aor:450,aoa:600,cash:500,total:2000}))near(rows[0][key],value);
  for(const [key,value] of Object.entries({vti:370,schd:540,aor:1010,aoa:1380,cash:1200,total:4500,extraAsset:1500,severance:1000,aorContribution:240,aoaContribution:320}))near(rows[1][key],value);
  near(rows.at(-1).total,4500);
 }
 const immediate=simulate({...c,retireYears:0})[0];near(immediate.vti,250);near(immediate.aor,650);near(immediate.aoa,900);near(immediate.cash,900);near(immediate.total,3000);
});
test('TC-045 AOR·AOA 분배금 성장과 재투자·매도 순서를 계산한다',()=>{
 const c={...fourFixture(),initialVti:0,initialCash:0,initialAor:1000,initialAoa:2000,retireYears:1,monthlyBudget:0,aorPriceGrowth:10,aoaPriceGrowth:20,aorYield:10,aoaYield:5,aorDividendGrowth:10,aoaDividendGrowth:20,dividendTax:0,withdrawMode:'extra'};
 const rows=simulate(c);near(rows[1].aor,1200);near(rows[1].aoa,2500);near(rows[1].netDividend,200);near(rows[2].netDividend,245);near(rows[2].income,245);near(rows[2].aor,1320);near(rows[2].aoa,3000);
 const sale={...fourFixture(),initialVti:100,initialSchd:100,initialAor:100,initialAoa:100,initialCash:100,horizon:1,withdrawMode:'extra',annualWithdrawal:250,withdrawSource:'vtiFirst'};
 let r=simulate(sale)[1];near(r.vti,0);near(r.schd,0);near(r.aor,50);near(r.aoa,100);near(r.cash,100);near(r.income,250);near(r.total,250);
 r=simulate({...sale,withdrawSource:'stocks'})[1];for(const k of ['vti','schd','aor','aoa'])near(r[k],37.5);near(r.total,250);
});
test('TC-046 AOR·AOA는 월 생활비 재원이며 별도 현금 완충재가 아니다',()=>{
 const c={...fourFixture(),initialVti:0,initialCash:100,initialAor:600,initialAoa:400,horizon:2};
 for(const policy of ['none','annual','conditional']){
  const rows=simulateMonthly(c,[],policy);near(rows[0].total,1100);near(rows[0].cash,100);
  for(const r of rows.slice(1)){near(r.total,1100-r.elapsed*120);near(r.total,r.vti+r.schd+r.aor+r.aoa+r.cash);near(r.income,120);}
  near(rows[1].cash,policy==='none'?0:360);
 }
 const reinvest={...fourFixture(),initialVti:0,initialCash:1000,horizon:1,stressCashCap:true};reinvest.allocations.fill(0);reinvest.aorAllocations.fill(25);reinvest.aoaAllocations.fill(75);
 let r=simulateMonthly(reinvest,[],'none')[1];near(r.aor,130);near(r.aoa,390);near(r.cash,360);near(r.total,880);
 r=simulateMonthly({...c,initialCash:0,monthlyBudget:100,stressWithdrawalCap:true},[],'none')[1];near(r.spendingCap,50);near(r.income,50);near(r.workNeeded,1150);near(r.total,950);
 const priority=simulateMonthly({...fourFixture(),initialVti:100,initialSchd:100,initialAor:100,initialAoa:100,initialCash:0,horizon:1,monthlyBudget:250/12,stressStockSale:'vtiFirst'},[],'none')[1];near(priority.vti,0);near(priority.schd,0);near(priority.aor,50);near(priority.aoa,100);
});
test('TC-047 네 ETF의 고정·자유 무작위 경로와 상관 모형을 구분한다',()=>{
 const c={...fourFixture(),retireYears:2,horizon:3,aorPriceGrowth:4,aoaPriceGrowth:6};
 const compound=(p,k)=>p.flatMap(r=>r.months).reduce((n,m)=>n*(1+m[k+'Return']),1);
 const a=monthlyMarketPath(c,stressRandom(42)),b=monthlyMarketPath(c,stressRandom(42));assert.deepEqual(a,b);
 for(const k of ['vti','schd','aor','aoa'])near(compound(a,k),(1+c[k+'PriceGrowth']/100)**5);
 const free={...c,stressReturnMode:'free'};assert.ok(Math.abs(compound(monthlyMarketPath(free,stressRandom(42)),'aor')-1.04**5)>1e-4);
 const zero={...c,stressVtiVol:0,stressSchdVol:0,stressAorVol:0,stressAoaVol:0};
 for(const m of monthlyMarketPath(zero,stressRandom(43)).flatMap(r=>r.months))for(const k of ['vti','schd','aor','aoa'])near(m[k+'Return'],(1+c[k+'PriceGrowth']/100)**(1/12)-1);
 const corr={...c,stressCorr:100},months=monthlyMarketPath(corr,stressRandom(44)).flatMap(r=>r.months);
 for(const m of months){const z=k=>(Math.log1p(m[k+'Return'])-Math.log1p(c[k+'PriceGrowth']/100)/12)/c['stress'+k[0].toUpperCase()+k.slice(1)+'Vol'];near(z('vti'),z('aor'));near(z('vti'),z('aoa'));}
 const retired={...c,stressScope:'retirement',initialAor:1000,initialAoa:2000};near(simulateMonthly(retired,monthlyMarketPath(retired,stressRandom(42)))[2].total,simulate(retired)[2].total);
 const annual=randomMarketPath(c,stressRandom(42));assert.ok(annual.every(r=>Number.isFinite(r.aorReturn)&&Number.isFinite(r.aoaReturn)));
});
test('TC-048 AOR·AOA 급락·회복은 개별 급락 가정을 따른다',()=>{
 const c={...fourFixture(),retireYears:0,horizon:6,stressCrashDuration:1,stressAorCrash:20,stressAoaCrash:30,aorPriceGrowth:4,aoaPriceGrowth:6};
 for(const late of [false,true]){
  const p=crashMarketPath(c,late);for(const k of ['aor','aoa'])near(p.flatMap(r=>r.months).reduce((n,m)=>n*(1+m[k+'Return']),1),(1+c[k+'PriceGrowth']/100)**6);
  near(p[late?4:0].aorReturn,-.2);near(p[late?4:0].aoaReturn,-.3);assert.ok(p[late?5:1].aorReturn>.04);
 }
 const free=crashMarketPath({...c,stressReturnMode:'free'});near(free[0].aorReturn,-.2);near(free[0].aoaReturn,-.3);assert.deepEqual(free[1],{});
});
test('TC-049 이전 기록은 새 ETF 비중 0으로 복원되고 비율 합계를 검증한다',()=>{
 const old=fourFixture();for(const key of Object.keys(old))if(/aor|aoa/i.test(key))delete old[key];const c=normalizeConfig(old);
 assert.ok(c.aorAllocations.every(v=>v===0));assert.ok(c.aoaAllocations.every(v=>v===0));assert.equal(c.initialAor,0);assert.equal(c.severanceAoaPct,0);
 for(const r of simulate(c)){near(r.aor,0);near(r.aoa,0);near(r.total,r.vti+r.schd+r.cash);}
 for(const patch of [{initialAor:-1},{initialAoa:NaN},{aorYield:31},{aoaPriceGrowth:51},{aorDividendGrowth:Infinity},{stressAorVol:61},{stressAoaCrash:91},{aorAllocations:Array(90).fill(30)},{aoaAllocations:[]},{severanceAllocation:'custom',severanceAorPct:30},{severanceAllocation:'custom',severanceAoaPct:-1}])assert.ok(validateConfig({...base(),...patch}));
 assert.throws(()=>simulate(fourFixture(),[{aorReturn:-1}]));assert.throws(()=>simulateMonthly(fourFixture(),[{months:Array.from({length:12},()=>({vtiReturn:0,schdReturn:0,aoaReturn:NaN}))}]));
 const short=normalizeConfig({...base(),allocations:Array(30).fill(10),aorAllocations:Array(30).fill(30),aoaAllocations:Array(30).fill(40)});assert.equal(short.aorAllocations[89],30);assert.equal(short.aoaAllocations[89],40);assert.equal(validateConfig(short),'');
});
test('TC-050 네 ETF 월별 손실·분배금 삭감·수령 후 총자산을 추적한다',()=>{
 const c={...fourFixture(),initialVti:0,initialCash:0,initialAor:1000,aorYield:12,dividendTax:0,monthlyBudget:0,horizon:2};
 const months=Array.from({length:12},(_,i)=>({vtiReturn:0,schdReturn:0,aorReturn:i===11?-.4:0,aoaReturn:0}));
 const rows=simulateMonthly(c,[{aorReturn:-.4,months}],'none');near(rows[1].netDividend,120);near(rows[1].aor,600);near(rows[1].total,720);near(rows[2].netDividend,108);
 const late={...fourFixture(),initialVti:0,initialCash:0,severanceTiming:'year',severanceYear:2028,severanceAmount:1000,severanceAllocation:'custom',severanceSafePct:0,severanceVtiPct:0,severanceAorPct:40,severanceAoaPct:60};
 const paid=simulateMonthly(late,[],'none');near(paid[2].income,0);assert.equal(paid[2].firstGapMonth,1);near(paid[2].aor,400);near(paid[2].aoa,600);near(paid[3].income,120);near(paid[3].total,880);
 const recovered=simulateMonthly({...fourFixture(),initialVti:0,initialCash:0,initialAor:1000,initialAoa:1000},[],'conditional')[1];assert.equal(recovered.refillEligible,true);near(recovered.cash,360);near(recovered.refillSold,360);near(recovered.total,1880);near(recovered.income,120);
});

test('TC-051 마지막 저축 연도 안전자산 옵션은 신규 자금에만 적용된다',()=>{
 const c={...fourFixture(),initialVti:1000,initialCash:0,retireYears:2,annualSaving:100,monthlyBudget:0,severanceAmount:1000,finalSavingSafeOnly:true};
 c.allocations.fill(40);c.aorAllocations.fill(20);c.aoaAllocations.fill(20);c.safeAllocations[1]=40;c.extraAssets[1]=300;
 const saved=JSON.stringify(c);
 for(const rows of [simulate(c),simulateMonthly(c,[],'none')]){
  near(rows[1].cash,20);near(rows[2].cash,1420);near(rows[2].vti,1032);near(rows[2].schd,16);near(rows[2].aor,16);near(rows[2].aoa,16);near(rows[2].total,2500);
  near(rows[2].safeContribution,100);for(const k of ['vti','schd','aor','aoa'])near(rows[2][k+'Contribution'],0);
 }
 assert.equal(JSON.stringify(c),saved);near(simulate({...c,finalSavingSafeOnly:false})[2].cash,580);
 const custom={...c,severanceAllocation:'custom',severanceSafePct:10,severanceVtiPct:20,severanceAorPct:30,severanceAoaPct:0};
 for(const rows of [simulate(custom),simulateMonthly(custom,[],'none')]){near(rows[2].cash,520);near(rows[2].vti,1232);near(rows[2].schd,416);near(rows[2].aor,316);near(rows[2].total,2500);}
 const rising=simulate({...c,vtiPriceGrowth:10});near(rising[2].vti,1245.2);
});
test('TC-052 마지막 저축 연도 옵션은 은퇴 시점 변경과 초기 수령을 구분한다',()=>{
 const c={...fourFixture(),initialVti:0,initialCash:1000,deployCash:500,annualSaving:100,monthlyBudget:0,retireYears:1,severanceAmount:800,severanceTiming:'year',severanceYear:2026,finalSavingSafeOnly:true};
 const r=simulate(c);near(r[0].cash,660);near(r[0].vti,912);near(r[0].schd,228);near(r[1].cash,760);
 const immediate=simulate({...c,retireYears:0});near(immediate[0].cash,660);near(immediate[1].cash,660);
 const moved={...c,deployCash:0,initialCash:0,severanceAmount:0,retireYears:3};const rows=simulate(moved);near(rows[1].safeContribution,20);near(rows[2].safeContribution,20);near(rows[3].safeContribution,100);
 const after={...moved,severanceAmount:800,severanceYear:2030};near(simulate(after)[4].cash-simulate(moved)[4].cash,160);
 const old=base();delete old.finalSavingSafeOnly;assert.equal(normalizeConfig(old).finalSavingSafeOnly,false);assert.deepEqual(simulate(normalizeConfig(old)),simulate(base()));
 for(const value of [null,undefined,'true',1])assert.ok(validateConfig({...base(),finalSavingSafeOnly:value}));
});
