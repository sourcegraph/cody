function wrapper() {
    console.log('wrapper')
    function test() {
        //      |
    }
}

// ------------------------------------

function testFunc() {
    //        |
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
        //  |
    }
}

// ------------------------------------

const arrowFunc = (value: string) => {
    //  |
}

// ------------------------------------

class Agent {
    //   |
}

// ------------------------------------

class AgentConstructor {
    constructor() {
    //   |
    }
}

// ------------------------------------

function signature()
//           |

// ------------------------------------

interface TestInterface {
    //          |
}

// ------------------------------------

interface TestInterfacePropertySignature {
    test: boolean
//    |
}

// ------------------------------------

interface TestInterfaceCallSignature {
    (): boolean;
//     |
}

// ------------------------------------

type TestType = {
    //   |
}

// ------------------------------------

type TestTypePropertySignature = {
    test: number
//   |
}

// ------------------------------------

type TestTypeCallSignature = {
    (): boolean;
    //   |
}

// ------------------------------------

enum TestEnum { One, Two, Three }
//     |

// ------------------------------------

const name = 'test'
//     |

// ------------------------------------

let changingName = 'test'
changingName = 'other'
// |

// ------------------------------------

export function testFunc() {}
// |

// ------------------------------------

export function testFunc() {}
//           |

// ------------------------------------

const name = 'test'
export { name }
// |

// ------------------------------------

const name = 'test'
export { name }
//         |

// ------------------------------------

const name = 'test'
export default name
//        |

// ------------------------------------

export default function testFunc() {}
//                |
