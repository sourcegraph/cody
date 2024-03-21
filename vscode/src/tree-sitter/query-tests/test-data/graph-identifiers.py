def wrapper():
    print('wrapper')
    def test():
        #     |
        pass

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
#                      |

# ------------------------------------

return_statement_value('value', False)
#                               |

# ------------------------------------

return_statement_value()
#                     |

# ------------------------------------

from math import cos
#    |

# ------------------------------------

from math import comb
#                |
