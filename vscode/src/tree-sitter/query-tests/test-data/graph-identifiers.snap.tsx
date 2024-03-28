// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  import _, { pick } from 'lodash';
//       ^ identifier[1]
//            ^^^^ identifier[2]
  const sentry = require('@sentry/node')
//               ^^^^^^^ identifier[3]

  function wrapper() {
      console.log('wrapper')
//            ^^^ identifier[4]
      sentry.captureException(new Error('hello world'))
//           ^^^^^^^^^^^^^^^^ identifier[5]
//                                ^^^^^ identifier[6]
      function test() {
//                    █
      }
  }

// Nodes types:
// identifier[1]: identifier
// identifier[2]: identifier
// identifier[3]: identifier
// identifier[4]: property_identifier
// identifier[5]: property_identifier
// identifier[6]: identifier

// ------------------------------------

  function testParams(arg: TestType): TestType {
//                         ^^^^^^^^ identifier[1]
//                                    ^^^^^^^^ identifier[2]
      const result: Agent = {
//                  ^^^^^ identifier[3]
          value: 1,
//        ^^^^^ identifier[4]
          key: 'foo',
//        ^^^ identifier[5]
      }
      const value = wrapper
//                  ^^^^^^^ identifier[6]
      pick(result, ['value'])
//    ^^^^ identifier[7]
      Agent.test()
//          ^^^^ identifier[8]
      wrapper
//    ^^^^^^^ identifier[9]
//           █
      return result
  }

// Nodes types:
// identifier[1]: type_identifier
// identifier[2]: type_identifier
// identifier[3]: type_identifier
// identifier[4]: property_identifier
// identifier[5]: property_identifier
// identifier[6]: identifier
// identifier[7]: identifier
// identifier[8]: property_identifier
// identifier[9]: identifier

// ------------------------------------

function testParameter(val) {
    //                 |
    wrapper
}

// ------------------------------------

function arrowWrapper() {
    const arrow = (value: string) => {
        //                           |
    }
}

// ------------------------------------

  class Parent {}
//      ^^^^^^ identifier[1]

  class Agent extends Parent {
//      ^^^^^ identifier[2]
//                    ^^^^^^ identifier[3]
      static test(): TestType { }
//                   ^^^^^^^^ identifier[4]
//                             █
  }

// Nodes types:
// identifier[1]: type_identifier
// identifier[2]: type_identifier
// identifier[3]: identifier
// identifier[4]: type_identifier

// ------------------------------------

function signature()
//                |

// ------------------------------------

// comment
//       |

// ------------------------------------

/**
 * comment
 //      |
 */

// ------------------------------------

function functionName() {}
//                  |

// ------------------------------------

function returnStatement() {
    return
    //   |
}

// ------------------------------------

  function returnStatementValue(value: Agent, flag?: boolean) {
//                                     ^^^^^ identifier[1]
      return 'asd'
//           █
  }

// Nodes types:
// identifier[1]: type_identifier

// ------------------------------------

  interface TestInterface extends TestType {
//          ^^^^^^^^^^^^^ identifier[1]
//                                ^^^^^^^^ identifier[2]
//                                         █
  }

// Nodes types:
// identifier[1]: type_identifier
// identifier[2]: type_identifier

// ------------------------------------

  type TestType = {
//     ^^^^^^^^ identifier[1]
//                █
  }

// Nodes types:
// identifier[1]: type_identifier

// ------------------------------------

  returnStatementValue('value')
//^^^^^^^^^^^^^^^^^^^^ identifier[1]
//                     █

// Nodes types:
// identifier[1]: identifier

// ------------------------------------

  returnStatementValue('value', false)
//^^^^^^^^^^^^^^^^^^^^ identifier[1]
//                              █

// Nodes types:
// identifier[1]: identifier

// ------------------------------------

  returnStatementValue()
//^^^^^^^^^^^^^^^^^^^^ identifier[1]
//                    █

// Nodes types:
// identifier[1]: identifier

// ------------------------------------

  const object = {
      key: 'value',
//    ^^^ identifier[1]
//         █
  }

// Nodes types:
// identifier[1]: property_identifier

// ------------------------------------

  returnStatementValue('value', () => {
//^^^^^^^^^^^^^^^^^^^^ identifier[1]
//                                    █
      const value = 'value'
  })

// Nodes types:
// identifier[1]: identifier

// ------------------------------------

  returnStatementValue('value', { key: value })
//^^^^^^^^^^^^^^^^^^^^ identifier[1]
//                                ^^^ identifier[2]
//                                    █

// Nodes types:
// identifier[1]: identifier
// identifier[2]: property_identifier

// ------------------------------------

  returnStatementValue('value', () => {
//^^^^^^^^^^^^^^^^^^^^ identifier[1]
      const value = 'value'
//                   █
  })

// Nodes types:
// identifier[1]: identifier

// ------------------------------------

  function ComponentObject() {
      return <button onClick={}></button>
//                   ^^^^^^^ identifier[1]
//                           █
  }

// Nodes types:
// identifier[1]: property_identifier

// ------------------------------------

  function ComponentString(): Agent {
//                            ^^^^^ identifier[1]
      return <div color=""></div>
//                ^^^^^ identifier[2]
//                      █
  }

// Nodes types:
// identifier[1]: type_identifier
// identifier[2]: property_identifier

