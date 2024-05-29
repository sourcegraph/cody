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
//        █
      fun string(): String
  }
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: class_declaration

// ------------------------------------

  interface SuperStringer {
//^ start range.identifier[1]
      fun string(): String
//        █
  }
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: class_declaration

// ------------------------------------

  typealias Key = Int
//^^^^^^^^^^^^^^^^^^^ symbol.function[1], range.function[1]
//    █

// Nodes types:
// symbol.function[1]: type_alias
// range.function[1]: type_alias

// ------------------------------------

  val person =
//^ start range.identifier[1]
          object {
//                █
          }
//        ^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: property_declaration

// ------------------------------------

  val people =
//^ start range.identifier[1]
          object {
//                █
          }
//        ^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: property_declaration

// ------------------------------------

  val shortDeclaration = 4
//    ^^^^^^^^^^^^^^^^ symbol.identifier[1], range.identifier[1]
//        █

// Nodes types:
// symbol.identifier[1]: simple_identifier
// range.identifier[1]: variable_declaration

// ------------------------------------

  const val name = "Tom"
//^^^^^^^^^^^^^^^^^^^^^^ symbol.identifier[1]
//          ^^^^ range.identifier[1]
//        █

// Nodes types:
// symbol.identifier[1]: property_declaration
// range.identifier[1]: variable_declaration

// ------------------------------------

  fun nestedVar() {
      val y = 4
//        ^ symbol.identifier[1], range.identifier[1]
//        █
  }

// Nodes types:
// symbol.identifier[1]: simple_identifier
// range.identifier[1]: variable_declaration

// ------------------------------------

  fun greet() {
//^ start range.function[1]
//        █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  fun getDisplayName(u: User): String {
//^ start range.function[1]
//                 █
      return u.firstName + " " + u.lastName
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

