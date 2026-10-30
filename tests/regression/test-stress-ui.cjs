// Isolated DOM/storage logic integration, not native-browser visual QA.
const assert=require('node:assert/strict'),{boot}=require('./test-records.cjs');
(async()=>{
 const app=boot(new Map(),{timers:fn=>setImmediate(fn)}),n=app.nodes;
 n.initialVti.value='20000';await n.initialVti.trigger('input');n.monthlyBudget.value='50';await n.monthlyBudget.trigger('input');
 n.stressCount.value='100';await n.stressCount.trigger('input');
 assert.equal(n.stressResults.classList.contains('hidden'),true);
 await n.runStress.click();
 assert.equal(app.api.isRunning(),false);assert.equal(app.api.getStress().count,100);assert.equal(n.stressResults.classList.contains('hidden'),false);assert.equal(n.runStress.disabled,false);assert.equal(n.exportStress.disabled,false);assert.ok(n.stressChart.innerHTML.includes('<path'));assert.ok(!n.stressChart.innerHTML.includes('NaN'));assert.ok(n.stressCases.innerHTML.includes('은퇴 초반 급락'));assert.ok(n.stressTraceRows.innerHTML.includes('년차'));
 assert.ok(n.stressMarketChart.innerHTML.includes('<path'));assert.ok(!n.stressMarketChart.innerHTML.includes('NaN'));assert.ok(n.stressMarketNote.textContent.includes('최종 주가 연복리'));assert.ok(n.stressBasis.textContent.includes('무작위 예시 경로'));
 const before=JSON.stringify(app.api.getStress().bands);await n.runStress.click();assert.equal(JSON.stringify(app.api.getStress().bands),before);
 const currentValue=n.stressMedian.innerHTML;n.realTerms.checked=true;await n.realTerms.trigger('input');assert.equal(n.stressResults.classList.contains('hidden'),false);assert.notEqual(n.stressMedian.innerHTML,currentValue);
 n.stressTrace.value='late';await n.stressTrace.trigger('change');assert.ok(n.stressBasis.textContent.includes('후반 급락'));assert.ok(n.stressTraceRows.innerHTML.includes('년차'));
 await n.exportStress.click();const csv=app.state.downloads[0].text.trim().split(/\r?\n/);assert.equal(csv.length,app.api.getConfig().horizon+1);assert.ok(csv[0].includes('현재가치'));assert.ok(csv[0].includes('초과안전자산재투자'));assert.ok(csv[1].includes('은퇴 후반 급락'));assert.ok(csv.every(line=>line.split(',').length===csv[0].split(',').length));
 n.stressVtiVol.value='25';await n.stressVtiVol.trigger('input');assert.equal(n.stressResults.classList.contains('hidden'),true);assert.equal(n.exportStress.disabled,true);assert.ok(n.stressStatus.textContent.includes('설정이 바뀌었습니다'));
 await n.rerollStress.click();assert.equal(app.api.getConfig().stressSeed,43);assert.notEqual(JSON.stringify(app.api.getStress().bands),before);
 n.historyName.value='시장 변동 테스트';await n.historyForm.trigger('submit');const saved=app.api.getRecords()[0].config;assert.equal(saved.stressVtiVol,25);assert.equal(saved.stressSeed,43);assert.equal(saved.stressCount,100);
 n.stressScope.value='retirement';await n.stressScope.trigger('input');await n.historyList.children[0].children[1].children[0].click();assert.equal(app.api.getConfig().stressScope,'all');assert.equal(n.stressVtiVol.value,25);
 const reloaded=boot(app.storage,{timers:fn=>setImmediate(fn)});assert.equal(reloaded.api.getConfig().stressSeed,43);assert.equal(reloaded.api.getConfig().stressVtiVol,25);assert.equal(reloaded.api.getStress(),null);
 n.stressReturnMode.value='free';await n.stressReturnMode.trigger('input');n.stressCashCap.checked=false;await n.stressCashCap.trigger('input');assert.equal(n.stressResults.classList.contains('hidden'),true);n.historyName.value='자유 경로 설정';await n.historyForm.trigger('submit');const newReload=boot(app.storage);assert.equal(newReload.api.getConfig().stressReturnMode,'free');assert.equal(newReload.api.getConfig().stressCashCap,false);
 const legacy={...saved};for(const key of Object.keys(legacy))if(key.startsWith('stress'))delete legacy[key];
 const legacyStorage=new Map([['retirement-planner-local-v1',JSON.stringify(legacy)],['retirement-planner-records-v1',JSON.stringify([{id:'old',name:'예전 기록',savedAt:'2026-10-30T00:00:00Z',config:legacy}])]]),old=boot(legacyStorage);assert.equal(old.api.getConfig().annualSaving,legacy.annualSaving);assert.equal(old.api.getConfig().stressVtiVol,18);assert.equal(old.api.getRecords().length,1);assert.equal(old.api.getRecords()[0].config.stressCount,1000);assert.equal(old.api.getHistoryError(),'');
 // Editing inputs while a batch is yielded cancels it; stale results cannot overwrite the new plan.
 const pending=n.runStress.click();assert.equal(app.api.isRunning(),true);n.monthlyBudget.value='999';await n.monthlyBudget.trigger('input');await pending;assert.equal(app.api.isRunning(),false);assert.equal(n.runStress.disabled,false);assert.equal(n.stressResults.classList.contains('hidden'),true);assert.notEqual(app.api.getStress().config.monthlyBudget,999);
 n.stressCorr.value='101';await n.stressCorr.trigger('input');await n.runStress.click();assert.equal(n.stressResults.classList.contains('hidden'),true);assert.ok(n.errorBox.textContent);
 console.log('PASS: simulation event flow and progress; seeded repeatability; real-value display; scenario selection; CSV; invalidation and cancellation; full stress settings saved/restored; reload and invalid inputs (isolated DOM integration).');
})().catch(err=>{console.error(err);process.exitCode=1;});
