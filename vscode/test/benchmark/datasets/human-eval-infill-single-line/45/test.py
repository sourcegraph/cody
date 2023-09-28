
from generated import triangle_area
import sys



METADATA = {}


def check(candidate):
    assert candidate(5, 3) == 7.5
    assert candidate(2, 2) == 2.0
    assert candidate(10, 8) == 40.0


try:
    check(triangle_area)
except AssertionError:
    sys.exit(1)
sys.exit(0)
