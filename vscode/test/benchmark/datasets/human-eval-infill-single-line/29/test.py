
from generated import filter_by_prefix
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate([], 'john') == []
    assert candidate(['xxx', 'asd', 'xxy', 'john doe', 'xxxAAA', 'xxx'], 'xxx') == ['xxx', 'xxxAAA', 'xxx']

try:
    check(filter_by_prefix)
except AssertionError:
    sys.exit(1)
sys.exit(0)
