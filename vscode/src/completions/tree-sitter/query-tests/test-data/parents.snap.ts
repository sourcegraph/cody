// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  export function whatsUp() {
//                          ^ start parents[3]
      const result = {
//    ^ start parents[2]
//          ^^^^^^ at_cursor[1]
//          ^ start parents[1]
//          █
          value:  'value'
      }
//    ^ end parents[1], parents[2]
  }
//^ end parents[3]

// Nodes types:
// at_cursor[1]: identifier
// parents[1]: variable_declarator
// parents[2]: lexical_declaration
// parents[3]: statement_block

// ------------------------------------

  export function singleLineVariable() {
//                                     ^ start parents[3]
      const a_very_long_variable_name = 'value'
//    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ parents[2]
//          ^^^^^^^^^^^^^^^^^^^^^^^^^ at_cursor[1]
//          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ parents[1]
//                                  █
  }
//^ end parents[3]

// Nodes types:
// at_cursor[1]: identifier
// parents[1]: variable_declarator
// parents[2]: lexical_declaration
// parents[3]: statement_block

// ------------------------------------

  interface kek {
//^ start parents[2], parents[3]
//              ^ at_cursor[1], start parents[1]
//              █
      value: string
  }
//^ end parents[1], parents[2]


//^ end parents[3]
// Nodes types:
// at_cursor[1]: {
// parents[1]: object_type
// parents[2]: interface_declaration
// parents[3]: program

// ------------------------------------

  export function pek() {
//^ start parents[3]
//       ^ start parents[2]
//                      ^ at_cursor[1], start parents[1]
//                      █
      const data: kek = {
          value: 'wow',
      }
      return data
  }
//^ end parents[1], parents[2], parents[3]

  export const hmmm = 1

// Nodes types:
// at_cursor[1]: {
// parents[1]: statement_block
// parents[2]: function_declaration
// parents[3]: export_statement

// ------------------------------------

  class Animal {
//^ start parents[2], parents[3]
//             ^ at_cursor[1], start parents[1]
//             █
      constructor() {}
  }
//^ end parents[1], parents[2]


//^ end parents[3]
// Nodes types:
// at_cursor[1]: {
// parents[1]: class_body
// parents[2]: class_declaration
// parents[3]: program

// ------------------------------------

  export class Doggo extends Animal {
//                                  ^ start parents[3]
      public bark() {
//    ^ start parents[2]
//                  ^ at_cursor[1], start parents[1]
//                  █
          return {}
      }
//    ^ end parents[1], parents[2]
  }
//^ end parents[3]

// Nodes types:
// at_cursor[1]: {
// parents[1]: statement_block
// parents[2]: method_definition
// parents[3]: class_body

// ------------------------------------

  export function inconsistentIndentation() {
      if (Doggo) {
          const value = null; const arrow = () => {
//                                  ^ start parents[3]
//                                          ^ start parents[2]
//                                                ^ at_cursor[1], start parents[1]
//                                                █
              console.log('Hello World!');
          }
//        ^ end parents[1], parents[2], parents[3]
      } else {
          const a = 1
      }
  }

// Nodes types:
// at_cursor[1]: {
// parents[1]: statement_block
// parents[2]: arrow_function
// parents[3]: variable_declarator

// ------------------------------------
// Captures the whole if_statement block

  export function whatIf() {
//                         ^ start parents[3]
      if (Doggo) {
//    ^ start parents[2]
//               ^ at_cursor[1], start parents[1]
//               █
          console.log('You are right!')
      } else {
//    ^ end parents[1]
          console.log('Nope -_-')
      }
//    ^ end parents[2]
  }
//^ end parents[3]

// Nodes types:
// at_cursor[1]: {
// parents[1]: statement_block
// parents[2]: if_statement
// parents[3]: statement_block

// ------------------------------------
// Captures the whole try_statement block

  export function tryHard(message: string) {
//                                         ^ start parents[3]
      try {
//    ^ start parents[2]
//        ^ at_cursor[1], start parents[1]
//        █
          new Doggo()
      } catch (error) {
//    ^ end parents[1]
          console.error('Opps!')
      } finally {
          console.log(message)
      }
//    ^ end parents[2]
  }
//^ end parents[3]

// Nodes types:
// at_cursor[1]: {
// parents[1]: statement_block
// parents[2]: try_statement
// parents[3]: statement_block

// ------------------------------------

  tryHard('Hello')
//^^^^^^^^^^^^^^^^ parents[2], parents[3]
//       ^^^^^^^^^ parents[1]
//               ^ at_cursor[1]
//               █

// Nodes types:
// at_cursor[1]: )
// parents[1]: arguments
// parents[2]: call_expression
// parents[3]: expression_statement

