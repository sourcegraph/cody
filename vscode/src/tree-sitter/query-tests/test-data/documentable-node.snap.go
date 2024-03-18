// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  package main

  type Creature struct {
//^ start range.identifier[1]
//     ^^^^^^^^ symbol.identifier[1]
//         █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: type_declaration

// ------------------------------------

  type Animal struct {
      Name string
//    ^^^^ symbol.identifier[1]
//    ^^^^^^^^^^^ range.identifier[1]
//     █
      Type string
  }

// Nodes types:
// symbol.identifier[1]: field_identifier
// range.identifier[1]: field_declaration

// ------------------------------------

  type Stringer interface {
//^ start range.identifier[1]
//     ^^^^^^^^ symbol.identifier[1]
//         █
      String() string
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: type_declaration

// ------------------------------------

  type Stringer interface {
      String() string
//    ^^^^^^ symbol.identifier[1]
//    ^^^^^^^^^^^^^^^ range.identifier[1]
//       █
  }

// Nodes types:
// symbol.identifier[1]: field_identifier
// range.identifier[1]: method_spec

// ------------------------------------

  type key int
//^^^^^^^^^^^^ range.identifier[1]
//     ^^^ symbol.identifier[1]
//       █

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: type_declaration

// ------------------------------------

  var person = struct {
//^ start range.identifier[1]
//               █
  }{}
//  ^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: var_declaration

// ------------------------------------

  var person = struct {
//^ start range.identifier[1]
//    ^^^^^^ symbol.identifier[1]
//        █
  }{}
//  ^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: var_declaration

// ------------------------------------

  shortDeclaration := 4
//^^^^^^^^^^^^^^^^ symbol.identifier[1]
//^^^^^^^^^^^^^^^^^^^^^ range.identifier[1]
//        █

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: short_var_declaration

// ------------------------------------

  const name = "Tom"
//^^^^^^^^^^^^^^^^^^ range.identifier[1]
//      ^^^^ symbol.identifier[1]
//        █

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: const_declaration

// ------------------------------------

  func nestedVar() {
      y := 4
//    ^ symbol.identifier[1]
//    ^^^^^^ range.identifier[1]
//    █
  }

// Nodes types:
// symbol.identifier[1]: identifier
// range.identifier[1]: short_var_declaration

// ------------------------------------

  func greet() {
//^ start range.function[1]
//     ^^^^^ symbol.function[1]
//        █
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: function_declaration

// ------------------------------------

  func (u User) DisplayName() string {
//^ start range.function[1]
//              ^^^^^^^^^^^ symbol.function[1]
//                 █
      return u.FirstName + " " + u.LastName
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: field_identifier
// range.function[1]: method_declaration

