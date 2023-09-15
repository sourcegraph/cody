
from generated import parse_nested_parens
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate('(()()) ((())) () ((())()())') == [2, 3, 1, 3]
    assert candidate('() (()) ((())) (((())))') == [1, 2, 3, 4]
    assert candidate('(()(())((())))') == [4]

try:
    check(parse_nested_parens)
except AssertionError:
    sys.exit(1)
sys.exit(0)
