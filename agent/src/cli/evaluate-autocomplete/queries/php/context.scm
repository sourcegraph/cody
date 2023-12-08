; Call expression
(scoped_call_expression
  arguments: (arguments "(" @opening_paren ")" @closing_paren)
) @call_expression

(member_call_expression
  arguments: (arguments "(" @opening_paren ")" @closing_paren)
) @call_expression

(function_call_expression
  arguments: (arguments "(" @opening_paren ")" @closing_paren)
) @call_expression

; Assignment statement
(assignment_expression "=" @opening_paren) @assignment_statement

; Function declaration
(method_declaration parameters: (formal_parameters "(" @opening_paren ")")) @function_declaration

; If statement
(if_statement) @if_statement
