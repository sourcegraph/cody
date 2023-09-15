
from generated import hex_key
import sys

def check(candidate):

    # Check some simple cases
    assert candidate("AB") == 1, "First test error: " + str(candidate("AB"))      
    assert candidate("1077E") == 2, "Second test error: " + str(candidate("1077E"))  
    assert candidate("ABED1A33") == 4, "Third test error: " + str(candidate("ABED1A33"))      
    assert candidate("2020") == 2, "Fourth test error: " + str(candidate("2020"))  
    assert candidate("123456789ABCDEF0") == 6, "Fifth test error: " + str(candidate("123456789ABCDEF0"))      
    assert candidate("112233445566778899AABBCCDDEEFF00") == 12, "Sixth test error: " + str(candidate("112233445566778899AABBCCDDEEFF00"))  


    # Check some edge cases that are easy to work out by hand.
    assert candidate([]) == 0


try:
    check(hex_key)
except AssertionError:
    sys.exit(1)
sys.exit(0)
