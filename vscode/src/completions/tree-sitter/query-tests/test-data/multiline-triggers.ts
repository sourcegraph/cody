// Doesn't match arrow function with non-empty body

export function arrowFunctionWithContent() {
    if (window) {
        const value = null; const arrow = () => {
        //                                      |
            console.log('Hello World!');
        }
    } else {
        const a = 1
    }
}

// ------------------------------------
// Matches empty arrow function

export function arrowFunctionEmpty() {
    if (window) {
        const value = null; const arrow = () => {
        //                                      |
        }
    } else {
        const a = 1
    }
}

// ------------------------------------
// Does not match non-empty function declaration

export function filled() {
    //                   |
    console.log('Much logic')
}

// ------------------------------------
// Matches empty function declaration

export function outer() {
    function middle() {
        function inner() { }
        //               |
    }
}

// ------------------------------------
// Matches empty function declaration with new lines inside

export function anotherOne() {
    function middle() {
        function inner() {
        //               |
        }
    }
}

// ------------------------------------
// Does not match function declarations with blocks starting before the cursor

export function objectInFunction() {
    function middle() {
        function inner() {
            const kek = {}
            //          |
        }
    }
}
