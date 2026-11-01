import { fundKeys, fundName, fundSetting, newFund, FUND_PRESETS, ETF_KEYS, ETF_CAPS, finalSavingSafeFor, etfRatiosFor, allocationFor, DEFAULTS, BUFFER_POLICIES, normalizeConfig, contributionFor, safePctFor, stockPctFor, severanceYearFor, severanceFor, extraAssetFor, severanceAllocationFor, receiptAllocationFor, monthlyBudgetTotal, validateConfig, validateStress, simulate, monthlyMarketPath, futureYearBudget, simulateMonthly, stressRandom, stressShock, randomMarketPath, stressConfig, crashMarketPath, stressPathSummary, createStressAccumulator, addStressPath, stressQuantile, finishStress } from './engine.js';

'use strict';
const $=id=>document.getElementById(id),storageKey='retirement-planner-local-v1',historyStorageKey='retirement-planner-records-v1';
let config=structuredClone(DEFAULTS),projection=[],stressResult=null,stressVersion=0,stressRunning=false,stressActiveKey='';
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){const candidate=normalizeConfig(saved);if(!validateConfig(candidate))config=candidate;}}catch{}
const fieldKeys=Object.keys(DEFAULTS).filter(k=>!Array.isArray(DEFAULTS[k]));
const fundColors={vti:'#176c60',schd:'#be8538',aor:'#426a9c',aoa:'#8465a5',safe:'#9aafa3'};
const colorFor=(k,c=config)=>fundColors[k]||(c.customFunds||[]).find(f=>f.id===k)?.color||'#a15377';
const escapeHtml=v=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const customBulk=new Map(),customSeverance=new Map();
let activeTab='plan';
function showTab(key,focus=false){
 if(!['plan','stress','funds'].includes(key))return;activeTab=key;hideChartTooltip();
 for(const name of ['plan','stress','funds']){$(name+'Tab').classList.toggle('hidden',name!==key);$(name+'TabButton').setAttribute('aria-selected',String(name===key));$(name+'TabButton').setAttribute('tabindex',name===key?'0':'-1');}
 $('plannerSettings').classList.toggle('hidden',key!=='plan');$('plannerLayout').classList.toggle('wide',key!=='plan');$('toggleSettings').classList.toggle('hidden',key!=='plan');
 if(focus)$(key+'TabButton').focus();
}
function fundField(label,value,attrs={}){
 const field=historyElement('div','field'),caption=historyElement('label','',label),box=historyElement('div','inputbox'),input=historyElement('input');
 Object.assign(input,{type:'number',value,min:'0',step:'0.1'},attrs);input.setAttribute('aria-label',label);box.append(input);field.append(caption,box);return {field,input};
}
function renderFundControls(preserveBulk=false){
 const previous=preserveBulk?new Map([...customBulk].map(([id,input])=>[id,input.value])):new Map();
 customBulk.clear();customSeverance.clear();$('customBulkInputs').replaceChildren();$('customSeveranceFields').replaceChildren();
 for(const f of config.customFunds){
  const bulk=fundField('ETF 내 '+f.name+' %',previous.get(f.id)??f.allocations[0],{max:'100',className:'allocation-input'});customBulk.set(f.id,bulk.input);$('customBulkInputs').append(bulk.field);
  const sev=fundField('퇴직금 전체 중 '+f.name+' %',f.severancePct,{max:'100'});customSeverance.set(f.id,sev.input);$('customSeveranceFields').append(sev.field);
  sev.input.addEventListener('input',()=>{f.severancePct=sev.input.value===''?NaN:Number(sev.input.value);update();});
 }
}
function renderFundManager(){
 const list=$('customFundList');list.replaceChildren();
 if(!config.customFunds.length)list.append(historyElement('p','help','추가한 종목이 없습니다. 위에서 이름을 입력하거나 빠른 추가를 선택하세요.'));
 for(const f of config.customFunds){
  const card=historyElement('article','fund-card'),head=historyElement('div','fund-card-head'),title=historyElement('h3','',f.name),remove=historyElement('button','','삭제'),fields=historyElement('div','fund-fields');
  remove.type='button';remove.setAttribute('aria-label',f.name+' 삭제');remove.addEventListener('click',()=>{
   if(f.initial>0||f.allocations.some(v=>v!==0)||f.severancePct!==0){$('fundManagerStatus').textContent='보유액·모든 연도 투자 비중·퇴직금 별도 비중을 먼저 0으로 바꿔 주세요. 자산이 사라지지 않도록 사용 중인 종목은 삭제하지 않습니다.';return;}
   config.customFunds=config.customFunds.filter(item=>item.id!==f.id);renderFundManager();renderFundControls();update();$('fundManagerStatus').textContent='종목을 삭제했습니다.';
  });head.append(title,remove);card.append(head);
  for(const [key,label,low,high,step] of [['name','종목 이름',null,null,null],['initial','현재 보유 평가액 · 만원',0,10000000,100],['priceGrowth','배당 제외 주가 상승률 · %/년',-50,50,.5],['yield','시작 분배율 · %/년',0,30,.01],['dividendGrowth','주당 분배금 증가율 · %/년',-50,50,.5],['tax','분배금 유효 세율 · %',0,100,.1],['vol','스트레스 연간 변동성 · %',0,60,1],['crash','급락 비교 연간 하락률 · %',0,90,5],['color','차트 색상',null,null,null]]){
   const entry=fundField(label,f[key],{min:String(low),max:String(high),step:String(step)}),input=entry.input;
   if(key==='name'){input.type='text';input.maxLength=80;}if(key==='color')input.type='color';
   input.setAttribute('data-fund-id',f.id);input.setAttribute('data-fund-key',key);input.setAttribute('aria-label',f.name+' '+label);
   input.addEventListener('input',()=>{f[key]=['name','color'].includes(key)?input.value:input.value===''?NaN:Number(input.value);if(key==='name'){title.textContent=f.name;renderFundControls(true);}update();});fields.append(entry.field);
  }
  card.append(fields);list.append(card);
 }
 $('addFund').disabled=config.customFunds.length>=12;
}
function addRegisteredFund(name){
 readFields();name=String(name).trim();if(!name||name.length>80){$('fundManagerStatus').textContent='종목 이름을 1~80자로 입력하세요.';return;}
 if(config.customFunds.length>=12){$('fundManagerStatus').textContent='추가 종목은 최대 12개입니다.';return;}
 if(config.customFunds.some(f=>f.name===name)){$('fundManagerStatus').textContent='같은 이름의 종목이 이미 있습니다.';return;}
 const id='fund_'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now().toString(36)+Math.random().toString(36).slice(2));
 const fund=newFund(id,name),palette=['#a15377','#62843b','#b65d34','#477a87','#9c6a27','#735d99','#537f73','#a74f55','#697b9b','#8f744f','#686b37','#9b688b'];fund.color=palette.find(color=>!config.customFunds.some(f=>f.color===color))||palette[config.customFunds.length%palette.length];config.customFunds.push(fund);$('newFundName').value='';renderFundManager();renderFundControls();update();$('fundManagerStatus').textContent=name+' 추가됨 · 분배율은 0%로 시작합니다. 보유액과 가정을 입력하고 은퇴 계획 탭에서 투자 비율을 정하세요.';
}
function renderLegends(){
 const entries=fundKeys(config).map(k=>'<span><i style="background:'+colorFor(k)+'"></i>'+escapeHtml(fundName(config,k))+'</span>').join('');
 $('assetLegend').innerHTML=entries+'<span><i style="background:'+fundColors.safe+'"></i>원화 안전자산</span>';
 $('marketLegend').innerHTML='<span><i style="background:#df9690"></i>추가 근로 필요 연도</span>'+entries;
}
function csvCell(value){const s=String(value);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
const amount=v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:0});
const decimal=v=>Number(v).toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1});
function cashText(v){return Math.abs(v)>=10000?decimal(v/10000)+'억원':amount(v)+'만원';}
function assetHtml(v){return Math.abs(v)>=10000?decimal(v/10000)+'<span> 억원</span>':amount(v)+'<span> 만원</span>';}
function displayValue(v,row){return config.realTerms?v/row.deflator:v;}
function fillFields(){for(const k of fieldKeys){const el=$(k);if(el.type==='checkbox')el.checked=config[k];else el.value=config[k];}$('bulkSafeRatio').value=config.safeSavingPct;const bulk=etfRatiosFor(config,0);$('bulkRatio').value=bulk.vti;$('bulkAorRatio').value=bulk.aor;$('bulkAoaRatio').value=bulk.aoa;renderBudgetItems();renderFundManager();renderFundControls();}
function readFields(){for(const k of fieldKeys){const el=$(k);config[k]=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:el.value===''?NaN:Number(el.value);}}
function renderBudgetItems(){
 const list=$('budgetItemsList');list.replaceChildren();
 if(!config.budgetItems.length)list.append(historyElement('p','help','항목을 추가해 현재 기준 생활비를 정리하세요. 금액 단위는 만원입니다.'));
 config.budgetItems.forEach((item,i)=>{
  const row=historyElement('div','budget-item'),name=historyElement('input','budget-name'),money=historyElement('input','budget-money'),frequency=historyElement('select','budget-frequency'),remove=historyElement('button','budget-remove','삭제');
  name.type='text';name.value=item.name;name.maxLength=80;name.placeholder='식비 · 관리비 등';name.setAttribute('aria-label',(i+1)+'번 생활비 항목 이름');
  money.type='number';money.value=Number.isFinite(item.amount)?item.amount:'';money.min='0';money.max='100000';money.step='.1';money.setAttribute('aria-label',(i+1)+'번 생활비 금액 · 만원');
  for(const [value,label] of [['monthly','매월'],['annual','연간']]){const option=historyElement('option','',label);option.value=value;frequency.append(option);}frequency.value=item.frequency;frequency.setAttribute('aria-label',(i+1)+'번 생활비 지출 주기');
  for(const [input,key] of [[name,'name'],[money,'amount'],[frequency,'frequency']]){input.setAttribute('data-budget-index',String(i));input.setAttribute('data-budget-key',key);}
  remove.type='button';remove.setAttribute('data-budget-remove',String(i));remove.setAttribute('aria-label',(item.name||'생활비 항목')+' 삭제');row.append(name,money,frequency,remove);list.append(row);
 });
 refreshBudgetSummary();
}
function refreshBudgetSummary(){
 const total=monthlyBudgetTotal(config.budgetItems),valid=Number.isFinite(total)&&total>=0&&total<=100000;
 $('budgetMonthlyTotal').textContent=valid?decimal(total)+'만원 / 월':'항목 금액 확인';
 $('applyBudgetTotal').disabled=!valid||!config.budgetItems.length;
 $('budgetItemsNote').textContent=!valid?'항목 금액과 합계를 확인하세요. 목표 생활비는 월 100,000만원 이하여야 합니다.':!config.budgetItems.length?'목표 생활비는 항목을 추가한 뒤 ‘합계 반영’을 눌러 변경합니다.':Math.abs(total-config.monthlyBudget)<1e-7?'항목 합계와 현재 목표 생활비가 같습니다.':'현재 목표 생활비는 월 '+decimal(config.monthlyBudget)+'만원입니다. ‘합계 반영’을 누르면 위 합계로 바뀝니다.';
}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(config));$('saveStatus').textContent='현재 입력 자동 저장됨';}catch{$('saveStatus').textContent='자동 저장을 사용할 수 없습니다. JSON 내보내기를 이용하세요.';}}
function setError(message){$('errorBox').textContent=message;$('errorBox').classList.toggle('hidden',!message);if(message){document.querySelectorAll('.metric-value').forEach(e=>e.textContent='입력 확인');$('retireAssetsNote').textContent='아래 결과는 마지막 유효한 입력 기준입니다.';}}
function renderSeverancePanel(){
 const linked=config.severanceTiming==='retirement',year=severanceYearFor(config),field=$('severanceYear');
 field.disabled=linked;field.min=config.startYear;field.max=config.startYear+config.retireYears+config.horizon;
 if(linked){config.severanceYear=year;field.value=year;}
 const custom=config.severanceAllocation==='custom',index=Math.max(0,year-config.startYear-1),ratio=severanceAllocationFor(config,index,year>config.startYear),valid=[ratio.safe,...fundKeys(config).map(k=>ratio[k])].every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&(!custom||config.severanceSafePct+config.severanceVtiPct+config.severanceAorPct+config.severanceAoaPct+config.customFunds.reduce((sum,f)=>sum+f.severancePct,0)<=100+1e-8);
 $('severanceCustomFields').classList.toggle('hidden',!custom);$('customSeveranceFields').classList.toggle('hidden',!custom);for(const input of customSeverance.values())input.disabled=!custom;
 for(const id of ['severanceSafePct','severanceVtiPct','severanceAorPct','severanceAoaPct'])$(id).disabled=!custom;
 $('severanceSchdPct').textContent=valid?decimal(ratio.schd)+'%':'비율 확인';
 $('severanceNote').textContent=!valid?'퇴직금 배분 비율을 확인하세요.':config.severanceAmount>0?year+'년'+(year===config.startYear?' 시작 시점':' 말')+'에 '+cashText(config.severanceAmount)+' 반영 · '+[...fundKeys(config).map(k=>[fundName(config,k),ratio[k]]),['안전자산',ratio.safe]].map(([name,pct])=>name+' '+decimal(pct)+'% ('+cashText(config.severanceAmount*pct/100)+')').join(' / ')+'. '+(custom?'퇴직금만 별도 비율을 사용합니다. 저축·기타 추가 자산의 비율은 연도별 설정을 따릅니다.':year===config.startYear?'첫 신규 투자 비율을 사용합니다.':'해당 연도의 신규 투자 비율을 사용합니다.')+' 스트레스 테스트의 수령 후 안전자산 보충·상한 규칙은 그대로 적용됩니다.':'퇴직금을 입력하면 수령 시점과 투자 배분이 표시됩니다. 자동 연결은 저축 종료 연도 말 수령이며, 즉시 퇴직은 시작 시점 수령입니다.';
}
function renderAllocation(){
 const count=Math.max(1,config.retireYears+config.horizon);let html='';
 for(let i=0;i<count;i++){
  const ratios=etfRatiosFor(config,i),cells=allocationCells(i),year=config.startYear+i+1,finalSafe=finalSavingSafeFor(config,i);
  const input=(key,value,label)=>'<input class="allocation-input" type="number" min="0" max="100" step="0.1" value="'+value+'" data-year="'+i+'" data-kind="'+key+'" aria-label="'+year+'년 ETF 내 '+label+' 비율">';
  html+='<tr><td>'+year+'년 · '+(i<config.retireYears?'저축':'은퇴')+(finalSafe?'<span class="receipt-note">안전자산 100% 옵션</span>':'')+'</td><td>'+amount(cells.saving)+'</td><td><input class="allocation-input" style="width:100px" type="number" min="0" max="10000000" step="100" value="'+(config.extraAssets[i]||'')+'" placeholder="0" data-year="'+i+'" data-kind="extra" aria-label="'+year+'년 세후 기타 추가 자산 · 만원">'+(severanceFor(config,i+1)>0?'<span class="receipt-note">퇴직금 +'+amount(severanceFor(config,i+1))+'</span>':'')+'</td><td><input class="allocation-input" type="number" min="0" max="100" step="0.1" value="'+(finalSafe?100:config.safeAllocations[i]??'')+'"'+(finalSafe?' disabled':'')+' placeholder="'+config.safeSavingPct+'" data-year="'+i+'" data-kind="safe" aria-label="'+year+'년 안전자산 비율"></td><td>'+input('vti',ratios.vti,'VTI')+'</td><td>'+decimal(ratios.schd)+'</td><td>'+input('aor',ratios.aor,'AOR')+'</td><td>'+input('aoa',ratios.aoa,'AOA')+'</td>'+config.customFunds.map(f=>'<td>'+input(f.id,ratios[f.id],escapeHtml(f.name))+'</td>').join('')+'<td>'+cells.percent+'</td><td>'+cells.money+'</td></tr>';
 }
 $('allocationRows').innerHTML=html;
 $('allocationHeaders').innerHTML=['투자 연도','연간 저축 · 만원','기타 추가 자산 · 세후 만원','안전자산 %',...fundKeys(config).map(k=>'ETF 내 '+fundName(config,k)+' %'),'전체 배분 비율 · '+[...fundKeys(config).map(k=>fundName(config,k)),'안전자산'].join(' / '),'신규 투자금 · 만원 · 같은 순서'].map(v=>'<th>'+escapeHtml(v)+'</th>').join('');
 $('allocationNote').textContent='안전자산 공란은 기본 비중('+decimal(config.safeSavingPct)+'%)을 사용합니다. 안전자산을 제외한 ETF 자금에서 SCHD 외 각 종목 비율을 정하고 나머지는 SCHD입니다. 이 표에는 퇴직금 외의 기타 추가 자산만 세후 명목금액으로 입력하세요. 저축·기타 자산은 해당 행, 퇴직금은 패널의 비율로 배분하며 전체 비율·금액은 합산 결과입니다. 수령 전 생활비·수익에 소급 반영하지 않습니다. 첫 행의 ETF 비율은 최초 현금 투자에도 적용합니다. AOR·AOA 내부 채권은 별도 안전자산 잔액에 포함하지 않습니다.';
}
function allocationCells(i){
 const saving=i<config.retireYears?contributionFor(config,i):0,total=saving+extraAssetFor(config,i+1),receipt=receiptAllocationFor(config,i+1),annual=allocationFor(config,i),keys=[...fundKeys(config),'safe'];
 const money=Object.fromEntries(keys.map(k=>[k,saving*annual[k]/100+receipt[k]])),ratios=Object.fromEntries(keys.map(k=>[k,total>0?money[k]/total*100:annual[k]]));
 return {saving,percent:keys.map(k=>decimal(ratios[k])).join(' / '),money:keys.map(k=>amount(money[k])).join(' / ')+'<div class="ratio-bar">'+keys.map(k=>'<i style="width:'+ratios[k]+'%;background:'+colorFor(k)+'"></i>').join('')+'</div>'};
}
let tooltipChart=null;
function hideChartTooltip(){tooltipChart=null;$('chartTooltip').classList.add('hidden');$('chartHoverLine').classList.add('hidden');}
function showChartValue(target,index,position){
 const data=target._chartData;if(!data||!data.rows.length)return;
 index=Math.max(0,Math.min(data.rows.length-1,index));target._chartIndex=index;tooltipChart=target;
 const row=data.rows[index],tip=$('chartTooltip'),line=$('chartHoverLine'),rect=target.getBoundingClientRect();
 const work=data.workByYear?.get(row.year),date=row.year+'년'+(row.month?' '+row.month+'월':' 말')+(work?' · 추가 근로 필요':'');
 tip.replaceChildren(historyElement('div','chart-tooltip-title',date),historyElement('div','chart-tooltip-basis',data.basis+' · '+data.unit));
 for(const item of data.series){
  const value=item.values[index],entry=historyElement('div','chart-tooltip-row'),label=historyElement('span','',item.label),number=historyElement('strong','',Number.isFinite(value)?Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2})+' '+data.unit:'—');
  label.style.color=item.color==='#dae9e0'?'#5a7168':item.color;entry.append(label,number);tip.append(entry);
 }
 if(work){const entry=historyElement('div','chart-tooltip-row'),label=historyElement('span','','근로 필요 · 현재 가치'),number=historyElement('strong','',Number(work.realWorkNeeded/12).toLocaleString('ko-KR',{maximumFractionDigits:2})+' 만원/월');entry.append(label,number);tip.append(entry);}
 tip.classList.remove('hidden');
 const screenX=rect.left+(data.left+(data.rows.length>1?index/(data.rows.length-1):0)*data.plotW)/900*rect.width;
 const px=position?.x??screenX,py=position?.y??(rect.top+data.top/data.height*rect.height),vw=globalThis.innerWidth||1024,vh=globalThis.innerHeight||768,tw=tip.offsetWidth||250,th=tip.offsetHeight||160;
 tip.style.left=Math.max(8,Math.min(px+14,vw-tw-8))+'px';tip.style.top=Math.max(8,Math.min(py+14,vh-th-8))+'px';
 line.style.left=screenX+'px';line.style.top=(rect.top+data.top/data.height*rect.height)+'px';line.style.height=data.plotH/data.height*rect.height+'px';line.classList.remove('hidden');
}
function bindChartInspection(target,data){
 if(tooltipChart===target)hideChartTooltip();target._chartData=data;
 if(target._chartEventsBound)return;target._chartEventsBound=true;
 target.setAttribute('tabindex','0');target.setAttribute('aria-describedby','chartHoverHint chartTooltip');
 const pointer=e=>{
  const info=target._chartData,rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const px=(e.clientX-rect.left)/rect.width*900,py=(e.clientY-rect.top)/rect.height*info.height;
  if(px<info.left||px>info.left+info.plotW||py<info.top||py>info.top+info.plotH){if(tooltipChart===target)hideChartTooltip();return;}
  const index=Math.round((px-info.left)/info.plotW*(info.rows.length-1));showChartValue(target,index,{x:e.clientX,y:e.clientY});
 };
 target.addEventListener('pointermove',pointer);target.addEventListener('pointerdown',pointer);
 target.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'&&tooltipChart===target)hideChartTooltip();});
 for(const event of ['pointercancel','blur'])target.addEventListener(event,()=>{if(tooltipChart===target)hideChartTooltip();});
 target.addEventListener('focus',()=>showChartValue(target,target._chartIndex??0));
 target.addEventListener('keydown',e=>{
  if(e.key==='Escape'){hideChartTooltip();return;}
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const last=target._chartData.rows.length-1,index=e.key==='Home'?0:e.key==='End'?last:(target._chartIndex??0)+(e.key==='ArrowRight'?1:-1);
  showChartValue(target,index);
 });
}
if(typeof addEventListener==='function'){addEventListener('scroll',hideChartTooltip,true);addEventListener('resize',hideChartTooltip);addEventListener('pointerdown',e=>{if(tooltipChart&&!tooltipChart.contains(e.target))hideChartTooltip();},true);}
function svgChart(target,series,rows,height,retireLine,inspection={}){
 const width=900,left=64,right=22,top=22,bottom=35,plotW=width-left-right,plotH=height-top-bottom;
 const all=series.flatMap(s=>s.values);const maxRaw=Math.max(1,...all),step=Math.pow(10,Math.floor(Math.log10(maxRaw)))/2,max=Math.ceil(maxRaw/step)*step;
 const x=i=>left+(rows.length>1?i/(rows.length-1):0)*plotW,y=v=>top+plotH-v/max*plotH;
 const paths=series.map(s=>s.values.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)).join(' '));
 let svg='<title>'+target.getAttribute('aria-label')+'</title>';
 if(inspection.highlightYears){for(let i=0;i<rows.length;i++){if(!inspection.highlightYears.has(rows[i].year))continue;let end=i;while(end+1<rows.length&&inspection.highlightYears.has(rows[end+1].year))end++;const a=i===0?left:(x(i-1)+x(i))/2,b=end===rows.length-1?width-right:(x(end)+x(end+1))/2;svg+='<rect class="chart-work-period" x="'+a.toFixed(2)+'" y="'+top+'" width="'+Math.max(1,b-a).toFixed(2)+'" height="'+plotH+'"/>';i=end;}}

 for(let j=0;j<=4;j++){const val=max*j/4,yy=y(val);svg+='<line x1="'+left+'" x2="'+(width-right)+'" y1="'+yy+'" y2="'+yy+'" stroke="#e7ece7"/><text x="'+(left-10)+'" y="'+(yy+4)+'" text-anchor="end" fill="#718279" font-size="11">'+(val>=10000?decimal(val/10000)+'억':amount(val))+'</text>';}
 series.forEach((s,i)=>{if(s.area){const under=s.under||rows.map(()=>0);const d=paths[i]+' '+under.map((v,j)=>'L'+x(rows.length-1-j).toFixed(2)+','+y(under[rows.length-1-j]).toFixed(2)).join(' ')+' Z';svg+='<path d="'+d+'" fill="'+s.color+'" opacity="'+(s.opacity||.9)+'"/>';}});
 series.forEach((s,i)=>{svg+='<path d="'+paths[i]+'" fill="none" stroke="'+s.color+'" stroke-width="'+(s.width||2.5)+'"'+(s.dashed?' stroke-dasharray="5 5"':'')+'/>';});
 if(retireLine!==null&&retireLine!==undefined){const ii=rows.findIndex(r=>r.elapsed===retireLine);if(ii>=0){const xx=x(ii);svg+='<line x1="'+xx+'" x2="'+xx+'" y1="'+top+'" y2="'+(height-bottom)+'" stroke="#6b8579" stroke-dasharray="4 5"/><text x="'+Math.min(width-right-70,xx+7)+'" y="'+(top+12)+'" fill="#526d60" font-size="11">저축 종료</text>';}}
 const indices=[...new Set([0,Math.round((rows.length-1)/4),Math.round((rows.length-1)/2),Math.round((rows.length-1)*3/4),rows.length-1])];
 indices.forEach(i=>{svg+='<text x="'+x(i)+'" y="'+(height-10)+'" text-anchor="middle" fill="#718279" font-size="11">'+rows[i].year+'</text>';});
 svg+='<rect x="'+left+'" y="'+top+'" width="'+plotW+'" height="'+plotH+'" fill="transparent" pointer-events="all"/>';
 target.innerHTML=svg;
 bindChartInspection(target,{rows,series:inspection.series||series.filter(s=>s.label),unit:inspection.unit||'만원',basis:inspection.basis||(config.realTerms?'현재 구매력':'해당 시점 명목금액'),height,left,top,plotW,plotH,workByYear:inspection.workByYear});
}
function renderCharts(){
 const rows=projection;
 const keys=[...fundKeys(config),'cash'],colors={...Object.fromEntries(fundKeys(config).map(k=>[k,colorFor(k)])),cash:fundColors.safe},layers=[];let previous=rows.map(()=>0);
 for(const k of keys){const under=previous,values=rows.map((r,i)=>under[i]+displayValue(r[k],r));layers.push({values,under,color:colors[k],area:true});previous=values;}
 svgChart($('assetChart'),layers.reverse(),rows,280,config.retireYears,{series:[...keys.map(k=>({label:k==='cash'?'안전자산':fundName(config,k),values:rows.map(r=>displayValue(r[k],r)),color:colors[k]})),{label:'총자산',values:rows.map(r=>displayValue(r.total,r)),color:'#1d3432'}]});
 const retired=rows.filter(r=>r.elapsed>config.retireYears);
 svgChart($('incomeChart'),[{label:'세후 배당·이자',values:retired.map(r=>displayValue((r.netDividend+r.netInterest)/12,r)),color:'#176c60'},{label:'추가 인출 포함',values:retired.map(r=>displayValue(r.income/12,r)),color:'#426a9c'},{label:'목표 생활비',values:retired.map(r=>displayValue(r.budget/12,r)),color:'#718279',dashed:true,width:2}],retired,225,null,{unit:'만원/월'});
}
function renderSummary(){
 const ret=projection[config.retireYears],first=projection[config.retireYears+1],ten=projection[config.retireYears+10];
 const basis=config.realTerms?'현재 구매력':'해당 시점 명목금액';
 const signed=v=>(v>0?'+':'')+decimal(v)+'%';
 $('customActiveRates').replaceChildren();
 for(const k of fundKeys(config)){const target=ETF_CAPS[k]?$('active'+ETF_CAPS[k]+'Rates'):historyElement('span');if(!ETF_CAPS[k])$('customActiveRates').append(target);target.textContent=fundName(config,k)+' · 주가 '+signed(fundSetting(config,k,'PriceGrowth'))+'/년 · 시작 분배율 '+Number(fundSetting(config,k,'Yield')).toLocaleString('ko-KR',{maximumFractionDigits:2})+'% · 주당 분배금 '+signed(fundSetting(config,k,'DividendGrowth'))+'/년';}
 $('timelineLabel').textContent=config.startYear+'년 시작 · '+ret.year+'년 저축 종료 · '+ret.age+'세 · '+basis;
 $('retireAssets').innerHTML=assetHtml(displayValue(ret.total,ret));
 $('retireAssetsNote').textContent=ret.year+'년 말 · '+basis;
 $('retireIncome').innerHTML=decimal(displayValue(first.income/12,first))+'<span> 만원</span>';
 $('retireIncomeNote').textContent=first.year+'년 · 배당·이자 + 추가 인출';
 $('afterTenAssets').innerHTML=ten?assetHtml(displayValue(ten.total,ten)):'기간 부족';
 $('afterTenNote').textContent=ten?ten.year+'년 말 · '+ten.age+'세':'은퇴 후 계산 기간을 10년 이상으로 설정하세요.';
 const monthly=[first.netDividend/12,first.netInterest/12,first.withdrawal/12],sum=monthly.reduce((a,b)=>a+b,0),colors=['#176c60','#9aafa3','#426a9c'];
 $('incomeStack').innerHTML=monthly.map((n,i)=>'<span style="width:'+(sum?n/sum*100:0)+'%;background:'+colors[i]+'"></span>').join('');
 $('incomeDividend').textContent=decimal(displayValue(first.netDividend/12,first))+'만원 / 월';
 $('incomeInterest').textContent=decimal(displayValue(first.netInterest/12,first))+'만원 / 월';
 $('incomeWithdrawal').textContent=decimal(displayValue(first.withdrawal/12,first))+'만원 / 월';
 $('incomeBudget').textContent=decimal(displayValue(first.budget/12,first))+'만원 / 월';
 const gap=displayValue((first.income-first.budget)/12,first);
 $('incomeGap').textContent=gap>=0?'첫 은퇴연도에 목표 생활비보다 월 '+decimal(gap)+'만원 여유가 있습니다.':'첫 은퇴연도에 목표 생활비보다 월 '+decimal(-gap)+'만원 부족합니다.';
 $('incomeGap').style.background=gap>=0?'#edf5ec':'#fff3e7';$('incomeGap').style.color=gap>=0?'#45675a':'#92522e';
 const keys=[...fundKeys(config),'cash'],parts=keys.map(k=>ret[k]);$('assetStack').innerHTML=parts.map((n,i)=>'<span style="width:'+(ret.total?n/ret.total*100:0)+'%;background:'+(keys[i]==='cash'?fundColors.safe:colorFor(keys[i]))+'"></span>').join('');
 $('customAssetSplit').replaceChildren();keys.forEach((k,i)=>{const target=k==='cash'?$('splitCash'):ETF_CAPS[k]?$('split'+ETF_CAPS[k]):historyElement('strong');if(k!=='cash'&&!ETF_CAPS[k]){const row=historyElement('div','split-row');row.append(historyElement('span','',fundName(config,k)),target);$('customAssetSplit').append(row);}target.textContent=cashText(displayValue(parts[i],ret))+' · '+decimal(ret.total?parts[i]/ret.total*100:0)+'%';});
 $('chartBasis').textContent='단위: 만원 · '+basis+' · 배당은 은퇴 전 재투자, 은퇴 후 생활비 사용';
 $('tableUnit').textContent='단위: 만원 · '+basis;
 const empty=projection.find(r=>r.unfunded>0.00001),messages=[];
 if(empty)messages.push(empty.year+'년부터 요청한 추가 인출을 전부 충당하지 못합니다. 재원 또는 인출액을 조정해 보세요.');
 if(fundKeys(config).some(k=>fundSetting(config,k,'DividendGrowth')>fundSetting(config,k,'PriceGrowth')+5))messages.push('배당이 주가보다 빠르게 증가하는 가정이 오래 지속되면 배당수익률이 크게 높아집니다. 장기 가정을 확인하세요.');
 $('warningBox').textContent=messages.join(' ');$('warningBox').classList.toggle('hidden',!messages.length);
}
function renderProjection(){
 $('projectionHeaders').innerHTML=['연도 / 나이','단계','저축액','추가 자산 합계 · 퇴직금 포함','세후 배당','세후 이자','추가 인출','미충당 인출',...fundKeys(config).map(k=>'기말 '+fundName(config,k)),'기말 안전자산','기말 합계','월 현금흐름','현재 가치 기준'].map(v=>'<th>'+escapeHtml(v)+'</th>').join('');
 $('projectionRows').innerHTML=projection.map(r=>'<tr class="'+(r.elapsed===config.retireYears?'retired-row':'')+'"><td>'+r.year+'년 / '+r.age+'세</td><td>'+(r.elapsed===0?'시작':r.working?'저축':'은퇴')+'</td>'+[r.saving,r.extraAsset||0,r.netDividend,r.netInterest,r.withdrawal,r.unfunded,...fundKeys(config).map(k=>r[k]),r.cash,r.total].map((v,i)=>'<td'+(i===5&&v>.001?' class="negative"':'')+'>'+amount(displayValue(v,r))+(i===1&&r.severance>0?'<span class="receipt-note">퇴직금 '+amount(displayValue(r.severance,r))+' 포함</span>':'')+'</td>').join('')+'<td>'+(r.working||r.elapsed===0?'—':decimal(displayValue(r.income/12,r)))+'</td><td>'+(r.working||r.elapsed===0?'—':decimal(r.income/12/r.deflator))+'</td></tr>').join('');
}
function stressInputKey(c){const copy={...c};delete copy.realTerms;delete copy.budgetItems;return JSON.stringify(copy);}
function stressBusy(busy){stressRunning=busy;$('runStress').disabled=busy;$('rerollStress').disabled=busy;$('stressProgress').classList.toggle('hidden',!busy);}
function refreshStressState(){
 const valid=!validateConfig(config),key=valid?stressInputKey(config):'';
 if(stressRunning&&key!==stressActiveKey){stressVersion++;stressBusy(false);}
 if(stressResult&&key===stressResult.key&&!stressRunning){renderStress();$('stressStatus').textContent='계산 완료 · '+amount(stressResult.count)+'개 경로 · 난수 번호 '+stressResult.config.stressSeed;return;}
 if(stressRunning)return;
 $('stressResults').classList.add('hidden');$('exportStress').disabled=true;
 $('stressStatus').textContent=!valid?'입력을 확인한 뒤 실행하세요.':stressResult?'설정이 바뀌었습니다. 다시 실행하면 새 설정으로 계산합니다.':'현재 설정으로 실행하면 결과가 표시됩니다. 설정과 결과는 자동으로 섞이지 않습니다.';
}
async function runStress(){
 update();if(validateConfig(config))return;
 const c=structuredClone(config),key=stressInputKey(c),effective=stressConfig(c),random=stressRandom(c.stressSeed),accumulators=Object.fromEntries(Object.keys(BUFFER_POLICIES).map(p=>[p,createStressAccumulator(c)])),version=++stressVersion;
 stressActiveKey=key;stressBusy(true);$('stressResults').classList.add('hidden');$('exportStress').disabled=true;$('stressProgress').value=0;
 $('stressStatus').textContent='시장 경로 계산 중 · 0 / '+amount(c.stressCount);
 try{
  for(let i=0;i<c.stressCount;i++){
   if(version!==stressVersion)return;
   const market=monthlyMarketPath(c,random);
   for(const policy of Object.keys(BUFFER_POLICIES))addStressPath(accumulators[policy],simulateMonthly(effective,market,policy),c);
   if((i+1)%10===0){$('stressProgress').value=(i+1)/c.stressCount*100;$('stressStatus').textContent='시장 경로 계산 중 · '+amount(i+1)+' / '+amount(c.stressCount)+' · 세 전략 비교';await new Promise(resolve=>setTimeout(resolve,0));}
  }
  if(version!==stressVersion)return;
  const strategies=Object.fromEntries(Object.entries(accumulators).map(([policy,acc])=>{const end=acc.values[acc.values.length-1].slice().sort((a,b)=>a-b),refills=acc.refills.slice().sort((a,b)=>a-b),down=acc.downSales.slice().sort((a,b)=>a-b);return [policy,{count:acc.count,supported:acc.supported,unfunded:acc.unfunded,empty:acc.empty,p10:stressQuantile(end,.1),p50:stressQuantile(end,.5),refills:stressQuantile(refills,.5),downSales:stressQuantile(down,.5)}];}));
  stressResult={...finishStress(accumulators[c.stressBufferPolicy],c,(settings,path)=>simulateMonthly(settings,path,c.stressBufferPolicy)),strategies,config:c,key};stressBusy(false);renderStress();
  $('stressStatus').textContent='계산 완료 · '+amount(c.stressCount)+'개 경로 · 난수 번호 '+c.stressSeed+' · 설정 변경 후 다시 실행하세요.';
 }catch(err){if(version!==stressVersion)return;stressBusy(false);$('stressStatus').textContent='시뮬레이션을 완료하지 못했습니다. '+err.message;}
}
function stressRows(){return stressResult.cases[$('stressTrace').value||'sample'].rows;}
function renderStress(){
 if(!stressResult)return;
 const result=stressResult,c=result.config,last=result.bands[result.bands.length-1],value=(v,row)=>config.realTerms?v/row.deflator:v,basis=config.realTerms?'현재 구매력':'해당 시점 명목금액',percent=n=>decimal(n/result.count*100)+'%';
 $('stressResults').classList.remove('hidden');$('exportStress').disabled=false;
 $('stressSupport').textContent=percent(result.supported);$('stressSupportNote').textContent=amount(result.supported)+' / '+amount(result.count)+'개 · 은퇴 '+c.horizon+'년 모두 충당';
 $('stressFailure').textContent=percent(result.unfunded);$('stressFailureNote').textContent='총자산 소진 경로 '+percent(result.empty)+' · 미충당과 별도 판정';
 $('stressMedian').innerHTML=assetHtml(value(last.p50,last));$('stressMedianNote').textContent='10~90백분위 '+cashText(value(last.p10,last))+' ~ '+cashText(value(last.p90,last));
 const spending=c.stressSpending==='budget'||c.withdrawMode==='budget'?'목표 생활비 부족분 인출':'배당·이자 + 연 추가 인출 '+amount(c.annualWithdrawal)+'만원';
 $('stressInterpretation').textContent='선택 전략: '+BUFFER_POLICIES[c.stressBufferPolicy]+' · 생활비: 현재 구매력 월 '+amount(c.monthlyBudget)+'만원 · '+spending+'. 세 전략 모두 안전자산을 먼저 쓰고, 부족할 때 '+(c.stressStockSale==='vtiFirst'?fundKeys(c).map(k=>fundName(c,k)).join('→')+' 순으로':'모든 ETF 보유가치 비례로')+' 매도합니다. 기본 계산의 인출 재원과는 별도입니다. '+(c.stressSpending==='plan'&&c.withdrawMode==='extra'?'정액 추가 인출 방식은 생활비가 부족해도 자동 증액하지 않습니다. ':'')+'생활비 충당은 모든 은퇴 월을 기준으로 판정합니다. 표시 비율은 모형 안의 경로 비중이며 실제 성공 확률이 아닙니다.';
 $('bufferStrategyRows').innerHTML=Object.entries(BUFFER_POLICIES).map(([policy,name])=>{const s=result.strategies[policy];return '<tr'+(policy===c.stressBufferPolicy?' class="retired-row"':'')+'><td>'+name+'</td><td>'+decimal(s.supported/s.count*100)+'%</td><td>'+decimal(s.unfunded/s.count*100)+'%</td><td>'+amount(value(s.p50,last))+'</td><td>'+amount(value(s.p10,last))+'</td><td>'+amount(s.refills)+'</td><td>'+amount(s.downSales)+'</td></tr>';}).join('');
 const selected=stressRows(),workRows=selected.filter(r=>r.monthsNeedingWork>0),workByYear=new Map(workRows.map(r=>[r.year,r])),workInspection={highlightYears:new Set(workByYear.keys()),workByYear};svgChart($('stressChart'),[{label:'90백분위',values:result.bands.map(r=>value(r.p90,r)),under:result.bands.map(r=>value(r.p10,r)),color:'#dae9e0',area:true,width:1},{label:'10백분위',values:result.bands.map(r=>value(r.p10,r)),color:'#dae9e0',width:1},{label:'중앙값',values:result.bands.map(r=>value(r.p50,r)),color:'#176c60'},{label:'선택 경로',values:selected.map(r=>value(r.total,r)),color:'#ac443a',width:2}],result.bands,280,c.retireYears,workInspection);
 $('stressBasis').textContent='단위: 만원 · '+basis+' · 음영은 각 연도별 10~90백분위입니다. 빨간 배경은 선택 경로의 추가 근로 필요 연도입니다. 선택 경로: '+result.cases[$('stressTrace').value||'sample'].name;
 const firstText=(r,month)=>r?r.year+'년'+(month?' '+month+'월':'')+' · 은퇴 '+(r.elapsed-c.retireYears)+'년차':'없음';
 $('stressCases').innerHTML=['sample','flat','early','late','worst'].map(k=>{const item=result.cases[k],s=stressPathSummary(item.rows,c);return '<tr><td>'+item.name+'</td><td>'+amount(value(s.retire.total,s.retire))+'</td><td>'+amount(value(s.final.total,s.final))+'</td><td'+(s.firstGap?' class="negative"':'')+'>'+firstText(s.firstGap,s.firstGap?.firstGapMonth)+'</td><td'+(s.firstUnfunded?' class="negative"':'')+'>'+firstText(s.firstUnfunded,s.firstUnfunded?.firstUnfundedMonth)+'</td><td>'+decimal(s.maxGapReal)+'</td></tr>';}).join('');
 const duration=c.stressReturnMode==='anchored'?Math.min(c.stressCrashDuration,c.horizon/2):Math.min(c.horizon,c.stressCrashDuration),loss=(1-Math.pow(1-c.stressCrash/100,duration))*100;
 $('stressScenarioNote').textContent='금액 단위: 만원 · '+basis+'. 초반·후반 급락은 무작위 경로와 별도로 만든 고정 비교입니다. 연 −'+decimal(c.stressCrash)+'%를 '+decimal(duration)+'년 적용(누적 −'+decimal(loss)+'%). '+(c.stressReturnMode==='anchored'?'급락 직후 같은 길이의 회복 구간을 두며, 두 경로의 최종 ETF 주가 연복리는 각각 설정값과 같습니다. 짧은 계산 기간에서는 급락 기간을 줄여 회복 구간을 확보합니다.':'그 외 기간은 기본 상승률이며, 손실 만회를 위한 강제 회복은 없습니다.')+' '+fundKeys(c).filter(k=>k!=='vti'&&k!=='schd').map(k=>fundName(c,k)+' 연 −'+decimal(fundSetting(c,k,'Crash'))+'%').join(' / ')+'를 같은 기간에 적용합니다. 주가 회복은 최종 보유자산 회복을 보장하지 않습니다.';
 const price=Object.fromEntries(fundKeys(config).map(k=>[k,100])),market=[{year:c.startYear,month:12,elapsed:0,...price}];
 for(const row of selected.slice(1)){
  const months=row.marketMonths||Array.from({length:12},()=>Object.fromEntries(fundKeys(config).map(k=>[k+'Return',Math.expm1(Math.log1p(row[k+'Return']??fundSetting(c,k,'PriceGrowth')/100)/12)])));
  for(let m=0;m<12;m++){for(const k of fundKeys(config))price[k]*=1+(months[m][k+'Return']??Math.expm1(Math.log1p(row[k+'Return']??fundSetting(c,k,'PriceGrowth')/100)/12));market.push({year:row.year,month:m+1,elapsed:row.elapsed-1+(m+1)/12,...price});}
 }
 svgChart($('stressMarketChart'),fundKeys(config).map(k=>({label:fundName(config,k),values:market.map(r=>r[k]),color:colorFor(k)})),market,225,c.retireYears,{...workInspection,unit:'지수',basis:'시작=100 · 배당·입출금 제외 명목 주가'});
 const years=c.retireYears+c.horizon;$('stressMarketNote').textContent='시작 지수 100 · 배당·입출금 제외 명목 주가 · 최종 주가 연복리 '+fundKeys(config).map(k=>fundName(config,k)+' '+decimal((Math.pow(price[k]/100,1/years)-1)*100)+'%').join(' / ')+'. '+(c.stressReturnMode==='anchored'?'최종 연복리 고정: 경로가 달라도 ETF별 마지막 주가는 같으며 인출 후 자산은 달라집니다.':'자유 경로: 최종 주가 수익률도 달라집니다.');
 const retired=selected.slice(c.retireYears+1);svgChart($('bufferCashChart'),[{label:'기말 안전자산',values:retired.map(r=>value(r.cash,r)),color:'#176c60'},{label:'목표·상한',values:retired.map(r=>value(r.cashTarget,r)),color:'#426a9c',dashed:true},{label:'최소 잔액',values:retired.map(r=>value(r.cashFloor,r)),color:'#be8538',dashed:true}],retired,225,null,workInspection);
 $('workNeedNote').textContent=(c.stressWithdrawalCap?'인출 상한 '+decimal(c.stressMaxWithdrawalRate)+'% 적용 · 연초 금융자산 기준 · ':'인출 상한 미적용 · ')+'선택 경로의 추가 근로 필요 연도 '+workRows.length+'년'+(workRows.length?' ('+workRows.slice(0,8).map(r=>r.year).join(' · ')+(workRows.length>8?' 외':'')+')':'')+'. 목표 생활비와 실제 투자자산 생활비 사용액의 차이를 표시합니다. 생활비는 감액하며 근로소득을 자산에 자동 입금하지 않습니다.';
 const summary=stressPathSummary(selected,c);$('bufferTraceNote').textContent='선택 경로 · 보충 매도 합계 '+cashText(summary.refillTotal)+' · 고점 미회복 중 매도 합계 '+cashText(summary.downSaleTotal)+' · 안전자산 초과분 재투자 '+cashText(retired.reduce((sum,r)=>sum+(r.cashReinvested||0)/r.deflator,0))+' · 모두 현재 가치 환산. 은퇴 중 안전자산 최소 잔여 생활비 '+(Number.isFinite(summary.minCashMonths)?decimal(summary.minCashMonths)+'개월':'지출 없음')+'. 고점 미회복 중 매도에는 생활비 매도와 보충 매도가 함께 포함됩니다.';
 $('stressTraceHeaders').innerHTML=['연도 / 은퇴 연차',...fundKeys(c).map(k=>fundName(c,k)+' 주가 수익률'),'월 배당·이자','생활비용 연 주식 매도','연 안전자산 인출','연 보충 매도','연 초과분 재투자','기말 안전자산','잔여 생활비 · 개월','기말 자산','월 현금흐름','월 현금흐름 · 현재 가치','가장 부족했던 월 · 현재 가치','실제 인출률 · 연초 금융자산 기준','상한에 따른 연 생활비 감액','추가 근로 필요액 · 현재 가치 월평균'].map(v=>'<th>'+escapeHtml(v)+'</th>').join('');
 $('stressTraceRows').innerHTML=retired.map(r=>'<tr'+(r.monthsNeedingWork>0?' class="work-required"':'')+'><td>'+r.year+'년 / '+(r.elapsed-c.retireYears)+'년차'+(r.monthsNeedingWork>0?'<span class="work-badge">추가 근로 필요 · '+r.monthsNeedingWork+'개월</span>':'')+'</td>'+fundKeys(c).map(k=>'<td'+(r[k+'Return']<0?' class="negative"':'')+'>'+decimal(r[k+'Return']*100)+'%</td>').join('')+'<td>'+decimal(config.realTerms?r.realNaturalIncome/12:(r.netDividend+r.netInterest)/12)+'</td><td>'+amount(value(r.stockSold,r))+'</td><td>'+amount(value(r.cashUsed,r))+'</td><td>'+amount(value(r.refillSold,r))+'</td><td>'+amount(value(r.cashReinvested,r))+'</td><td>'+amount(value(r.cash,r))+'</td><td>'+(r.cashMonths===null?'—':decimal(r.cashMonths))+'</td><td>'+amount(value(r.total,r))+'</td><td>'+decimal(config.realTerms?r.realIncome/12:r.income/12)+'</td><td>'+decimal(r.realIncome/12)+'</td><td'+(r.hadLivingGap?' class="negative"':'')+'>'+decimal(r.maxMonthlyGapReal)+'</td><td>'+decimal(r.spendingRate)+'%</td><td>'+amount(value(r.capReduction,r))+'</td><td>'+decimal(r.realWorkNeeded/12)+'</td></tr>').join('');
}
function update(rebuildSchedule=true){
 readFields();renderSeverancePanel();refreshBudgetSummary();$('savingGrowthUnit').textContent=config.savingGrowthMode==='fixed'?'만원':'%';$('retireYearsLabel').textContent=config.retireYears+'년';
 $('stressMaxWithdrawalRate').disabled=!config.stressWithdrawalCap;
 $('annualWithdrawal').disabled=config.withdrawMode==='budget';$('inflateWithdrawal').disabled=config.withdrawMode==='budget';
 $('retireNote').textContent=config.retireYears===0?'현재 자산으로 즉시 은퇴하는 경우를 계산합니다.':(config.startYear+1)+'~'+(config.startYear+config.retireYears)+'년 저축, '+(config.startYear+config.retireYears+1)+'년부터 인출합니다.';
 $('finalSavingSafeNote').textContent=(config.finalSavingSafeOnly?'옵션 적용 · ':'옵션을 켜면 · ')+(config.retireYears>0?(config.startYear+config.retireYears)+'년의 저축·기타 추가 자산과 연도별 비율을 따르는 퇴직금에 안전자산 100%를 적용합니다.':'즉시 은퇴에는 저축 연도가 없어 적용하지 않습니다.')+' 기존 보유 ETF와 시작 시점 투자·수령, 퇴직금 별도 배분은 유지합니다. 옵션을 끄면 기존 연도별 비율로 돌아갑니다.';
 const error=validateConfig(config);setError(error);refreshStressState();if(error)return;
 projection=simulate(config);renderLegends();if(rebuildSchedule)renderAllocation();renderSummary();renderCharts();renderProjection();persist();
}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let savedRecords=[],historyReadError='';
try{
 const stored=JSON.parse(localStorage.getItem(historyStorageKey)||'[]');
 if(!Array.isArray(stored))throw new Error('기록 목록 형식이 올바르지 않습니다.');
 savedRecords=stored.map(record=>{
  if(!record||typeof record.id!=='string'||typeof record.name!=='string'||!record.name.trim()||!Number.isFinite(Date.parse(record.savedAt))||!record.config||typeof record.config!=='object')throw new Error('저장된 기록의 내용을 확인할 수 없습니다.');
  const candidate=normalizeConfig(record.config),error=validateConfig(candidate);
  if(error)throw new Error(error);
  return {id:record.id,name:record.name.slice(0,80),savedAt:record.savedAt,config:candidate};
 });
}catch(err){historyReadError='저장 기록을 읽을 수 없습니다. 기존 기록을 보호하기 위해 새 기록 저장을 중단했습니다. 현재 설정은 JSON으로 내보낼 수 있습니다.';}
function historyMessage(message,failed=false){$('historyStatus').textContent=message;$('historyStatus').classList.toggle('failed',failed);}
function writeRecords(next){
 if(historyReadError){historyMessage(historyReadError,true);return false;}
 try{localStorage.setItem(historyStorageKey,JSON.stringify(next));savedRecords=next;return true;}
 catch{historyMessage('브라우저에 기록을 저장하지 못했습니다. 저장 공간이나 브라우저 설정을 확인하고, JSON 내보내기로 백업하세요.',true);return false;}
}
function historyElement(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function recordDate(iso){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));}
function recordSummary(c){
 const growth=c.savingGrowth===0?'증가 없음':c.savingGrowthMode==='fixed'?'매년 '+amount(c.savingGrowth)+'만원 증가':'매년 '+decimal(c.savingGrowth)+'% 증가';
 const income=c.withdrawMode==='budget'?'목표 생활비 월 '+amount(c.monthlyBudget)+'만원':'연 추가 인출 '+amount(c.annualWithdrawal)+'만원';
 const source={stocks:'주식 비례 매도',vtiFirst:'VTI 우선',cashFirst:'안전자산 우선'}[c.withdrawSource];
 return (c.startYear+c.retireYears)+'년 은퇴 · 연 저축 '+amount(c.annualSaving)+'만원 ('+growth+') · 물가 '+decimal(c.inflation)+'% · '+income+' · '+source;
}
function renderHistory(){
 $('historyCount').textContent=savedRecords.length+'개';$('loadConfig').textContent='저장 기록'+(savedRecords.length?' ('+savedRecords.length+')':'');
 const list=$('historyList');list.replaceChildren();
 if(historyReadError){historyMessage(historyReadError,true);return;}
 if(!savedRecords.length){list.append(historyElement('div','empty','아직 저장한 기록이 없습니다. 이름을 입력해 현재 설정을 저장하거나 기존 JSON 파일을 불러오세요.'));return;}
 for(const record of savedRecords){
  const item=historyElement('article','history-item'),copy=historyElement('div','history-copy'),actions=historyElement('div','history-actions');
  copy.append(historyElement('div','history-name',record.name),historyElement('div','history-meta',recordDate(record.savedAt)+' 저장'),historyElement('div','history-meta',recordSummary(record.config)));
  const load=historyElement('button','primary','불러오기');load.type='button';load.setAttribute('aria-label',record.name+' 기록 불러오기');
  load.addEventListener('click',()=>{
   previousConfig=structuredClone(config);config=normalizeConfig(record.config);fillFields();update();
   $('historyName').value=record.name;historyMessage('‘'+record.name+'’ 기록을 불러왔습니다. 모든 입력과 연도별 투자 비율을 복원했습니다.');allowUndo('기록을 불러왔습니다.');
  });
  const backup=historyElement('button','','JSON');backup.type='button';backup.setAttribute('aria-label',record.name+' 기록 JSON 내보내기');
  backup.addEventListener('click',()=>{const filename=record.name.replace(/[\\/:*?"<>|]/g,'_').slice(0,80);download('은퇴계획_'+filename+'.json',JSON.stringify({version:1,...record.config},null,2),'application/json');historyMessage('‘'+record.name+'’ 기록을 JSON으로 내보냈습니다.');});
  const remove=historyElement('button','','삭제');remove.type='button';remove.setAttribute('aria-label',record.name+' 기록 삭제');
  remove.addEventListener('click',()=>{
   if(!writeRecords(savedRecords.filter(r=>r.id!==record.id)))return;
   renderHistory();historyMessage('‘'+record.name+'’ 기록을 삭제했습니다.');
   const undo=historyElement('button','preset-link','되돌리기');undo.type='button';undo.addEventListener('click',()=>{
    if(savedRecords.some(r=>r.id===record.id))return;
    if(writeRecords([...savedRecords,record].sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt)))){renderHistory();historyMessage('삭제한 기록을 복원했습니다.');}
   });$('historyStatus').append(undo);
  });
  actions.append(load,backup,remove);item.append(copy,actions);list.append(item);
 }
}
function openHistory(focusName=false){
 $('historyPanel').classList.remove('hidden');$('loadConfig').setAttribute('aria-expanded','true');renderHistory();
 if(focusName){if(!$('historyName').value.trim())$('historyName').value=(config.startYear+config.retireYears)+'년 은퇴 계획';$('historyName').focus({preventScroll:true});$('historyName').select();}
 $('historyPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function saveRecord(event){
 event.preventDefault();readFields();const error=validateConfig(config);if(error){setError(error);historyMessage(error,true);return;}
 const name=$('historyName').value.trim().slice(0,80);if(!name){historyMessage('기록 이름을 입력해 주세요.',true);$('historyName').focus();return;}
 const record={id:typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name,savedAt:new Date().toISOString(),config:structuredClone(config)};
 if(writeRecords([record,...savedRecords])){renderHistory();historyMessage('‘'+name+'’ 기록을 저장했습니다. 목록의 불러오기를 누르면 이 설정으로 돌아옵니다.');$('saveStatus').textContent='이름을 붙인 기록 저장 완료';}
}
$('runStress').addEventListener('click',runStress);
$('rerollStress').addEventListener('click',()=>{readFields();config.stressSeed=(Number.isFinite(config.stressSeed)?config.stressSeed:42)%4294967295+1;$('stressSeed').value=config.stressSeed;return runStress();});
$('stressTrace').addEventListener('change',()=>{if(stressResult&&stressResult.key===stressInputKey(config))renderStress();});
$('exportStress').addEventListener('click',()=>{
 if(!stressResult||stressRunning||stressResult.key!==stressInputKey(config))return;
 const c=stressResult.config,key=$('stressTrace').value||'sample',header=['경로','보충전략','난수번호','연도','은퇴연차',...fundKeys(c).map(k=>fundName(c,k)+'주가수익률_%'),'세후배당_만원','세후이자_만원','생활비주식매도_만원','안전자산인출_만원','보충매도_만원','초과안전자산재투자_만원','안전자산목표상한_만원','추가자산합계_만원','퇴직금_만원_합계에포함','기말안전자산_만원','기말자산_만원','월평균현금흐름_만원','월평균현금흐름_현재가치_만원','목표월평균생활비_현재가치_만원','최대월부족액_현재가치_만원','기말안전자산_잔여생활비개월','최소안전자산_잔여생활비개월','고점미회복중매도_만원','첫생활비부족월','연초인출기준자산_만원','연간생활비사용상한_만원','실제인출률_%','상한에따른생활비감액_만원','추가근로필요액_현재가치_만원','근로필요개월',...fundKeys(config).map(k=>'기말'+fundName(config,k)+'_만원')];
 const data=stressRows().slice(c.retireYears+1).map(r=>[stressResult.cases[key].name,BUFFER_POLICIES[c.stressBufferPolicy],c.stressSeed,r.year,r.elapsed-c.retireYears,...fundKeys(c).map(k=>(r[k+'Return']*100).toFixed(4)),...[r.netDividend,r.netInterest,r.stockSold,r.cashUsed,r.refillSold,r.cashReinvested,r.cashTarget,r.extraAsset,r.severance,r.cash,r.total,r.income/12,r.realIncome/12,r.realBudget/12,r.maxMonthlyGapReal].map(v=>v.toFixed(2)),r.cashMonths===null?'':r.cashMonths.toFixed(2),r.minCashMonths===null?'':r.minCashMonths.toFixed(2),r.downMarketSold.toFixed(2),r.firstGapMonth??'',r.withdrawalBase.toFixed(2),r.spendingCap===null?'':r.spendingCap.toFixed(2),r.spendingRate.toFixed(4),r.capReduction.toFixed(2),r.realWorkNeeded.toFixed(2),r.monthsNeedingWork,...fundKeys(config).map(k=>r[k].toFixed(2))]);
 download('은퇴계획_스트레스_'+key+'.csv','\ufeff'+[header,...data].map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');$('stressStatus').textContent='선택 경로를 CSV로 저장했습니다. CSV의 자산·인출액은 명목금액이며 현재 가치 열은 별도입니다.';
});
fieldKeys.forEach(k=>{$(k).addEventListener('input',()=>update());});
$('toggleSettings').addEventListener('click',()=>{const open=document.body.classList.toggle('settings-open');$('toggleSettings').textContent=open?'계산 설정 닫기':'계산 설정 열기';$('toggleSettings').setAttribute('aria-expanded',String(open));});
$('allocationRows').addEventListener('input',e=>{
 if(!e.target.matches('[data-year]'))return;const i=Number(e.target.dataset.year),kind=e.target.dataset.kind,key={extra:'extraAssets',safe:'safeAllocations',vti:'allocations',aor:'aorAllocations',aoa:'aoaAllocations'}[kind];const custom=config.customFunds.find(f=>f.id===kind);if(!key&&!custom)return;
 const target=custom?custom.allocations:config[key];target[i]=e.target.value===''?(kind==='extra'?0:kind==='safe'?null:NaN):Number(e.target.value);update(false);
 if(!validateConfig(config)){const cells=e.target.closest('tr').querySelectorAll('td'),data=allocationCells(i);cells[5].textContent=decimal(etfRatiosFor(config,i).schd);cells[8+config.customFunds.length].textContent=data.percent;cells[9+config.customFunds.length].innerHTML=data.money;}
});
$('applyRatio').addEventListener('click',()=>{
 const read=id=>$(id).value===''?NaN:Number($(id).value),safe=read('bulkSafeRatio'),vti=read('bulkRatio'),aor=read('bulkAorRatio'),aoa=read('bulkAoaRatio');
 const customValues=config.customFunds.map(f=>customBulk.get(f.id)?.value===''?NaN:Number(customBulk.get(f.id)?.value));
 if(![safe,vti,aor,aoa,...customValues].every(v=>Number.isFinite(v)&&v>=0&&v<=100)||vti+aor+aoa+customValues.reduce((a,b)=>a+b,0)>100+1e-8){$('saveStatus').textContent='각 비율은 0~100%, ETF 내 SCHD 외 종목의 합계는 100% 이하로 입력하세요.';return;}
 config.allocations=Array(90).fill(vti);config.aorAllocations=Array(90).fill(aor);config.aoaAllocations=Array(90).fill(aoa);config.safeAllocations=Array(90).fill(safe);config.customFunds.forEach((f,i)=>f.allocations=Array(90).fill(customValues[i]));update();
});
$('budgetItemsList').addEventListener('input',e=>{const index=Number(e.target.dataset.budgetIndex),key=e.target.dataset.budgetKey;if(!Number.isInteger(index)||!config.budgetItems[index]||!['name','amount','frequency'].includes(key))return;config.budgetItems[index][key]=key==='amount'?(e.target.value===''?NaN:Number(e.target.value)):e.target.value;update(false);});
$('budgetItemsList').addEventListener('click',e=>{const raw=e.target.dataset.budgetRemove;if(raw===undefined)return;const index=Number(raw);if(!Number.isInteger(index)||!config.budgetItems[index])return;config.budgetItems.splice(index,1);renderBudgetItems();update(false);});
$('addBudgetItem').addEventListener('click',()=>{if(config.budgetItems.length>=100)return;config.budgetItems.push({name:'새 항목',amount:0,frequency:'monthly'});renderBudgetItems();update(false);});
$('addManagementFee').addEventListener('click',()=>{if(config.budgetItems.length>=100||config.budgetItems.some(item=>item.name==='관리비'))return;config.budgetItems.push({name:'관리비',amount:0,frequency:'monthly'});renderBudgetItems();update(false);});
$('applyBudgetTotal').addEventListener('click',()=>{const total=monthlyBudgetTotal(config.budgetItems);if(!config.budgetItems.length||!Number.isFinite(total)||total<0||total>100000)return;$('monthlyBudget').value=total;update();});
$('saveConfig').addEventListener('click',()=>openHistory(true));
$('loadConfig').addEventListener('click',()=>openHistory());
$('closeHistory').addEventListener('click',()=>{$('historyPanel').classList.add('hidden');$('loadConfig').setAttribute('aria-expanded','false');$('loadConfig').focus();});
$('historyForm').addEventListener('submit',saveRecord);
$('downloadConfig').addEventListener('click',()=>{readFields();const error=validateConfig(config);if(error){setError(error);historyMessage(error,true);return;}download('은퇴계획_설정.json',JSON.stringify({version:1,...config},null,2),'application/json');historyMessage('현재 설정을 JSON으로 내보냈습니다.');});
$('importConfig').addEventListener('click',()=>$('configFile').click());
$('configFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const incoming=JSON.parse(await file.text()),candidate=normalizeConfig(incoming);const error=validateConfig(candidate);if(error)throw new Error(error);config=candidate;fillFields();update();openHistory();$('historyName').value=file.name.replace(/\.json$/i,'').slice(0,80);historyMessage('JSON 설정을 불러왔습니다. 이름을 확인하고 ‘현재 설정을 기록에 저장’을 누르면 목록에 보관됩니다.');$('saveStatus').textContent='JSON 설정 불러오기 완료';}catch(err){setError('설정 파일을 읽을 수 없습니다. '+err.message);historyMessage('JSON 설정을 읽을 수 없습니다. '+err.message,true);}e.target.value='';});
$('exportCsv').addEventListener('click',()=>{readFields();if(validateConfig(config)){setError('입력을 확인한 뒤 CSV를 내보내세요.');return;}const header=['연도','나이','단계','기준','저축액_만원','추가자산합계_만원','퇴직금_만원_합계에포함','세후배당_만원','세후이자_만원','추가인출_만원','미충당인출_만원',...fundKeys(config).map(k=>'기말'+fundName(config,k)+'_만원'),'기말안전자산_만원','기말총자산_만원','월현금흐름_만원','월현금흐름_현재가치기준_만원','목표월생활비_만원'];const data=projection.map(r=>[r.year,r.age,r.elapsed===0?'시작':r.working?'저축':'은퇴',config.realTerms?'현재구매력':'명목금액',...[r.saving,r.extraAsset||0,r.severance||0,r.netDividend,r.netInterest,r.withdrawal,r.unfunded,...fundKeys(config).map(k=>r[k]),r.cash,r.total,r.income/12].map(v=>displayValue(v,r).toFixed(2)),(r.income/12/r.deflator).toFixed(2),displayValue(r.budget/12,r).toFixed(2)]);download('은퇴계획_연도별.csv','\ufeff'+[header,...data].map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');$('saveStatus').textContent='연도별 CSV를 저장했습니다.';});
let previousConfig=null;
function allowUndo(message){$('saveStatus').textContent=message+' ';const undo=document.createElement('button');undo.className='preset-link';undo.textContent='되돌리기';undo.addEventListener('click',()=>{if(previousConfig){config=previousConfig;previousConfig=null;fillFields();update();}});$('saveStatus').append(undo);}
$('reset').addEventListener('click',()=>{previousConfig=structuredClone(config);config=structuredClone(DEFAULTS);fillFields();update();allowUndo('처음 계획으로 복원했습니다.');});
$('retireExample').addEventListener('click',()=>{previousConfig=structuredClone(config);config={...structuredClone(DEFAULTS),initialVti:80000,initialSchd:20000,initialCash:0,deployCash:0,annualSaving:0,safeSavingPct:0,retireYears:0,horizon:20,monthlyBudget:200,allocations:Array(30).fill(80)};fillFields();update();allowUndo('가상 은퇴 예시를 적용했습니다.');});
for(const key of ['plan','stress','funds']){
 $(key+'TabButton').addEventListener('click',()=>showTab(key));
 $(key+'TabButton').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['plan','stress','funds'],index=e.key==='Home'?0:e.key==='End'?2:(tabs.indexOf(key)+(e.key==='ArrowRight'?1:2))%3;showTab(tabs[index],true);});
}
$('addFund').addEventListener('click',()=>addRegisteredFund($('newFundName').value));
$('newFundName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addRegisteredFund($('newFundName').value);}});
for(const preset of FUND_PRESETS){const button=historyElement('button','',preset.name+' 추가'),source=historyElement('a','','공식 자료');button.type='button';button.addEventListener('click',()=>addRegisteredFund(preset.name));source.href=preset.url;source.target='_blank';source.rel='noreferrer';source.setAttribute('aria-label',preset.name+' '+preset.code+' 공식 자료');$('fundPresets').append(button,source);}
fillFields();update();renderHistory();
