
from generated import sum_to_n
import sys



METADATA = {}


def check(candidate):
    assert candidate(1) == 1
    assert candidate(6) == 21
    assert candidate(11) == 66
    assert candidate(30) == 465
    assert candidate(100) == 5050


try:
    check(sum_to_n)
except AssertionError:
    sys.exit(1)
sys.exit(0)
