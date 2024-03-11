def wrapper():
    print('wrapper')
    def test():
        # |
        pass

# ------------------------------------

def test():
    # |
    pass

# ------------------------------------

def test_multiline_func_declaration(
    #              |
    val,
    val2
):
    wrapper()

# ------------------------------------

def test_parameter(val):
    #              |
    wrapper()

# ------------------------------------

class Agent:
    #   |
    pass

# ------------------------------------


class AgentMultiLine(
    BaseClass1,
    BaseClass2):
    #   |
    def __init__(self, name):
        self.name = name

# ------------------------------------

class Agent:
    def __init__(self, name):
    #      |
        self.name = name

# ------------------------------------

class Agent:
    def __init__(self, name):
        self.name = name

    def test(self):
    #    |
        pass

# ------------------------------------

def return_statement():
    return
    #    |

# ------------------------------------

return_statement('value')
#       |

# ------------------------------------

user_name = 'Tom'
    #  |

# ------------------------------------

user_name = 'Tom'
    #         |
