// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  function wrapper() {
      console.log('wrapper')
      function test() {
//                    ^ start function.body[1]
//                    █
      }
//    ^ end function.body[1]
  }

// Nodes types:
// function.body[1]: statement_block

// ------------------------------------

  function testParams() {
//                   ^^ function.parameters[1]
//                   █
      wrapper
  }

// Nodes types:
// function.parameters[1]: formal_parameters

// ------------------------------------

  function testParameter(val) {
//                       ^^^ parameter[1]
//                       █
      wrapper
  }

// Nodes types:
// parameter[1]: required_parameter

// ------------------------------------

  function arrowWrapper() {
      const arrow = (value: string) => {
//                                     ^ start function.body[1]
//                                     █
      }
//    ^ end function.body[1]
  }

// Nodes types:
// function.body[1]: statement_block

// ------------------------------------

  class Agent {
//            ^ start class.body[1]
//            █
  }
//^ end class.body[1]

// Nodes types:
// class.body[1]: class_body

// ------------------------------------

  function signature()
//                  ^^ function.parameters[1]
//                  █

// Nodes types:
// function.parameters[1]: formal_parameters

// ------------------------------------

// comment
//^^^^^^^^^^ comment[1]
//         █

// Nodes types:
// comment[1]: comment

// ------------------------------------

  /**
//^ start comment[1]
   * comment
//         █
   */
//  ^ end comment[1]

// Nodes types:
// comment[1]: comment

// ------------------------------------

  function functionName() {}
//         ^^^^^^^^^^^^ function.name[1]
//                    █

// Nodes types:
// function.name[1]: identifier

// ------------------------------------

  function returnStatement() {
      return
//    ^^^^^^ return_statement[1]
//         █
  }

// Nodes types:
// return_statement[1]: return_statement

// ------------------------------------

  function returnStatementValue(value: string, flag?: boolean) {
      return "asd"
//           ^^^^^ return_statement.value[1]
//           █
  }

// Nodes types:
// return_statement.value[1]: string

// ------------------------------------

  interface TestInterface {
//                        ^ start type_declaration.body[1]
//                        █
  }
//^ end type_declaration.body[1]

// Nodes types:
// type_declaration.body[1]: object_type

// ------------------------------------

  type TestType = {
//                ^ start type_declaration.body[1]
//                █
  }
//^ end type_declaration.body[1]

// Nodes types:
// type_declaration.body[1]: object_type

// ------------------------------------

  returnStatementValue("value")
//                     ^^^^^^^ argument[1]
//                     █

// Nodes types:
// argument[1]: string

// ------------------------------------

  returnStatementValue("value", false)
//                              ^^^^^ argument[1]
//                              █

// Nodes types:
// argument[1]: false

// ------------------------------------

  returnStatementValue()
//                    ^^ arguments[1]
//                    █

// Nodes types:
// arguments[1]: arguments

// ------------------------------------

  const object = {
      key: "value"
//         ^^^^^^^ pair.value[1]
//         █
  }

// Nodes types:
// pair.value[1]: string

// ------------------------------------

  returnStatementValue("value", () => {
//                                    ^ start function.body[1]
//                                    █
      const value = "value"
  })
//^ end function.body[1]

// Nodes types:
// function.body[1]: statement_block

// ------------------------------------

  returnStatementValue("value", {key: value})
//                                    ^^^^^ pair.value[1]
//                                    █

// Nodes types:
// pair.value[1]: identifier

// ------------------------------------

returnStatementValue("value", () => {
    const value = "value"
   //             |
})
