// Isolated DOM integration; native browser visual QA is not performed.
const assert=require('node:assert/strict'),{boot}=require('./test-records.cjs');
(async()=>{
 const app=boot(new Map()),n=app.nodes,input=async(id,value)=>{n[id].value=String(value);await n[id].trigger('input');},toggle=async checked=>{n.finalSavingSafeOnly.checked=checked;await n.finalSavingSafeOnly.trigger('input');};
 for(const [id,value] of Object.entries({retireYears:2,horizon:3,annualSaving:100,monthlyBudget:0,severanceAmount:1000,cashYield:0,vtiPriceGrowth:0,schdPriceGrowth:0,vtiYield:0,schdYield:0}))await input(id,value);
 const cells=Array.from({length:11},()=>({}));await n.allocationRows.trigger('input',{target:{matches:()=>true,dataset:{year:'1',kind:'safe'},value:'40',closest:()=>({querySelectorAll:()=>cells})}});
 await toggle(true);assert.equal(app.api.getConfig().safeAllocations[1],40);assert.ok(n.allocationRows.innerHTML.includes('value="100" disabled'));assert.ok(n.allocationRows.innerHTML.includes('안전자산 100% 옵션'));assert.ok(n.finalSavingSafeNote.textContent.includes('2028년'));
 const r=n.assetChart._chartData.rows[2];assert.equal(r.safeContribution,100);assert.equal(r.cash,1120);assert.ok(n.severanceNote.textContent.includes('안전자산 100.0% (1,000만원)'));
 await input('retireYears',3);assert.equal(app.api.getConfig().safeAllocations[1],40);assert.equal(n.assetChart._chartData.rows[2].safeContribution,40);assert.equal(n.assetChart._chartData.rows[3].safeContribution,100);assert.ok(n.finalSavingSafeNote.textContent.includes('2029년'));
 await input('retireYears',2);await toggle(false);assert.ok(!n.allocationRows.innerHTML.includes('value="100" disabled'));assert.equal(n.assetChart._chartData.rows[2].safeContribution,40);assert.equal(n.assetChart._chartData.rows[2].cash,460);
 await toggle(true);await input('severanceAllocation','custom');await input('severanceVtiPct',80);await input('severanceSafePct',20);assert.ok(n.severanceNote.textContent.includes('VTI 80.0%'));assert.equal(n.assetChart._chartData.rows[2].cash,320);
 n.historyName.value='가상 마지막 해 현금 계획';await n.historyForm.trigger('submit');await toggle(false);await n.historyList.children[0].children[1].children[0].click();assert.equal(app.api.getConfig().finalSavingSafeOnly,true);assert.equal(n.finalSavingSafeOnly.checked,true);assert.equal(app.api.getConfig().safeAllocations[1],40);
 const reloaded=boot(app.storage);assert.equal(reloaded.api.getConfig().finalSavingSafeOnly,true);await n.downloadConfig.click();const json=JSON.parse(app.state.downloads.at(-1).text);assert.equal(json.finalSavingSafeOnly,true);
 await input('retireYears',0);assert.ok(n.finalSavingSafeNote.textContent.includes('즉시 은퇴'));assert.ok(!n.allocationRows.innerHTML.includes('안전자산 100% 옵션'));
 await input('retireYears',1);await input('severanceAllocation','annual');await input('severanceTiming','year');await input('severanceYear',2026);assert.ok(n.severanceNote.textContent.includes('안전자산 20.0%'));
 delete json.finalSavingSafeOnly;await n.configFile.trigger('change',{target:{files:[{name:'fictional-old.json',text:async()=>JSON.stringify(json)}],value:'file'}});assert.equal(app.api.getConfig().finalSavingSafeOnly,false);assert.equal(n.finalSavingSafeOnly.checked,false);assert.equal(n.errorBox.textContent,'');
 console.log('PASS: final saving year cash-only override, retirement-year moves, original allocation preservation, custom and initial severance, records/JSON and legacy defaults (isolated DOM).');
})().catch(e=>{console.error(e);process.exitCode=1;});
