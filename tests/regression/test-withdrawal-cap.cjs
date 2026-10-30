// Synthetic settings with isolated DOM; not native-browser visual QA.
const assert=require('node:assert/strict'),{boot}=require('./test-records.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
(async()=>{
 const app=boot(new Map(),{timers:fn=>setImmediate(fn)}),n=app.nodes;
 const input=async(id,value)=>{n[id].value=String(value);await n[id].trigger('input');};
 for(const [id,value] of Object.entries({initialVti:10000,initialSchd:0,initialCash:0,annualSaving:0,retireYears:0,horizon:3,inflation:0,vtiPriceGrowth:0,schdPriceGrowth:0,vtiYield:0,schdYield:0,cashYield:0,monthlyBudget:100,stressVtiVol:0,stressSchdVol:0,stressCount:100}))await input(id,value);
 assert.equal(n.stressMaxWithdrawalRate.disabled,true);n.stressWithdrawalCap.checked=true;await n.stressWithdrawalCap.trigger('input');assert.equal(n.stressMaxWithdrawalRate.disabled,false);
 await n.runStress.click();assert.equal(n.stressResults.classList.contains('hidden'),false);
 let row=app.api.getStress().cases.sample.rows[1];near(row.income,500);near(row.workNeeded,700);near(row.spendingRate,5);near(row.unfunded,0);near(row.total,9500);
 assert.ok(n.workNeedNote.textContent.includes('5.0%'));assert.ok(n.workNeedNote.textContent.includes('추가 근로 필요 연도 3년'));assert.ok(n.stressTraceRows.innerHTML.includes('class="work-required"'));assert.ok(n.stressTraceRows.innerHTML.includes('추가 근로 필요 · 12개월'));
 for(const id of ['stressChart','stressMarketChart','bufferCashChart'])assert.ok(n[id].innerHTML.includes('class="chart-work-period"'));
 n.stressChart.getBoundingClientRect=()=>({left:0,top:0,width:900,height:280});await n.stressChart.trigger('keydown',{key:'Home'});await n.stressChart.trigger('keydown',{key:'ArrowRight'});assert.ok(n.chartTooltip.textContent.includes('추가 근로 필요'));assert.ok(n.chartTooltip.textContent.includes('58.33 만원/월'));
 await n.exportStress.click();const csv=app.state.downloads.at(-1).text.trim().split(/\r?\n/).map(line=>line.replace(/^\uFEFF/,'').split(','));const rate=csv[0].indexOf('실제인출률_%'),work=csv[0].indexOf('추가근로필요액_현재가치_만원'),cap=csv[0].indexOf('연간생활비사용상한_만원');near(Number(csv[1][rate]),5);near(Number(csv[1][work]),700);near(Number(csv[1][cap]),500);assert.ok(csv.every(r=>r.length===csv[0].length));
 n.historyName.value='가상 5% 상한 계획';await n.historyForm.trigger('submit');const reload=boot(app.storage);assert.equal(reload.api.getConfig().stressWithdrawalCap,true);assert.equal(reload.api.getConfig().stressMaxWithdrawalRate,5);
 n.stressWithdrawalCap.checked=false;await n.stressWithdrawalCap.trigger('input');assert.equal(n.stressMaxWithdrawalRate.disabled,true);assert.equal(n.stressResults.classList.contains('hidden'),true);await n.runStress.click();row=app.api.getStress().cases.sample.rows[1];near(row.income,1200);near(row.workNeeded,0);assert.ok(!n.stressChart.innerHTML.includes('class="chart-work-period"'));assert.ok(n.workNeedNote.textContent.includes('추가 근로 필요 연도 0년'));
 await n.historyList.children[0].children[1].children[0].click();assert.equal(app.api.getConfig().stressWithdrawalCap,true);await input('stressMaxWithdrawalRate',101);assert.ok(n.errorBox.textContent);
 console.log('PASS: inclusive spending cap, separate work gaps, red year regions and rows, tooltip/CSV, saved settings and disabled compatibility (isolated DOM).');
})().catch(err=>{console.error(err);process.exitCode=1;});
