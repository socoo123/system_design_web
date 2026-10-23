"""Idempotent local fixes for retained Ch11 SVG frames; never rewrites a deck."""
from pathlib import Path
import re

path = Path(__file__).resolve().parents[2] / 'chapters/ch11.html'
source = path.read_text()

def repair(match):
    svg = match.group()
    if 'id="d2s' in svg:
        # A 136-unit body was disproportionate to the two labels it contains.
        svg = svg.replace('M370 78 V214 A90 12 0 0 0 550 214 V78',
                          'M370 78 V174 A90 12 0 0 0 550 174 V78')
        svg = svg.replace('x="460" y="156"', 'x="460" y="124"')
        svg = svg.replace('x="460" y="174"', 'x="460" y="145"')
        svg = svg.replace('x="368" y="238"', 'x="368" y="202"')
        svg = svg.replace('x="463" y="252"', 'x="463" y="216"')
    if 'id="d5s' in svg:
        # Leave the nearby vertical return wire a real text-free channel.
        svg = svg.replace('x="310" y="180" text-anchor="middle" class="tiny">cursor',
                          'x="296" y="170" text-anchor="middle" class="tiny">bound')
    if 'id="d4s5' in svg:
        svg = svg.replace('lost DEL: 2 s origin deadline + 25 s TTL ≤ 27 s',
                          'lost DEL: install ≤ 2 s + TTL 25 s ≤ 27 s cached')
    return svg

source = re.sub(r'<svg\b.*?</svg>', repair, source, flags=re.S)
source = source.replace(
    '若 DEL 丢失，按 A9 最坏算 2 s 回源截止 + 25 s 非滑动 TTL ≤ 27 s，才落在约 30 s 目标内；过期不续命，也不从落后副本回填。',
    '若 DEL 丢失，缓存端安装截止 2 s + 固定 TTL 25 s ≤ 27 s 驻留；再计 API 响应最多 2 s，约 29 s 才落在约 30 s 目标内。')
source = source.replace(
    'If DEL is lost, A9 bounds it by a 2 s origin deadline plus a 25 s non-sliding TTL, at most 27 s, within the approximate 30 s target. Do not extend expiry or refill from a lagging replica.',
    'If DEL is lost, a cache-side 2 s install deadline + fixed 25 s TTL bounds residence to 27 s; at most 2 s API response time gives about 29 s within the roughly-30 s target.')
path.write_text(source)

source = path.read_text().replace('The delete target assumes a maximum 2 s origin deadline, a 25 s non-sliding cache TTL, primary reads and no serving beyond expiry.', 'Cache-server installation is bounded to 2 s, fixed TTL to 25 s and API response to 2 s, giving about 29 s with primary fills and no serving beyond expiry.')
path.write_text(source)
