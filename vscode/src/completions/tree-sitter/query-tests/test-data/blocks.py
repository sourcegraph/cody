# Function definition
def greet(name):
    #          |
    greeting = "Hello, " + name
    return greeting

# ------------------------------------
# Class definition

class Greeter:
    #        |
    def __init__(self, name):
        self.name = name
    def greet(self):
        return "Hello, " + self.name

# ------------------------------------
# If statement

if greet('Alice') == 'Hello, Alice':
    #                              |
    print('Greeting is correct')
elif greet('Alice') != 'Hello, Alice':
    print('Greeting is incorrect')
else:
    print('This is else block')

# ------------------------------------
# For loop

for i in range(3):
    #            |
    print(f'Number {i}')

# ------------------------------------
# While loop

i = 0
while i < 3:
    #      |
    print(f'Count {i}')
    i += 1

# ------------------------------------
# Try-Except block

try:
#  |
    result = 10 / 0
except ZeroDivisionError:
    print('Divided by zero!')
finally:
    print('This is the finally block')

# ------------------------------------
# With statement

with open('file.txt', 'w') as file:
    #                             |
    file.write('Hello, World!')

# ------------------------------------
# Nested blocks

if True:
    #  |
    for j in range(3):
        print(f'Nested loop at count {j}')

# ------------------------------------
# Multiline string block for docstring (placed inside a function here)

def my_function():
    #            |
    """
    This function does nothing really.
    """
    pass

# ------------------------------------
# Decorator and function it decorates

def my_decorator(func):
    #                 |
    def wrapper(*args, **kwargs):
        print('Function is being called')
        return func(*args, **kwargs)
    return wrapper

# ------------------------------------

@my_decorator
def say_hello():
    #          |
    return "Hello!"
