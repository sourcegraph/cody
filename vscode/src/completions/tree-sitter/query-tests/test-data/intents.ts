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

function returnStatementValue() {
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
