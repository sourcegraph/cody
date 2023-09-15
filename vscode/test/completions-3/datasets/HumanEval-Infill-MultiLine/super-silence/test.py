
from generated import get_max_triples
import sys

def check(candidate):

    assert candidate(5) == 1
    assert candidate(6) == 4
    assert candidate(10) == 36
    assert candidate(100) == 53361

try:
    check(get_max_triples)
except AssertionError:
    sys.exit(1)
sys.exit(0)
