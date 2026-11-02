import { DEFAULTS, normalizeConfig, validateConfig } from './engine.js';

// All sharing stays in the fragment. No settings service or network request is used.
const PUBLIC_APP_URL='https://hamstory.github.io/retirement-simulator/';
const MAX_SETTINGS_BYTES=262144,MAX_SETTINGS_LINK=400000;
const FUND_COLOR_PRESETS=Object.freeze([
 '#1b7f72','#237a8c','#36729c','#526aa3','#715da6','#8e529b','#a44f7b','#b05259','#aa603a','#9b742c','#7d7c2e','#5f803c',
 '#235c50','#295b70','#335780','#4c5085','#684681','#813d76','#913e60','#994742','#92532d','#80642c','#66702f','#477143',
 '#358e7d','#38869a','#4a7faa','#647bb1','#8371b3','#9d68a8','#b3678e','#bb6a70','#b87852','#a78a43','#8d9149','#729556',
 '#3b6d65','#456b7a','#536782','#666185','#795b80','#8a5875','#995b68','#a2665c','#9a7251','#8a7c4d','#758353','#5c8562'
]);
const FUND_FIELD_HELP=Object.freeze({
 name:'표·차트·저장 기록에 표시할 이름입니다. 이름만으로 실제 시세나 상품 정보를 조회하지 않습니다. 같은 상품을 다른 가정으로 비교하려면 이름을 구분해 주세요.',
 priceGrowth:'배당을 제외한 연간 주가 변화율 가정입니다. 3%라면 주가 100원이 1년 뒤 103원이 되는 것으로 계산합니다. 배당 재투자를 포함한 총수익률을 그대로 넣으면 분배금이 중복 반영될 수 있습니다.',
 yield:'시작 평가액 대비 연간 세전 배당·분배금 비율입니다. 4%라면 시작 평가액 100만원에서 첫해 세전 4만원을 받는 가정입니다. 실제 지급 주기 대신 월별 스트레스 테스트에서는 매월 균등 수령으로 계산하며, 이후 분배율은 주가·주당 분배금 성장에 따라 달라집니다.',
 dividendGrowth:'보유 수량이 아닌 주당 배당·분배금의 연간 증가율입니다. 3%라면 주당 100원이 다음 해 103원이 됩니다. 주가 상승률과 별개로 적용되며, 은퇴 전 재투자로 늘어난 수량의 배당도 추가됩니다.',
 tax:'배당·분배금에서 차감할 유효 세율 가정입니다. 10%라면 세전 100원 중 90원을 현금흐름에 반영합니다. 계좌 종류·비과세 분배 등 본인 조건에 맞게 정하며, 매도 세금·종합소득세·건강보험료는 별도로 계산하지 않습니다.',
 vol:'무작위 시장 경로가 흔들리는 강도를 정하는 연간 변동성입니다. 값이 클수록 급등·급락 폭이 커질 수 있으며, 매년 반드시 그 비율만큼 움직인다는 뜻은 아닙니다. 최종 연복리 고정 모드에서는 최종 주가는 유지하면서 중간 경로를 흔듭니다.',
 crash:'초반·후반 급락 비교에 쓰는 한 해의 하락률입니다. 35%가 2년 이어지면 누적 하락은 약 58%입니다. 최종 연복리 고정 모드는 뒤에 회복 구간을 두고, 자유 경로 모드는 손실을 강제로 만회하지 않습니다. 무작위 경로의 변동성과는 별도입니다.',
 color:'차트·범례·배분 막대에 공통으로 쓰는 색입니다. 새 종목에는 48개 프리셋 중 사용 중인 색과 겹치지 않는 색을 우선 무작위 지정합니다. 프리셋이나 직접 입력으로 바꿀 수 있으며 수익률을 바꾸는 설정은 아닙니다.'
});
function chooseFundColor(used=[],random=Math.random){
 const available=FUND_COLOR_PRESETS.filter(color=>!used.some(value=>String(value).toLowerCase()===color)),pool=available.length?available:FUND_COLOR_PRESETS,value=Number(random());
 return pool[Math.min(pool.length-1,Math.max(0,Math.floor((Number.isFinite(value)?value:0)*pool.length)))];
}
const SERIES_KEYS=['allocations','safeAllocations','extraAssets','aorAllocations','aoaAllocations','qqqAllocations'];
function packSeries(values){
 const runs=[];for(const value of values){const last=runs.at(-1);if(last&&Object.is(last[0],value))last[1]++;else runs.push([value,1]);}
 const packed={r:runs};return JSON.stringify(packed).length<JSON.stringify(values).length?packed:values;
}
function unpackSeries(value){
 if(Array.isArray(value)){if(value.length>90)throw new Error('연도별 비율 길이를 확인하세요.');return value;}
 if(!value||typeof value!=='object'||Object.keys(value).length!==1||!Array.isArray(value.r)||value.r.length>90)throw new Error('연도별 비율 형식이 올바르지 않습니다.');
 const result=[];for(const run of value.r){if(!Array.isArray(run)||run.length!==2||!Number.isInteger(run[1])||run[1]<1||result.length+run[1]>90)throw new Error('연도별 비율 길이를 확인하세요.');for(let i=0;i<run[1];i++)result.push(run[0]);}return result;
}
function packConfig(input){
 const c=normalizeConfig(input),error=validateConfig(c);if(error)throw new Error(error);
 const result=Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,c[k]]));
 for(const k of SERIES_KEYS)result[k]=packSeries(c[k]);
 result.customFunds=c.customFunds.map(f=>({...Object.fromEntries(['id','name','initial','priceGrowth','yield','dividendGrowth','vol','crash','tax','color','severancePct'].map(k=>[k,f[k]])),allocations:packSeries(f.allocations)}));
 result.budgetItems=c.budgetItems.map(item=>({name:item.name,amount:item.amount,frequency:item.frequency}));
 result.startingInputs=c.startingInputs.map(item=>({id:item.id,value:item.value}));
 return {v:1,c:result};
}
function unpackConfig(payload){
 if(!payload||payload.v!==1||!payload.c||typeof payload.c!=='object'||Array.isArray(payload.c)||Object.keys(payload).some(k=>!['v','c'].includes(k)))throw new Error('지원하지 않는 설정 링크입니다.');
 const c=payload.c;if(Object.keys(c).some(k=>!Object.hasOwn(DEFAULTS,k)))throw new Error('지원하지 않는 설정 항목이 있습니다.');
 for(const k of SERIES_KEYS)if(Object.hasOwn(c,k))c[k]=unpackSeries(c[k]);
 if(Object.hasOwn(c,'customFunds')){if(!Array.isArray(c.customFunds)||c.customFunds.length>12)throw new Error('추가 종목 수를 확인하세요.');for(const f of c.customFunds){if(!f||typeof f!=='object'||Array.isArray(f))throw new Error('종목 형식이 올바르지 않습니다.');if(Object.hasOwn(f,'allocations'))f.allocations=unpackSeries(f.allocations);}}
 const normalized=normalizeConfig(c),error=validateConfig(normalized);if(error)throw new Error(error);return normalized;
}
function base64Url(bytes){
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromBase64Url(text){
 if(!text||!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)throw new Error('설정 링크 데이터가 올바르지 않습니다.');
 let raw;try{raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));}catch{throw new Error('설정 링크 데이터가 올바르지 않습니다.');}
 return Uint8Array.from(raw,ch=>ch.charCodeAt(0));
}
async function readLimitedStream(stream,limit=MAX_SETTINGS_BYTES){
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('설정 링크의 데이터가 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function encodeConfigLink(config,base=PUBLIC_APP_URL,{compress=true}={}){
 const raw=new TextEncoder().encode(JSON.stringify(packConfig(config)));if(raw.length>MAX_SETTINGS_BYTES)throw new Error('설정이 너무 큽니다. JSON 파일을 이용하세요.');
 let bytes=raw,format='v1n';if(compress&&typeof CompressionStream==='function'){try{const zipped=await readLimitedStream(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')));if(zipped.length<raw.length){bytes=zipped;format='v1z';}}catch{}}
 let url;try{url=new URL(base);if(!['https:','http:'].includes(url.protocol))url=new URL(PUBLIC_APP_URL);}catch{url=new URL(PUBLIC_APP_URL);}
 url.username='';url.password='';url.search='';url.hash='plan='+format+'.'+base64Url(bytes);return url.href;
}
async function decodeConfigLink(input){
 if(typeof input!=='string'||input.length>MAX_SETTINGS_LINK)throw new Error('설정 링크 길이를 확인하세요.');
 const text=input.trim();let url;try{url=new URL(text.startsWith('#')?PUBLIC_APP_URL+text:text);}catch{throw new Error('전체 설정 링크를 붙여넣어 주세요.');}
 if(!['https:','http:','file:'].includes(url.protocol))throw new Error('설정 링크 형식이 올바르지 않습니다.');
 const match=/^#plan=(v1[nz])\.([A-Za-z0-9_-]+)$/.exec(url.hash);if(!match)throw new Error('지원하지 않는 설정 링크입니다.');
 let bytes=fromBase64Url(match[2]);if(bytes.length>MAX_SETTINGS_BYTES)throw new Error('설정 링크의 데이터가 너무 큽니다.');
 if(match[1]==='v1z'){if(typeof DecompressionStream!=='function')throw new Error('이 브라우저에서는 압축 설정 링크를 읽을 수 없습니다. JSON 파일을 이용하세요.');try{bytes=await readLimitedStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));}catch{throw new Error('압축 설정 링크가 손상되었거나 너무 큽니다.');}}
 let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('설정 링크의 내용이 올바르지 않습니다.');}return unpackConfig(payload);
}

// @single-file-exports
export { PUBLIC_APP_URL, FUND_COLOR_PRESETS, FUND_FIELD_HELP, chooseFundColor, encodeConfigLink, decodeConfigLink };
