## Problem:

I have some code that either renders an inline completion, or renders an decoration in VS Code with a code suggestion.

Inline completions rely that we are not removing any characters from the document, if we have to delete some characters then we need a decoration.

### Inline Decoration Example:

Incoming suggestion:
} else if len(args) > 2 {
return args{}, errors.New("too many arguments")
}

Existing code:
} else if len(arguments) > 2 {
return args{}, errors.New("too many arguments")
}

Solution: We needed to remove code from `arguments` to replace it with `args`, therefore we are deleting characters from the document.

### Inline completion example:

Incoming suggestion:
} else if len(argumentsNew) > 2 {
return args{}, errors.New("too many arguments")
}

Existing code:
} else if len(arguments) > 2 {
return args{}, errors.New("too many arguments")
}

Solution: We needed to add `New` to `arguments`, we are only adding characters so we show a completion
