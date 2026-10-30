const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{boot}=require('./test-records.cjs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../dist/index.html'),'utf8'),sandbox={};vm.createContext(sandbox);vm.runInContext(html.match(/<script id="calculation-engine">([\s\S]*?)<\/script>/)[1]+';globalThis.api={DEFAULTS,simulate,validateConfig,monthlyBudgetTotal};',sandbox);
const {DEFAULTS,simulate,validateConfig,monthlyBudgetTotal}=sandbox.api,base=()=>JSON.parse(JSON.stringify(DEFAULTS)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
let c={...base(),retireYears:3,safeSavingPct:20,annualSaving:5000,initialCash:0,initialVti:10000,deployCash:0};c.safeAllocations[1]=40;c.safeAllocations[2]=100;let rows=simulate(c);
near(rows[1].safeContribution,1000);near(rows[2].safeContribution,2000);near(rows[2].vtiContribution,2400);near(rows[2].schdContribution,600);near(rows[3].safeContribution,5000);near(rows[3].vtiContribution,0);near(rows[3].schdContribution,0);
rows.slice(1,4).forEach(r=>near(r.saving,r.safeContribution+r.vtiContribution+r.schdContribution));
// Increasing safe contributions does not sell the existing VTI position.
assert.ok(rows[3].vti>rows[2].vti);near(simulate({...c,safeSavingPct:0})[2].safeContribution,2000);near(simulate({...c,safeSavingPct:0})[1].safeContribution,0);
const legacy={...base(),safeSavingPct:35};delete legacy.safeAllocations;near(simulate(legacy)[1].safeContribution,420);
for(const invalid of [[-1,...Array(29).fill(null)],[101,...Array(29).fill(null)],[NaN,...Array(29).fill(null)],[]])assert.ok(validateConfig({...base(),safeAllocations:invalid}));
near(monthlyBudgetTotal([{amount:30,frequency:'monthly'},{amount:120,frequency:'annual'}]),40);
(async()=>{
 const app=boot(new Map(),{timers:fn=>setImmediate(fn)}),n=app.nodes;
 // Delegate the annual safe allocation input with minimal row cells.
 const cells=Array.from({length:8},()=>({}));const target={matches:s=>s==='[data-year]',dataset:{year:'8',kind:'safe'},value:'60',closest:()=>({querySelectorAll:()=>cells})};await n.allocationRows.trigger('input',{target});assert.equal(app.api.getConfig().safeAllocations[8],60);assert.equal(cells[6].textContent,'32.0 / 8.0 / 60.0');assert.ok(cells[7].innerHTML.includes('720'));assert.ok(cells[7].innerHTML.includes('#9aafa3'));
 n.safeSavingPct.value='10';await n.safeSavingPct.trigger('input');assert.equal(app.api.getConfig().safeAllocations[8],60);
 target.value='';await n.allocationRows.trigger('input',{target});assert.equal(app.api.getConfig().safeAllocations[8],null);assert.equal(cells[6].textContent,'72.0 / 18.0 / 10.0');
 n.bulkRatio.value='70';n.bulkSafeRatio.value='40';await n.applyRatio.click();assert.ok(app.api.getConfig().safeAllocations.every(v=>v===40));assert.ok(app.api.getConfig().allocations.every(v=>v===70));
 assert.ok(n.activeVtiRates.textContent.includes('3.0%'));n.vtiPriceGrowth.value='5.5';await n.vtiPriceGrowth.trigger('input');assert.ok(n.activeVtiRates.textContent.includes('+5.5%/년'));assert.ok(n.activeVtiRates.textContent.includes('1.05%'));assert.ok(n.activeSchdRates.textContent.includes('3.24%'));
 const previous=app.api.getConfig().monthlyBudget;await n.addManagementFee.click();assert.equal(app.api.getConfig().budgetItems.length,1);near(app.api.getConfig().monthlyBudget,previous);assert.ok(n.budgetMonthlyTotal.textContent.includes('0.0'));await n.addManagementFee.click();assert.equal(app.api.getConfig().budgetItems.length,1);
 await n.budgetItemsList.trigger('input',{target:{dataset:{budgetIndex:'0',budgetKey:'amount'},value:'20'}});
 await n.addBudgetItem.click();
 const input=(key,value)=>n.budgetItemsList.trigger('input',{target:{dataset:{budgetIndex:'1',budgetKey:key},value}});
 await input('name','보험·세금');await input('frequency','annual');await input('amount','120');assert.ok(n.budgetMonthlyTotal.textContent.includes('30.0'));near(app.api.getConfig().monthlyBudget,previous);
 await n.applyBudgetTotal.click();near(app.api.getConfig().monthlyBudget,30);assert.ok(n.budgetItemsNote.textContent.includes('같습니다'));
 n.stressCount.value='100';await n.stressCount.trigger('input');await n.runStress.click();assert.equal(n.stressResults.classList.contains('hidden'),false);
 await input('name','연간 보험료');assert.equal(n.stressResults.classList.contains('hidden'),false);await input('amount','240');assert.equal(n.stressResults.classList.contains('hidden'),false);await n.applyBudgetTotal.click();near(app.api.getConfig().monthlyBudget,40);assert.equal(n.stressResults.classList.contains('hidden'),true);
 n.historyName.value='은퇴 전 안전자산 + 생활비';await n.historyForm.trigger('submit');const saved=app.api.getRecords()[0].config;assert.equal(saved.safeAllocations[8],40);assert.equal(saved.budgetItems[1].amount,240);
 n.bulkSafeRatio.value='0';await n.applyRatio.click();await n.budgetItemsList.trigger('click',{target:{dataset:{budgetRemove:'0'}}});assert.equal(app.api.getConfig().budgetItems.length,1);
 await n.historyList.children[0].children[1].children[0].click();assert.equal(app.api.getConfig().safeAllocations[8],40);assert.equal(app.api.getConfig().budgetItems.length,2);near(app.api.getConfig().monthlyBudget,40);
 const reload=boot(app.storage);assert.equal(reload.api.getConfig().safeAllocations[8],40);assert.equal(reload.api.getConfig().budgetItems[1].name,'연간 보험료');
 await n.downloadConfig.click();const json=JSON.parse(app.state.downloads.at(-1).text);assert.equal(json.safeAllocations[8],40);assert.equal(json.budgetItems[0].amount,20);
 const old={...saved,safeSavingPct:15};delete old.safeAllocations;delete old.budgetItems;await n.configFile.trigger('change',{target:{files:[{name:'old.json',text:async()=>JSON.stringify(old)}],value:'file'}});assert.equal(app.api.getConfig().safeAllocations[8],null);assert.equal(app.api.getConfig().budgetItems.length,0);assert.equal(app.api.getConfig().safeSavingPct,15);
 console.log('PASS: annual safe contributions and stock splits; no existing-position sales; 0/100% and default fallback; input, bulk, saving and legacy migration; monthly/annual living costs and explicit application; rate labels; stress integration and invalidation; JSON and records (engine + isolated DOM).');
})().catch(err=>{console.error(err);process.exitCode=1;});
