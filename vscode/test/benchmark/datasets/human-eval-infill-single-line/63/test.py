
from generated import fibfib
import sys



METADATA = {}


def check(candidate):
    assert candidate(2) == 1
    assert candidate(1) == 0
    assert candidate(5) == 4
    assert candidate(8) == 24
    assert candidate(10) == 81
    assert candidate(12) == 274
    assert candidate(14) == 927


try:
    check(fibfib)
except AssertionError:
    sys.exit(1)
sys.exit(0)
