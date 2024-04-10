// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  function wrapper() {
      console.log('wrapper')
      function test() {
//    ^ start range.function[1]
//             ^^^^ symbol.function[1]
//                █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: function_declaration

// ------------------------------------

  function testFunc() {
//^ start range.function[1]
//         ^^^^^^^^ symbol.function[1]
//              █
      wrapper
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: function_declaration

// ------------------------------------

  function testParameter(val) {
//^ start range.function[1]
//                       █
      wrapper
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  function arrowWrapper() {
      const arrow = (value: string) => {
//    ^ start range.identifier[1]
//          ^^^^^ symbol.identifier[1]
//            █
      }
//    ^ end range.identifier[1]
  }

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: lexical_declaration

// ------------------------------------

  const arrowFunc = (value: string) => {
//^ start range.identifier[1]
//      ^^^^^^^^^ symbol.identifier[1]
//        █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: lexical_declaration

// ------------------------------------

  class Agent {
//^ start range.identifier[1]
//      ^^^^^ symbol.identifier[1]
//         █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: class_declaration

// ------------------------------------

  class AgentConstructor {
      constructor() {
//    ^^^^^^^^^^^ symbol.function[1]
//    ^ start range.function[1]
//         █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: property_identifier
// range.function[1]: method_definition

// ------------------------------------

  function signature()
//^^^^^^^^^^^^^^^^^^^^ range.function[1]
//         ^^^^^^^^^ symbol.function[1]
//             █

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: function_signature

// ------------------------------------

  interface TestInterface {
//^ start range.identifier[1]
//          ^^^^^^^^^^^^^ symbol.identifier[1]
//                █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: interface_declaration

// ------------------------------------

  interface TestInterfacePropertySignature {
      test: boolean
//    ^^^^ symbol.identifier[1]
//    ^^^^^^^^^^^^^ range.identifier[1]
//      █
  }

// Nodes types:
// symbol.identifier[1]: property_identifier
// range.identifier[1]: property_signature

// ------------------------------------

  interface TestInterfaceCallSignature {
      (): boolean;
//    ^^^^^^^^^^^ symbol.function[1], range.function[1]
//       █
  }

// Nodes types:
// symbol.function[1]: call_signature
// range.function[1]: call_signature

// ------------------------------------

  type TestType = {
//^ start range.identifier[1]
//     ^^^^^^^^ symbol.identifier[1]
//         █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: type_alias_declaration

// ------------------------------------

  type TestTypePropertySignature = {
      test: number
//    ^^^^ symbol.identifier[1]
//    ^^^^^^^^^^^^ range.identifier[1]
//     █
  }

// Nodes types:
// symbol.identifier[1]: property_identifier
// range.identifier[1]: property_signature

// ------------------------------------

  type TestTypeCallSignature = {
      (): boolean;
//    ^^^^^^^^^^^ symbol.function[1], range.function[1]
//         █
  }

// Nodes types:
// symbol.function[1]: call_signature
// range.function[1]: call_signature

// ------------------------------------

  enum TestEnum { One, Two, Three }
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ range.identifier[1]
//     ^^^^^^^^ symbol.identifier[1]
//       █

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: enum_declaration

// ------------------------------------

  const name = 'test'
//^^^^^^^^^^^^^^^^^^^ range.identifier[1]
//      ^^^^ symbol.identifier[1]
//       █

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: lexical_declaration

// ------------------------------------

let changingName = 'test'
changingName = 'other'
// |
