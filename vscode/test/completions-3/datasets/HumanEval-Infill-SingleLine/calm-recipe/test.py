
from generated import closest_integer
import sys

def check(candidate):

    # Check some simple cases
    assert candidate("10") == 10, "Test 1"
    assert candidate("14.5") == 15, "Test 2"
    assert candidate("-15.5") == -16, "Test 3"
    assert candidate("15.3") == 15, "Test 3"

    # Check some edge cases that are easy to work out by hand.
    assert candidate("0") == 0, "Test 0"
    assert candidate("14.50") == 15, "Test 14.50"


try:
    check(closest_integer)
except AssertionError:
    sys.exit(1)
sys.exit(0)
