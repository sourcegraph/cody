
from generated import greatest_common_divisor
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate(3, 7) == 1
    assert candidate(10, 15) == 5
    assert candidate(49, 14) == 7
    assert candidate(144, 60) == 12

try:
    check(greatest_common_divisor)
except AssertionError:
    sys.exit(1)
sys.exit(0)
