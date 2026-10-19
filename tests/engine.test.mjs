import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allocate,aggregate,benchmark,buildPlan,daysBetween,campaignName,csvText,flowExport} from '../public/engine.js';
const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const base={budget:30000000,includesTax:false,taxRate:19,startDate:'2026-11-01',endDate:'2026-11-30',historyStart:'2026-07',historyEnd:'2026-09',weighting:'recent',selected:['BTA-ACANTO','BTA-NUVO','BTA-MISTRAL','BTA-VERDI'],channels:['meta','google','tiktok'],allocation:'equal',mix:'historical',priorities:{},overrides:{},scenario:'base',sensitivity:20,frequency:3.1,namingMode:'new',stage:'auto',suffix:''};
test('allocation reconciles to the peso, including fractional and zero weights',()=>{
  assert.deepEqual(allocate(10,[1,1,1]),[4,3,3]);
  assert.deepEqual(allocate(100,[0,1,0]),[0,100,0]);
  for(const total of [0,1,7,10000001,96721435]) assert.equal(allocate(total,[1,.03,42,0,99]).reduce((a,b)=>a+b,0),total);
  assert.deepEqual(allocate(100,[0,0]),[0,0]);
});
test('inclusive date intervals, leap years, reversed dates and invalid dates',()=>{
  assert.equal(daysBetween('2026-11-01','2026-11-30'),30);
  assert.equal(daysBetween('2028-02-01','2028-02-29'),29);
  assert.equal(daysBetween('2026-10-19','2026-10-19'),1);
  assert.equal(daysBetween('2026-11-30','2026-11-01'),0);
  assert.equal(daysBetween('2026-02-30','2026-03-01'),0);
});
test('ratio of weighted sums is used instead of average CPL',()=>{
  const records=[['a','meta','2026-07',100,1000,10,1,1],['a','meta','2026-08',100,500,10,10,1]];
  assert.equal(aggregate(records).cpl,200/11);
  assert.equal(aggregate(records,{weighting:'recent',historyStart:'2026-07'}).cpl,300/21);
  assert.equal(aggregate(records).ctr,20/1500);
  assert.equal(aggregate([]).cpl,null);
});
test('base plan reconciles budget and projected total from individual rows',()=>{
  const plan=buildPlan(data,base);
  assert.equal(plan.errors.length,0);assert.equal(plan.allocated,30000000);assert.equal(plan.unallocated,0);
  assert.equal(plan.rows.reduce((a,r)=>a+r.budget,0),plan.net);
  assert.ok(plan.results>0);assert.ok(plan.rows.every(r=>r.budget>0&&r.cpl>0));
  assert.equal(plan.results,plan.rows.reduce((s,r)=>s+r.budget/r.cpl,0));
  assert.equal(plan.daily,1000000);
  assert.equal(new Set(plan.rows.map(r=>r.naming.name)).size,plan.rows.length);
});
test('known source project-month CPL can be reconstructed from stored totals',()=>{
  const r=data.records.find(r=>r[0]==='BTA-VERDI'&&r[1]==='meta'&&r[2]==='2026-10');
  assert.equal(r[3],2544382);assert.equal(r[6],180);assert.equal(r[4],166077);assert.equal(r[5],2963);
  assert.equal(aggregate([r]).cpl,2544382/180);
});
test('VAT-inclusive budget is netted before allocation',()=>{
  const p=buildPlan(data,{...base,budget:11900000,includesTax:true});
  assert.equal(p.net,10000000);assert.equal(p.allocated,10000000);assert.equal(p.tax,1900000);
});
test('manual zero weights assign no money and all-zero weights block calculation',()=>{
  const p=buildPlan(data,{...base,allocation:'manual',priorities:{'BTA-ACANTO':1,'BTA-NUVO':0,'BTA-MISTRAL':0,'BTA-VERDI':0}});
  assert.equal(p.allocated,p.net);assert.ok(p.rows.every(r=>r.project.id==='BTA-ACANTO'));
  const p2=buildPlan(data,{...base,allocation:'manual',priorities:Object.fromEntries(base.selected.map(id=>[id,0]))});
  assert.equal(p2.rows.length,0);assert.ok(p2.errors.length);
});
test('scenario factor changes CPL and results, retaining assigned budget',()=>{
  const p=buildPlan(data,base),c=buildPlan(data,{...base,scenario:'conservative'}),o=buildPlan(data,{...base,scenario:'optimistic'});
  assert.ok(Math.abs(c.results-p.results/1.2)<1e-7);
  assert.ok(Math.abs(o.results-p.results/.8)<1e-7);
  assert.equal(c.allocated,p.allocated);assert.equal(o.allocated,p.allocated);
});
test('manual CPL override feeds the same projection engine',()=>{
  const p=buildPlan(data,{...base,selected:['BTA-ACANTO'],channels:['meta'],budget:1000000,overrides:{'BTA-ACANTO:meta':5000}});
  assert.equal(p.results,200);assert.equal(p.rows[0].manual,true);
});
test('fallback stays within city, housing type and channel',()=>{
  const project={id:'BTA-NOHISTORY',name:'Nuevo',kind:'VIS',city:'BTA',token:'NUEVO',templates:{}};
  const b=benchmark(data,project,'meta',base);assert.equal(b.basis,'comparable');
  assert.ok(b.records.every(r=>r[1]==='meta'&&data.projects.find(p=>p.id===r[0]).kind==='VIS'&&r[0].startsWith('BTA-')));
  const missing=benchmark(data,project,'meta',{...base,historyStart:'2024-01',historyEnd:'2024-02'});assert.equal(missing.basis,'missing');assert.equal(missing.cpl,null);
});
test('no evidence leaves budget unallocated, never invents zero-cost results',()=>{
  const p=buildPlan(data,{...base,historyStart:'2024-01',historyEnd:'2024-02'});
  assert.equal(p.rows.length,0);assert.equal(p.unallocated,p.net);assert.equal(p.results,0);
});
test('empty projects, empty media and reversed history are surfaced as errors',()=>{
  assert.ok(buildPlan(data,{...base,selected:[]}).errors.length);
  assert.ok(buildPlan(data,{...base,channels:[]}).errors.length);
  assert.ok(buildPlan(data,{...base,historyStart:'2026-09',historyEnd:'2026-07'}).errors.length);
});
test('new names use correct project city, quarter, channel code and clean suffix',()=>{
  const p=data.projects.find(p=>p.id==='BTA-ACANTO');
  const name=campaignName(p,'google',{...base,suffix:'Campaña noviembre!'}).name;
  assert.match(name,/^GLG_VIS_ACANTO_/);assert.match(name,/_BTA_/);assert.match(name,/_Q4_VML_CAMPANA_NOVIEMBRE$/);
  assert.equal(campaignName(p,'meta',{...base,namingMode:'existing'}).name,p.templates.meta.name);
});
test('Google reach remains unavailable and partial months are flagged',()=>{
  const p=buildPlan(data,{...base,historyEnd:'2026-10'});
  assert.ok(p.rows.filter(r=>r.channel==='google').every(r=>r.reach===null));
  assert.ok(p.warnings.some(w=>w.includes('incompleto')));
  assert.ok(p.rows.filter(r=>r.channel==='meta').every(r=>Math.abs(r.reach-r.impressions/base.frequency)<1e-7));
});
test('CSV contains precise values, source basis, and protects formulas',()=>{
  assert.match(csvText([['=EVIL()','a;b','x"y',12]]),/'=EVIL/);
  const csv=flowExport(buildPlan(data,base),base);
  assert.match(csv,/Nomenclatura campaña/);assert.match(csv,/TOTAL ASIGNADO/);assert.match(csv,/2026-07/);assert.match(csv,/30000000/);
});
test('catalog and data contain no summary rows or buyer/contact records',()=>{
  assert.equal(new Set(data.projects.map(p=>p.id)).size,data.projects.length);
  assert.ok(data.projects.every(p=>!['VIS','NO_VIS','TOTAL','ACTIVOS_POR_TIPOLOGIA'].includes(p.token)));
  assert.ok(data.records.every(r=>data.projects.some(p=>p.id===r[0])&&r.slice(3).every(v=>Number.isFinite(v)&&v>=0)));
  const payload=JSON.stringify(data);
  for(const s of ['Nombre Comprador','No. Identificacion','Telefono','Salario','Fecha Nacimiento','E-mail']) assert.ok(!payload.includes(s));
  assert.ok(data.projects.filter(p=>p.active).every(p=>p.image));
});
