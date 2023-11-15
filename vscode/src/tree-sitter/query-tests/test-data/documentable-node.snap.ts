// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  function wrapper() {
      console.log('wrapper')
      function test() {
//             ^^^^ documentableNode[1]
//                █
      }
  }

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

  function testFunc() {
//         ^^^^^^^^ documentableNode[1]
//              █
      wrapper
  }

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

function testParameter(val) {
    //                 |
    wrapper
}

// ------------------------------------

  function arrowWrapper() {
      const arrow = (value: string) => {
//          ^^^^^ documentableNode[1]
//            █
      }
  }

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

  const arrowFunc = (value: string) => {
//      ^^^^^^^^^ documentableNode[1]
//        █
  }

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

  class Agent {
//      ^^^^^ documentableNode[1]
//         █
  }

// Nodes types:
// documentableNode[1]: type_identifier

// ------------------------------------

  class AgentConstructor {
      constructor() {
//    ^^^^^^^^^^^ documentableNode[1]
//         █
      }
  }

// Nodes types:
// documentableNode[1]: property_identifier

// ------------------------------------

  function signature()
//         ^^^^^^^^^ documentableNode[1]
//             █

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

  interface TestInterface {
//          ^^^^^^^^^^^^^ documentableNode[1]
//                █
  }

// Nodes types:
// documentableNode[1]: type_identifier

// ------------------------------------

  interface TestInterfacePropertySignature {
      test: boolean
//    ^^^^ documentableNode[1]
//      █
  }

// Nodes types:
// documentableNode[1]: property_identifier

// ------------------------------------

  interface TestInterfaceCallSignature {
      (): boolean;
//    ^^^^^^^^^^^ documentableNode[1]
//       █
  }

// Nodes types:
// documentableNode[1]: call_signature

// ------------------------------------

  type TestType = {
//     ^^^^^^^^ documentableNode[1]
//         █
  }

// Nodes types:
// documentableNode[1]: type_identifier

// ------------------------------------

  type TestTypePropertySignature = {
      test: number
//    ^^^^ documentableNode[1]
//     █
  }

// Nodes types:
// documentableNode[1]: property_identifier

// ------------------------------------

  type TestTypeCallSignature = {
      (): boolean;
//    ^^^^^^^^^^^ documentableNode[1]
//         █
  }

// Nodes types:
// documentableNode[1]: call_signature

// ------------------------------------

  enum TestEnum { One, Two, Three }
//     ^^^^^^^^ documentableNode[1]
//       █

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

  const name = 'test'
//      ^^^^ documentableNode[1]
//       █

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

let changingName = 'test'
changingName = 'other'
// |

// ------------------------------------

  export function testFunc() {}
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ documentableExport[1]
//   █

// Nodes types:
// documentableExport[1]: export_statement

// ------------------------------------

  export function testFunc() {}
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ documentableExport[1]
//             █

// Nodes types:
// documentableExport[1]: export_statement

// ------------------------------------

  const name = 'test'
  export { name }
//^^^^^^^^^^^^^^^ documentableExport[1]
//   █

// Nodes types:
// documentableExport[1]: export_statement

// ------------------------------------

  const name = 'test'
  export { name }
//         ^^^^ documentableNode[1]
//           █

// Nodes types:
// documentableNode[1]: identifier

// ------------------------------------

  const name = 'test'
  export default name
//^^^^^^^^^^^^^^^^^^^ documentableExport[1]
//          █

// Nodes types:
// documentableExport[1]: export_statement

// ------------------------------------

  export default function testFunc() {}
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ documentableExport[1]
//                  █

// Nodes types:
// documentableExport[1]: export_statement

