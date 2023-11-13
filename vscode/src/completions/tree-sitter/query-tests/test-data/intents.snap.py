# 
# | - query start position in the source file.
# █ – query start position in the annotated file.
# ^ – characters matching the last query result.
#
# ------------------------------------

 def wrapper():
     print('wrapper')
     def test():
#              █
         pass
#        ^^^^ function.body[1]

# Nodes types:
# function.body[1]: block

# ------------------------------------

 def test_params():
#               ^^ function.parameters[1]
#               █
     wrapper()

# Nodes types:
# function.parameters[1]: parameters

# ------------------------------------

 def test_parameter(val):
#                   ^^^ parameter[1]
#                   █
     wrapper()

# Nodes types:
# parameter[1]: identifier

# ------------------------------------

 def arrow_wrapper():
     arrow = lambda value: None
#                          ^^^^ function.body[1]
#                        █

# Nodes types:
# function.body[1]: none

# ------------------------------------

 class Agent:
#           █
     pass
#    ^^^^ class.body[1]

# Nodes types:
# class.body[1]: block

# ------------------------------------

 def signature():
#               █
     pass
#    ^^^^ function.body[1]

# Nodes types:
# function.body[1]: block

# ------------------------------------

# comment
#^^^^^^^^^ comment[1]
#  █

# Nodes types:
# comment[1]: comment

# ------------------------------------

 def function_name():
#    ^^^^^^^^^^^^^ function.name[1]
#                █
     pass

# Nodes types:
# function.name[1]: identifier

# ------------------------------------

 def return_statement():
     return
#    ^^^^^^ return_statement[1]
#         █

# Nodes types:
# return_statement[1]: return_statement

# ------------------------------------

 def return_statement_value(value: str, flag: bool = False):
     return 'asd'
#           ^^^^^ return_statement.value[1]
#           █

# Nodes types:
# return_statement.value[1]: string

# ------------------------------------

 return_statement_value('value')
#                       ^^^^^^^ argument[1]
#                       █

# Nodes types:
# argument[1]: string

# ------------------------------------

 return_statement_value('value', False)
#                                ^^^^^ argument[1]
#                                █

# Nodes types:
# argument[1]: false

# ------------------------------------

 return_statement_value()
#                      ^^ arguments[1]
#                      █

# Nodes types:
# arguments[1]: argument_list

# ------------------------------------

 from math import cos
#     ^^^^ import.source[1]
#     █

# Nodes types:
# import.source[1]: dotted_name

# ------------------------------------

 from math import comb
#                 ^^^^ import.name[1]
#                 █

# Nodes types:
# import.name[1]: dotted_name

