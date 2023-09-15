
from generated import max_element
import sys



METADATA = {}


def check(candidate):
    assert candidate([1, 2, 3]) == 3
    assert candidate([5, 3, -5, 2, -3, 3, 9, 0, 124, 1, -10]) == 124

try:
    check(max_element)
except AssertionError:
    sys.exit(1)
sys.exit(0)
