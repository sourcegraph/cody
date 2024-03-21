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
//^ start range.function[1]
//              █
      wrapper
  }
//^ end range.function[1]

// Nodes types:
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
      const arrow = (value: string) => {
//                  ^ start range.function[1]
          console.log('hello')
//            █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: arrow_function

// ------------------------------------

  const arrowFunc = (value: string) => {
//                  ^ start range.function[1]
      console.log('hello')
//        █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: arrow_function

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

