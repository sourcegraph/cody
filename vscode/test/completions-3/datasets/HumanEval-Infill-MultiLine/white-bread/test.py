
from generated import f
import sys

def check(candidate):

    assert candidate(5) == [1, 2, 6, 24, 15]
    assert candidate(7) == [1, 2, 6, 24, 15, 720, 28]
    assert candidate(1) == [1]
    assert candidate(3) == [1, 2, 6]

try:
    check(f)
except AssertionError:
    sys.exit(1)
sys.exit(0)
