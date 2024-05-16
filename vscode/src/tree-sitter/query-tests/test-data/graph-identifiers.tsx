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

function testParams(arg: TestType): TestType {
    const result: Agent = {
        value: 1,
        key: 'foo',
    }
    const value = wrapper
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

interface TestInterface extends TestType {
    //                                   |
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
