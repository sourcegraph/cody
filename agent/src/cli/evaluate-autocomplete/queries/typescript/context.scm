;; Inherits from javascript/context.scm

((function_declaration
   name: (_) @name
   (formal_parameters (_ (type_annotation) @search)))
 (#search! "type_identifier"))

((variable_declarator
  name: (_) @name
  type: (type_annotation) @search)
 (#search! "type_identifier"))
