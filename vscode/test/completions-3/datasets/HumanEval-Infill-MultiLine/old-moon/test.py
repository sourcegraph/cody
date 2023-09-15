
from generated import string_xor
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate('111000', '101010') == '010010'
    assert candidate('1', '1') == '0'
    assert candidate('0101', '0000') == '0101'

try:
    check(string_xor)
except AssertionError:
    sys.exit(1)
sys.exit(0)
