// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  func nestedVar() {
//^ start range.function[1]
      y := 4
//    █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

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
      return u.FirstName + " " + u.LastName
//                 █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: method_declaration

// ------------------------------------

  func funcFactory(mystring string) func(before, after string) string {
      return func(before, after string) string {
//           ^ start range.function[1]
//             █
          return fmt.Sprintf("%s %s %s", before, mystring, after)
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: func_literal

// ------------------------------------

  func funcFactory(mystring string) func(before, after string) string {
//^ start range.function[1]
//     ^^^^^^^^^^^ symbol.function[1]
//        █
      return func(before, after string) string {
          return fmt.Sprintf("%s %s %s", before, mystring, after)
      }
  }
//^ end range.function[1]

// Nodes types:
// symbol.function[1]: identifier
// range.function[1]: function_declaration

// ------------------------------------

  func() {
//^ start range.function[1]
      fmt.Println("I'm an anonymous function!")
//        █
  }()
//^ end range.function[1]

// Nodes types:
// range.function[1]: func_literal

// ------------------------------------

  var varFunction = func(name string) {
//                  ^ start range.function[1]
      fmt.Println("Hello,", name)
//        █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: func_literal

