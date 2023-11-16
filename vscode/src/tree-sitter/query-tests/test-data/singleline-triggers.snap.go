// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  package main

// Matches empty struct

  type Creature struct {
//              ^ start trigger[1]
//                     █
  }
//^ end trigger[1]

// Nodes types:
// trigger[1]: struct_type

// ------------------------------------
// Does not match non-empty struct

type Animal struct {
	//             |
	Name string
	Type string
}

// ------------------------------------
// Matches empty struct

  var person = struct {
//             ^ start trigger[1]
//                    █
  }{}
//^ end trigger[1]

// Nodes types:
// trigger[1]: struct_type

// ------------------------------------
// Does not match non-empty struct

var human = struct {
	//             |
	FirstName string
	LastName  string
}{
	FirstName: "John",
	LastName:  "Doe",
}

// ------------------------------------
// Does not match function declaration

func greet() {
	//       |
}

// ------------------------------------
// Matches empty nested interface

  func wrap() {
      type Writer interface {
//                ^ start trigger[1]
//                          █
      }
//    ^ end trigger[1]
  }

// Nodes types:
// trigger[1]: interface_type

