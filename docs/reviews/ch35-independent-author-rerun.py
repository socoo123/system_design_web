"""Run the author's unchanged test logic while redirecting only its report file."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'examples/ch35/check.py'
text=source.read_text().replace("'docs/reviews/ch35-code-results.json'","'docs/reviews/ch35-independent-author-rerun-results.json'")
sys.path.insert(0,str(source.parent))
exec(compile(text,str(source),'exec'),{'__name__':'__main__','__file__':str(source)})
