
from generated import maximum
import sys

def check(candidate):

    # Check some simple cases
    assert candidate([-3, -4, 5], 3) == [-4, -3, 5]
    assert candidate([4, -4, 4], 2) == [4, 4]
    assert candidate([-3, 2, 1, 2, -1, -2, 1], 1) == [2]
    assert candidate([123, -123, 20, 0 , 1, 2, -3], 3) == [2, 20, 123]
    assert candidate([-123, 20, 0 , 1, 2, -3], 4) == [0, 1, 2, 20]
    assert candidate([5, 15, 0, 3, -13, -8, 0], 7) == [-13, -8, 0, 0, 3, 5, 15]
    assert candidate([-1, 0, 2, 5, 3, -10], 2) == [3, 5]
    assert candidate([1, 0, 5, -7], 1) == [5]
    assert candidate([4, -4], 2) == [-4, 4]
    assert candidate([-10, 10], 2) == [-10, 10]

    # Check some edge cases that are easy to work out by hand.
    assert candidate([1, 2, 3, -23, 243, -400, 0], 0) == []


try:
    check(maximum)
except AssertionError:
    sys.exit(1)
sys.exit(0)
