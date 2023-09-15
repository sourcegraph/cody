
from generated import all_prefixes
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate('') == []
    assert candidate('asdfgh') == ['a', 'as', 'asd', 'asdf', 'asdfg', 'asdfgh']
    assert candidate('WWW') == ['W', 'WW', 'WWW']

try:
    check(all_prefixes)
except AssertionError:
    sys.exit(1)
sys.exit(0)
