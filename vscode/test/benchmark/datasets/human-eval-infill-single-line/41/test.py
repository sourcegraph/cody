
from generated import car_race_collision
import sys



METADATA = {}


def check(candidate):
    assert candidate(2) == 4
    assert candidate(3) == 9
    assert candidate(4) == 16
    assert candidate(8) == 64
    assert candidate(10) == 100


try:
    check(car_race_collision)
except AssertionError:
    sys.exit(1)
sys.exit(0)
