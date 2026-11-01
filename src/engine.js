'use strict';
const DEFAULTS={startYear:2026,birthYear:1990,initialVti:0,initialSchd:0,initialCash:0,deployCash:0,annualSaving:1200,savingGrowthMode:'percent',savingGrowth:0,safeSavingPct:20,retireYears:10,horizon:40,inflation:2,annualWithdrawal:0,inflateWithdrawal:false,withdrawMode:'budget',withdrawSource:'stocks',monthlyBudget:200,vtiPriceGrowth:3,schdPriceGrowth:3,vtiYield:1.05,schdYield:3.24,vtiDividendGrowth:3,schdDividendGrowth:3,cashYield:2.5,dividendTax:15,cashTax:15.4,realTerms:false,allocations:Array(30).fill(80),stressCount:1000,stressSeed:42,stressVtiVol:18,stressSchdVol:16,stressCorr:90,stressDividendCut:25,stressScope:'all',stressSpending:'budget',stressCrash:35,stressCrashDuration:2};
DEFAULTS.safeAllocations=Array(30).fill(null);
DEFAULTS.budgetItems=[];
DEFAULTS.allocations=Array(90).fill(80);
DEFAULTS.safeAllocations=Array(90).fill(null);
DEFAULTS.extraAssets=Array(90).fill(0);
Object.assign(DEFAULTS,{severanceAmount:0,severanceTiming:'retirement',severanceYear:2026});
Object.assign(DEFAULTS,{severanceAllocation:'annual',severanceSafePct:20,severanceVtiPct:64});
const ETF_KEYS=['vti','schd','aor','aoa'];
const ETF_CAPS={vti:'Vti',schd:'Schd',aor:'Aor',aoa:'Aoa'};
Object.assign(DEFAULTS,{initialAor:0,initialAoa:0,aorPriceGrowth:3,aoaPriceGrowth:3,aorYield:2.58,aoaYield:2.12,aorDividendGrowth:3,aoaDividendGrowth:3,stressAorVol:12,stressAoaVol:15,stressAorCrash:25,stressAoaCrash:30,severanceAorPct:0,severanceAoaPct:0,aorAllocations:Array(90).fill(0),aoaAllocations:Array(90).fill(0)});
Object.assign(DEFAULTS,{stressWithdrawalCap:false,stressMaxWithdrawalRate:5});
Object.assign(DEFAULTS,{finalSavingSafeOnly:false});
Object.assign(DEFAULTS,{stressBufferPolicy:'conditional',stressBufferYears:3,stressBufferFloor:1,stressRecoveryDrawdown:10,stressStockSale:'proportional',stressReturnMode:'anchored',stressCashCap:true});
// Registered funds use the same engine as the original four ETFs; no product-specific branches.
DEFAULTS.customFunds=[];
DEFAULTS.unusedFunds=['aor','aoa'];
DEFAULTS.startingInputs=[];
function fundKeys(c){return [...ETF_KEYS,...(c.customFunds||[]).map(f=>f.id)];}
function fundName(c,k){return ETF_KEYS.includes(k)?k.toUpperCase():(c.customFunds||[]).find(f=>f.id===k)?.name||k;}
function fundSetting(c,k,kind){
 const f=(c.customFunds||[]).find(f=>f.id===k);
 if(f)return f[{Initial:'initial',PriceGrowth:'priceGrowth',Yield:'yield',DividendGrowth:'dividendGrowth',Vol:'vol',Crash:'crash',Tax:'tax'}[kind]];
 if(kind==='Initial')return c['initial'+ETF_CAPS[k]];
 if(kind==='Tax')return c.dividendTax;
 if(kind==='Vol')return c['stress'+ETF_CAPS[k]+'Vol'];
 if(kind==='Crash')return k==='vti'||k==='schd'?c.stressCrash:c['stress'+ETF_CAPS[k]+'Crash'];
 return c[k+kind];
}
function newFund(id,name='새 종목') {return {id,name,initial:0,priceGrowth:3,yield:0,dividendGrowth:0,vol:18,crash:35,tax:15.4,color:'#a15377',allocations:Array(90).fill(0),severancePct:0};}
function marketShock(returns,c){const factor=r=>r<=-.20?Math.max(0,1+r*c.stressDividendCut/100):1;return Object.fromEntries(fundKeys(c).flatMap(k=>[[k+'Return',returns[k]],[k+'DividendFactor',factor(returns[k])]]));}
function fundHasAllocation(c,k){
 if(fundSetting(c,k,'Initial')>0||c.deployCash>0&&etfRatiosFor(c,0)[k]>0)return true;
 if(Array.from({length:90},(_,i)=>etfRatiosFor(c,i)[k]).some(v=>v>0))return true;
 if(c.severanceAllocation==='custom'&&severanceAllocationFor(c,0)[k]>0)return true;
 if(c.startingInputs?.length){const map=Object.fromEntries(c.startingInputs.map(x=>[x.id,x.value]));if(k==='schd'?100-Object.entries(map).filter(([id])=>id!=='safe'&&id!=='total').reduce((sum,[,v])=>sum+v,0)>0:(map[k]??0)>0)return true;}
 return false;
}
function normalizeConfig(incoming){
 const c={...structuredClone(DEFAULTS),...structuredClone(incoming)};
 for(const [key,fallback] of [['allocations',80],['safeAllocations',null],['extraAssets',0],['aorAllocations',0],['aoaAllocations',0]])if(Array.isArray(c[key])&&c[key].length>=30&&c[key].length<=90){const old=c[key];c[key]=Array.from({length:90},(_,i)=>i<old.length?old[i]:(key==='allocations'||key==='aorAllocations'||key==='aoaAllocations')?(old[old.length-1]??fallback):fallback);}
 if(Array.isArray(c.customFunds))for(const f of c.customFunds)if(f&&Array.isArray(f.allocations)&&f.allocations.length>=30&&f.allocations.length<=90)f.allocations=Array.from({length:90},(_,i)=>f.allocations[i]??f.allocations.at(-1));
 if(!validateConfig(c)){const keys=fundKeys(c);c.unusedFunds=incoming.unusedFunds===undefined?keys.filter(k=>!fundHasAllocation(c,k)):c.unusedFunds.filter(k=>!fundHasAllocation(c,k));}
 return c;
}
function contributionFor(c,index){return Math.max(0,c.savingGrowthMode==='fixed'?c.annualSaving+c.savingGrowth*index:c.annualSaving*Math.pow(1+c.savingGrowth/100,index));}
function safePctFor(c,index){return c.safeAllocations?.[index]??c.safeSavingPct;}
function stockPctFor(c,index){return c.allocations[index]??c.allocations[c.allocations.length-1];}
function etfRatiosFor(c,index){
 const vti=stockPctFor(c,index),aor=c.aorAllocations?.[index]??c.aorAllocations?.at(-1)??0,aoa=c.aoaAllocations?.[index]??c.aoaAllocations?.at(-1)??0;
 const custom=Object.fromEntries((c.customFunds||[]).map(f=>[f.id,f.allocations[index]??f.allocations.at(-1)]));
 return {vti,schd:Math.max(0,100-vti-aor-aoa-Object.values(custom).reduce((a,b)=>a+b,0)),aor,aoa,...custom};
}
function finalSavingSafeFor(c,index){return c.finalSavingSafeOnly===true&&c.retireYears>0&&index===c.retireYears-1;}
function allocationFor(c,index,applyFinalYear=true){const safe=applyFinalYear&&finalSavingSafeFor(c,index)?100:safePctFor(c,index),ratios=etfRatiosFor(c,index);return {safe,...Object.fromEntries(fundKeys(c).map(k=>[k,(100-safe)*ratios[k]/100]))};}
function severanceYearFor(c){return c.severanceTiming==='retirement'?c.startYear+c.retireYears:c.severanceYear;}
function severanceFor(c,elapsed){return c.startYear+elapsed===severanceYearFor(c)?c.severanceAmount:0;}
function extraAssetFor(c,elapsed){return (elapsed>0?(c.extraAssets?.[elapsed-1]??0):0)+severanceFor(c,elapsed);}
function severanceAllocationFor(c,index,applyFinalYear=true){
 if(c.severanceAllocation!=='custom')return allocationFor(c,index,applyFinalYear);
 const safe=c.severanceSafePct,vti=c.severanceVtiPct,aor=c.severanceAorPct,aoa=c.severanceAoaPct;
 const custom=Object.fromEntries((c.customFunds||[]).map(f=>[f.id,f.severancePct]));
 return {safe,vti,aor,aoa,...custom,schd:Math.max(0,100-safe-vti-aor-aoa-Object.values(custom).reduce((a,b)=>a+b,0))};
}
function receiptAllocationFor(c,elapsed){
 const index=Math.max(0,elapsed-1),other=elapsed>0?(c.extraAssets?.[index]??0):0,severance=severanceFor(c,elapsed),ratio=severanceAllocationFor(c,index,elapsed>0),annual=allocationFor(c,index);
 return Object.fromEntries(['safe',...fundKeys(c)].map(k=>[k,other*annual[k]/100+severance*ratio[k]/100]));
}
function etfTotal(values,keys=ETF_KEYS){return keys.reduce((sum,k)=>sum+values[k],0);}
function etfValues(shares,prices){return Object.fromEntries(Object.keys(shares).map(k=>[k,shares[k]*prices[k]]));}
function sellEtfs(shares,prices,needed,mode){
 const keys=Object.keys(shares);
 if(mode==='vtiFirst'){let sold=0;for(const k of keys){const value=Math.min(shares[k]*prices[k],Math.max(0,needed-sold));shares[k]=Math.max(0,shares[k]-value/prices[k]);sold+=value;}return sold;}
 const total=etfTotal(etfValues(shares,prices),keys),sold=Math.min(total,needed),keep=total>0?Math.max(0,1-sold/total):1;for(const k of keys)shares[k]*=keep;return sold;
}
function monthlyBudgetTotal(items){return items.reduce((sum,item)=>sum+item.amount/(item.frequency==='annual'?12:1),0);}
function validateConfig(c){
 const funds=c.customFunds===undefined?[]:c.customFunds;
 if(!Array.isArray(funds)||funds.length>12)return '추가 종목은 최대 12개까지 등록할 수 있습니다.';
 const ids=new Set();
 for(const f of funds){
  if(!f||typeof f.id!=='string'||!/^fund_[a-z0-9_]{1,48}$/.test(f.id)||ids.has(f.id))return '추가 종목 ID가 잘못되었거나 중복입니다.';
  ids.add(f.id);
  if(typeof f.name!=='string'||!f.name.trim()||f.name.length>80||typeof f.color!=='string'||!/^#[0-9a-f]{6}$/i.test(f.color))return '종목 이름(1~80자)과 색상을 확인하세요.';
  for(const [key,low,high] of [['initial',0,1000000000],['priceGrowth',-50,50],['yield',0,30],['dividendGrowth',-50,50],['vol',0,60],['crash',0,90],['tax',0,100],['severancePct',0,100]])if(!Number.isFinite(f[key])||f[key]<low||f[key]>high)return '추가 종목의 보유액·수익률·세율·비중 범위를 확인하세요.';
  if(!Array.isArray(f.allocations)||f.allocations.length<30||f.allocations.length>90||f.allocations.some(v=>!Number.isFinite(v)||v<0||v>100))return '추가 종목의 연도별 비율은 0~100%로 입력하세요.';
 }
 const known=fundKeys(c);
 if(!Array.isArray(c.unusedFunds)||c.unusedFunds.length>16||new Set(c.unusedFunds).size!==c.unusedFunds.length||c.unusedFunds.some(k=>!known.includes(k)))return '종목 사용 상태를 확인하세요.';
 const start=c.startingInputs,allowed=['total','safe',...known.filter(k=>k!=='schd')];
 if(!Array.isArray(start)||start.length>18||start.some(x=>!x||!allowed.includes(x.id)||!Number.isFinite(x.value)||x.value<0||x.value>(x.id==='total'?1000000000:100))||new Set(start.map(x=>x.id)).size!==start.length)return '시작 자금 금액·배분 비율을 확인하세요.';
 if(start.length&&(!start.some(x=>x.id==='total')||!start.some(x=>x.id==='safe')||start.filter(x=>x.id!=='total'&&x.id!=='safe').reduce((sum,x)=>sum+x.value,0)>100+1e-8))return '시작 자금은 금액·안전자산 비율을 채우고 SCHD 외 ETF 비율 합계를 100% 이하로 입력하세요.';
 const finiteKeys=['startYear','birthYear','initialVti','initialSchd','initialCash','deployCash','annualSaving','savingGrowth','safeSavingPct','retireYears','horizon','inflation','annualWithdrawal','monthlyBudget','vtiPriceGrowth','schdPriceGrowth','vtiYield','schdYield','vtiDividendGrowth','schdDividendGrowth','cashYield','dividendTax','cashTax'];
 finiteKeys.push('initialAor','initialAoa','aorPriceGrowth','aoaPriceGrowth','aorYield','aoaYield','aorDividendGrowth','aoaDividendGrowth');
 for(const k of finiteKeys)if(!Number.isFinite(c[k]))return '모든 숫자 입력란을 채워 주세요.';
 if(c.initialAor<0||c.initialAoa<0||c.initialVti<0||c.initialSchd<0||c.initialCash<0||c.deployCash<0||c.annualSaving<0||c.annualWithdrawal<0||c.monthlyBudget<0)return '자산·저축액·인출액에는 0 이상의 금액을 입력하세요.';
 if(c.deployCash>c.initialCash)return '처음 투자할 현금이 현재 보유 현금보다 큽니다.';
 if(c.retireYears<0||c.retireYears>30||!Number.isInteger(c.retireYears)||c.horizon<1||c.horizon>60||!Number.isInteger(c.horizon))return '저축 기간은 0~30년, 은퇴 후 기간은 1~60년의 정수로 입력하세요.';
 if(c.startYear<2020||c.startYear>2100||!Number.isInteger(c.startYear)||!Number.isInteger(c.birthYear)||c.birthYear<1900||c.birthYear>c.startYear)return '시작 연도와 출생 연도를 확인하세요.';
 if(c.safeSavingPct<0||c.safeSavingPct>100||c.dividendTax<0||c.dividendTax>100||c.cashTax<0||c.cashTax>100)return '비중과 세율은 0~100% 범위로 입력하세요.';
 if(typeof c.finalSavingSafeOnly!=='boolean')return '마지막 저축 연도 안전자산 옵션을 확인하세요.';
 if(c.inflation < -5 || c.inflation>20)return '물가상승률은 -5~20% 범위로 입력하세요.';
 for(const k of ETF_KEYS.flatMap(k=>[k+'PriceGrowth',k+'DividendGrowth']))if(c[k]<-50||c[k]>50)return '주가·배당 증가율은 -50~50% 범위로 입력하세요.';
 for(const k of [...ETF_KEYS.map(k=>k+'Yield'),'cashYield'])if(c[k]<0||c[k]>30)return '배당·이자율은 0~30% 범위로 입력하세요.';
 if(!['percent','fixed'].includes(c.savingGrowthMode)||!['extra','budget'].includes(c.withdrawMode)||!['stocks','vtiFirst','cashFirst'].includes(c.withdrawSource))return '선택한 계산 방식을 확인하세요.';
 if(c.savingGrowthMode==='percent'&&(c.savingGrowth<-100||c.savingGrowth>100))return '저축액 증가율은 -100~100% 범위로 입력하세요.';
 if(!Array.isArray(c.allocations)||(c.allocations.length<30||c.allocations.length>90)||c.allocations.some(v=>!Number.isFinite(v)||v<0||v>100))return '연도별 VTI 비율은 0~100% 범위로 입력하세요.';
 for(const key of ['aorAllocations','aoaAllocations'])if(!Array.isArray(c[key])||c[key].length<30||c[key].length>90||c[key].some(v=>!Number.isFinite(v)||v<0||v>100))return '연도별 AOR·AOA 비율은 0~100% 범위로 입력하세요.';
 if(Array.from({length:90},(_,i)=>etfRatiosFor(c,i)).some(r=>Object.entries(r).filter(([k])=>k!=='schd').reduce((sum,[,v])=>sum+v,0)>100+1e-8))return 'ETF 내 SCHD 외 모든 종목 비율 합계는 100% 이하로 입력하세요. 나머지는 SCHD입니다.';
 if(c.safeAllocations!==undefined&&(!Array.isArray(c.safeAllocations)||(c.safeAllocations.length<30||c.safeAllocations.length>90)||c.safeAllocations.some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>100))))return '연도별 안전자산 비율은 0~100% 범위로 입력하세요.';
 if(c.budgetItems!==undefined&&(!Array.isArray(c.budgetItems)||c.budgetItems.length>100||c.budgetItems.some(item=>!item||typeof item.name!=='string'||item.name.length>80||!Number.isFinite(item.amount)||item.amount<0||item.amount>100000||!['monthly','annual'].includes(item.frequency))))return '생활비 항목은 100개 이하, 금액은 0~100,000만원 범위로 입력하세요.';
 if(c.extraAssets!==undefined&&(!Array.isArray(c.extraAssets)||(c.extraAssets.length<30||c.extraAssets.length>90)||c.extraAssets.some(v=>!Number.isFinite(v)||v<0||v>10000000)))return '연도별 추가 자산은 0~10,000,000만원 범위로 입력하세요.';
 if(!Number.isFinite(c.severanceAmount)||c.severanceAmount<0||c.severanceAmount>10000000||!['retirement','year'].includes(c.severanceTiming))return '세후 퇴직금은 0~10,000,000만원, 수령 시점은 퇴직 연도 또는 직접 지정으로 입력하세요.';
 if(c.severanceTiming==='year'&&(!Number.isInteger(c.severanceYear)||c.severanceYear<c.startYear||c.severanceYear>c.startYear+c.retireYears+c.horizon))return '퇴직금 수령 연도는 시작 연도부터 계산 마지막 연도 사이의 정수로 입력하세요.';
 if(!['annual','custom'].includes(c.severanceAllocation)||(c.severanceAllocation==='custom'&&(![c.severanceSafePct,c.severanceVtiPct,c.severanceAorPct,c.severanceAoaPct].every(v=>Number.isFinite(v)&&v>=0&&v<=100)||c.severanceSafePct+c.severanceVtiPct+c.severanceAorPct+c.severanceAoaPct+funds.reduce((sum,f)=>sum+f.severancePct,0)>100+1e-8)))return '퇴직금 배분 방식을 확인하세요. SCHD 외 모든 종목·안전자산 비율은 각각 0~100%, 합계는 100% 이하로 입력하세요.';
 return validateStress(c);
}
function validateStress(c){
 const ranges={stressCount:[100,5000],stressSeed:[1,4294967295],stressVtiVol:[0,60],stressSchdVol:[0,60],stressAorVol:[0,60],stressAoaVol:[0,60],stressAorCrash:[0,90],stressAoaCrash:[0,90],stressCorr:[-100,100],stressDividendCut:[0,100],stressCrash:[0,90],stressCrashDuration:[1,60]};
 for(const [key,[low,high]] of Object.entries(ranges)){if(!Number.isFinite(c[key])||c[key]<low||c[key]>high)return '스트레스 테스트의 반복 횟수·변동성·급락 설정 범위를 확인하세요.';}
 if(![c.stressCount,c.stressSeed,c.stressCrashDuration].every(Number.isInteger))return '반복 횟수·난수 번호·급락 기간은 정수로 입력하세요.';
 if(!['all','retirement'].includes(c.stressScope)||!['budget','plan'].includes(c.stressSpending))return '스트레스 테스트의 적용 기간과 생활비 방식을 확인하세요.';
 for(const key of ['stressBufferYears','stressBufferFloor','stressRecoveryDrawdown'])if(!Number.isFinite(c[key]))return '안전자산 보충 설정을 확인하세요.';
 if(c.stressBufferYears<0||c.stressBufferYears>10||c.stressBufferFloor<0||c.stressBufferFloor>c.stressBufferYears||c.stressRecoveryDrawdown<0||c.stressRecoveryDrawdown>100)return '안전자산 목표는 0~10년, 최소 잔액은 목표 이하, 회복 허용 하락률은 0~100%로 입력하세요.';
 if(!['none','annual','conditional'].includes(c.stressBufferPolicy)||!['proportional','vtiFirst'].includes(c.stressStockSale))return '안전자산 보충 전략과 주식 매도 순서를 확인하세요.';
 if(!['anchored','free'].includes(c.stressReturnMode)||typeof c.stressCashCap!=='boolean')return '시장 경로의 최종 수익률 방식과 안전자산 상한 설정을 확인하세요.';
 if(typeof c.stressWithdrawalCap!=='boolean'||!Number.isFinite(c.stressMaxWithdrawalRate)||c.stressMaxWithdrawalRate<0||c.stressMaxWithdrawalRate>100)return '생활비 인출률 상한은 0~100%로 입력하세요.';
 return '';
}
function simulate(c,marketPath=[],endElapsed=c.retireYears+c.horizon){
 const validation=validateConfig(c);if(validation)throw new Error(validation);
 const keys=fundKeys(c);
 const rows=[],ratios=etfRatiosFor(c,0),shares={},prices={},dividends={};let cash=c.initialCash-c.deployCash;
 const initialSeverance=severanceFor(c,0),initialReceipt=receiptAllocationFor(c,0);cash+=initialReceipt.safe;
 for(const k of keys){prices[k]=1;dividends[k]=fundSetting(c,k,'Yield')/100;shares[k]=fundSetting(c,k,'Initial')+c.deployCash*ratios[k]/100+initialReceipt[k];}
 const valuation=elapsed=>{const values=etfValues(shares,prices);return {elapsed,year:c.startYear+elapsed,age:c.startYear+elapsed-c.birthYear,...values,cash,total:etfTotal(values,keys)+cash,deflator:Math.pow(1+c.inflation/100,elapsed)};};
 const zeroContributions=Object.fromEntries(keys.map(k=>[k+'Contribution',0])),zeroFundDividends=Object.fromEntries(keys.map(k=>[k+'NetDividend',0]));
 rows.push({...valuation(0),working:c.retireYears>0,saving:0,extraAsset:initialSeverance,severance:initialSeverance,...zeroContributions,...zeroFundDividends,safeContribution:0,netDividend:0,netInterest:0,grossDividend:0,withdrawal:0,stockSold:0,cashUsed:0,requestedWithdrawal:0,unfunded:0,income:0,budget:c.monthlyBudget*12});
 for(let t=1;t<=Math.min(endElapsed,c.retireYears+c.horizon);t++){
  const working=t<=c.retireYears,market=marketPath[t-1]||{},returns={},factors={},contributions={...zeroContributions},fundDividends={...zeroFundDividends};
  let grossDividend=0,netDividend=0;
  for(const k of keys){
   const r=market[k+'Return']??fundSetting(c,k,'PriceGrowth')/100,factor=market[k+'DividendFactor']??1;
   if(![r,factor].every(Number.isFinite)||r<=-1||factor<0||factor>1)throw new Error('시장 경로의 수익률 또는 배당 삭감 값을 확인하세요.');
   returns[k+'Return']=r;factors[k+'DividendFactor']=factor;dividends[k]*=factor;grossDividend+=shares[k]*dividends[k];fundDividends[k+'NetDividend']=shares[k]*dividends[k]*(1-fundSetting(c,k,'Tax')/100);netDividend+=fundDividends[k+'NetDividend'];prices[k]*=1+r;
  }
  const netInterest=cash*c.cashYield/100*(1-c.cashTax/100),budget=c.monthlyBudget*12*Math.pow(1+c.inflation/100,t);
  let saving=0,safeContribution=0,requestedWithdrawal=0,withdrawal=0,stockSold=0,cashUsed=0,unfunded=0,income=0;
  if(working){
   for(const k of keys)shares[k]+=shares[k]*dividends[k]*(1-fundSetting(c,k,'Tax')/100)/prices[k];
   cash+=netInterest;saving=contributionFor(c,t-1);const annual=allocationFor(c,t-1);safeContribution=saving*annual.safe/100;cash+=safeContribution;
   for(const k of keys){contributions[k+'Contribution']=saving*annual[k]/100;shares[k]+=contributions[k+'Contribution']/prices[k];}
  }else{
   const naturalIncome=netDividend+netInterest;
   requestedWithdrawal=c.withdrawMode==='budget'?Math.max(0,budget-naturalIncome):c.annualWithdrawal*(c.inflateWithdrawal?Math.pow(1+c.inflation/100,t-c.retireYears-1):1);
   let needed=requestedWithdrawal;
   if(c.withdrawSource==='cashFirst'){cashUsed=Math.min(cash,needed);cash-=cashUsed;needed-=cashUsed;}
   stockSold=sellEtfs(shares,prices,needed,c.withdrawSource);withdrawal=cashUsed+stockSold;unfunded=Math.max(0,requestedWithdrawal-withdrawal);
   income=c.withdrawMode==='budget'?Math.min(naturalIncome,budget)+withdrawal:naturalIncome+withdrawal;
   if(c.withdrawMode==='budget')cash+=Math.max(0,naturalIncome-budget);
  }
  const severance=severanceFor(c,t),extraAsset=extraAssetFor(c,t),receipt=receiptAllocationFor(c,t);cash+=receipt.safe;
  for(const k of keys)shares[k]+=receipt[k]/prices[k];
  rows.push({...valuation(t),working,saving,extraAsset,severance,...contributions,...fundDividends,safeContribution,netDividend,netInterest,grossDividend,withdrawal,stockSold,cashUsed,requestedWithdrawal,unfunded,income,budget,marketMonths:market.months,...returns,...factors});
  for(const k of keys)dividends[k]*=1+fundSetting(c,k,'DividendGrowth')/100;
 }
 return rows;
}
const BUFFER_POLICIES={none:'주식 매도로 보충 안 함',annual:'매년 목표까지 보충',conditional:'회복 조건부 보충 + 최소 잔액'};
function monthlyMarketPath(c,random){
 const keys=fundKeys(c);
 const result=[],rho=c.stressCorr/100,residual=Math.sqrt(Math.max(0,1-rho*rho)),shocks=[],sums=Object.fromEntries(keys.map(k=>[k,0]));let activeCount=0;
 // Preserve the original VTI/SCHD draws; the two extra streams are drawn afterward.
 for(let i=0;i<(c.retireYears+c.horizon)*12;i++){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random(),z=radius*Math.cos(angle),other=rho*z+residual*radius*Math.sin(angle),active=c.stressScope==='all'||i>=c.retireYears*12;
  shocks.push({z,active,vti:active?c.stressVtiVol/100/Math.sqrt(12)*z:0,schd:active?c.stressSchdVol/100/Math.sqrt(12)*other:0});if(active)activeCount++;
 }
 for(const shock of shocks){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random();
  shock.aor=shock.active?c.stressAorVol/100/Math.sqrt(12)*(rho*shock.z+residual*radius*Math.cos(angle)):0;
  shock.aoa=shock.active?c.stressAoaVol/100/Math.sqrt(12)*(rho*shock.z+residual*radius*Math.sin(angle)):0;
 }
 for(const k of keys.filter(k=>!ETF_KEYS.includes(k)))for(const shock of shocks){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random();shock[k]=shock.active?fundSetting(c,k,'Vol')/100/Math.sqrt(12)*(rho*shock.z+residual*radius*Math.cos(angle)):0;
 }
 for(const shock of shocks){for(const k of keys)sums[k]+=shock[k];
 }
 const centers=Object.fromEntries(keys.map(k=>[k,c.stressReturnMode==='anchored'&&activeCount?sums[k]/activeCount:0]));
 for(let t=1;t<=c.retireYears+c.horizon;t++){
  const months=[],growth=Object.fromEntries(keys.map(k=>[k,1]));
  for(let m=0;m<12;m++){
   const shock=shocks[(t-1)*12+m],month={};
   for(const k of keys){const r=Math.expm1(Math.log1p(fundSetting(c,k,'PriceGrowth')/100)/12+shock[k]-(shock.active?centers[k]:0));month[k+'Return']=r;growth[k]*=1+r;}
   months.push(month);
  }
  result.push({...marketShock(Object.fromEntries(keys.map(k=>[k,growth[k]-1])),c),months});
 }
 return result;
}
function futureYearBudget(c,elapsed){let sum=0;for(let m=1;m<=12;m++)sum+=c.monthlyBudget*Math.pow(1+c.inflation/100,elapsed+m/12);return sum;}
function simulateMonthly(c,marketPath=[],policy=c.stressBufferPolicy){
 const validation=validateConfig(c);if(validation)throw new Error(validation);
 const keys=fundKeys(c);
 const rows=simulate(c,marketPath,c.retireYears),prices={},dividends={},shares={};
 for(const k of keys){prices[k]=1;dividends[k]=fundSetting(c,k,'Yield')/100;}
 for(let i=0;i<c.retireYears;i++){const p=marketPath[i]||{};for(const k of keys){prices[k]*=1+(p[k+'Return']??fundSetting(c,k,'PriceGrowth')/100);dividends[k]*=(p[k+'DividendFactor']??1)*(1+fundSetting(c,k,'DividendGrowth')/100);}}
 const ret=rows.at(-1),reference={...prices},retEtfs=etfTotal(ret,keys),fallback=etfRatiosFor(c,0),weights=Object.fromEntries(keys.map(k=>[k,retEtfs>0?ret[k]/retEtfs:fallback[k]/100]));
 for(const k of keys)shares[k]=ret[k]/prices[k];let cash=ret.cash,peakIndex=1;
 const indexValue=()=>keys.reduce((sum,k)=>sum+weights[k]*prices[k]/reference[k],0),sell=needed=>sellEtfs(shares,prices,needed,c.stressStockSale);
 for(let t=c.retireYears+1;t<=c.retireYears+c.horizon;t++){
  const withdrawalBase=etfTotal(etfValues(shares,prices),keys)+cash,spendingCap=c.stressWithdrawalCap?withdrawalBase*c.stressMaxWithdrawalRate/100:null;
  const p=marketPath[t-1]||{},fallbackMonths=()=>Array.from({length:12},()=>Object.fromEntries(keys.map(k=>[k+'Return',Math.expm1(Math.log1p(p[k+'Return']??fundSetting(c,k,'PriceGrowth')/100)/12)]))),months=p.months||fallbackMonths();
  if(months.length!==12)throw new Error('월별 시장 경로는 매년 12개여야 합니다.');
  let netDividend=0,grossDividend=0,netInterest=0,requestedWithdrawal=0,withdrawal=0,stockSold=0,cashUsed=0,unfunded=0,income=0,budget=0,livingGap=0,maxMonthlyGapReal=0,firstGapMonth=null,firstUnfundedMonth=null,refillSold=0,downMarketSold=0,minCashMonths=Infinity;
  const fundDividends=Object.fromEntries(keys.map(k=>[k+'NetDividend',0])),cuts=Object.fromEntries(keys.map(k=>[k,false])),ytd=Object.fromEntries(keys.map(k=>[k,1]));
  let hadEmpty=false,realIncome=0,realBudget=0,realNaturalIncome=0,realGap=0,capReduction=0,monthsNeedingWork=0;const yearStartIndex=indexValue();
  for(let m=1;m<=12;m++){
   const mr=months[m-1],returns={};
   for(const k of keys){const r=mr[k+'Return']??((k!=='vti'&&k!=='schd')?Math.expm1(Math.log1p(p[k+'Return']??fundSetting(c,k,'PriceGrowth')/100)/12):NaN);if(!Number.isFinite(r)||r<=-1)throw new Error('월별 주가 수익률을 확인하세요.');returns[k]=r;}
   const elapsed=t-1+m/12,deflator=Math.pow(1+c.inflation/100,elapsed),monthlyBudget=c.monthlyBudget*deflator,gross=keys.reduce((sum,k)=>sum+shares[k]*dividends[k],0)/12,dividend=keys.reduce((sum,k)=>sum+shares[k]*dividends[k]*(1-fundSetting(c,k,'Tax')/100),0)/12,interest=cash*c.cashYield/100/12*(1-c.cashTax/100);
   for(const k of keys)fundDividends[k+'NetDividend']+=shares[k]*dividends[k]*(1-fundSetting(c,k,'Tax')/100)/12;
   for(const k of keys){prices[k]*=1+returns[k];ytd[k]*=1+returns[k];}peakIndex=Math.max(peakIndex,indexValue());
   const natural=dividend+interest,planned=c.withdrawMode==='budget'?monthlyBudget:natural+c.annualWithdrawal/12*(c.inflateWithdrawal?Math.pow(1+c.inflation/100,t-c.retireYears-1+(m-1)/12):1),allowed=spendingCap===null?planned:Math.min(planned,spendingCap/12),naturalUsed=Math.min(natural,allowed),request=Math.max(0,allowed-naturalUsed);
   const fromCash=Math.min(cash,request);cash-=fromCash;const fromStock=sell(Math.max(0,request-fromCash)),missing=Math.max(0,request-fromCash-fromStock),paid=naturalUsed+fromCash+fromStock,gap=Math.max(0,monthlyBudget-paid);
   cash+=Math.max(0,natural-naturalUsed);capReduction+=Math.max(0,planned-allowed);if(gap>.00001)monthsNeedingWork++;
   if(indexValue()<peakIndex*(1-1e-8))downMarketSold+=fromStock;
   if(gap>.00001&&firstGapMonth===null)firstGapMonth=m;if(missing>.00001&&firstUnfundedMonth===null)firstUnfundedMonth=m;
   netDividend+=dividend;grossDividend+=gross;netInterest+=interest;requestedWithdrawal+=request;withdrawal+=fromCash+fromStock;stockSold+=fromStock;cashUsed+=fromCash;unfunded+=missing;income+=paid;budget+=monthlyBudget;livingGap+=gap;maxMonthlyGapReal=Math.max(maxMonthlyGapReal,gap/deflator);
   realIncome+=paid/deflator;realBudget+=monthlyBudget/deflator;realNaturalIncome+=natural/deflator;realGap+=gap/deflator;
   minCashMonths=Math.min(minCashMonths,monthlyBudget>0?cash/monthlyBudget:Infinity);
   if(cash+etfTotal(etfValues(shares,prices),keys)<.00001)hadEmpty=true;
   // Each fund's observed loss affects only its future distributions.
   for(const k of keys){if(!cuts[k]&&ytd[k]<=.8+1e-12){dividends[k]*=Math.max(0,1+(ytd[k]-1)*c.stressDividendCut/100);cuts[k]=true;}dividends[k]*=Math.pow(1+fundSetting(c,k,'DividendGrowth')/100,1/12);}
  }
  const severance=severanceFor(c,t),extraAsset=extraAssetFor(c,t),receipt=receiptAllocationFor(c,t);cash+=receipt.safe;for(const k of keys)shares[k]+=receipt[k]/prices[k];
  const nextBudget=futureYearBudget(c,t),cashTarget=nextBudget*c.stressBufferYears,cashFloor=nextBudget*c.stressBufferFloor,healthy=indexValue()>=yearStartIndex*(1-1e-10)&&indexValue()>=peakIndex*(1-c.stressRecoveryDrawdown/100)*(1-1e-10);
  const replenishTo=policy==='annual'?cashTarget:policy==='conditional'?(healthy?cashTarget:cashFloor):0;
  if(t<c.retireYears+c.horizon&&cash<replenishTo){refillSold=sell(replenishTo-cash);cash+=refillSold;if(indexValue()<peakIndex*(1-1e-8))downMarketSold+=refillSold;}
  const cashReinvested=c.stressCashCap?Math.max(0,cash-cashTarget):0;
  if(cashReinvested>0){const ratios=etfRatiosFor(c,t-1);cash-=cashReinvested;for(const k of keys)shares[k]+=cashReinvested*ratios[k]/100/prices[k];}
  const deflator=Math.pow(1+c.inflation/100,t),nextMonthly=c.monthlyBudget*Math.pow(1+c.inflation/100,t+1/12),values=etfValues(shares,prices);
  rows.push({elapsed:t,year:c.startYear+t,age:c.startYear+t-c.birthYear,working:false,saving:0,extraAsset,severance,...Object.fromEntries(keys.map(k=>[k+'Contribution',0])),safeContribution:0,...fundDividends,...values,cash,total:etfTotal(values,keys)+cash,deflator,netDividend,grossDividend,netInterest,requestedWithdrawal,withdrawal,stockSold,cashUsed,unfunded,income,budget,realIncome,realBudget,realNaturalIncome,realGap,livingGap,maxMonthlyGapReal,firstGapMonth,firstUnfundedMonth,hadEmpty,hadLivingGap:firstGapMonth!==null,hadUnfunded:firstUnfundedMonth!==null,withdrawalBase,spendingCap,spendingRate:withdrawalBase>0?income/withdrawalBase*100:0,capReduction,monthsNeedingWork,workNeeded:livingGap,realWorkNeeded:realGap,refillSold,cashReinvested,marketMonths:months,downMarketSold,minCashMonths:Number.isFinite(minCashMonths)?minCashMonths:null,cashMonths:nextMonthly>0?cash/nextMonthly:null,cashTarget,cashFloor,marketDrawdown:1-indexValue()/peakIndex,refillEligible:healthy,...Object.fromEntries(keys.map(k=>[k+'Return',ytd[k]-1]))});
 }
 return rows;
}
// Seeded annual paths remain available for the original calculation checks.
function stressRandom(seed){let state=seed>>>0;return ()=>{state=(state+0x6D2B79F5)>>>0;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return (((x^(x>>>14))>>>0)+.5)/4294967296;};}
function stressShock(v,s,c,a=c.aorPriceGrowth/100,b=c.aoaPriceGrowth/100){const factor=r=>r<=-.20?Math.max(0,1+r*c.stressDividendCut/100):1;return {vtiReturn:v,schdReturn:s,aorReturn:a,aoaReturn:b,vtiDividendFactor:factor(v),schdDividendFactor:factor(s),aorDividendFactor:factor(a),aoaDividendFactor:factor(b)};}
function randomMarketPath(c,random){
 const path=[],zs=[],rho=c.stressCorr/100,residual=Math.sqrt(Math.max(0,1-rho*rho));
 for(let t=1;t<=c.retireYears+c.horizon;t++){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random(),zV=radius*Math.cos(angle),zS=rho*zV+residual*radius*Math.sin(angle);zs.push(zV);
  if(c.stressScope==='retirement'&&t<=c.retireYears){path.push({});continue;}
  path.push(stressShock(Math.expm1(Math.log1p(c.vtiPriceGrowth/100)+c.stressVtiVol/100*zV),Math.expm1(Math.log1p(c.schdPriceGrowth/100)+c.stressSchdVol/100*zS),c));
 }
 for(let i=0;i<path.length;i++){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random();if(c.stressScope==='retirement'&&i<c.retireYears)continue;
  const a=Math.expm1(Math.log1p(c.aorPriceGrowth/100)+c.stressAorVol/100*(rho*zs[i]+residual*radius*Math.cos(angle))),b=Math.expm1(Math.log1p(c.aoaPriceGrowth/100)+c.stressAoaVol/100*(rho*zs[i]+residual*radius*Math.sin(angle)));
  path[i]=stressShock(path[i].vtiReturn,path[i].schdReturn,c,a,b);
 }
 for(const k of fundKeys(c).filter(k=>!ETF_KEYS.includes(k)))for(let i=0;i<path.length;i++){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random();if(c.stressScope==='retirement'&&i<c.retireYears)continue;
  const r=Math.expm1(Math.log1p(fundSetting(c,k,'PriceGrowth')/100)+fundSetting(c,k,'Vol')/100*(rho*zs[i]+residual*radius*Math.cos(angle)));
  path[i][k+'Return']=r;path[i][k+'DividendFactor']=r<=-.2?Math.max(0,1+r*c.stressDividendCut/100):1;
 }
 return path;
}
function stressConfig(c){return {...c,withdrawMode:c.stressSpending==='budget'?'budget':c.withdrawMode};}
function crashMarketPath(c,late=false){
 const keys=fundKeys(c),losses=Object.fromEntries(keys.map(k=>[k,fundSetting(c,k,'Crash')]));
 if(c.stressReturnMode==='anchored'){
  const total=c.horizon*12,duration=Math.min(c.stressCrashDuration*12,Math.floor(total/2)),start=late?total-2*duration:0;
  return Array.from({length:c.retireYears+c.horizon},(_,i)=>{
   const growth=Object.fromEntries(keys.map(k=>[k,1]));
   const months=Array.from({length:12},(_,m)=>{
    const at=(i-c.retireYears)*12+m,inCrash=at>=start&&at<start+duration,inRecovery=at>=start+duration&&at<start+2*duration,month={};
    for(const k of keys){const base=Math.log1p(fundSetting(c,k,'PriceGrowth')/100)/12,crash=Math.log1p(-losses[k]/100)/12,r=Math.expm1(losses[k]===0?base:inCrash?crash:inRecovery?2*base-crash:base);month[k+'Return']=r;growth[k]*=1+r;}return month;
   });
   return {...marketShock(Object.fromEntries(keys.map(k=>[k,growth[k]-1])),c),months};
  });
 }
 const duration=Math.min(c.horizon,c.stressCrashDuration),start=late?c.horizon-duration:0;
 return Array.from({length:c.retireYears+c.horizon},(_,i)=>i>=c.retireYears+start&&i<c.retireYears+start+duration?marketShock(Object.fromEntries(keys.map(k=>[k,-losses[k]/100])),c):{});
}
function stressPathSummary(rows,c){
 const retired=rows.slice(c.retireYears+1),gap=r=>r.livingGap??Math.max(0,r.budget-r.income),firstGap=retired.find(r=>r.hadLivingGap??(gap(r)>.00001)),firstUnfunded=retired.find(r=>r.hadUnfunded??(r.unfunded>.00001)),firstEmpty=retired.find(r=>r.hadEmpty??(r.total<.00001));
 return {retire:rows[c.retireYears],final:rows[rows.length-1],firstGap,firstUnfunded,firstEmpty,maxGapReal:Math.max(0,...retired.map(r=>r.maxMonthlyGapReal??gap(r)/r.deflator/12)),gapSum:retired.reduce((sum,r)=>sum+(r.realGap??gap(r)/r.deflator),0),refillTotal:retired.reduce((sum,r)=>sum+(r.refillSold||0)/r.deflator,0),downSaleTotal:retired.reduce((sum,r)=>sum+(r.downMarketSold||0)/r.deflator,0),minCashMonths:Math.min(Infinity,...retired.map(r=>r.minCashMonths??Infinity))};
}
function createStressAccumulator(c){return {count:0,supported:0,unfunded:0,empty:0,refills:[],downSales:[],cashMonths:[],values:Array.from({length:c.retireYears+c.horizon+1},()=>[]),worst:null,sample:null};}
function addStressPath(acc,rows,c){
 const summary=stressPathSummary(rows,c);acc.count++;if(!summary.firstGap)acc.supported++;if(summary.firstUnfunded)acc.unfunded++;if(summary.firstEmpty)acc.empty++;
 if(!acc.sample)acc.sample=rows;
 rows.forEach((r,i)=>acc.values[i].push(r.total));
 acc.refills.push(summary.refillTotal);acc.downSales.push(summary.downSaleTotal);acc.cashMonths.push(summary.minCashMonths);
 if(!acc.worst||summary.final.total<acc.worst.summary.final.total-1e-7||(Math.abs(summary.final.total-acc.worst.summary.final.total)<=1e-7&&summary.gapSum>acc.worst.summary.gapSum))acc.worst={rows,summary};
}
function stressQuantile(sorted,p){const at=(sorted.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at);return sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo);}
function finishStress(acc,c,runner=simulate){
 const effective=stressConfig(c),flat=runner(effective),early=runner(effective,crashMarketPath(c)),late=runner(effective,crashMarketPath(c,true));
 return {count:acc.count,supported:acc.supported,unfunded:acc.unfunded,empty:acc.empty,bands:acc.values.map((values,i)=>{values.sort((a,b)=>a-b);return {elapsed:i,year:c.startYear+i,deflator:Math.pow(1+c.inflation/100,i),p10:stressQuantile(values,.1),p50:stressQuantile(values,.5),p90:stressQuantile(values,.9)};}),cases:{sample:{name:'무작위 예시 경로',rows:acc.sample},flat:{name:'일정 수익률 기준선',rows:flat},early:{name:'은퇴 초반 급락',rows:early},late:{name:'은퇴 후반 급락',rows:late},worst:{name:'반복 경로 중 기말 자산 최저',rows:acc.worst.rows}}};
}

// @single-file-exports
export { fundHasAllocation, fundKeys, fundName, fundSetting, newFund, ETF_KEYS, ETF_CAPS, finalSavingSafeFor, etfRatiosFor, allocationFor, DEFAULTS, BUFFER_POLICIES, normalizeConfig, contributionFor, safePctFor, stockPctFor, severanceYearFor, severanceFor, extraAssetFor, severanceAllocationFor, receiptAllocationFor, monthlyBudgetTotal, validateConfig, validateStress, simulate, monthlyMarketPath, futureYearBudget, simulateMonthly, stressRandom, stressShock, randomMarketPath, stressConfig, crashMarketPath, stressPathSummary, createStressAccumulator, addStressPath, stressQuantile, finishStress };
