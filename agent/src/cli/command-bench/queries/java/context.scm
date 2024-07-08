; Call expression
(method_invocation
    arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression

(object_creation_expression
    arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression

; Function declaration
(method_declaration parameters: (formal_parameters "(" @opening_paren ")")) @function_declaration

; Assignment statements
(assignment_expression "=" @equal_sign ) @assignment_statement
(variable_declarator "=" @equal_sign ) @assignment_statement

; If statements
(if_statement) @if_statement
