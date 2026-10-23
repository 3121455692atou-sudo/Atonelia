#!/usr/bin/env python3
"""从 docs/research/timeline-2023-2026.json 生成 src/career/data/stocks_gen.js（月末收盘价）。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/research/timeline-2023-2026.json'
OUT = ROOT / 'src/career/data/stocks_gen.js'

META = {
    'NVDA': ('英伟达', '芯片', None),
    'MSFT': ('微软', '云与软件', None),
    'GOOGL': ('Alphabet', '互联网', None),
    'META': ('Meta', '互联网', None),
    'AMZN': ('亚马逊', '云与电商', None),
    'TSM': ('台积电', '芯片', None),
    'AMD': ('AMD', '芯片', None),
    'BABA': ('阿里巴巴', '中国互联网', None),
    '0700.HK': ('腾讯控股', '中国互联网', None),
    'BIDU': ('百度', '中国互联网', None),
    '2513.HK': ('智谱', '大模型', 'glm'),
    '0100.HK': ('MiniMax', '大模型', 'minimax'),
    '6082.HK': ('壁仞科技', '国产 GPU', None),
    '688795.SS': ('摩尔线程', '国产 GPU', None),
    '688802.SS': ('沐曦股份', '国产 GPU', None),
    'CRWV': ('CoreWeave', 'AI 云', None),
    'CBRS': ('Cerebras', 'AI 芯片', None),
}


def main():
    data = json.loads(SRC.read_text())
    rows = []
    for s in data['stocks']:
        t = s['ticker']
        if t not in META:
            continue
        name, sector, family = META[t]
        mc = s['monthly_close']
        months = sorted(mc)
        row = {'id': t, 'name': name, 'ccy': s['currency'], 'sector': sector,
               'listed': months[0] if months[0] > '2023-01' else None,
               'monthly': {m: round(mc[m], 2) for m in months}}
        if family:
            row['family'] = family
        rows.append(row)
    body = ',\n'.join('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows)
    OUT.write_text(
        '// 由 scripts/build_stocks.py 生成，请勿手改。数据：Yahoo Finance 月末收盘价（拆股调整，未做股息复权）。\n'
        '// listed：上市月份，之前不可交易；family：该股票对应的模型家族（玩家扮演这家公司时不显示）。\n'
        f'export const STOCKS = [\n{body},\n];\n')
    print(f'wrote {OUT.relative_to(ROOT)} · {len(rows)} tickers')


if __name__ == '__main__':
    main()
