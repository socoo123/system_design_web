#!/usr/bin/env python3
"""Synchronize the chapter's six snippets from exact source regions."""
import html
from pathlib import Path
import re
import sys
import textwrap

HERE=Path(__file__).resolve().parent
PAGE=HERE.parents[1]/'chapters/ch23.html'

def source(name):
    file,sep,region=name.partition('#')
    value=(HERE/file).read_text()
    if sep:
        value=re.search(r'    // BEGIN '+re.escape(region)+r'\n(.*?)    // END '+re.escape(region),value,re.S)[1]
        value=textwrap.dedent(value)
    return value.rstrip('\n')

def main():
    current=PAGE.read_text();count=0
    def replace(m):
        nonlocal count
        expected=html.escape(source(m[2]),quote=True)
        if '--check' in sys.argv and m[3]!=expected: raise AssertionError('source mismatch '+m[2])
        count+=1
        return m[1]+expected+m[4]
    final=re.sub(r'(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)(.*?)(</code></pre>)',replace,current,flags=re.S)
    if count!=6: raise AssertionError(f'expected 6 snippets, got {count}')
    if '--check' not in sys.argv: PAGE.write_text(final)
    print(f'{count} page snippets match exact chapter sources')

if __name__=='__main__': main()
