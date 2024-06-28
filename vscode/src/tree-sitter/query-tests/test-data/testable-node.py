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

def test_parameter(val):
    #              |
    wrapper()

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

# The Agent class ...
# |
# Note: this agent may become sentient
class Agent:
    def __init__(self, name):
        self.name = name

