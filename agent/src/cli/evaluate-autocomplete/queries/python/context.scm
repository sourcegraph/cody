; Call expression

(call
    arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression

; Assignment statement
(assignment "=" @equal_sign right: (_) @rhs) @assignment_statement

; Function declaration
(function_definition parameters: (parameters "(" @opening_paren ")")) @function_declaration

; If statement
(if_statement) @if_statement
