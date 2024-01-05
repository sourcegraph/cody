; Call expressions
(call_expression
    function: (identifier)
    arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression
(composite_literal (literal_value "{" @opening_paren "}" @closing_paren)) @call_expression

; Assignment statements
(short_var_declaration ":=" @equal_sign) @assignment_statement
(assignment_statement "=" @equal_sign) @assignment_statement

; Function declaration
(function_declaration parameters: (parameter_list "(" @opening_paren ")")) @function_declaration

; If statements
(if_statement) @if_statement
