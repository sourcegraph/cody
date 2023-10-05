// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

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
//                                          ^ start trigger[1]
//                                                █
          }
//        ^ end trigger[1]
      } else {
          const a = 1
      }
  }

// Nodes types:
// trigger[1]: arrow_function

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
//        ^^^^^^^^^^^^^^^^^^^^ trigger[1]
//                         █
      }
  }

// Nodes types:
// trigger[1]: function_declaration

// ------------------------------------
// Matches empty function declaration with new lines inside

  export function anotherOne() {
      function middle() {
          function inner() {
//        ^ start trigger[1]
//                         █
          }
//        ^ end trigger[1]
      }
  }

// Nodes types:
// trigger[1]: function_declaration

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
