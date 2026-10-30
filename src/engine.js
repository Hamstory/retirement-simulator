'use strict';
const DEFAULTS={startYear:2026,birthYear:1990,initialVti:0,initialSchd:0,initialCash:0,deployCash:0,annualSaving:1200,savingGrowthMode:'percent',savingGrowth:0,safeSavingPct:20,retireYears:10,horizon:40,inflation:2,annualWithdrawal:0,inflateWithdrawal:false,withdrawMode:'budget',withdrawSource:'stocks',monthlyBudget:200,vtiPriceGrowth:3,schdPriceGrowth:3,vtiYield:1.05,schdYield:3.24,vtiDividendGrowth:3,schdDividendGrowth:3,cashYield:2.5,dividendTax:15,cashTax:15.4,realTerms:false,allocations:Array(30).fill(80),stressCount:1000,stressSeed:42,stressVtiVol:18,stressSchdVol:16,stressCorr:90,stressDividendCut:25,stressScope:'all',stressSpending:'budget',stressCrash:35,stressCrashDuration:2};
DEFAULTS.safeAllocations=Array(30).fill(null);
DEFAULTS.budgetItems=[];
DEFAULTS.allocations=Array(90).fill(80);
DEFAULTS.safeAllocations=Array(90).fill(null);
DEFAULTS.extraAssets=Array(90).fill(0);
Object.assign(DEFAULTS,{severanceAmount:0,severanceTiming:'retirement',severanceYear:2026});
Object.assign(DEFAULTS,{stressWithdrawalCap:false,stressMaxWithdrawalRate:5});
Object.assign(DEFAULTS,{stressBufferPolicy:'conditional',stressBufferYears:3,stressBufferFloor:1,stressRecoveryDrawdown:10,stressStockSale:'proportional',stressReturnMode:'anchored',stressCashCap:true});
function normalizeConfig(incoming){
 const c={...structuredClone(DEFAULTS),...structuredClone(incoming)};
 for(const [key,fallback] of [['allocations',80],['safeAllocations',null],['extraAssets',0]])if(Array.isArray(c[key])&&c[key].length>=30&&c[key].length<=90){const old=c[key];c[key]=Array.from({length:90},(_,i)=>i<old.length?old[i]:key==='allocations'?(old[old.length-1]??fallback):fallback);}
 return c;
}
function contributionFor(c,index){return Math.max(0,c.savingGrowthMode==='fixed'?c.annualSaving+c.savingGrowth*index:c.annualSaving*Math.pow(1+c.savingGrowth/100,index));}
function safePctFor(c,index){return c.safeAllocations?.[index]??c.safeSavingPct;}
function stockPctFor(c,index){return c.allocations[index]??c.allocations[c.allocations.length-1];}
function severanceYearFor(c){return c.severanceTiming==='retirement'?c.startYear+c.retireYears:c.severanceYear;}
function severanceFor(c,elapsed){return c.startYear+elapsed===severanceYearFor(c)?c.severanceAmount:0;}
function extraAssetFor(c,elapsed){return (elapsed>0?(c.extraAssets?.[elapsed-1]??0):0)+severanceFor(c,elapsed);}
function monthlyBudgetTotal(items){return items.reduce((sum,item)=>sum+item.amount/(item.frequency==='annual'?12:1),0);}
function validateConfig(c){
 const finiteKeys=['startYear','birthYear','initialVti','initialSchd','initialCash','deployCash','annualSaving','savingGrowth','safeSavingPct','retireYears','horizon','inflation','annualWithdrawal','monthlyBudget','vtiPriceGrowth','schdPriceGrowth','vtiYield','schdYield','vtiDividendGrowth','schdDividendGrowth','cashYield','dividendTax','cashTax'];
 for(const k of finiteKeys)if(!Number.isFinite(c[k]))return '모든 숫자 입력란을 채워 주세요.';
 if(c.initialVti<0||c.initialSchd<0||c.initialCash<0||c.deployCash<0||c.annualSaving<0||c.annualWithdrawal<0||c.monthlyBudget<0)return '자산·저축액·인출액에는 0 이상의 금액을 입력하세요.';
 if(c.deployCash>c.initialCash)return '처음 투자할 현금이 현재 보유 현금보다 큽니다.';
 if(c.retireYears<0||c.retireYears>30||!Number.isInteger(c.retireYears)||c.horizon<1||c.horizon>60||!Number.isInteger(c.horizon))return '저축 기간은 0~30년, 은퇴 후 기간은 1~60년의 정수로 입력하세요.';
 if(c.startYear<2020||c.startYear>2100||!Number.isInteger(c.startYear)||!Number.isInteger(c.birthYear)||c.birthYear<1900||c.birthYear>c.startYear)return '시작 연도와 출생 연도를 확인하세요.';
 if(c.safeSavingPct<0||c.safeSavingPct>100||c.dividendTax<0||c.dividendTax>100||c.cashTax<0||c.cashTax>100)return '비중과 세율은 0~100% 범위로 입력하세요.';
 if(c.inflation < -5 || c.inflation>20)return '물가상승률은 -5~20% 범위로 입력하세요.';
 for(const k of ['vtiPriceGrowth','schdPriceGrowth','vtiDividendGrowth','schdDividendGrowth'])if(c[k]<-50||c[k]>50)return '주가·배당 증가율은 -50~50% 범위로 입력하세요.';
 for(const k of ['vtiYield','schdYield','cashYield'])if(c[k]<0||c[k]>30)return '배당·이자율은 0~30% 범위로 입력하세요.';
 if(!['percent','fixed'].includes(c.savingGrowthMode)||!['extra','budget'].includes(c.withdrawMode)||!['stocks','vtiFirst','cashFirst'].includes(c.withdrawSource))return '선택한 계산 방식을 확인하세요.';
 if(c.savingGrowthMode==='percent'&&(c.savingGrowth<-100||c.savingGrowth>100))return '저축액 증가율은 -100~100% 범위로 입력하세요.';
 if(!Array.isArray(c.allocations)||(c.allocations.length<30||c.allocations.length>90)||c.allocations.some(v=>!Number.isFinite(v)||v<0||v>100))return '연도별 VTI 비율은 0~100% 범위로 입력하세요.';
 if(c.safeAllocations!==undefined&&(!Array.isArray(c.safeAllocations)||(c.safeAllocations.length<30||c.safeAllocations.length>90)||c.safeAllocations.some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>100))))return '연도별 안전자산 비율은 0~100% 범위로 입력하세요.';
 if(c.budgetItems!==undefined&&(!Array.isArray(c.budgetItems)||c.budgetItems.length>100||c.budgetItems.some(item=>!item||typeof item.name!=='string'||item.name.length>80||!Number.isFinite(item.amount)||item.amount<0||item.amount>100000||!['monthly','annual'].includes(item.frequency))))return '생활비 항목은 100개 이하, 금액은 0~100,000만원 범위로 입력하세요.';
 if(c.extraAssets!==undefined&&(!Array.isArray(c.extraAssets)||(c.extraAssets.length<30||c.extraAssets.length>90)||c.extraAssets.some(v=>!Number.isFinite(v)||v<0||v>10000000)))return '연도별 추가 자산은 0~10,000,000만원 범위로 입력하세요.';
 if(!Number.isFinite(c.severanceAmount)||c.severanceAmount<0||c.severanceAmount>10000000||!['retirement','year'].includes(c.severanceTiming))return '세후 퇴직금은 0~10,000,000만원, 수령 시점은 퇴직 연도 또는 직접 지정으로 입력하세요.';
 if(c.severanceTiming==='year'&&(!Number.isInteger(c.severanceYear)||c.severanceYear<c.startYear||c.severanceYear>c.startYear+c.retireYears+c.horizon))return '퇴직금 수령 연도는 시작 연도부터 계산 마지막 연도 사이의 정수로 입력하세요.';
 return validateStress(c);
}
function validateStress(c){
 const ranges={stressCount:[100,5000],stressSeed:[1,4294967295],stressVtiVol:[0,60],stressSchdVol:[0,60],stressCorr:[-100,100],stressDividendCut:[0,100],stressCrash:[0,90],stressCrashDuration:[1,60]};
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
 const rows=[];const alloc0=c.allocations[0]/100;
 let vShares=c.initialVti+c.deployCash*alloc0,sShares=c.initialSchd+c.deployCash*(1-alloc0),cash=c.initialCash-c.deployCash;
 let vp=1,sp=1,vd=c.vtiYield/100,sd=c.schdYield/100;
 const initialSeverance=severanceFor(c,0),initialSafe=initialSeverance*safePctFor(c,0)/100;
 cash+=initialSafe;vShares+=(initialSeverance-initialSafe)*alloc0;sShares+=(initialSeverance-initialSafe)*(1-alloc0);
 const valuation=(elapsed)=>({elapsed,year:c.startYear+elapsed,age:c.startYear+elapsed-c.birthYear,vti:vShares*vp,schd:sShares*sp,cash,total:vShares*vp+sShares*sp+cash,deflator:Math.pow(1+c.inflation/100,elapsed)});
 rows.push({...valuation(0),working:c.retireYears>0,saving:0,extraAsset:initialSeverance,severance:initialSeverance,vtiContribution:0,schdContribution:0,safeContribution:0,netDividend:0,netInterest:0,grossDividend:0,withdrawal:0,stockSold:0,cashUsed:0,requestedWithdrawal:0,unfunded:0,income:0,budget:c.monthlyBudget*12});
 for(let t=1;t<=Math.min(endElapsed,c.retireYears+c.horizon);t++){
  const working=t<=c.retireYears;
  const market=marketPath[t-1]||{},vReturn=market.vtiReturn??c.vtiPriceGrowth/100,sReturn=market.schdReturn??c.schdPriceGrowth/100,vFactor=market.vtiDividendFactor??1,sFactor=market.schdDividendFactor??1;
  if(![vReturn,sReturn,vFactor,sFactor].every(Number.isFinite)||vReturn<=-1||sReturn<=-1||vFactor<0||vFactor>1||sFactor<0||sFactor>1)throw new Error('시장 경로의 수익률 또는 배당 삭감 값을 확인하세요.');
  vd*=vFactor;sd*=sFactor;
  const grossDividend=vShares*vd+sShares*sd,netDividend=grossDividend*(1-c.dividendTax/100),netInterest=cash*c.cashYield/100*(1-c.cashTax/100);
  vp*=1+vReturn;sp*=1+sReturn;
  let saving=0,vtiContribution=0,schdContribution=0,safeContribution=0,requestedWithdrawal=0,withdrawal=0,stockSold=0,cashUsed=0,unfunded=0,income=0;
  const budget=c.monthlyBudget*12*Math.pow(1+c.inflation/100,t);
  if(working){
   // Each ETF reinvests its own dividend; cash interest stays in cash.
   vShares+=(vShares*vd*(1-c.dividendTax/100))/vp;
   sShares+=(sShares*sd*(1-c.dividendTax/100))/sp;
   cash+=netInterest;
   saving=contributionFor(c,t-1);safeContribution=saving*safePctFor(c,t-1)/100;
   const ratio=stockPctFor(c,t-1)/100;
   vtiContribution=(saving-safeContribution)*ratio;schdContribution=saving-safeContribution-vtiContribution;
   vShares+=vtiContribution/vp;sShares+=schdContribution/sp;cash+=safeContribution;
  }else{
   const naturalIncome=netDividend+netInterest;
   requestedWithdrawal=c.withdrawMode==='budget'?Math.max(0,budget-naturalIncome):c.annualWithdrawal*(c.inflateWithdrawal?Math.pow(1+c.inflation/100,t-c.retireYears-1):1);
   let needed=requestedWithdrawal;
   if(c.withdrawSource==='cashFirst'){cashUsed=Math.min(cash,needed);cash-=cashUsed;needed-=cashUsed;}
   if(c.withdrawSource==='vtiFirst'){
    const vtiSold=Math.min(vShares*vp,needed);
    vShares=Math.max(0,vShares-vtiSold/vp);
    const schdSold=Math.min(sShares*sp,Math.max(0,needed-vtiSold));
    sShares=Math.max(0,sShares-schdSold/sp);
    stockSold=vtiSold+schdSold;
   }else{
    const stocks=vShares*vp+sShares*sp;
    stockSold=Math.min(stocks,needed);
    const keep=stocks>0?Math.max(0,1-stockSold/stocks):1;
    vShares*=keep;sShares*=keep;
   }
   withdrawal=cashUsed+stockSold;unfunded=Math.max(0,requestedWithdrawal-withdrawal);
   income=c.withdrawMode==='budget'?Math.min(naturalIncome,budget)+withdrawal:naturalIncome+withdrawal;
   if(c.withdrawMode==='budget')cash+=Math.max(0,naturalIncome-budget);
  }
  const severance=severanceFor(c,t),extraAsset=extraAssetFor(c,t),extraSafe=extraAsset*safePctFor(c,t-1)/100,extraVti=(extraAsset-extraSafe)*stockPctFor(c,t-1)/100;
  cash+=extraSafe;vShares+=extraVti/vp;sShares+=(extraAsset-extraSafe-extraVti)/sp;
  rows.push({...valuation(t),working,saving,extraAsset,severance,vtiContribution,schdContribution,safeContribution,netDividend,netInterest,grossDividend,withdrawal,stockSold,cashUsed,requestedWithdrawal,unfunded,income,budget,marketMonths:market.months,vtiReturn:vReturn,schdReturn:sReturn,vtiDividendFactor:vFactor,schdDividendFactor:sFactor});
  vd*=1+c.vtiDividendGrowth/100;sd*=1+c.schdDividendGrowth/100;
 }
 return rows;
}
const BUFFER_POLICIES={none:'주식 매도로 보충 안 함',annual:'매년 목표까지 보충',conditional:'회복 조건부 보충 + 최소 잔액'};
function monthlyMarketPath(c,random){
 const result=[],rho=c.stressCorr/100,correlation=Math.sqrt(Math.max(0,1-rho*rho)),shocks=[];
 let sumV=0,sumS=0,activeCount=0;
 // Draw the whole path first. Center active log shocks to condition on a known endpoint.
 // Portfolio decisions receive only the resulting month, never future shocks or prices.
 for(let i=0;i<(c.retireYears+c.horizon)*12;i++){
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random(),z=radius*Math.cos(angle),other=rho*z+correlation*radius*Math.sin(angle),active=c.stressScope==='all'||i>=c.retireYears*12;
  const v=active?c.stressVtiVol/100/Math.sqrt(12)*z:0,s=active?c.stressSchdVol/100/Math.sqrt(12)*other:0;
  shocks.push({v,s,active});if(active){sumV+=v;sumS+=s;activeCount++;}
 }
 const centerV=c.stressReturnMode==='anchored'?sumV/activeCount:0,centerS=c.stressReturnMode==='anchored'?sumS/activeCount:0;
 for(let t=1;t<=c.retireYears+c.horizon;t++){
  const months=[];let vg=1,sg=1;
  for(let m=0;m<12;m++){
   const shock=shocks[(t-1)*12+m],v=Math.expm1(Math.log1p(c.vtiPriceGrowth/100)/12+shock.v-(shock.active?centerV:0)),s=Math.expm1(Math.log1p(c.schdPriceGrowth/100)/12+shock.s-(shock.active?centerS:0));
   months.push({vtiReturn:v,schdReturn:s});vg*=1+v;sg*=1+s;
  }
  const annual=stressShock(vg-1,sg-1,c);result.push({...annual,months});
 }
 return result;
}
function futureYearBudget(c,elapsed){let sum=0;for(let m=1;m<=12;m++)sum+=c.monthlyBudget*Math.pow(1+c.inflation/100,elapsed+m/12);return sum;}
function simulateMonthly(c,marketPath=[],policy=c.stressBufferPolicy){
 const validation=validateConfig(c);if(validation)throw new Error(validation);
 const rows=simulate(c,marketPath,c.retireYears);
 let vp=1,sp=1,vd=c.vtiYield/100,sd=c.schdYield/100;
 for(let i=0;i<c.retireYears;i++){const p=marketPath[i]||{};vp*=1+(p.vtiReturn??c.vtiPriceGrowth/100);sp*=1+(p.schdReturn??c.schdPriceGrowth/100);vd*=(p.vtiDividendFactor??1)*(1+c.vtiDividendGrowth/100);sd*=(p.schdDividendFactor??1)*(1+c.schdDividendGrowth/100);}
 const ret=rows[rows.length-1],referenceV=vp,referenceS=sp,stockWeight=ret.vti+ret.schd>0?ret.vti/(ret.vti+ret.schd):stockPctFor(c,0)/100;
 let vShares=ret.vti/vp,sShares=ret.schd/sp,cash=ret.cash,peakIndex=1;
 const indexValue=()=>stockWeight*vp/referenceV+(1-stockWeight)*sp/referenceS;
 const sell=(needed)=>{
  const v=vShares*vp,s=sShares*sp;
  if(c.stressStockSale==='vtiFirst'){const a=Math.min(v,needed),b=Math.min(s,Math.max(0,needed-a));vShares=Math.max(0,vShares-a/vp);sShares=Math.max(0,sShares-b/sp);return a+b;}
  const sold=Math.min(v+s,needed),keep=v+s>0?Math.max(0,1-sold/(v+s)):1;vShares*=keep;sShares*=keep;return sold;
 };
 for(let t=c.retireYears+1;t<=c.retireYears+c.horizon;t++){
  const withdrawalBase=vShares*vp+sShares*sp+cash,spendingCap=c.stressWithdrawalCap?withdrawalBase*c.stressMaxWithdrawalRate/100:null;
  const p=marketPath[t-1]||{},annualV=p.vtiReturn??c.vtiPriceGrowth/100,annualS=p.schdReturn??c.schdPriceGrowth/100;
  const months=p.months||Array.from({length:12},()=>({vtiReturn:Math.expm1(Math.log1p(annualV)/12),schdReturn:Math.expm1(Math.log1p(annualS)/12)}));
  if(months.length!==12)throw new Error('월별 시장 경로는 매년 12개여야 합니다.');
  let netDividend=0,grossDividend=0,netInterest=0,requestedWithdrawal=0,withdrawal=0,stockSold=0,cashUsed=0,unfunded=0,income=0,budget=0,livingGap=0,maxMonthlyGapReal=0,firstGapMonth=null,firstUnfundedMonth=null,refillSold=0,downMarketSold=0,minCashMonths=Infinity;
  let cutV=false,cutS=false,hadEmpty=false,ytdV=1,ytdS=1,realIncome=0,realBudget=0,realNaturalIncome=0,realGap=0,capReduction=0,monthsNeedingWork=0;const yearStartIndex=indexValue();
  for(let m=1;m<=12;m++){
   const mr=months[m-1];if(![mr.vtiReturn,mr.schdReturn].every(r=>Number.isFinite(r)&&r>-1))throw new Error('월별 주가 수익률을 확인하세요.');
   const elapsed=t-1+m/12,deflator=Math.pow(1+c.inflation/100,elapsed),monthlyBudget=c.monthlyBudget*deflator,gross=(vShares*vd+sShares*sd)/12,dividend=gross*(1-c.dividendTax/100),interest=cash*c.cashYield/100/12*(1-c.cashTax/100);
   vp*=1+mr.vtiReturn;sp*=1+mr.schdReturn;ytdV*=1+mr.vtiReturn;ytdS*=1+mr.schdReturn;peakIndex=Math.max(peakIndex,indexValue());
   const natural=dividend+interest,planned=c.withdrawMode==='budget'?monthlyBudget:natural+c.annualWithdrawal/12*(c.inflateWithdrawal?Math.pow(1+c.inflation/100,t-c.retireYears-1+(m-1)/12):1),allowed=spendingCap===null?planned:Math.min(planned,spendingCap/12),naturalUsed=Math.min(natural,allowed),request=Math.max(0,allowed-naturalUsed);
   const fromCash=Math.min(cash,request);cash-=fromCash;const fromStock=sell(Math.max(0,request-fromCash)),missing=Math.max(0,request-fromCash-fromStock),paid=naturalUsed+fromCash+fromStock,gap=Math.max(0,monthlyBudget-paid);
   cash+=Math.max(0,natural-naturalUsed);capReduction+=Math.max(0,planned-allowed);if(gap>.00001)monthsNeedingWork++;
   if(indexValue()<peakIndex*(1-1e-8))downMarketSold+=fromStock;
   if(gap>.00001&&firstGapMonth===null)firstGapMonth=m;if(missing>.00001&&firstUnfundedMonth===null)firstUnfundedMonth=m;
   netDividend+=dividend;grossDividend+=gross;netInterest+=interest;requestedWithdrawal+=request;withdrawal+=fromCash+fromStock;stockSold+=fromStock;cashUsed+=fromCash;unfunded+=missing;income+=paid;budget+=monthlyBudget;livingGap+=gap;maxMonthlyGapReal=Math.max(maxMonthlyGapReal,gap/deflator);
   realIncome+=paid/deflator;realBudget+=monthlyBudget/deflator;realNaturalIncome+=natural/deflator;realGap+=gap/deflator;
   minCashMonths=Math.min(minCashMonths,monthlyBudget>0?cash/monthlyBudget:Infinity);
   if(cash+vShares*vp+sShares*sp<.00001)hadEmpty=true;
   // A cut uses only the decline observed by this month-end and affects future payments.
   if(!cutV&&ytdV<=.8+1e-12){vd*=Math.max(0,1+(ytdV-1)*c.stressDividendCut/100);cutV=true;}
   if(!cutS&&ytdS<=.8+1e-12){sd*=Math.max(0,1+(ytdS-1)*c.stressDividendCut/100);cutS=true;}
   vd*=Math.pow(1+c.vtiDividendGrowth/100,1/12);sd*=Math.pow(1+c.schdDividendGrowth/100,1/12);
  }
  // Net one-off receipts arrive at year-end, never funding an earlier month's shortfall.
  const severance=severanceFor(c,t),extraAsset=extraAssetFor(c,t),extraSafe=extraAsset*safePctFor(c,t-1)/100,extraVti=(extraAsset-extraSafe)*stockPctFor(c,t-1)/100;
  cash+=extraSafe;vShares+=extraVti/vp;sShares+=(extraAsset-extraSafe-extraVti)/sp;
  const nextBudget=futureYearBudget(c,t),cashTarget=nextBudget*c.stressBufferYears,cashFloor=nextBudget*c.stressBufferFloor,healthy=indexValue()>=yearStartIndex*(1-1e-10)&&indexValue()>=peakIndex*(1-c.stressRecoveryDrawdown/100)*(1-1e-10);
  const replenishTo=policy==='annual'?cashTarget:policy==='conditional'?(healthy?cashTarget:cashFloor):0;
  if(t<c.retireYears+c.horizon&&cash<replenishTo){refillSold=sell(replenishTo-cash);cash+=refillSold;if(indexValue()<peakIndex*(1-1e-8))downMarketSold+=refillSold;}
  const cashReinvested=c.stressCashCap?Math.max(0,cash-cashTarget):0;
  if(cashReinvested>0){const ratio=stockPctFor(c,t-1)/100;cash-=cashReinvested;vShares+=cashReinvested*ratio/vp;sShares+=cashReinvested*(1-ratio)/sp;}
  const deflator=Math.pow(1+c.inflation/100,t),nextMonthly=c.monthlyBudget*Math.pow(1+c.inflation/100,t+1/12);
  rows.push({elapsed:t,year:c.startYear+t,age:c.startYear+t-c.birthYear,working:false,saving:0,extraAsset,severance,vtiContribution:0,schdContribution:0,safeContribution:0,vti:vShares*vp,schd:sShares*sp,cash,total:vShares*vp+sShares*sp+cash,deflator,netDividend,grossDividend,netInterest,requestedWithdrawal,withdrawal,stockSold,cashUsed,unfunded,income,budget,realIncome,realBudget,realNaturalIncome,realGap,livingGap,maxMonthlyGapReal,firstGapMonth,firstUnfundedMonth,hadEmpty,hadLivingGap:firstGapMonth!==null,hadUnfunded:firstUnfundedMonth!==null,withdrawalBase,spendingCap,spendingRate:withdrawalBase>0?income/withdrawalBase*100:0,capReduction,monthsNeedingWork,workNeeded:livingGap,realWorkNeeded:realGap,refillSold,cashReinvested,marketMonths:months,downMarketSold,minCashMonths:Number.isFinite(minCashMonths)?minCashMonths:null,cashMonths:nextMonthly>0?cash/nextMonthly:null,cashTarget,cashFloor,marketDrawdown:1-indexValue()/peakIndex,refillEligible:healthy,vtiReturn:ytdV-1,schdReturn:ytdS-1});
 }
 return rows;
}
// Seeded annual paths remain available for the original calculation checks.
function stressRandom(seed){let state=seed>>>0;return ()=>{state=(state+0x6D2B79F5)>>>0;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return (((x^(x>>>14))>>>0)+.5)/4294967296;};}
function stressShock(v,s,c){const factor=r=>r<=-.20?Math.max(0,1+r*c.stressDividendCut/100):1;return {vtiReturn:v,schdReturn:s,vtiDividendFactor:factor(v),schdDividendFactor:factor(s)};}
function randomMarketPath(c,random){
 const path=[],rho=c.stressCorr/100,sigmaV=c.stressVtiVol/100,sigmaS=c.stressSchdVol/100;
 for(let t=1;t<=c.retireYears+c.horizon;t++){
  // Consume the same draws across settings so policy comparisons share shocks.
  const radius=Math.sqrt(-2*Math.log(random())),angle=2*Math.PI*random(),zV=radius*Math.cos(angle),zS=rho*zV+Math.sqrt(Math.max(0,1-rho*rho))*radius*Math.sin(angle);
  if(c.stressScope==='retirement'&&t<=c.retireYears){path.push({});continue;}
  const v=Math.expm1(Math.log1p(c.vtiPriceGrowth/100)+sigmaV*zV),s=Math.expm1(Math.log1p(c.schdPriceGrowth/100)+sigmaS*zS);
  path.push(stressShock(v,s,c));
 }
 return path;
}
function stressConfig(c){return {...c,withdrawMode:c.stressSpending==='budget'?'budget':c.withdrawMode};}
function crashMarketPath(c,late=false){
 if(c.stressReturnMode==='anchored'){
  const total=c.horizon*12,duration=Math.min(c.stressCrashDuration*12,Math.floor(total/2)),start=late?total-2*duration:0;
  const crash=Math.log1p(-c.stressCrash/100)/12,baseV=Math.log1p(c.vtiPriceGrowth/100)/12,baseS=Math.log1p(c.schdPriceGrowth/100)/12;
  return Array.from({length:c.retireYears+c.horizon},(_,i)=>{
   const months=Array.from({length:12},(_,m)=>{const at=(i-c.retireYears)*12+m,inCrash=at>=start&&at<start+duration,inRecovery=at>=start+duration&&at<start+2*duration;
    return {vtiReturn:Math.expm1(c.stressCrash===0?baseV:inCrash?crash:inRecovery?2*baseV-crash:baseV),schdReturn:Math.expm1(c.stressCrash===0?baseS:inCrash?crash:inRecovery?2*baseS-crash:baseS)};});
   const v=months.reduce((value,m)=>value*(1+m.vtiReturn),1)-1,s=months.reduce((value,m)=>value*(1+m.schdReturn),1)-1;
   return {...stressShock(v,s,c),months};
  });
 }
 const duration=Math.min(c.horizon,c.stressCrashDuration),start=late?c.horizon-duration:0;
 return Array.from({length:c.retireYears+c.horizon},(_,i)=>i>=c.retireYears+start&&i<c.retireYears+start+duration?stressShock(-c.stressCrash/100,-c.stressCrash/100,c):{});
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
export { DEFAULTS, BUFFER_POLICIES, normalizeConfig, contributionFor, safePctFor, stockPctFor, severanceYearFor, severanceFor, extraAssetFor, monthlyBudgetTotal, validateConfig, validateStress, simulate, monthlyMarketPath, futureYearBudget, simulateMonthly, stressRandom, stressShock, randomMarketPath, stressConfig, crashMarketPath, stressPathSummary, createStressAccumulator, addStressPath, stressQuantile, finishStress };
