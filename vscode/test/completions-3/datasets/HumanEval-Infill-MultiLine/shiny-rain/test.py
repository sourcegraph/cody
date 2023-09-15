
from generated import is_palindrome
import sys



METADATA = {}


def check(candidate):
    assert candidate('') == True
    assert candidate('aba') == True
    assert candidate('aaaaa') == True
    assert candidate('zbcd') == False
    assert candidate('xywyx') == True
    assert candidate('xywyz') == False
    assert candidate('xywzx') == False


try:
    check(is_palindrome)
except AssertionError:
    sys.exit(1)
sys.exit(0)
