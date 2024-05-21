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
//               █
          console.log('test')
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

  function testKeyword(val) {
//^ start range.function[1]
//       █
      wrapper
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  class AgentConstructor {
      constructor() {
//    ^^^^^^^^^^^ symbol.function[1]
//    ^ start range.function[1]
//             █
          console.log('hello')
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: property_identifier
// range.function[1]: method_definition

// ------------------------------------

  class AgentMethod {
      constructor() {}

      public sayHello() {
//    ^ start range.function[1]
//           ^^^^^^^^ symbol.function[1]
//             █
          console.log('hello')
      }
//    ^ end range.function[1]
  }

// Nodes types:
// symbol.function[1]: property_identifier
// range.function[1]: method_definition

