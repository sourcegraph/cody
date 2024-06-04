; Call expressions
(invocation_expression
  arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression

(object_creation_expression
  arguments: (argument_list "(" @opening_paren ")" @closing_paren)
) @call_expression

; Assignment statement
(variable_declarator
  (identifier)
  (_ "=" @equal_sign)
) @assignment_statement

(assignment_expression
  (assignment_operator "=" @equal_sign)
) @assignment_statement

; Function declaration
(method_declaration parameters: (parameter_list "(" @opening_paren ")")) @function_declaration

; If statement
(if_statement) @if_statement
