
from generated import incr_list
import sys



METADATA = {}


def check(candidate):
    assert candidate([]) == []
    assert candidate([3, 2, 1]) == [4, 3, 2]
    assert candidate([5, 2, 5, 2, 3, 3, 9, 0, 123]) == [6, 3, 6, 3, 4, 4, 10, 1, 124]


try:
    check(incr_list)
except AssertionError:
    sys.exit(1)
sys.exit(0)
