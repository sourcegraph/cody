; Call expression
(call_expression
  arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression

; Assignment statement
(declaration declarator: (_) @rhs) @assignment_statement
(assignment_expression right: (_) @rhs) @assignment_statement

; Function declaration
(function_declarator parameters: (parameter_list "(" @opening_paren ")")) @function_declaration

; If statement
(if_statement) @if_statement
