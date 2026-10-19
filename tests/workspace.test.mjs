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
  const context={...engine,console,Intl,Date,Number,Math,JSON,Set,String,Object,Array,Error,structuredClone,
    setTimeout,clearTimeout,document:{documentElement:{dataset:{}},querySelector:s=>elements[s.slice(1)]||null,querySelectorAll:()=>[]},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{hash:''},window:{addEventListener(){},scrollTo(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(data)})};
  const code=source.replace(/^import[\s\S]*?from '\.\/engine\.js';/,'');
  const api=await vm.runInNewContext(`(async()=>{${code}\nreturn {nav,update,switchCity,showDetail,setStep:value=>{step=value;render();},getConfig:()=>config,getPlan:()=>plan};})()`,context);
  return {api,elements,storage};
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
