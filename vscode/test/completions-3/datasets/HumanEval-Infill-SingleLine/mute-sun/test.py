
from generated import decode_cyclic
import sys



METADATA = {}


def check(candidate):
    from random import randint, choice
    import string

    letters = string.ascii_lowercase
    for _ in range(100):
        str = ''.join(choice(letters) for i in range(randint(10, 20)))
        encoded_str = encode_cyclic(str)
        assert candidate(encoded_str) == str


try:
    check(decode_cyclic)
except AssertionError:
    sys.exit(1)
sys.exit(0)
