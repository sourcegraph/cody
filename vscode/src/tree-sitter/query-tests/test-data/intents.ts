function wrapper() {
    console.log('wrapper')
    function test() {
        //          |
    }
}

// ------------------------------------

function testParams() {
    //             |
    wrapper
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

class Agent {
    //      |
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

function returnStatementValue(value: string, flag?: boolean) {
    return "asd"
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

returnStatementValue("value")
//                   |

// ------------------------------------

returnStatementValue("value", false)
//                            |

// ------------------------------------

returnStatementValue()
//                  |

// ------------------------------------

const object = {
    key: "value"
    //   |
}

// ------------------------------------

returnStatementValue("value", () => {
    //                              |
    const value = "value"
})

// ------------------------------------

returnStatementValue("value", {key: value})
//                                  |

// ------------------------------------

returnStatementValue("value", () => {
    const value = "value"
   //             |
})
