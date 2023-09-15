
from generated import unique
import sys



METADATA = {}


def check(candidate):
    assert candidate([5, 3, 5, 2, 3, 3, 9, 0, 123]) == [0, 2, 3, 5, 9, 123]


try:
    check(unique)
except AssertionError:
    sys.exit(1)
sys.exit(0)
