# Welcome to Cody

# To get started, place your cursor at the end of
# the following function and press tab to accept the
# Cody-powered autocomplete. (You can press Opt-\ (# TODO: Make this platform specific)
# to generate more suggestions)

def hello_world():
    """Prints hello world (with an emoji)"""
    # TODO: Add logic to automatically trigger a completion when this line is manually clicked

# Nice! Next, let's edit code with an instruction. # TODO: Show this dynamically
#
# Place the cursor on the empty line below, press
# Opt+K to open the Cody Edit Input (# TODO: Make this a link).
# We've pre-filled the instruction
# all you need to do is choose Submit.

import os

def find_logs(dir_path):
    logs = []
    for root, dirs, files in os.walk(dir_path):
        for file in files:
            if file.endswith('.log'):
                logs.append(os.path.join(root, file))
    return logs

# Once you've accepted the edit, you're done! That's
# all you need to edit code with Cody.
#
# Next up: Start a Chat (Opt+L) # TODO: Make this a link
