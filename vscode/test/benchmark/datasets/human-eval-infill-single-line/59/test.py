
from generated import largest_prime_factor
import sys



METADATA = {}


def check(candidate):
    assert candidate(15) == 5
    assert candidate(27) == 3
    assert candidate(63) == 7
    assert candidate(330) == 11
    assert candidate(13195) == 29


try:
    check(largest_prime_factor)
except AssertionError:
    sys.exit(1)
sys.exit(0)
