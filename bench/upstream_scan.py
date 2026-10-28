"""Run android-ad-cleaner's own `chan_fast.py scan` on a saved dumpsys file, with adb faked.

    python bench/upstream_scan.py <android-ad-cleaner clone> <dumpsys.txt> [runs]

Prints the upstream scan output (package TAB channel TAB name) and, with runs > 1, its median time.
"""
import contextlib
import io
import statistics
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

root, dump = Path(sys.argv[1]), Path(sys.argv[2]).read_text(encoding="utf-8")
runs = int(sys.argv[3]) if len(sys.argv) > 3 else 1
sys.path.insert(0, str(root / "tool"))
import chan_fast  # noqa: E402

fake = SimpleNamespace(returncode=0, stdout=dump, stderr="")
times = []
for _ in range(runs):
    with patch.object(chan_fast.subprocess, "run", return_value=fake), \
         patch.object(sys, "argv", ["chan_fast.py", "-s", "demo", "scan"]), \
         contextlib.redirect_stdout(io.StringIO()) as out:
        t = time.perf_counter()
        chan_fast.main()
        times.append((time.perf_counter() - t) * 1000)
sys.stdout.reconfigure(encoding="utf-8")
print(out.getvalue(), end="")
if runs > 1:
    print(f"# upstream scan median {statistics.median(times):.2f} ms over {runs} runs", file=sys.stderr)
