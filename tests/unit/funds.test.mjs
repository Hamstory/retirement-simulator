import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,newFund,fundKeys,normalizeConfig,validateConfig,simulate,simulateMonthly,monthlyMarketPath,randomMarketPath,crashMarketPath,stressRandom} from '../../src/engine.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
function fixture(){
 const c=structuredClone(DEFAULTS);Object.assign(c,{retireYears:1,horizon:3,inflation:0,cashYield:0,initialCash:200,deployCash:100,annualSaving:1000,monthlyBudget:0,stressCashCap:false,allocations:Array(90).fill(0),aorAllocations:Array(90).fill(0),aoaAllocations:Array(90).fill(0)});
 for(const k of ['vti','schd','aor','aoa'])for(const suffix of ['PriceGrowth','Yield','DividendGrowth'])c[k+suffix]=0;
 c.customFunds=[{...newFund('fund_alpha','가상 종목 A'),initial:100,priceGrowth:0,allocations:Array(90).fill(40)},{...newFund('fund_beta','가상 종목 B'),initial:200,priceGrowth:0,allocations:Array(90).fill(60)}];return c;
}
test('TC-053 등록 종목이 초기 자산·연도별 투자·퇴직금·매도·세후 분배금에 반영된다',()=>{
 const c=fixture();c.extraAssets[0]=100;Object.assign(c,{severanceAmount:1000,severanceAllocation:'custom',severanceVtiPct:0,severanceSafePct:20});c.customFunds[0].severancePct=30;c.customFunds[1].severancePct=50;
 assert.equal(validateConfig(c),'');const rows=simulate(c),r=rows[1];near(rows[0].total,500);near(rows[0].fund_alpha,140);near(rows[0].fund_beta,260);
 near(r.fund_alpha,792);near(r.fund_beta,1288);near(r.cash,520);near(r.total,2600);near(simulateMonthly(c)[1].total,r.total);
 for(const row of simulateMonthly(c))near(row.total,fundKeys(c).reduce((sum,k)=>sum+row[k],row.cash));
 const dividends=fixture();Object.assign(dividends,{retireYears:0,initialCash:0,deployCash:0,annualSaving:0});Object.assign(dividends.customFunds[0],{yield:12,tax:0});Object.assign(dividends.customFunds[1],{yield:6,tax:50});
 near(simulate(dividends)[1].netDividend,18);near(simulateMonthly(dividends)[1].netDividend,18);
 dividends.withdrawMode='extra';dividends.annualWithdrawal=240;dividends.customFunds.forEach(f=>f.yield=0);dividends.withdrawSource='vtiFirst';
 const annual=simulate(dividends)[1];near(annual.fund_alpha,0);near(annual.fund_beta,60);near(annual.stockSold,240);
 dividends.stressStockSale='vtiFirst';const monthly=simulateMonthly(dividends)[1];near(monthly.fund_alpha,0);near(monthly.fund_beta,60);near(monthly.stockSold,240);
 dividends.withdrawSource='stocks';const proportional=simulate(dividends)[1];near(proportional.fund_alpha,20);near(proportional.fund_beta,40);
 const cap=fixture();Object.assign(cap,{retireYears:0,initialCash:1000,deployCash:0,stressCashCap:true,stressBufferPolicy:'none'});const end=simulateMonthly(cap)[1];near(end.cash,0);near(end.fund_alpha,500);near(end.fund_beta,800);near(end.total,1300);
 const safe=fixture();safe.finalSavingSafeOnly=true;const final=simulate(safe)[1];near(final.fund_alpha,140);near(final.fund_beta,260);near(final.cash,1100);
 // Tax-adjusted reinvestment also uses the fund's own tax, and receipts cannot cover earlier months.
 const reinvest=fixture();reinvest.initialCash=0;reinvest.deployCash=0;reinvest.annualSaving=0;reinvest.customFunds[0].yield=10;reinvest.customFunds[0].tax=20;near(simulate(reinvest)[1].fund_alpha,108);
 const late=fixture();late.retireYears=0;late.initialCash=0;late.deployCash=0;late.customFunds.forEach(f=>f.initial=0);late.monthlyBudget=1;late.extraAssets[0]=100;const paid=simulateMonthly(late)[1];assert.ok(paid.hadLivingGap);near(paid.income,0);near(paid.total,100);
});
test('TC-054 등록 종목 시장 경로의 고정 연복리·급락 회복·재현성을 유지한다',()=>{
 const c=fixture();c.horizon=8;c.customFunds[0].priceGrowth=4;c.customFunds[1].priceGrowth=2;c.customFunds[0].crash=45;c.customFunds[1].crash=20;
 const a=monthlyMarketPath(c,stressRandom(82)),b=monthlyMarketPath(c,stressRandom(82));assert.deepEqual(a,b);
 const end=(path,key)=>path.reduce((v,y)=>v*(1+y[key+'Return']),1);
 for(const k of ['fund_alpha','fund_beta']){
  const growth=c.customFunds.find(f=>f.id===k).priceGrowth/100;near(end(a,k),(1+growth)**9);assert.ok(a.every(y=>y.months.length===12&&y.months.every(m=>Number.isFinite(m[k+'Return']))));
  near(end(crashMarketPath(c),k),(1+growth)**9);near(end(crashMarketPath(c,true),k),(1+growth)**9);
 }
 c.stressReturnMode='free';assert.notEqual(end(monthlyMarketPath(c,stressRandom(82)),'fund_alpha'),end(monthlyMarketPath(c,stressRandom(83)),'fund_alpha'));assert.ok(randomMarketPath(c,stressRandom(1)).every(y=>Number.isFinite(y.fund_alphaReturn)));
 c.stressScope='retirement';const path=monthlyMarketPath(c,stressRandom(2));near(path[0].fund_alphaReturn,.04);near(simulateMonthly(c,path)[c.retireYears].total,simulate(c)[c.retireYears].total);
});
test('TC-055 종목 등록값과 합계 비율을 검증하고 이전 설정을 호환한다',()=>{
 const legacy=structuredClone(DEFAULTS);delete legacy.customFunds;assert.deepEqual(normalizeConfig(legacy).customFunds,[]);assert.equal(validateConfig(normalizeConfig(legacy)),'');
 const c=fixture();assert.equal(validateConfig(c),'');for(const mutate of [x=>x.customFunds=null,x=>x.customFunds[1].id=x.customFunds[0].id,x=>x.customFunds[0].id='__proto__',x=>x.customFunds[0].name='',x=>x.customFunds[0].color='red',x=>x.customFunds[0].tax=101,x=>x.customFunds[0].vol=NaN,x=>x.customFunds[0].allocations[0]=41,x=>x.customFunds[0].allocations=null,x=>x.customFunds=Array.from({length:13},(_,i)=>newFund('fund_'+i))]){const bad=structuredClone(c);mutate(bad);assert.ok(validateConfig(bad));}
 c.severanceAllocation='custom';c.customFunds[0].severancePct=30;assert.ok(validateConfig(c));c.severanceVtiPct=0;assert.equal(validateConfig(c),'');
 const short=fixture();short.customFunds[0].allocations=Array(30).fill(25);assert.equal(normalizeConfig(short).customFunds[0].allocations.length,90);assert.equal(normalizeConfig(short).customFunds[0].allocations.at(-1),25);
});
