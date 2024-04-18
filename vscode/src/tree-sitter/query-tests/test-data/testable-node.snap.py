# 
# | - query start position in the source file.
# █ – query start position in the annotated file.
# ^ – characters matching the last query result.
#
# ------------------------------------

 def wrapper():
     print('wrapper')
     def test():
#    ^ start range.function[1]
#        ^^^^ symbol.function[1]
#          █
         pass
#           ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition

# ------------------------------------

 def test():
#^ start range.function[1]
#    ^^^^ symbol.function[1]
#      █
     pass
#       ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition

# ------------------------------------

 def test_parameter(val):
#^ start range.function[1]
#                   █
     wrapper()
#            ^ end range.function[1]

# Nodes types:
# range.function[1]: function_definition

# ------------------------------------

 class Agent:
     def __init__(self, name):
#    ^ start range.function[1]
#        ^^^^^^^^ symbol.function[1]
#               █
         self.name = name
#                       ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition

# ------------------------------------

 class Agent:
     def __init__(self, name):
         self.name = name

     def test(self):
#    ^ start range.function[1]
#        ^^^^ symbol.function[1]
#         █
         pass
#           ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition

