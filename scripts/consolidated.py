"""Read the two authoritative city flows without adding copies or subtotals.

Financial history mirrors the source's S/V detail rows. The projection subset
requires a project, a supported medium and consistent Leads KPI labels.
"""
import collections
import datetime
import math
import re
import unicodedata

SHEETS = {'BTA': ' Flow Bogota Consolidado', 'MDE': 'Flow Medellín Consolidado'}
COLS = ['city', 'month', 'project', 'initiative', 'channel', 'campaign',
        'planned', 'actual', 'sourceResults', 'leads', 'leadSpend',
        'impressions', 'clicks', 'plannedLeads', 'sourceRow', 'flags', 'kpi']

def norm(value):
    return re.sub('[^A-Z0-9]', '', unicodedata.normalize('NFKD', str(value or '').upper()).encode('ascii', 'ignore').decode())

def numeric(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None

def attach_consolidated(workbook, data):
    projects = {p['id']: p for p in data['projects']}
    aliases = {'BULEVARVERDEAPARTAMENTOS': 'BULEVARVERDE', 'VIVOPARK1': 'VIVOPARK', 'VIVOPARK2': 'VIVOPARK',
               'TORREESTACIONCC': 'TORREESTACIONCENTROCOMERCIAL', 'URBANYOFI': 'URBANITYOFFICE',
               'URBANYOFICINAS': 'URBANITYOFFICE', 'NUEVATORREESKALA': 'ESKALA', 'TERRA': 'URBANIATERRA',
               'ICONIKA68': 'ICONIK68', 'TORREESTACIONCOMERCIAL': 'TORREESTACIONCENTROCOMERCIAL'}
    candidates = []
    for p in projects.values():
        candidates.append((norm(p['name']), p['id']))
    for a, b in aliases.items():
        for city in SHEETS:
            if city + '-' + b in projects:
                candidates.append((a, city + '-' + b))
    candidates.sort(key=lambda item: len(item[0]), reverse=True)

    def project_id(initiative, campaign, city):
        label, name = norm(initiative), norm(campaign)
        if label in ['MARCA', 'SEGUIDORES', 'CATALOGO', 'SALUDFINANCIERA'] or 'MARCA' in name or 'SEGUIDORES' in name:
            return None
        # Campaign takes precedence over ambiguous labels such as Torre Estación.
        found = next((pid for text, pid in candidates if pid.startswith(city + '-') and text in name), None)
        return found or (city + '-' + aliases.get(label, label) if city + '-' + aliases.get(label, label) in projects else None)

    def medium(label, campaign):
        n, c = norm(label), str(campaign or '').strip().upper()
        if 'YOUTUBE' in n or c.startswith(('YT_', 'YOUTUBE')): return 'youtube'
        if 'TIKTOK' in n or c.startswith(('TT_', 'TIKTOK')) or '| TT |' in c: return 'tiktok'
        if n in ['META', 'METAADS', 'FACEBOOK', 'INSTAGRAM'] or c.startswith(('FB_', 'FACEBOOK', 'INSTAGRAM')) or '| MA |' in c: return 'meta'
        if 'GOOGLE' in n or c.startswith(('GLG_', 'GOOGLE')) or 'SEARCH' in c or 'PMAX' in c or 'PERFORMANCE MAX' in c: return 'google'
        return 'other'

    ledger, sources, issues = [], {}, []
    for city, sheet_name in SHEETS.items():
        detail, skipped, signatures = [], 0, collections.defaultdict(list)
        rows = list(workbook[sheet_name].values)
        for row_no, original in enumerate(rows, 1):
            r = list(original) + [None] * max(0, 44 - len(original))
            if r[0] == 'Mes' or not any(r[i] for i in [8, 9, 10]): continue
            date = next((r[i] for i in [1, 14] if isinstance(r[i], (datetime.date, datetime.datetime))), None)
            if date is None:
                if row_no > 12 and any(numeric(r[i]) for i in [18, 21]): skipped += 1
                continue
            month = date.strftime('%Y-%m')
            initiative, campaign = str(r[8] or 'Sin iniciativa'), str(r[10] or r[9] or 'Sin nomenclatura')
            channel = medium(r[11], campaign)
            pid = project_id(initiative, campaign, city)
            values = [numeric(r[i]) for i in [18, 21, 25, 42, 43, 31]]
            planned, actual, results, impressions, clicks, target = values
            flags = []
            for col, value in zip(['S', 'V', 'Z', 'AQ', 'AR', 'AF'], values):
                if value is None: flags.append('missing:' + col)
            kpi, principal = norm(r[23]), norm(r[29])
            is_lead = kpi in ['LEADS', 'CONVERSIONES'] and principal in ['', 'LEADS', 'CONVERSIONES', '0']
            if kpi in ['LEADS', 'CONVERSIONES'] and not is_lead: flags.append('conflicting-kpi')
            if any(term in norm(campaign) for term in ['MARCA', 'SEGUIDORES', 'ALCANCE', 'INTERACCION', 'INTERACCIONES', 'TRAFICO']):
                if is_lead: flags.append('non-lead-campaign')
                is_lead = False
            leads = results if is_lead else None
            lead_spend = actual if is_lead else None
            item = [city, month, pid, initiative, channel, campaign, planned, actual, results,
                    leads, lead_spend, impressions, clicks, target if is_lead else None, row_no, flags, str(r[23] or '')]
            detail.append(item)
            if actual and campaign != 'Sin nomenclatura': signatures[(month, campaign, actual, results, impressions, clicks)].append(item)
        repeats = [group for group in signatures.values() if len(group) > 1]
        for group in repeats:
            for item in group: item[15].append('repeated-metrics')
            issues.append({'city': city, 'month': group[0][1], 'rows': [item[14] for item in group], 'type': 'repeated-metrics'})
        periods = sorted(set(r[1] for r in detail))
        sources[city] = {'sheet': sheet_name, 'rows': len(detail), 'start': periods[0], 'end': periods[-1],
                         'months': periods, 'firstRow': min(r[14] for r in detail), 'lastRow': max(r[14] for r in detail),
                         'planned': sum(r[6] or 0 for r in detail), 'actual': sum(r[7] or 0 for r in detail),
                         'sourceResults': sum(r[8] or 0 for r in detail), 'repeatedGroups': len(repeats),
                         'undatedNamedRows': skipped,
                         'monthly': [{'month': m, 'planned': sum(r[6] or 0 for r in detail if r[1] == m),
                                      'actual': sum(r[7] or 0 for r in detail if r[1] == m),
                                      'rows': sum(r[1] == m for r in detail)} for m in periods]}
        ledger.extend(detail)
    # Historical control totals retain every dated source row, including brand,
    # unmapped initiatives and repeated metrics. No silent correction of Excel.
    agg = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    for r in ledger:
        if not r[2] or r[4] not in ['meta', 'google', 'tiktok'] or r[9] is None or r[7] is None: continue
        if r[7] <= 0 and r[9] <= 0: continue
        a = agg[(r[2], r[4], r[1])]
        for i, value in enumerate([r[7], r[11] or 0, r[12] or 0, r[9], 1]): a[i] += value
    data['records'] = [[*key, *values] for key, values in sorted(agg.items())]
    data['ledger'] = ledger
    for old in ['excluded', 'metaRepeatedMetricRows', 'unmatchedCampaigns', 'unmatchedRows', 'tiktokSources']:
        data['meta'].pop(old, None)
    data['meta'].update({'schema': 2, 'ledgerColumns': COLS, 'consolidated': sources, 'qualityIssues': issues,
                         'sourceRows': len(ledger), 'sourceCounts': {v['sheet']: v['rows'] for v in sources.values()},
                         'recordSource': 'Consolidados por ciudad: V / Z / AQ / AR',
                         'notes': [
                             'Inversión planeada = suma de S e inversión real registrada = suma de V, solo filas de detalle con fecha e iniciativa o campaña. Se excluyen encabezados y subtotales.',
                             'Bogotá y Medellín se consultan y se planean por separado. El histórico incluye todas las iniciativas y medios del consolidado, independientemente de la selección del flow.',
                             'No se suman las hojas Copia de ni los reportes RAW a los consolidados: repetirían inversión.',
                             'El archivo contiene febrero–diciembre de 2025 y febrero–octubre de 2026. Enero no está en estos consolidados; ausencia de registro no equivale a inversión cero.',
                             'Octubre de 2026 tiene corte al 19. Las proyecciones usan por defecto julio–septiembre de 2026.',
                             'Leads y CPL usan solo filas con KPI de leads coherente en X y AD, sin nombres de campañas de marca, alcance, tráfico, interacciones o seguidores. El CPL usa inversión de esas filas, no inversión de marca. Las conversiones de Google pueden ser decimales.',
                             'Filas con campaña, mes y métricas idénticas se señalan para revisión. Se conservan para conciliar con el archivo; no se asume que sean duplicados sin confirmar.',
                             'Los valores almacenados en Excel se leen sin recalcular sus fórmulas. Los totales de la aplicación se recalculan desde las filas de detalle.',
                             'Impresiones y clics reproducen AQ y AR del consolidado; sus fórmulas de origen pueden repetir métricas. El alcance es una aproximación, no personas únicas.',
                             'El flow utiliza el subconjunto de leads con proyecto y medio identificados. Las campañas de marca y sin proyecto permanecen en el total histórico.'
                         ]})
    for p in data['projects']:
        own = [r for r in data['records'] if r[0] == p['id']]
        p['months'] = len(set(r[2] for r in own))
        p['lastMonth'] = max((r[2] for r in own), default=None)
    return data
