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

function testParams() {
    const result = {
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
    const arrow = (value) => {
        //                   |
    }
}

// ------------------------------------

class Parent {}

class Agent extends Parent {
    static test() { }
    //             |
}

// ------------------------------------

function signature() {}
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

function returnStatementValue(value, flag) {
    return 'asd'
    //     |
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

function ComponentString() {
    return <div color=""></div>
    //                |
}
