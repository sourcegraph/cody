// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  package main

  class Creature {
//^ start range.identifier[1]
//      ^^^^^^^^ symbol.identifier[1]
//        █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: class_declaration

// ------------------------------------

  data class Animal(
//^ start range.identifier[1]
          val name: String,
//                █
          val type: String
  )
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: class_declaration

// ------------------------------------

  data class User(
//^ start range.identifier[1]
          val name: String,
          val firstName: String,
          val lastName: String,
//                █
          val email: String
  )
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: class_declaration

// ------------------------------------

  interface Stringer {
//^ start range.identifier[1]
//          ^^^^^^^^ symbol.identifier[1]
//           █
      fun string(): String
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: class_declaration

// ------------------------------------

  interface SuperStringer {
      fun string(): String
//    ^^^^^^^^^^^^^^^^^^^^ range.function[1]
//        ^^^^^^ symbol.function[1]
//        █
  }

// Nodes types:
// symbol.function[1]: simple_identifier
// range.function[1]: function_declaration

// ------------------------------------

  typealias Key = Int
//^^^^^^^^^^^^^^^^^^^ symbol.identifier[1], range.identifier[1]
//    █

// Nodes types:
// symbol.identifier[1]: type_alias
// range.identifier[1]: type_alias

// ------------------------------------

val person =
        object {
            //  |
        }

// ------------------------------------

val people =
        object {
            //  |
        }

// ------------------------------------

val shortDeclaration = 4
//      |

// ------------------------------------

const val name = "Tom"
//      |

// ------------------------------------

  fun nestedVar() {
//^ start range.function[1]
      val y = 4
//        █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  fun greet() {
//^ start range.function[1]
//    ^^^^^ symbol.function[1]
//        █
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: simple_identifier
// range.function[1]: function_declaration

// ------------------------------------

  fun getDisplayName(u: User): String {
//^ start range.function[1]
//    ^^^^^^^^^^^^^^ symbol.function[1]
//                 █
      return u.firstName + " " + u.lastName
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: simple_identifier
// range.function[1]: function_declaration

