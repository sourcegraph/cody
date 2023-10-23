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

  function functionName() {}
//         ^^^^^^^^^^^^ function.name[1]
//                    █

// Nodes types:
// function.name[1]: identifier

// ------------------------------------

  const stringValue = "hello"
//                     ^^^^^ string[1]
//                       █

// Nodes types:
// string[1]: string_fragment

// ------------------------------------

  const templateListeralValue = `world`
//                              ^^^^^^^ string[1]
//                               █

// Nodes types:
// string[1]: template_string

// ------------------------------------

  function withEmptyBlockStatement() {
      functionName(); { }
//                    ^^^ block_statement[1]
//                    █
  }

// Nodes types:
// block_statement[1]: statement_block

// ------------------------------------

  function returnStatement() {
      return
//    ^^^^^^ return_statement[1]
//         █
  }

// Nodes types:
// return_statement[1]: return_statement

// ------------------------------------

  function returnStatementValue() {
      return "asd"
//           ^^^^^ string[1]
//           █
  }

// Nodes types:
// string[1]: string

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

