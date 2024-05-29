// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

// fn main() {

  struct Creature {
//^ start range.identifier[1]
//       ^^^^^^^^ symbol.identifier[1]
//            █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: struct_item

// ------------------------------------

  struct Animal {
//^ start range.identifier[1]
      name: String,
//            █
      type: String
  }
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: struct_item

// ------------------------------------

  struct User {
//^ start range.identifier[1]
      name: String,
      first_name: String,
      last_name: String,
//            █
      email: String
  }
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: struct_item

// ------------------------------------

  trait Stringer {
//^ start range.identifier[1]
//      ^^^^^^^^ symbol.identifier[1]
//            █
      fn string(&self) -> String;
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: trait_item

// ------------------------------------

  trait SuperStringer: Stringer {
//^ start range.identifier[1]
//      ^^^^^^^^^^^^^ symbol.identifier[1]
//            █
  }
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: trait_item

// ------------------------------------

type Key = i32;
//      |

// ------------------------------------

let person = (
    //      |
);

// ------------------------------------

let short_declaration = 4;
//      |

// ------------------------------------

const NAME: &str = "Tom";
//      |

// ------------------------------------

  fn nested_var() {
//^ start range.function[1]
      let y = 4;
//            █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_item

// ------------------------------------

  fn greet() {
//^ start range.function[1]
//   ^^^^^ symbol.function[1]
//        █
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: function_item

// ------------------------------------

  fn get_display_name(u: &User) -> String {
//^ start range.function[1]
      let mut name = String::new();
//            █
      name.push_str(&u.first_name);
      name.push_str(" ");
      name.push_str(&u.last_name);
      name
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_item

// ------------------------------------

  use mycrate::{
//^ start symbol.identifier[1], range.identifier[1]
//            █
      math::{add, subtract},
      io::{read_file, write_file},
      ui::{create_button, create_menu}
  };
// ^ end symbol.identifier[1], range.identifier[1]

// Nodes types:
// symbol.identifier[1]: use_declaration
// range.identifier[1]: use_declaration

// ------------------------------------

  impl Stringer for Person {
      fn string(&self) -> String {
//    ^ start range.function[1]
//                █
        format!("{} ({} years old)", self.name, self.age)
      }
//    ^ end range.function[1]
    }

// Nodes types:
// range.function[1]: function_item

