
from generated import truncate_number
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate(3.5) == 0.5
    assert abs(candidate(1.33) - 0.33) < 1e-6
    assert abs(candidate(123.456) - 0.456) < 1e-6

try:
    check(truncate_number)
except AssertionError:
    sys.exit(1)
sys.exit(0)
