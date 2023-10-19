// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  package main

  import "fmt"

  type Person struct {
//                   ^ start trigger[1]
//                   █
      Name string
      Age  int
  }
//^ end trigger[1]

// Nodes types:
// trigger[1]: field_declaration_list

// ------------------------------------

  func greet(name string) {
//                        ^ start trigger[1]
//                        █
      fmt.Println("Hello,", name)
  }
//^ end trigger[1]

// Nodes types:
// trigger[1]: block

// ------------------------------------

  func printNumbers() {
      for i := 0; i < 10; i++ {
//                            ^ start trigger[1]
//                            █
          fmt.Println(i)
      }
//    ^ end trigger[1]
  }

// Nodes types:
// trigger[1]: block

// ------------------------------------

  func compare(x int) {
      if x > 5 {
//    ^ start trigger[1]
//             █
          fmt.Println("Greater than 5")
      } else {
          fmt.Println("Less than or equal to 5")
      }
//    ^ end trigger[1]
  }

// Nodes types:
// trigger[1]: if_statement

// ------------------------------------

  var arr = [5]int{
//                ^ start trigger[1]
//                █
      1, 2, 3, 4, 5,
  }
//^ end trigger[1]

// Nodes types:
// trigger[1]: literal_value

// ------------------------------------

  var dictionary = map[string]string{
//                                  ^ start trigger[1]
//                                  █
      "apple": "A fruit",
      "book":  "Something you read",
  }
//^ end trigger[1]

// Nodes types:
// trigger[1]: literal_value

// ------------------------------------

  type Shape interface {
//           ^ start trigger[1]
//                     █
      Area() float64
  }
//^ end trigger[1]

// Nodes types:
// trigger[1]: interface_type

