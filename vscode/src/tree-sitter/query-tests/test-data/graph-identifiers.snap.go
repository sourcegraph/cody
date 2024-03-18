// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  package main

  func greet() {
      // impl
  }

  greet()
//^^^^^ identifier[1]
//     █

// Nodes types:
// identifier[1]: identifier

// ------------------------------------

  func wrap() {
      type Writer interface {
//         ^^^^^^ identifier[1]

      }

      greet()
//    ^^^^^ identifier[2]
//         █
  }

// Nodes types:
// identifier[1]: type_identifier
// identifier[2]: identifier

