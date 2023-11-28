// Matches empty interface

interface Interface {}
//                  |

// ------------------------------------
// Matches interface with missing closing brace

interface IncompleteInterface {
//                            |
console.log('incomplete')

// ------------------------------------
// Matches empty type

type Type = {}
//          |

// ------------------------------------
// TODO: this case is not covered because the AST produced starts with the ERROR node.
// Does not match anything as it is invalid syntax

type IncompleteType = {
//                    |
console.log('incomplete')


// ------------------------------------
// Does not match non-empty interface

interface Interface {
    //              |
    name: string
}
