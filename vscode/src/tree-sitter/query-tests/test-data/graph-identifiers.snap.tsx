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

// ------------------------------------

  function testParams(): TestType {
//                       ^^^^^^^^ identifier[1]
      const result: Agent = {
//                  ^^^^^ identifier[2]
          value: 1,
          key: 'foo',
      }
      pick(result, ['value'])
//    ^^^^ identifier[3]
      Agent.test()
//          ^^^^ identifier[4]
      wrapper
//    ^^^^^^^ identifier[5]
//           █
      return result
  }

// Nodes types:
// identifier[1]: type_identifier
// identifier[2]: type_identifier
// identifier[3]: identifier
// identifier[4]: property_identifier
// identifier[5]: identifier

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

  class Agent extends Parent {
//                    ^^^^^^ identifier[1]
      static test(): TestType { }
//                   ^^^^^^^^ identifier[2]
//                             █
  }

// Nodes types:
// identifier[1]: identifier
// identifier[2]: type_identifier

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

interface TestInterface {
    //                  |
}

// ------------------------------------

type TestType = {
    //          |
}

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
    //   |
}

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
//                                    █

// Nodes types:
// identifier[1]: identifier

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

