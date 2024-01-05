; Call expressions
(call_expression
  (arguments
    "(" @opening_paren
    ")" @closing_paren
  )
) @call_expression

(new_expression
  arguments: (arguments
    "(" @opening_paren
    ")" @closing_paren
   )
  ) @call_expression

; Assignment statements
(variable_declarator "=" @equal_sign) @assignment_statement
(assignment_expression "=" @equal_sign) @assignment_statement

; Function declaration
(function_declaration parameters: (formal_parameters "(" @opening_paren ")")) @function_declaration
(method_definition parameters: (formal_parameters "(" @opening_paren ")")) @function_declaration

; If statements
(if_statement) @if_statement

