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
          console.log('test')
//               █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  function testFunc() {
//         ^^^^^^^^ symbol.function[1]
//              █
      wrapper
  }

// Nodes types:
// symbol.function[1]: identifier

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

  function testKeyword(val) {
//^ start range.function[1]
//    █
      wrapper
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  function arrowWrapper() {
//^ start range.function[1]
      const arrow = (value: string) => {
          console.log('hello')
//            █
      }
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

const arrowFunc = (value: string) => {
    console.log('hello')
    //  |
}

// ------------------------------------

class Agent {
    //   |
}

// ------------------------------------

  class AgentConstructor {
      constructor() {
//    ^ start range.function[1]
          console.log('hello')
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: method_definition

// ------------------------------------

  class AgentMethod {
      constructor() {}

      public sayHello() {
//    ^ start range.function[1]
          console.log('hello')
//             █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: method_definition

