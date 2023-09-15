
from generated import special_factorial
import sys

def check(candidate):

    # Check some simple cases
    assert candidate(4) == 288, "Test 4"
    assert candidate(5) == 34560, "Test 5"
    assert candidate(7) == 125411328000, "Test 7"

    # Check some edge cases that are easy to work out by hand.
    assert candidate(1) == 1, "Test 1"


try:
    check(special_factorial)
except AssertionError:
    sys.exit(1)
sys.exit(0)
