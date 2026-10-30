const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../dist/index.html'),'utf8');
const engine=html.match(/<script id="calculation-engine">([\s\S]*?)<\/script>/)[1];
const sandbox={};vm.createContext(sandbox);vm.runInContext(engine+';globalThis.api={DEFAULTS,simulate,validateConfig,stressRandom,randomMarketPath,stressConfig,crashMarketPath,stressPathSummary,createStressAccumulator,addStressPath,finishStress};',sandbox);
const {DEFAULTS,simulate,validateConfig,stressRandom,randomMarketPath,stressConfig,crashMarketPath,stressPathSummary,createStressAccumulator,addStressPath,finishStress}=sandbox.api;
const base=()=>JSON.parse(JSON.stringify(DEFAULTS)),near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps*Math.max(1,Math.abs(a)),`${a} != ${b}`);
let c={...base(),stressVtiVol:0,stressSchdVol:0,stressDividendCut:0};
const flat=simulate(c),zero=simulate(c,randomMarketPath(c,stressRandom(c.stressSeed)));
flat.forEach((r,i)=>{for(const key of ['total','income','netDividend','stockSold','cash'])near(r[key],zero[i][key]);});
const a=randomMarketPath(base(),stressRandom(42)),b=randomMarketPath(base(),stressRandom(42)),d=randomMarketPath(base(),stressRandom(43));assert.equal(JSON.stringify(a),JSON.stringify(b));assert.notEqual(JSON.stringify(a),JSON.stringify(d));
c={...base(),stressScope:'retirement'};const path=randomMarketPath(c,stressRandom(42));assert.ok(path.slice(0,c.retireYears).every(x=>Object.keys(x).length===0));near(simulate(c,path)[c.retireYears].total,simulate(c)[c.retireYears].total);
// A return sequence with the same compounded market performance hurts more when losses come first.
c={...base(),initialVti:10000,initialSchd:0,initialCash:0,deployCash:0,retireYears:0,horizon:3,vtiYield:0,schdYield:0,cashYield:0,inflation:0,withdrawMode:'budget',monthlyBudget:100,stressDividendCut:0};
const early=[-.4,.25,.2].map(v=>({vtiReturn:v,schdReturn:v})),late=[.2,.25,-.4].map(v=>({vtiReturn:v,schdReturn:v}));
near(simulate(c,early)[3].total,4560);near(simulate(c,late)[3].total,6180);
near(simulate({...c,monthlyBudget:0},early)[3].total,9000);near(simulate({...c,monthlyBudget:0},late)[3].total,9000);
// Dividend cuts affect this year's payment and the future per-share dividend level.
c={...c,withdrawMode:'extra',annualWithdrawal:0,vtiYield:1.05,vtiDividendGrowth:3};const cuts=simulate(c,[{vtiDividendFactor:.9}]);near(cuts[1].netDividend,10000*.0105*.9*.85);near(cuts[2].netDividend,cuts[1].netDividend*1.03);
// Identical shocks preserve the same terminal value without income, contributions or withdrawals.
c={...c,vtiYield:0,stressReturnMode:'free',stressCrash:35,stressCrashDuration:2,horizon:10};const crashEarly=crashMarketPath(c),crashLate=crashMarketPath(c,true);near(simulate(c,crashEarly)[10].total,simulate(c,crashLate)[10].total);assert.equal(crashEarly.filter(p=>p.vtiReturn===-.35).length,2);assert.equal(crashLate.filter(p=>p.vtiReturn===-.35).length,2);
const short={...c,horizon:1};assert.equal(crashMarketPath(short).length,1);assert.equal(crashMarketPath(short)[0].vtiReturn,-.35);
c={...base(),initialVti:100,initialSchd:0,initialCash:100,deployCash:0,retireYears:0,horizon:2,vtiYield:0,schdYield:0,cashYield:0,vtiPriceGrowth:0,schdPriceGrowth:0,inflation:0,monthlyBudget:100,annualWithdrawal:500,withdrawMode:'extra',withdrawSource:'vtiFirst'};
let rows=simulate(c),s=stressPathSummary(rows,c);assert.ok(s.firstGap);assert.ok(s.firstUnfunded);assert.equal(s.firstEmpty,undefined);near(rows[1].cash,100);near(rows[1].unfunded,400);
rows=simulate({...c,withdrawSource:'cashFirst'});s=stressPathSummary(rows,c);assert.ok(s.firstEmpty);near(rows[1].total,0);near(rows[2].total,0);near(rows[2].income,0);
assert.equal(stressConfig({...c,stressSpending:'budget'}).withdrawMode,'budget');assert.equal(stressConfig({...c,stressSpending:'plan'}).withdrawMode,'extra');
// Perfect positive / negative correlation operates on standardized log returns.
for(const rho of [100,-100]){
 c={...base(),stressCorr:rho};const p=randomMarketPath(c,stressRandom(42));p.forEach(r=>{const zV=(Math.log1p(r.vtiReturn)-Math.log1p(c.vtiPriceGrowth/100))/(c.stressVtiVol/100),zS=(Math.log1p(r.schdReturn)-Math.log1p(c.schdPriceGrowth/100))/(c.stressSchdVol/100);near(zV,zS*(rho/100));});
}
c={...base(),stressCount:1000,horizon:60};let random=stressRandom(c.stressSeed),acc=createStressAccumulator(c);const t=Date.now();
for(let i=0;i<c.stressCount;i++){rows=simulate(stressConfig(c),randomMarketPath(c,random));assert.ok(rows.every(r=>r.total>=0&&Number.isFinite(r.total)&&r.income>=0&&r.vti>=0&&r.schd>=0&&r.cash>=0));addStressPath(acc,rows,c);}
const result=finishStress(acc,c);assert.equal(result.count,1000);assert.equal(result.bands.length,71);assert.ok(result.supported>=0&&result.supported<=1000);assert.ok(result.bands.every(r=>r.p10<=r.p50&&r.p50<=r.p90));assert.ok(result.worst===undefined);assert.equal(result.cases.worst.rows.length,71);assert.ok(result.unfunded>=1000-result.supported); // budget mode: a material shortfall entails unfunded withdrawal
for(const patch of [{stressCount:99},{stressSeed:0},{stressVtiVol:NaN},{stressCorr:101},{stressCrashDuration:1.5},{stressSpending:'wrong'}])assert.ok(validateConfig({...base(),...patch}));
assert.throws(()=>simulate(base(),[{vtiReturn:-1}]));assert.throws(()=>simulate(base(),[{vtiDividendFactor:-.1}]));
console.log(`PASS: zero-volatility equivalence; reproducible paths; retirement-only scope; withdrawal sequence effects; dividend cut persistence; matched crash sequences; no negative assets; distinct cash-access and living-cost failures; spending modes; correlated shocks; 1,000 x 70-year paths and quantiles (${Date.now()-t}ms); validation.`);
