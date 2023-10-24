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

function arrowWrapper() {
    const arrow = (value: string) => {
        //                           |
    }
}

// ------------------------------------

function signature()
//                |

// ------------------------------------

// comment
//       |

// ------------------------------------

function functionName() {}
//                  |

// ------------------------------------

const stringValue = "hello"
//                     |

// ------------------------------------

const templateListeralValue = `world`
//                             |

// ------------------------------------

function withEmptyBlockStatement() {
    functionName(); { }
    //              |
}

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
