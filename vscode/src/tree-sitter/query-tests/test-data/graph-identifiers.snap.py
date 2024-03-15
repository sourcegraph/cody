# 
# | - query start position in the source file.
# █ – query start position in the annotated file.
# ^ – characters matching the last query result.
#
# ------------------------------------

 def wrapper():
     print('wrapper')
#    ^^^^^ identifier[1]
     def test():
#              █
         pass

# Nodes types:
# identifier[1]: identifier

# ------------------------------------

def test_params():
    #          |
    wrapper()

# ------------------------------------

def test_parameter(val):
    #              |
    wrapper()

# ------------------------------------

def arrow_wrapper():
    arrow = lambda value: None
    #                   |

# ------------------------------------

class Agent:
    #      |
    pass

# ------------------------------------

def signature():
    #          |
    pass

# ------------------------------------

# comment
# |

# ------------------------------------

def function_name():
    #           |
    pass

# ------------------------------------

def return_statement():
    return
    #    |

# ------------------------------------

def return_statement_value(value: str, flag: bool = False):
    return 'asd'
    #      |

# ------------------------------------

 return_statement_value('value')
#^^^^^^^^^^^^^^^^^^^^^^ identifier[1]
#                       █

# Nodes types:
# identifier[1]: identifier

# ------------------------------------

 return_statement_value('value', False)
#^^^^^^^^^^^^^^^^^^^^^^ identifier[1]
#                                █

# Nodes types:
# identifier[1]: identifier

# ------------------------------------

 return_statement_value()
#^^^^^^^^^^^^^^^^^^^^^^ identifier[1]
#                      █

# Nodes types:
# identifier[1]: identifier

# ------------------------------------

from math import cos
#    |

# ------------------------------------

from math import comb
#                |
