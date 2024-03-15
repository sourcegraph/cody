import _, { pick } from 'lodash';
const sentry = require('@sentry/node')

function wrapper() {
    console.log('wrapper')
    sentry.captureException(new Error('hello world'))
    function test() {
        //          |
    }
}

// ------------------------------------

function testParams(): TestType {
    const result: Agent = {
        value: 1,
        key: 'foo',
    }
    pick(result, ['value'])
    Agent.test()
    wrapper
    //     |
    return result
}

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
    static test(): TestType { }
    //                       |
}

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
    return 'asd'
    //     |
}

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
//                   |

// ------------------------------------

returnStatementValue('value', false)
//                            |

// ------------------------------------

returnStatementValue()
//                  |

// ------------------------------------

const object = {
    key: 'value',
    //   |
}

// ------------------------------------

returnStatementValue('value', () => {
    //                              |
    const value = 'value'
})

// ------------------------------------

returnStatementValue('value', { key: value })
//                                  |

// ------------------------------------

returnStatementValue('value', () => {
    const value = 'value'
    //             |
})

// ------------------------------------

function ComponentObject() {
    return <button onClick={}></button>
    //                     |
}

// ------------------------------------

function ComponentString(): Agent {
    return <div color=""></div>
    //                |
}
