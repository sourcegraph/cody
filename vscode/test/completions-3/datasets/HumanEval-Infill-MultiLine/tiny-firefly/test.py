
from generated import remove_duplicates
import sys



METADATA = {
    'author': 'jt',
    'dataset': 'test'
}


def check(candidate):
    assert candidate([]) == []
    assert candidate([1, 2, 3, 4]) == [1, 2, 3, 4]
    assert candidate([1, 2, 3, 2, 4, 3, 5]) == [1, 4, 5]

try:
    check(remove_duplicates)
except AssertionError:
    sys.exit(1)
sys.exit(0)
