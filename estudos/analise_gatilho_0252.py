"""Analise exploratoria de antecedentes da assinatura congelada na zona 0252."""
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import sys
import json
from pathlib import Path
import re
import statistics
import zipfile

HERE = Path(sys.argv[1]).resolve()
ROOT = Path(sys.argv[2]).resolve()
DAY = '25/10/2026'
RESULT = 'O voto do eleitor foi computado'

def clock(value):
    return datetime.strptime(value, '%d/%m/%Y %H:%M:%S')

def classify(c):
    if c is None:
        return 'não reconstruído'
    m = [e[0] for e in c['signature']]
    if any('Mesário # habilitou o eleitor' in x for x in m): return 'habilitação manual'
    if any('Tipo de habilitação do eleitor [biométrica]' == x for x in m): return 'biometria reconhecida'
    if any('Ano de nascimento' in x or 'não possui biometria' in x for x in m): return 'sem biometria cadastrada'
    return 'outro ou indeterminado'

def main():
    cycles = defaultdict(list)
    with (HERE/'lote_ciclos.jsonl').open(encoding='utf8') as f:
        for line in f:
            c=json.loads(line)
            if c['turn']=='2T': cycles[c['section']].append(c)
    target=next(c['signature'] for c in cycles['0001'] if c['end']=='25/10/2026 10:42:21')
    messages=[x[0] for x in target]
    matches=[c for cs in cycles.values() for c in cs if c['signature']==target]
    sections=sorted({c['section'] for c in matches})
    all_rows=[]
    for section in sections:
        folder=ROOT/section
        package,=folder.glob('pacote_*/*-log.jez')
        manifest=json.loads((folder/'manifesto.json').read_text(encoding='utf8'))
        expected=next(a['sha256_local'] for a in manifest['arquivos'] if a['tipo']=='log')
        if hashlib.sha256(package.read_bytes()).hexdigest()!=expected: raise ValueError('hash '+section)
        with zipfile.ZipFile(package) as archive:
            names=[n for n in archive.namelist() if n.lower().endswith('logd.dat')]
            if len(names)!=1: raise ValueError('múltiplos logs: '+section)
            lines=archive.read(names[0]).decode('cp1252',errors='replace').splitlines()
        rows=[]
        for lineno,line in enumerate(lines,1):
            fields=line.split('\t')
            if line.startswith(DAY) and len(fields)>=6 and fields[3]=='VOTA': rows.append((lineno,fields[0],fields[4]))
        ends=[r for r in rows if r[2]==RESULT]
        endlines=[r[0] for r in ends]
        byend={c['line_end']:c for c in cycles[section]}
        for c in cycles[section]:
            if [e[0] for e in c['signature']]!=messages: continue
            i=bisect_left(endlines,c['line_end'])
            if i>=len(ends) or ends[i][0]!=c['line_end']: raise ValueError('conclusão ausente')
            prev=ends[i-1] if i else None
            beginning=next(r for r in rows if r[0]==c['line_id'])
            gap=(clock(beginning[1])-clock(prev[1])).total_seconds() if prev else None
            if gap is not None and gap<0: gap=None
            between=[r[2] for r in rows if (prev is None or r[0]>prev[0]) and r[0]<c['line_id']]
            before=next((r[2] for r in reversed(rows) if r[0]<c['line_id']),None)
            previous_cycle=byend.get(prev[0]) if prev else None
            all_rows.append({'section':section,'ordinal':i+1,'section_total':len(ends),
                             'match':c['signature']==target,'gap_s':gap,
                             'previous_type':classify(previous_cycle),
                             'previous_sequence':tuple(e[0] for e in previous_cycle['signature']) if previous_cycle else None,
                             'previous_message':re.sub(r'(?<!\d)\d{4,}(?!\d)','#',before or 'início'),
                             'intermediate_events':len(between),
                             'previous_fraction':i/len(ends) if ends else None})
    observed=[x for x in all_rows if x['match']]
    controls=[x for x in all_rows if not x['match']]
    sequences=Counter(x['previous_sequence'] for x in observed if x['previous_sequence'] is not None)
    common_sequence,common_count=sequences.most_common(1)[0]
    common_control=sum(x['previous_sequence']==common_sequence for x in controls)
    def summarise(items):
        gaps=[x['gap_s'] for x in items if x['gap_s'] is not None]
        ords=[x['ordinal'] for x in items]
        return {'n':len(items),'ordinal_min':min(ords),'ordinal_max':max(ords),
                'ordinal_median':statistics.median(ords),'ordinal_mod_10':dict(Counter(x%10 for x in ords)),
                'gap_n':len(gaps),'gap_min':min(gaps),'gap_median':statistics.median(gaps),'gap_max':max(gaps),
                'prior_route':dict(Counter(x['previous_type'] for x in items)),
                'last_message':dict(Counter(x['previous_message'] for x in items)),
                'intermediate_events':dict(Counter(x['intermediate_events'] for x in items)),
                'position_quartile':dict(Counter(min(int(x['previous_fraction']*4)+1,4) for x in items))}
    report={'data':DAY,'zona':'0252','signature':target,'matching_sections':len(sections),
            'occurrences':sorted(observed,key=lambda x:(x['section'],x['ordinal'])),
            'matched_summary':summarise(observed),'control_summary':summarise(controls),
            'previous_sequence_comparison':{'distinct_in_matches':len(sequences),'most_common':common_sequence,
                                            'matches':common_count,'controls':common_control},
            'control_definition':'Mesmas 25 seções, mesma sequência de nove mensagens e rota; excluídas as 35 ocorrências exatas.',
            'note':'Posição é a ordem do evento computado no log do turno, não identificação do eleitor nem ordem do RDV.'}
    (HERE/'painel_assinatura_0252.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    quality=json.loads((HERE/'lote_qualidade.json').read_text(encoding='utf8'))
    problems={p[1] for p in quality['problems'] if p[0]=='2T'}
    per_section=defaultdict(list)
    for item in observed: per_section[item['section']].append(item)
    section_rows=[]
    for item in quality['summaries']:
        if item['turn']!='2T': continue
        section=item['section']
        caveats=[]
        if section in problems: caveats.append('mais de um log; reconciliação pendente')
        if item['unknown']: caveats.append(f"{item['unknown']} percurso(s) não reconstruído(s)")
        section_rows.append({'secao':section,'computados':item['computed'],
                             'posicoes':[x['ordinal'] for x in sorted(per_section[section],key=lambda x:x['ordinal'])],
                             'ressalvas':caveats})
    s=report['matched_summary']; t=report['control_summary']
    public={'zona':'0252','turno':'2T','data':DAY,
            'definicao':'Nove mensagens e todos os intervalos iguais à assinatura congelada (10, 8, 1).',
            'nota_ordem':'Posição do evento computado no log; não identifica eleitor nem posição no RDV.',
            'secoes':sorted(section_rows,key=lambda x:x['secao']),
            'ocorrencias':[{'secao':x['section'],'posicao':x['ordinal'],
                            'total_secao':x['section_total'],'intervalo_anterior_s':x['gap_s'],
                            'tipo_anterior':x['previous_type']} for x in report['occurrences']],
            'comparacao':{'criterio_controle':report['control_definition'],
                          'sequencia_anterior':{'distintas_nos_casos':len(sequences),'mais_comum_nos_casos':common_count,
                                                'mesma_sequencia_nos_controles':common_control},
                          'assinatura':{'total':s['n'],'mediana_intervalo_s':s['gap_median'],
                            'intervalo_min_s':s['gap_min'],'intervalo_max_s':s['gap_max'],
                            'aguardando_identificador':s['last_message'].get('Aguardando digitação do identificador do eleitor',0),
                            'anterior_biometrica':s['prior_route'].get('biometria reconhecida',0),
                            'quartil_2':s['position_quartile'].get(2,0)},
                          'controle':{'total':t['n'],'intervalo_disponivel':t['gap_n'],
                            'mediana_intervalo_s':t['gap_median'],
                            'aguardando_identificador':t['last_message'].get('Aguardando digitação do identificador do eleitor',0),
                            'anterior_biometrica':t['prior_route'].get('biometria reconhecida',0),
                            'quartil_2':t['position_quartile'].get(2,0)}}}
    (HERE/'painel_assinatura_0252_publico.json').write_text(json.dumps(public,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'prior_sequences':report['previous_sequence_comparison'],'matched':report['matched_summary']['n'],'controls':report['control_summary']['n']},ensure_ascii=False,indent=2))

if __name__=='__main__': main()

