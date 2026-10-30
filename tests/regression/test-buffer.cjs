const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{boot}=require('./test-records.cjs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../dist/index.html'),'utf8'),context={structuredClone};vm.createContext(context);vm.runInContext(html.match(/<script id="calculation-engine">([\s\S]*?)<\/script>/)[1]+';globalThis.api={DEFAULTS,simulate,simulateMonthly,validateConfig,normalizeConfig,monthlyMarketPath,stressRandom,stressPathSummary,stressConfig};',context);
const {DEFAULTS,simulate,simulateMonthly,validateConfig,normalizeConfig,monthlyMarketPath,stressRandom,stressPathSummary,stressConfig}=context.api,base=()=>structuredClone(DEFAULTS),near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps*Math.max(1,Math.abs(a)),`${a} != ${b}`);
const fixture=()=>({...base(),initialVti:1000,initialSchd:0,initialCash:100,deployCash:0,retireYears:0,horizon:3,annualSaving:0,vtiPriceGrowth:0,schdPriceGrowth:0,vtiYield:0,schdYield:0,vtiDividendGrowth:0,schdDividendGrowth:0,cashYield:0,inflation:0,monthlyBudget:10,withdrawMode:'budget'});
let c=fixture();
// A refill is a transfer, never extra wealth, spending or income.
for(const policy of ['none','annual','conditional']){const rows=simulateMonthly(c,[],policy);near(rows[3].total,1100-360);near(rows[1].income,120);near(rows[1].requestedWithdrawal,120);assert.equal(rows[1].hadLivingGap,false);near(rows[3].refillSold,0);}
const crash=[{vtiReturn:-.35,schdReturn:-.35},{vtiReturn:.10,schdReturn:.10}];
let none=simulateMonthly(c,crash,'none'),annual=simulateMonthly(c,crash,'annual'),conditional=simulateMonthly(c,crash,'conditional');
near(none[1].cash,0);near(annual[1].refillSold,360);near(conditional[1].refillSold,120);near(conditional[1].cash,120);assert.equal(conditional[1].refillEligible,false);assert.equal(conditional[2].refillEligible,false);near(conditional[2].cash,120);near(conditional[2].refillSold,120);near(conditional[1].total,annual[1].total);near(conditional[1].income,120);assert.ok(conditional[1].downMarketSold>=conditional[1].refillSold);near(annual[1].cashTarget,360);near(annual[1].cashFloor,120);
// Recovery thresholds control whether to fill the target or only the floor.
const permissive=simulateMonthly({...c,stressRecoveryDrawdown:40},crash,'conditional');assert.equal(permissive[2].refillEligible,true);near(permissive[2].cash,360);
// Sales/receipts cannot alter the independent market recovery index.
const bigCash=simulateMonthly({...c,initialCash:5000},crash,'conditional');near(bigCash[1].marketDrawdown,conditional[1].marketDrawdown);near(bigCash[2].marketDrawdown,conditional[2].marketDrawdown);
// An end-year receipt must not hide earlier monthly insolvency or pay past expenses.
c={...fixture(),initialVti:0,initialCash:0,horizon:2,safeSavingPct:100};c.extraAssets[0]=1000;let rows=simulateMonthly(c,[],'none');near(rows[1].income,0);near(rows[1].cash,1000);assert.equal(rows[1].firstGapMonth,1);assert.equal(rows[1].hadEmpty,true);near(rows[2].cash,880);near(rows[2].income,120);const summary=stressPathSummary(rows,c);assert.equal(summary.firstGap.year,2027);assert.equal(summary.firstEmpty.year,2027);
// Flow identity with zero investment returns, across all refill rules and receipts.
c={...fixture(),initialVti:75000,initialSchd:15000,initialCash:5000,horizon:6};c.extraAssets[1]=10000;c.extraAssets[4]=20000;c.safeAllocations[1]=40;
for(const policy of ['none','annual','conditional']){rows=simulateMonthly(c,[],policy);let expected=95000;for(const r of rows.slice(1)){expected+=r.extraAsset-r.income;near(r.total,expected);assert.ok([r.vti,r.schd,r.cash,r.stockSold,r.refillSold].every(v=>v>=0));}}
// Receipt allocation is shared by annual and monthly models, including after saving ends.
c={...fixture(),retireYears:1,annualSaving:5000,initialVti:0,initialCash:0};c.extraAssets[0]=10000;c.safeAllocations[0]=40;rows=simulate(c);near(rows[1].cash,6000);near(rows[1].vti,7200);near(rows[1].schd,1800);near(simulateMonthly(c)[1].total,rows[1].total);
// VTI-first applies to refill and living-cost sales.
c={...fixture(),initialVti:1000,initialSchd:500,initialCash:100,stressStockSale:'vtiFirst'};rows=simulateMonthly(c,[],'annual');near(rows[1].schd,500);near(rows[1].vti,620);near(rows[1].cash,360);
// Empty portfolios never create money when trying to refill.
c={...fixture(),initialVti:0,initialCash:0};rows=simulateMonthly(c,[],'annual');assert.ok(rows.slice(1).every(r=>r.total===0&&r.refillSold===0&&r.unfunded>0));
// A later decline cannot retroactively cut earlier dividends in that year.
c={...fixture(),initialVti:10000,initialCash:0,monthlyBudget:0,vtiYield:12,dividendTax:0,horizon:1};const months=Array.from({length:12},(_,i)=>({vtiReturn:i===11?-.4:0,schdReturn:0}));rows=simulateMonthly(c,[{vtiReturn:-.4,schdReturn:0,months}],'none');near(rows[1].netDividend,1200);
// Monthly paths are reproducible and preserve retirement-only accumulation.
c={...base(),stressScope:'retirement'};const a=monthlyMarketPath(c,stressRandom(42)),b=monthlyMarketPath(c,stressRandom(42));assert.equal(JSON.stringify(a),JSON.stringify(b));near(simulateMonthly(c,a)[c.retireYears].total,simulate(c)[c.retireYears].total);assert.ok(a.every(p=>p.months.length===12));
 const old={...base(),allocations:Array(30).fill(70),safeAllocations:Array(30).fill(null)};delete old.extraAssets;const migrated=normalizeConfig(old);assert.equal(migrated.allocations.length,90);assert.equal(migrated.allocations[80],70);assert.equal(migrated.extraAssets[80],0);assert.ok(validateConfig({...base(),allocations:[]}));assert.ok(validateConfig({...base(),extraAssets:Array(90).fill(-1)}));assert.ok(validateConfig({...base(),stressBufferFloor:4,stressBufferYears:3}));
 c={...fixture(),initialVti:10000,inflation:3};rows=simulateMonthly(c,[],'conditional');for(const r of rows.slice(1)){near(r.realIncome/12,10);near(r.realBudget/12,10);}
(async()=>{
 const app=boot(new Map(),{timers:fn=>setImmediate(fn)}),n=app.nodes,cells=Array.from({length:8},()=>({}));
 const edit=(year,kind,value)=>n.allocationRows.trigger('input',{target:{matches:()=>true,dataset:{year:String(year),kind},value:String(value),closest:()=>({querySelectorAll:()=>cells})}});
 await edit(9,'extra',10000);await edit(9,'safe',100);assert.equal(app.api.getConfig().extraAssets[9],10000);assert.ok(cells[7].innerHTML.includes('11,200'));
 await edit(35,'extra',3000);assert.equal(app.api.getConfig().extraAssets[35],3000);assert.ok(n.allocationRows.innerHTML.includes('2062년'));
 n.stressCount.value='100';await n.stressCount.trigger('input');await n.runStress.click();assert.equal(Object.keys(app.api.getStress().strategies).length,3);assert.ok(n.bufferStrategyRows.innerHTML.includes('회복 조건부'));assert.ok(n.bufferCashChart.innerHTML.includes('<path'));assert.ok(!n.bufferCashChart.innerHTML.includes('NaN'));assert.ok(n.stressTraceRows.innerHTML.includes('년차'));assert.ok(n.bufferTraceNote.textContent.includes('개월'));
 const compared=app.api.getStress().strategies;assert.equal(compared.none.count,100);assert.equal(compared.annual.count,100);assert.equal(compared.conditional.count,100);
 await n.exportStress.click();const csv=app.state.downloads.at(-1).text;assert.ok(csv.includes('보충매도_만원'));assert.ok(csv.includes('연말추가자산_만원'));assert.ok(csv.trim().split(/\r?\n/).every(line=>line.split(',').length===csv.trim().split(/\r?\n/)[0].split(',').length));
 n.historyName.value='퇴직금과 보충 전략';await n.historyForm.trigger('submit');await edit(35,'extra',0);await n.historyList.children[0].children[1].children[0].click();assert.equal(app.api.getConfig().extraAssets[35],3000);assert.equal(app.api.getConfig().safeAllocations[9],100);const reload=boot(app.storage);assert.equal(reload.api.getConfig().extraAssets[35],3000);assert.equal(reload.api.getConfig().stressBufferPolicy,'conditional');
 console.log('PASS: monthly funding; same-path three-policy comparisons; target/floor and recovery gates; refill conservation and no double counting; no future dividend knowledge; interim insolvency; receipt timing and allocation; VTI-first; 90-year legacy migration; receipt inputs and records; cash chart and CSV (engine + isolated DOM).');
})().catch(err=>{console.error(err);process.exitCode=1;});
