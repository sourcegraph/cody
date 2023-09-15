
from generated import string_sequence
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate(0) == '0'
    assert candidate(3) == '0 1 2 3'
    assert candidate(10) == '0 1 2 3 4 5 6 7 8 9 10'

try:
    check(string_sequence)
except AssertionError:
    sys.exit(1)
sys.exit(0)
