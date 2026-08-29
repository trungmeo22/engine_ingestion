import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
lib_dir = root_dir / "lib"

for path_str in [str(lib_dir), str(root_dir)]:
    if path_str not in sys.path:
        sys.path.insert(0, path_str)
