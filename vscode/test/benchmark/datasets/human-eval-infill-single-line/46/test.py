
from generated import fib4
import sys



METADATA = {}


def check(candidate):
    assert candidate(5) == 4
    assert candidate(8) == 28
    assert candidate(10) == 104
    assert candidate(12) == 386


try:
    check(fib4)
except AssertionError:
    sys.exit(1)
sys.exit(0)
