// Rendering/state smoke tests. These are not a browser or visual layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../public/engine.js';
const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const source=readFileSync(new URL('../public/workspace.js',import.meta.url),'utf8');

async function workspace(){
  const elements=Object.fromEntries(['app','toast','detail-dialog','dialog-content','close-dialog'].map(id=>[id,{innerHTML:'',textContent:'',classList:{add(){},remove(){}},showModal(){},close(){}}]));
  const storage=new Map();
  const collections={};
  const context={...engine,console,Intl,Date,Number,Math,JSON,Set,String,Object,Array,Error,structuredClone,
    setTimeout,clearTimeout,document:{documentElement:{dataset:{}},querySelector:s=>elements[s]||elements[s.slice(1)]||null,querySelectorAll:s=>collections[s]||[]},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{hash:''},window:{addEventListener(){},scrollTo(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(data)})};
  const code=source.replace(/^import[\s\S]*?from '\.\/engine\.js';/,'');
  const api=await vm.runInNewContext(`(async()=>{${code}\nreturn {nav,update,switchCity,showDetail,bindLiveControls,loadExample,setStep:value=>{step=value;render();},getConfig:()=>config,getPlan:()=>plan};})()`,context);
  return {api,elements,storage,collections};
}

test('initial summary shows full Bogotá source total, not the selected flow subtotal',async()=>{
  const {api,elements}=await workspace();
  assert.match(elements.app.innerHTML,/2\.288\.182\.930/);
  assert.match(elements.app.innerHTML,/Consolidado completo de Bogotá/);
  assert.equal(api.getConfig().selected.length,0);
  assert.equal(api.getConfig().budget,0);
  api.update({selected:['BTA-ACANTO'],budget:10000000});
  api.nav('history');
  assert.match(elements.app.innerHTML,/2\.288\.182\.930/);
  assert.doesNotMatch(elements.app.innerHTML,/No pudimos cargar/);
});

test('live budget controls recalculate without replacing the input and preserve the historical total',async()=>{
  const {api,elements,collections}=await workspace();
  api.loadExample();
  const before=api.getPlan().results;
  const html=elements.app.innerHTML;
  const budget={value:'45000000',setCustomValidity(){}};
  const range={value:'30000000',max:'100000000'};
  const exportButton={disabled:false};
  elements['[data-live-budget]']=budget;
  elements['budget-range']=range;
  elements['live-kpis']={innerHTML:''};
  elements['live-errors']={innerHTML:''};
  collections['[data-export-button],#generate-flow']=[exportButton];
  api.bindLiveControls();
  budget.oninput();
  assert.equal(api.getPlan().allocated,45000000);
  assert.ok(Math.abs(api.getPlan().results-before*1.5)<0.01);
  assert.equal(elements.app.innerHTML,html,'continuous input does not replace the workspace');
  assert.match(elements['live-kpis'].innerHTML,/1\.500\.000/);
  range.value='0';range.oninput();
  assert.ok(api.getPlan().errors.length);
  assert.equal(exportButton.disabled,true);
  assert.match(elements['live-errors'].innerHTML,/presupuesto/i);
  range.value='15000000';range.oninput();
  assert.equal(budget.value,15000000);
  assert.equal(api.getPlan().allocated,15000000);
  assert.equal(exportButton.disabled,false);
  api.nav('history');
  assert.match(elements.app.innerHTML,/2\.288\.182\.930/);
});

test('live project weights normalize the whole budget and manual CPL changes the same model',async()=>{
  const {api,collections,elements}=await workspace();
  api.loadExample();
  assert.equal(api.getConfig().example,true);
  const weight={dataset:{liveWeight:'BTA-ELEMENT142'},value:'50'};
  collections['[data-live-weight]']=[weight];
  api.bindLiveControls();weight.oninput();
  assert.equal(api.getConfig().allocation,'manual');
  assert.equal(api.getPlan().allocated,30000000);
  assert.equal(api.getPlan().rows.filter(r=>r.project.id==='BTA-ELEMENT142').reduce((s,r)=>s+r.budget,0),12000000);
  const row=api.getPlan().rows[0];
  const before=api.getPlan().results;
  const cpl={dataset:{cpl:row.id},value:String(row.baseCpl*2),setCustomValidity(value){this.validationMessage=value;}};
  const exportButton={disabled:false};
  elements['live-errors']={innerHTML:''};
  collections['[data-cpl]']=[cpl];
  collections['[data-export-button]']=[exportButton];
  api.bindLiveControls();cpl.oninput();
  assert.equal(api.getPlan().allocated,30000000);
  assert.ok(Math.abs(api.getPlan().results-(before-row.results/2))<0.001);
  assert.equal(cpl.validationMessage,'');
  cpl.value='0';cpl.oninput();
  assert.equal(exportButton.disabled,true);
  assert.match(cpl.validationMessage,/mayor que cero/);
});

test('city switch changes displayed total and restores each independent budget and selection',async()=>{
  const {api,elements}=await workspace();
  api.update({selected:['BTA-ACANTO'],budget:10000000});
  api.switchCity('MDE');
  assert.match(elements.app.innerHTML,/914\.783\.236/);
  assert.match(elements.app.innerHTML,/Consolidado completo de Medellín/);
  assert.equal(api.getConfig().budget,0);
  assert.equal(api.getConfig().selected.length,0);
  api.update({selected:['MDE-PUERTOCAPRI'],budget:5000000});
  api.switchCity('BTA');
  assert.equal(api.getConfig().budget,10000000);
  assert.deepEqual(Array.from(api.getConfig().selected),['BTA-ACANTO']);
  api.switchCity('MDE');
  assert.equal(api.getConfig().budget,5000000);
  assert.deepEqual(Array.from(api.getConfig().selected),['MDE-PUERTOCAPRI']);
});

test('all planning steps, source screens, names and calculation detail render with real data',async()=>{
  const {api,elements}=await workspace();
  for(const city of ['BTA','MDE']){
    api.switchCity(city);
    const selected=data.projects.filter(p=>p.city===city&&p.active&&p.months>0).slice(0,3).map(p=>p.id);
    api.update({selected,budget:30000000});
    api.nav('builder');
    for(const step of [1,2,3]){api.setStep(step);assert.ok(elements.app.innerHTML.length>1000);assert.doesNotMatch(elements.app.innerHTML,/NaN|undefined/);}
    assert.ok(api.getPlan().rows.length>0);
    assert.equal(api.getPlan().allocated,30000000);
    api.showDetail(api.getPlan().rows[0].id);
    assert.match(elements['dialog-content'].innerHTML,/id="detail-title"/);
    for(const view of ['history','names','method','saved','summary']){api.nav(view);assert.ok(elements.app.innerHTML.length>1000);assert.doesNotMatch(elements.app.innerHTML,/NaN|undefined/);}
  }
});
