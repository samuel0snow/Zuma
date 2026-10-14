from pathlib import Path
from PIL import Image
import sys
source, target, size = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])
target.parent.mkdir(parents=True, exist_ok=True)
im = Image.open(source).convert('RGBA')
assert im.getextrema()[3][0] == 0, 'Generated asset must have real transparency'
im.thumbnail((size,size), Image.Resampling.LANCZOS)
im.save(target, 'WEBP', quality=90, method=6)
print(target, im.size, target.stat().st_size)
