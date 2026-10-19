export const CHANNELS = {
  meta: { name: 'Meta Ads', short: 'Meta', code: 'FB', color: '#1675ed' },
  google: { name: 'Google Ads', short: 'Google', code: 'GLG', color: '#e8ac2c' },
  tiktok: { name: 'TikTok Ads', short: 'TikTok', code: 'TT', color: '#242c40' }
};
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
export const monthNumber = s => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
export function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
}
export function daysBetween(a, b) {
  if (!validDate(a) || !validDate(b)) return 0;
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1);
}
export function allocate(total, weights) {
  total = Math.max(0, Math.round(total));
  const clean = weights.map(w => Number.isFinite(w) ? Math.max(0, w) : 0);
  const sum = clean.reduce((a, b) => a + b, 0);
  if (!sum) return clean.map(() => 0);
  const exact = clean.map(w => total * w / sum), amounts = exact.map(Math.floor);
  const order = exact.map((v, i) => ({ i, r: v - amounts[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let left = total - amounts.reduce((a, b) => a + b, 0), i = 0; left > 0; left--, i++) amounts[order[i].i]++;
  return amounts;
}
export function aggregate(records, config = {}) {
  let spend = 0, impressions = 0, clicks = 0, results = 0, sourceRows = 0;
  const months = new Set();
  for (const r of records) {
    const weight = config.weighting === 'recent' ? Math.max(1, monthNumber(r[2]) - monthNumber(config.historyStart) + 1) : 1;
    spend += r[3] * weight; impressions += r[4] * weight; clicks += r[5] * weight; results += r[6] * weight;
    sourceRows += r[7]; months.add(r[2]);
  }
  return { spend, impressions, clicks, results, sourceRows, months: months.size,
    cpl: spend > 0 && results > 0 ? spend / results : null,
    cpm: spend > 0 && impressions > 0 ? spend / impressions * 1000 : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cvr: clicks > 0 ? results / clicks : null };
}
export function historicalRows(data, {city, start, end, channel = 'all', project = 'all', search = ''}) {
  if (!['BTA', 'MDE'].includes(city)) return [];
  const query = normalize(search);
  return data.ledger.filter(r => r[0] === city && r[1] >= start && r[1] <= end
    && (channel === 'all' || r[4] === channel)
    && (project === 'all' || r[2] === project)
    && (!query || normalize(`${r[3]} ${r[5]}`).includes(query)));
}
export function summarizeLedger(rows) {
  const sum = i => rows.reduce((s, r) => s + (r[i] ?? 0), 0);
  const actual = sum(7), planned = sum(6), leads = sum(9), leadSpend = sum(10);
  return {actual, planned, leads, leadSpend, cpl: leads > 0 && leadSpend > 0 ? leadSpend / leads : null,
    impressions: sum(11), clicks: sum(12), sourceResults: sum(8), plannedLeads: sum(13),
    rows: rows.length, missingActual: rows.filter(r => r[7] === null).length,
    flagged: rows.filter(r => r[15].includes('repeated-metrics')).length,
    months: new Set(rows.map(r => r[1])).size,
    execution: planned > 0 ? actual / planned : null};
}
export function historicalSeries(rows) {
  return [...new Set(rows.map(r => r[1]))].sort().map(month => ({month, ...summarizeLedger(rows.filter(r => r[1] === month))}));
}
export function benchmark(data, project, channel, config) {
  const window = data.records.filter(r => r[1] === channel && r[2] >= config.historyStart && r[2] <= config.historyEnd);
  const ownRecords = window.filter(r => r[0] === project.id);
  const own = aggregate(ownRecords, config);
  if (own.cpl !== null) return { ...own, basis: 'own', basisLabel: 'Histórico propio', own, records: ownRecords, raw: aggregate(ownRecords) };
  const ids = new Set(data.projects.filter(p => p.city === project.city && p.kind === project.kind).map(p => p.id));
  const poolRecords = window.filter(r => ids.has(r[0]));
  const pool = aggregate(poolRecords, config);
  return { ...pool, basis: pool.cpl ? 'comparable' : 'missing', basisLabel: pool.cpl ? `Referencia ${project.city === 'BTA' ? 'Bogotá' : 'Medellín'} · ${project.kind}` : 'Sin base suficiente', own, records: poolRecords, raw: aggregate(poolRecords) };
}
export function campaignName(project, channel, config) {
  const template = project.templates[channel];
  if (config.namingMode === 'existing' && template) return { name: template.name, original: template.name, generated: false, source: template.source, row: template.row };
  const original = template?.name || '';
  const stage = config.stage !== 'auto' ? config.stage : original.match(/_(POSTLAN|LAN|SOS|INVER|EXP)_/)?.[1] || 'SOS';
  const projectToken = original.match(/^(?:FB|GLG|TT)_(?:NO_VIS|VIS)_(.+?)_(?:POSTLAN|LAN|SOS|INVER|EXP)_/)?.[1] || (project.id.endsWith('TORREESTACIONCENTROCOMERCIAL') ? 'TORRE_ESTACION_C_C' : project.token);
  const purchase = original.match(/_(CPL|CPC|CPA)_/)?.[1] || 'CPL';
  const objective = original.match(/_(?:CPL|CPC|CPA)_(LEADS|CONVERSIONES|SEARCH)_/)?.[1] || 'LEADS';
  const origin = original.match(/_(TACTICO_[A-Z0-9_]+?)_Q[1-4]_/)?.[1] || 'AON';
  const audience = original.match(/_(ADV|INT|DEMO|LKL|RMK|KW|PMAX|VID)_/)?.[1] || (channel === 'google' ? 'PMAX' : 'INT');
  const format = original.match(/_(STATIC|VIDEO|MIX|SEARCH|PMAX)_/)?.[1] || (channel === 'google' ? 'PMAX' : channel === 'tiktok' ? 'VIDEO' : 'STATIC');
  const quarter = `Q${Math.ceil(Number(config.startDate.slice(5, 7)) / 3) || 1}`;
  const suffix = normalize(config.suffix).slice(0, 30);
  const name = [CHANNELS[channel].code, project.kind.replaceAll(' ', '_'), projectToken, stage, purchase, objective, audience, project.city, format, origin, quarter, 'VML', suffix].filter(Boolean).join('_');
  return { name, original: template?.name || null, generated: true, source: template?.source || 'Patrón inferido de los flows', row: template?.row };
}
export function buildPlan(data, config) {
  const errors = [];
  const days = daysBetween(config.startDate, config.endDate);
  if (!days) errors.push('Revisa las fechas: el final debe ser igual o posterior al inicio.');
  if (!(Number(config.budget) > 0) || !Number.isFinite(Number(config.budget))) errors.push('Ingresa un presupuesto mayor que cero.');
  if (!/^\d{4}-\d{2}$/.test(config.historyStart) || !/^\d{4}-\d{2}$/.test(config.historyEnd) || config.historyStart > config.historyEnd) errors.push('Revisa el intervalo histórico.');
  const selected = data.projects.filter(p => config.selected.includes(p.id));
  if (new Set(selected.map(p => p.city)).size > 1 || (config.city && selected.some(p => p.city !== config.city))) errors.push('Cada flow pertenece a una sola ciudad. Revisa los proyectos seleccionados.');
  if (!selected.length) errors.push('Selecciona al menos un proyecto.');
  const channels = config.channels.filter(c => CHANNELS[c]);
  if (!channels.length) errors.push('Selecciona al menos un medio.');
  const taxRate = Math.max(0, Number(config.taxRate) || 0) / 100;
  const net = Math.round((Number(config.budget) || 0) / (config.includesTax ? 1 + taxRate : 1));
  const frequency = Math.max(1, Number(config.frequency) || 3.1);
  const sensitivity = Math.min(90, Math.max(0, Number(config.sensitivity) || 0)) / 100;
  const scenarioFactor = config.scenario === 'conservative' ? 1 + sensitivity : config.scenario === 'optimistic' ? 1 - sensitivity : 1;
  const projectGroups = selected.map(project => {
    const cells = channels.map(channel => {
      const rate = benchmark(data, project, channel, config), id = `${project.id}:${channel}`;
      const override = Number(config.overrides?.[id]);
      const cpl = Number.isFinite(override) && override > 0 ? override : rate.cpl;
      return { id, project, channel, rate, baseCpl: cpl, manual: Number.isFinite(override) && override > 0 };
    });
    return { project, cells, spend: cells.reduce((s, c) => s + c.rate.own.spend, 0) };
  });
  const positiveSpend = projectGroups.filter(g => g.spend > 0);
  const fallbackSpend = positiveSpend.length ? positiveSpend.reduce((s, g) => s + g.spend, 0) / positiveSpend.length : 1;
  const weights = projectGroups.map(g => {
    if (config.allocation === 'manual') return Math.max(0, Number(config.priorities?.[g.project.id] ?? 1));
    return config.allocation === 'historical' ? g.spend || fallbackSpend : 1;
  });
  if (weights.length && weights.every(w => !w)) errors.push('Asigna un peso mayor que cero a algún proyecto.');
  if (errors.length) return { errors, rows: [], projects: selected, net: Math.max(0, net), days, allocated: 0, unallocated: Math.max(0, net), results: 0, baseResults: 0, impressions: 0, clicks: 0, cpl: null, scenarioFactor, frequency, sensitivity, warnings: [] };
  const budgets = allocate(net, weights), rows = [], warnings = [];
  for (let gi = 0; gi < projectGroups.length; gi++) {
    const g = projectGroups[gi];
    const eligible = g.cells.filter(c => c.baseCpl > 0);
    const hasOwnSpend = eligible.some(c => c.rate.own.spend > 0);
    const mix = eligible.map(c => config.mix === 'equal' ? 1 : hasOwnSpend ? c.rate.own.spend : c.rate.spend);
    const channelBudgets = allocate(budgets[gi], mix);
    if (hasOwnSpend && config.mix !== 'equal') {
      for (const c of eligible.filter(c => !c.rate.own.spend)) warnings.push(`${g.project.name}: ${CHANNELS[c.channel].short} queda sin inversión en mix histórico. Usa mix equitativo para probarlo.`);
    }
    for (const c of g.cells.filter(c => !c.baseCpl)) warnings.push(`${g.project.name} / ${CHANNELS[c.channel].short}: sin CPL válido en el periodo.`);
    for (let ci = 0; ci < eligible.length; ci++) {
      const c = eligible[ci], budget = channelBudgets[ci];
      if (!budget) continue;
      const cpl = c.baseCpl * scenarioFactor, results = budget / cpl;
      const impressions = c.rate.cpm > 0 ? budget / c.rate.cpm * 1000 : null;
      const clicks = impressions !== null && c.rate.ctr !== null ? impressions * c.rate.ctr : null;
      rows.push({ ...c, budget, daily: budget / days, cpl, results, baseResults: budget / c.baseCpl, impressions, clicks,
        reach: c.channel !== 'google' && impressions !== null ? impressions / frequency : null,
        naming: campaignName(c.project, c.channel, config) });
    }
  }
  const sum = field => rows.reduce((s, r) => s + (r[field] || 0), 0);
  const allocated = sum('budget'), results = sum('results');
  const unallocated = net - allocated;
  if (unallocated) warnings.push(`Hay ${unallocated.toLocaleString('es-CO')} COP pendientes de asignar por falta de base histórica.`);
  if (config.historyEnd > data.meta.completeThrough) warnings.push('El histórico incluye octubre de 2026, un mes incompleto.');
  if (rows.some(r => r.rate.basis === 'comparable')) warnings.push('Algunos medios usan una referencia de la misma ciudad y tipología; revisa la base de cada fila.');
  if (data.ledger?.some(r => selected.some(p => p.id === r[2]) && channels.includes(r[4]) && r[1] >= config.historyStart && r[1] <= config.historyEnd && r[15].includes('repeated-metrics'))) warnings.push('La base seleccionada contiene filas con métricas repetidas en el consolidado. Se conservan como en Excel; revisa el detalle del histórico.');
  return { errors, rows, projects: selected, net, days, allocated, unallocated, results, baseResults: sum('baseResults'), impressions: sum('impressions'), clicks: sum('clicks'),
    impressionsComplete: rows.every(r => r.impressions !== null), clicksComplete: rows.every(r => r.clicks !== null),
    cpl: results > 0 ? allocated / results : null, daily: allocated / days, tax: config.includesTax ? Number(config.budget) - net : net * taxRate,
    scenarioFactor, frequency, sensitivity, warnings };
}
export function csvText(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const s = String(value ?? '');
    const safe = /^[=+@\-]/.test(s) && typeof value !== 'number' ? `'${s}` : s;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(';')).join('\r\n');
}
export function flowExport(plan, config) {
  return csvText([
    ['Proyecto','Ciudad','Medio','Inicio','Fin','Días','Inversión neta COP','Inversión diaria COP','CPL proyectado COP','Resultados atribuidos estimados','Impresiones estimadas','Clics estimados','Alcance modelado sin desduplicar','Frecuencia supuesta','Nomenclatura campaña','Base','Histórico desde','Histórico hasta','Ponderación','Escenario','CPL manual','Fuente nomenclatura'],
    ...plan.rows.map(r => [r.project.name,r.project.city,CHANNELS[r.channel].name,config.startDate,config.endDate,plan.days,r.budget,r.daily.toFixed(2),r.cpl.toFixed(2),r.results.toFixed(2),r.impressions?.toFixed(0),r.clicks?.toFixed(0),r.reach?.toFixed(0),r.reach === null ? '' : plan.frequency,r.naming.name,r.rate.basisLabel,config.historyStart,config.historyEnd,config.weighting,config.scenario,r.manual ? 'Sí' : 'No',r.naming.source]),
    ['TOTAL ASIGNADO','','','','','',plan.allocated,plan.daily?.toFixed(2),'',plan.results.toFixed(2),plan.impressionsComplete ? plan.impressions.toFixed(0) : 'Parcial',plan.clicksComplete ? plan.clicks.toFixed(0) : 'Parcial'],
    ['PENDIENTE DE ASIGNAR','','','','','',plan.unallocated],
    ['NOTA','Proyección lineal. No garantiza resultados ni deduplica personas. Google reporta conversiones atribuidas.'],
    ['FÓRMULAS','CPL = suma gasto ponderado / suma resultados ponderados; Resultados = presupuesto / CPL; Impresiones = presupuesto / CPM * 1000; Clics = impresiones * CTR.'],
    ['SENSIBILIDAD CPL',`${config.sensitivity}%; coeficiente aplicado: ${plan.scenarioFactor}`]
  ]);
}
