const assert=require('node:assert/strict'),{boot}=require('./test-records.cjs');
(async()=>{
 const app=boot(),n=app.nodes,input=async(id,value)=>{n[id].value=String(value);await n[id].trigger('input');};
 for(const [id,value] of Object.entries({initialVti:1000,initialSchd:500,annualSaving:0,retireYears:1,horizon:2,inflation:10,monthlyBudget:0,cashYield:0,vtiPriceGrowth:0,schdPriceGrowth:0,vtiYield:4,schdYield:6,vtiDividendGrowth:0,schdDividendGrowth:0}))await input(id,value);
 const cells=k=>[...n.projectionRows.innerHTML.matchAll(new RegExp('<td data-projection-fund="'+k+'">([\\s\\S]*?)</td>','g'))].map(m=>m[1]);
 assert.ok(!n.projectionHeaders.innerHTML.includes('기말 AOR'));assert.ok(!n.projectionHeaders.innerHTML.includes('기말 AOA'));assert.ok(cells('vti')[0].includes('배당 —'));assert.ok(cells('vti')[1].includes('배당 34.0만원'));assert.ok(cells('vti')[1].includes('1,034'));assert.ok(cells('vti')[1].indexOf('fund-dividend')>cells('vti')[1].indexOf('fund-end-value'));assert.ok(cells('schd')[1].includes('배당 25.5만원'));
 n.realTerms.checked=true;await n.realTerms.trigger('input');assert.ok(cells('vti')[1].includes('배당 30.9만원'));
 const usage=k=>n.fundUsageList.children.find(row=>row.children[1].getAttribute('data-usage-id')===k).children[1];await usage('aoa').click();assert.ok(n.projectionHeaders.innerHTML.includes('기말 AOA'));assert.ok(cells('aoa')[1].includes('배당 0.0만원'));await usage('aoa').click();assert.ok(!n.projectionHeaders.innerHTML.includes('기말 AOA'));
 n.newFundName.value='가상 배당 내역';await n.addFund.click();const f=app.api.getConfig().customFunds[0];const find=(node,key)=>{if(node.getAttribute?.('data-fund-key')===key&&node.getAttribute('data-fund-id')===f.id)return node;for(const c of node.children||[]){const x=find(c,key);if(x)return x;}};
 for(const [key,value] of Object.entries({initial:400,yield:5,tax:10,priceGrowth:0,dividendGrowth:0})){const field=find(n.customFundList,key);field.value=String(value);await field.trigger('input');}
 assert.ok(cells(f.id)[1].includes('배당 16.4만원'));await usage(f.id).click();assert.ok(n.projectionHeaders.innerHTML.includes(f.name)); // cannot hide a held asset
 await n.exportCsv.click();const csv=app.state.downloads.at(-1).text.trim().split(/\r?\n/).map(line=>line.replace(/^\uFEFF/,'').split(','));assert.ok(csv.every(row=>row.length===csv[0].length));assert.equal(Number(csv[2][csv[0].indexOf('VTI세후배당_만원')]),30.91);assert.equal(Number(csv[2][csv[0].indexOf(f.name+'세후배당_만원')]),16.36);
 console.log('PASS: active-only projection columns, per-fund annual after-tax dividends below balances, accumulation reinvestment, real values, zero allocations and CSV breakouts (isolated DOM).');
})().catch(error=>{console.error(error);process.exitCode=1;});
