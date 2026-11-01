const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../dist/index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
class Node {
 constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.type=attrs.type||'';this.value='';this.checked=false;this.disabled=false;this.children=[];this.listeners={};this.style={};this._class=attrs.class||'';this._text='';this._html='';this.classList={add:(c)=>{const s=new Set(this._class.split(' ').filter(Boolean));s.add(c);this._class=[...s].join(' ');},remove:(c)=>{this._class=this._class.split(' ').filter(v=>v!==c).join(' ');},toggle:(c,force)=>{const has=this._class.split(' ').includes(c),next=force===undefined?!has:force;next?this.classList.add(c):this.classList.remove(c);return next;},contains:c=>this._class.split(' ').includes(c)};}
 set className(v){this._class=v;}get className(){return this._class;}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent||'').join('');}
 set innerHTML(v){this._html=v;this.children=[];}get innerHTML(){return this._html;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];this._text='';}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 async trigger(type,overrides={}){for(const fn of this.listeners[type]||[])await fn({target:this,preventDefault(){},...overrides});}
 click(){return this.trigger('click');}focus(){this.focused=true;}select(){this.selected=true;}scrollIntoView(){}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]||null;}
}
function boot(storage=new Map(),options={}){
 const nodes={};for(const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const attrs={};for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];nodes[m[3]]=new Node(m[1],attrs);}
 const state={failWrites:false,downloads:[],clipboard:[],cleanedUrls:[]};
 const sandbox={console,structuredClone,crypto:{randomUUID},document:{getElementById:id=>{if(!nodes[id])throw new Error('Missing '+id);return nodes[id];},createElement:tag=>new Node(tag),querySelectorAll:()=>[],body:new Node('body')},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(state.failWrites)throw new Error('quota');storage.set(k,v);}},setTimeout:options.timers||(()=>{}),Blob,URL,TextEncoder,TextDecoder,atob,btoa,location:options.location?new URL(options.location):undefined,navigator:options.clipboard?{clipboard:{writeText:async value=>{if(options.clipboard==='fail')throw new Error('clipboard unavailable');state.clipboard.push(value);}}}:{},...(options.compression?{CompressionStream,DecompressionStream}:{})};
 sandbox.history={state:null,replaceState:(stateValue,title,url)=>{state.cleanedUrls.push(url);sandbox.location=new URL(url);}};
 vm.createContext(sandbox);vm.runInContext(scripts+'\nglobalThis.api={getConfig:()=>structuredClone(config),getRecords:()=>structuredClone(savedRecords),setAllocation:(i,p)=>{config.allocations[i]=p;update();},getHistoryError:()=>historyReadError,getStress:()=>stressResult,isRunning:()=>stressRunning,ready:()=>urlStartup};',sandbox);
 sandbox.captureDownload=(name,text,type)=>state.downloads.push({name,text,type});vm.runInContext('download=captureDownload;',sandbox);
 return {nodes,storage,state,api:sandbox.api};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
module.exports={boot};
if(require.main===module)
(async()=>{
 const a=boot(),n=a.nodes;
 assert.equal(a.api.getRecords().length,0);
 n.annualSaving.value='6000';await n.annualSaving.trigger('input');n.withdrawSource.value='vtiFirst';await n.withdrawSource.trigger('input');a.api.setAllocation(4,35);
 await n.saveConfig.click();assert.equal(n.historyPanel.classList.contains('hidden'),false);
 n.historyName.value='기본 계획';await n.historyForm.trigger('submit');assert.equal(a.api.getRecords().length,1);assert.equal(a.api.getRecords()[0].config.allocations[4],35);
 const savedFirst=a.api.getRecords()[0];
 n.annualSaving.value='3500';await n.annualSaving.trigger('input');n.inflation.value='3';await n.inflation.trigger('input');a.api.setAllocation(4,85);n.historyName.value='보수적 계획';await n.historyForm.trigger('submit');
 assert.equal(a.api.getRecords().length,2);assert.equal(a.api.getRecords()[1].config.annualSaving,6000);assert.equal(a.api.getRecords()[1].config.allocations[4],35);assert.notEqual(a.api.getRecords()[0].id,savedFirst.id);
 await n.historyList.children[1].children[1].children[0].click();assert.equal(a.api.getConfig().annualSaving,6000);assert.equal(a.api.getConfig().inflation,2);assert.equal(a.api.getConfig().withdrawSource,'vtiFirst');assert.equal(a.api.getConfig().allocations[4],35);assert.equal(n.historyName.value,'기본 계획');
 await n.historyList.children[1].children[1].children[2].click();assert.equal(JSON.parse(a.state.downloads[0].text).allocations[4],35);assert.ok(a.state.downloads[0].name.endsWith('.json'));
 await n.historyList.children[1].children[1].children[3].click();assert.equal(a.api.getRecords().length,1);assert.equal(n.historyStatus.children.length,1);await n.historyStatus.children[0].click();assert.equal(a.api.getRecords().length,2);assert.ok(a.api.getRecords().some(r=>r.id===savedFirst.id));
 const b=boot(a.storage);assert.equal(b.api.getRecords().length,2);assert.equal(b.api.getConfig().annualSaving,6000);assert.equal(b.api.getConfig().allocations[4],35);
 const before=JSON.stringify(a.api.getRecords());a.state.failWrites=true;n.historyName.value='저장 실패 테스트';await n.historyForm.trigger('submit');assert.equal(JSON.stringify(a.api.getRecords()),before);assert.ok(n.historyStatus.textContent.includes('저장하지 못했습니다'));a.state.failWrites=false;
 const imported={...a.api.getConfig(),annualSaving:4321};await n.configFile.trigger('change',{target:{files:[{name:'예전설정.json',text:async()=>JSON.stringify(imported)}],value:'file'}});assert.equal(a.api.getConfig().annualSaving,4321);assert.equal(a.api.getRecords().length,2);assert.equal(n.historyName.value,'예전설정');await n.historyForm.trigger('submit');assert.equal(a.api.getRecords().length,3);
 const broken=new Map([['retirement-planner-records-v1','not JSON']]),bad=boot(broken);assert.ok(bad.api.getHistoryError());bad.nodes.historyName.value='새 기록';await bad.nodes.historyForm.trigger('submit');assert.equal(broken.get('retirement-planner-records-v1'),'not JSON');
 const o=boot(),p=o.nodes,edit=async value=>{p.annualSaving.value=String(value);await p.annualSaving.trigger('input');};
 p.historyName.value='가상 원본 기록';await p.historyForm.trigger('submit');await edit(2400);p.historyName.value='가상 다른 기록';await p.historyForm.trigger('submit');
 const original=JSON.stringify(o.api.getRecords()),originalStorage=o.storage.get('retirement-planner-records-v1'),targetId=o.api.getRecords()[1].id;
 const overwrite=()=>p.historyList.children.find(row=>row.children[0].children[0].textContent==='가상 원본 기록').children[1].children.find(button=>button.textContent==='덮어쓰기');
 await edit('');await overwrite().click();assert.equal(JSON.stringify(o.api.getRecords()),original);assert.equal(o.storage.get('retirement-planner-records-v1'),originalStorage);assert.ok(p.historyStatus.textContent.includes('입력을 확인'));
 await edit(3600);o.state.failWrites=true;await overwrite().click();assert.equal(JSON.stringify(o.api.getRecords()),original);assert.equal(o.storage.get('retirement-planner-records-v1'),originalStorage);o.state.failWrites=false;
 await overwrite().click();let updated=o.api.getRecords();assert.equal(updated.length,2);assert.equal(updated[1].id,targetId);assert.equal(updated[1].name,'가상 원본 기록');assert.equal(updated[1].config.annualSaving,3600);assert.equal(JSON.stringify(updated[0]),JSON.stringify(JSON.parse(original)[0]));assert.ok(Date.parse(updated[1].savedAt)>=Date.parse(JSON.parse(original)[1].savedAt));assert.equal(p.historyStatus.children.length,1);
 await edit(4200);assert.equal(o.api.getRecords()[1].config.annualSaving,3600);o.state.failWrites=true;await p.historyStatus.children[0].click();assert.equal(o.api.getRecords()[1].config.annualSaving,3600);assert.equal(p.historyStatus.children.length,1);o.state.failWrites=false;await p.historyStatus.children[0].click();assert.equal(JSON.stringify(o.api.getRecords()),original);assert.equal(o.api.getConfig().annualSaving,4200);
 await overwrite().click();assert.equal(boot(o.storage).api.getRecords()[1].config.annualSaving,4200);assert.equal(o.api.getRecords()[1].id,targetId);assert.equal(o.api.getRecords().length,2);
 console.log('PASS: named snapshots; separate records; deep-copy isolation; full config and annual allocation restore; reload persistence; record JSON export; delete and undo; targeted overwrite and undo preserve identity, other records and current inputs; invalid input and failed writes preserve records; legacy JSON import and save; corrupted storage protection.');
})().catch(err=>{console.error(err);process.exitCode=1;});
