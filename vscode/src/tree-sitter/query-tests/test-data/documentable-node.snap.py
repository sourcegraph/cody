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
#              ^ insertion.point[1]
#          █
         pass
#           ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

 def test():
#^ start range.function[1]
#    ^^^^ symbol.function[1]
#          ^ insertion.point[1]
#      █
     pass
#       ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

 def test_multiline_func_declaration(
#^ start range.function[1]
#    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ symbol.function[1]
#                   █
     val,
     val2
 ):
# ^ insertion.point[1]
     wrapper()
#            ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

 def test_parameter(val):
#^ start range.function[1]
#                       ^ insertion.point[1]
#                   █
     wrapper()
#            ^ end range.function[1]

# Nodes types:
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

 class Agent:
#^ start range.class[1]
#      ^^^^^ symbol.class[1]
#           ^ insertion.point[1]
#        █
     pass
#       ^ end range.class[1]

# Nodes types:
# symbol.class[1]: identifier
# range.class[1]: class_definition
# insertion.point[1]: :

# ------------------------------------


 class AgentMultiLine(
#^ start range.class[1]
     BaseClass1,
     BaseClass2):
#               ^ insertion.point[1]
#        █
     def __init__(self, name):
         self.name = name
#                       ^ end range.class[1]

# Nodes types:
# range.class[1]: class_definition
# insertion.point[1]: :

# ------------------------------------

 class Agent:
     def __init__(self, name):
#    ^ start range.function[1]
#        ^^^^^^^^ symbol.function[1]
#                            ^ insertion.point[1]
#           █
         self.name = name
#                       ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

 class Agent:
     def __init__(self, name):
         self.name = name

     def test(self):
#    ^ start range.function[1]
#        ^^^^ symbol.function[1]
#                  ^ insertion.point[1]
#         █
         pass
#           ^ end range.function[1]

# Nodes types:
# symbol.function[1]: identifier
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

 def return_statement():
#^ start range.function[1]
#                      ^ insertion.point[1]
     return
#         ^ end range.function[1]
#         █

# Nodes types:
# range.function[1]: function_definition
# insertion.point[1]: :

# ------------------------------------

return_statement('value')
#       |

# ------------------------------------

 user_name = 'Tom'
#^^^^^^^^^ symbol.identifier[1]
#^^^^^^^^^^^^^^^^^ range.identifier[1]
#       █

# Nodes types:
# symbol.identifier[1]: identifier
# range.identifier[1]: assignment

# ------------------------------------

 user_name = 'Tom'
#^^^^^^^^^^^^^^^^^ range.identifier[1]
#              █

# Nodes types:
# range.identifier[1]: assignment

