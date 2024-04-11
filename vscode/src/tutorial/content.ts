export const TUTORIAL_MACOS_CONTENT = `### Welcome to Cody!
"""
This is an interactive getting started doc to show
you how to use some of Cody's editing features
"""

### Part 1: Autocomplete
"""
Place your cursor at the end of the following
function and press tab to accept the
Cody-powered autocomplete.
"""

def hello_world():
    """Prints hello world (with an emoji)"""
\u0020\u0020\u0020\u0020
#   ^ Place cursor above
"""
Pro-tip: you can press Opt+\\ to generate new
autocomplete suggestions.
"""

### Part 2: Edit Code with instructions
"""
Next, let's edit code with an instruction. Place the
cursor on the empty line below, and press
Opt+K to open the Edit Code input.
We've pre-filled the instruction,
all you need to do is choose Submit.
"""

# ^ Place cursor above and press Opt+K

### Part 3: Ask Cody to Fix
"""
The following code has a bug. Place the cursor
under the word with the wavy underline,
click the lightbulb (or hit Cmd+.), and ask
Cody to fix it for you:
"""
def log_fruits():
    print("List of fruits:", "apple,", "banana,", "cherry")
#         ^ Place cursor here and press Cmd+.

### Part 4: Start a chat
#
# Start a Chat (Opt+L)
`

export const TUTORIAL_CONTENT = TUTORIAL_MACOS_CONTENT.replace('Opt', 'Alt').replace('Cmd', 'Ctrl')
