
from generated import fizz_buzz
import sys



METADATA = {}


def check(candidate):
    assert candidate(50) == 0
    assert candidate(78) == 2
    assert candidate(79) == 3
    assert candidate(100) == 3
    assert candidate(200) == 6
    assert candidate(4000) == 192
    assert candidate(10000) == 639
    assert candidate(100000) == 8026


try:
    check(fizz_buzz)
except AssertionError:
    sys.exit(1)
sys.exit(0)
