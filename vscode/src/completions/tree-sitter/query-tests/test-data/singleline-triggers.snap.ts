// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

// Matches empty interface

  interface Interface {}
//^^^^^^^^^^^^^^^^^^^^^^ trigger[1]
//                    █

// Nodes types:
// trigger[1]: interface_declaration

// ------------------------------------
// Matches interface with missing closing brace

  interface IncompleteInterface {
//^ start trigger[1]
//                              █
  console.log('incomplete')
//                        ^ end trigger[1]

// Nodes types:
// trigger[1]: interface_declaration

// ------------------------------------
// Matches empty type

  type Type = {}
//^^^^^^^^^^^^^^ trigger[1]
//            █

// Nodes types:
// trigger[1]: type_alias_declaration

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
