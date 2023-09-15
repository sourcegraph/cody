
from generated import fib
import sys



METADATA = {}


def check(candidate):
    assert candidate(10) == 55
    assert candidate(1) == 1
    assert candidate(8) == 21
    assert candidate(11) == 89
    assert candidate(12) == 144


try:
    check(fib)
except AssertionError:
    sys.exit(1)
sys.exit(0)
