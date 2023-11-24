// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  function incomplete(value: number) {
//                                   ^ function.body[1]
//                                   █

// Nodes types:
// function.body[1]: statement_block

// ------------------------------------

  const arrow = ()
//              ^^ parameters[1]
//              █

// Nodes types:
// parameters[1]: formal_parameters

