// fn main() {

struct Creature {
    //      |
}

// ------------------------------------

struct Animal {
    name: String,
    //      |
    type: String
}

// ------------------------------------

struct User {
    name: String,
    first_name: String,
    last_name: String,
    //      |
    email: String
}

// ------------------------------------

trait Stringer {
    //      |
    fn string(&self) -> String;
}

// ------------------------------------

trait SuperStringer: Stringer {
    //      |
}

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
    let y = 4;
    //      |
}

// ------------------------------------

fn greet() {
//      |
}

// ------------------------------------

fn get_display_name(u: &User) -> String {
    let mut name = String::new();
    //      |
    name.push_str(&u.first_name);
    name.push_str(" ");
    name.push_str(&u.last_name);
    name
}

// ------------------------------------

use mycrate::{
    //      |
    math::{add, subtract},
    io::{read_file, write_file},
    ui::{create_button, create_menu}
};

// ------------------------------------

impl Stringer for Person {
    fn string(&self) -> String {
        //      |
      format!("{} ({} years old)", self.name, self.age)
    }
  }
