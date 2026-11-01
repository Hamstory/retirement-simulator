import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {DEFAULTS,normalizeConfig,newFund} from '../../src/engine.js';
import {PUBLIC_APP_URL,FUND_COLOR_PRESETS,chooseFundColor,encodeConfigLink,decodeConfigLink} from '../../src/settings.js';
const rawLink=payload=>PUBLIC_APP_URL+'#plan=v1n.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
function fixture(){const c=structuredClone(DEFAULTS);c.customFunds=[{...newFund('fund_sample','가상 배당 🌱 <A>'),yield:4,tax:7,allocations:Array.from({length:90},(_,i)=>i%3?10:15),severancePct:10}];c.allocations=Array(90).fill(50);c.budgetItems=[{name:'가상 연간 비용',amount:36,frequency:'annual'}];c.extraAssets[9]=1500;c.severanceAllocation='custom';c.severanceVtiPct=50;c.startingInputs=[{id:'total',value:0},{id:'safe',value:20},{id:'vti',value:50},{id:'fund_sample',value:20}];return normalizeConfig(c);}
test('TC-056 설정 URL의 압축·일반 인코딩과 전체 설정 왕복',async()=>{
 const c=fixture();for(const compress of [false,true]){const link=await encodeConfigLink(c,'https://example.test/planner/?tracking=ignored#old',{compress}),url=new URL(link);assert.equal(url.search,'');assert.ok(url.hash.startsWith('#plan=v1'));assert.deepEqual(await decodeConfigLink(link),c);assert.deepEqual(await decodeConfigLink(url.hash),c);if(compress)assert.ok(link.length<(await encodeConfigLink(c,PUBLIC_APP_URL,{compress:false})).length);}
 const offline=await encodeConfigLink(c,'file:///fictional-project/index.html');assert.equal(new URL(offline).origin,new URL(PUBLIC_APP_URL).origin);assert.equal(new URL(offline).pathname,new URL(PUBLIC_APP_URL).pathname);
 const withExtras={...c,unknownSecret:'fictional ignored metadata',savedRecords:[{name:'fictional snapshot'}]};withExtras.customFunds[0].unknownSecret='fictional extra';withExtras.budgetItems[0].unknownSecret='fictional extra';const restored=await decodeConfigLink(await encodeConfigLink(withExtras));assert.equal(restored.unknownSecret,undefined);assert.equal(restored.savedRecords,undefined);assert.equal(restored.customFunds[0].unknownSecret,undefined);assert.equal(restored.budgetItems[0].unknownSecret,undefined);
 const legacy=await decodeConfigLink(rawLink({v:1,c:{annualSaving:500}}));assert.equal(legacy.annualSaving,500);assert.deepEqual(legacy.customFunds,[]);
});
test('TC-057 잘못된 설정 URL·과도한 압축 해제·배열을 안전하게 거부한다',async()=>{
 const inputs=['not a link','javascript:#plan=v1n.AA',PUBLIC_APP_URL+'#plan=v2n.AA',PUBLIC_APP_URL+'#plan=v1n.A',PUBLIC_APP_URL+'#plan=v1n.@@@@',rawLink({v:2,c:{}}),rawLink({v:1,c:{unknown:1}}),rawLink({v:1,c:{allocations:{r:[[80,99999999]]}}}),rawLink({v:1,c:{allocations:{r:[[80,-1]]}}}),rawLink({v:1,c:{monthlyBudget:-5}}),rawLink({v:1,c:{customFunds:Array(13).fill({})}}),PUBLIC_APP_URL+'#plan=v1z.AAAA',PUBLIC_APP_URL+'#plan=v1n.'+'a'.repeat(400001)];
 for(const input of inputs)await assert.rejects(decodeConfigLink(input));
 const bomb=deflateSync(Buffer.from(' '.repeat(300000)));await assert.rejects(decodeConfigLink(PUBLIC_APP_URL+'#plan=v1z.'+bomb.toString('base64url')),/손상|너무/);
 await assert.rejects(encodeConfigLink({...fixture(),monthlyBudget:NaN}));
});
test('TC-058 48개 종목 색상 프리셋의 무작위 선택과 중복 회피',()=>{
 assert.equal(FUND_COLOR_PRESETS.length,48);assert.equal(new Set(FUND_COLOR_PRESETS).size,48);assert.ok(FUND_COLOR_PRESETS.every(color=>/^#[0-9a-f]{6}$/.test(color)));assert.notEqual(chooseFundColor([],()=>0),chooseFundColor([],()=>.999));
 const used=[];for(let i=0;i<48;i++){const color=chooseFundColor(used,()=>.42);assert.ok(!used.includes(color));used.push(color);}assert.ok(FUND_COLOR_PRESETS.includes(chooseFundColor(used,()=>.5)));assert.equal(chooseFundColor([],()=>1),FUND_COLOR_PRESETS.at(-1));assert.notEqual(chooseFundColor([FUND_COLOR_PRESETS[0].toUpperCase()],()=>0),FUND_COLOR_PRESETS[0]);
});
