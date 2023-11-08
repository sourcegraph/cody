# 
# | - query start position in the source file.
# █ – query start position in the annotated file.
# ^ – characters matching the last query result.
#
# ------------------------------------

# Function definition
 def greet(name):
#^ start trigger[1]
#               █
     greeting = "Hello, " + name
     return greeting
#                  ^ end trigger[1]

# Nodes types:
# trigger[1]: function_definition

# ------------------------------------
# Class definition

 class Greeter:
#^ start trigger[1]
#             █
     def __init__(self, name):
         self.name = name
     def greet(self):
         return "Hello, " + self.name
#                                   ^ end trigger[1]

# Nodes types:
# trigger[1]: class_definition

# ------------------------------------
# If statement

 if greet('Alice') == 'Hello, Alice':
#^ start trigger[1]
#                                   █
     print('Greeting is correct')
 elif greet('Alice') != 'Hello, Alice':
     print('Greeting is incorrect')
 else:
     print('This is else block')
#                              ^ end trigger[1]

# Nodes types:
# trigger[1]: if_statement

# ------------------------------------
# For loop

 for i in range(3):
#^ start trigger[1]
#                 █
     print(f'Number {i}')
#                       ^ end trigger[1]

# Nodes types:
# trigger[1]: for_statement

# ------------------------------------
# While loop

 i = 0
 while i < 3:
#^ start trigger[1]
#           █
     print(f'Count {i}')
     i += 1
#         ^ end trigger[1]

# Nodes types:
# trigger[1]: while_statement

# ------------------------------------
# Try-Except block

 try:
#^ start trigger[1]
#   █
     result = 10 / 0
 except ZeroDivisionError:
     print('Divided by zero!')
 finally:
     print('This is the finally block')
#                                     ^ end trigger[1]

# Nodes types:
# trigger[1]: try_statement

# ------------------------------------
# With statement

 with open('file.txt', 'w') as file:
#^ start trigger[1]
#                                  █
     file.write('Hello, World!')
#                              ^ end trigger[1]

# Nodes types:
# trigger[1]: with_statement

# ------------------------------------
# Nested blocks

 if True:
#^ start trigger[1]
#       █
     for j in range(3):
         print(f'Nested loop at count {j}')
#                                         ^ end trigger[1]

# Nodes types:
# trigger[1]: if_statement

# ------------------------------------
# Multiline string block for docstring (placed inside a function here)

 def my_function():
#^ start trigger[1]
#                 █
     """
     This function does nothing really.
     """
     pass
#       ^ end trigger[1]

# Nodes types:
# trigger[1]: function_definition

# ------------------------------------
# Decorator and function it decorates

 def my_decorator(func):
#^ start trigger[1]
#                      █
     def wrapper(*args, **kwargs):
         print('Function is being called')
         return func(*args, **kwargs)
     return wrapper
#                 ^ end trigger[1]

# Nodes types:
# trigger[1]: function_definition

# ------------------------------------

 @my_decorator
 def say_hello():
#^ start trigger[1]
#               █
     return "Hello!"
#                  ^ end trigger[1]

# Nodes types:
# trigger[1]: function_definition

