
from generated import largest_divisor
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate(3) == 1
    assert candidate(7) == 1
    assert candidate(10) == 5
    assert candidate(100) == 50
    assert candidate(49) == 7

try:
    check(largest_divisor)
except AssertionError:
    sys.exit(1)
sys.exit(0)
