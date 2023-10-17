// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  package main

  import "fmt"

  type Person struct {
//                   ^ start blocks[1]
//                   █
      Name string
      Age  int
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: field_declaration_list

// ------------------------------------

  func greet(name string) {
//                        ^ start blocks[1]
//                        █
      fmt.Println("Hello,", name)
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: block

// ------------------------------------

  func printNumbers() {
      for i := 0; i < 10; i++ {
//                            ^ start blocks[1]
//                            █
          fmt.Println(i)
      }
//    ^ end blocks[1]
  }

// Nodes types:
// blocks[1]: block

// ------------------------------------

  func compare(x int) {
      if x > 5 {
//    ^ start blocks[1]
//             █
          fmt.Println("Greater than 5")
      } else {
          fmt.Println("Less than or equal to 5")
      }
//    ^ end blocks[1]
  }

// Nodes types:
// blocks[1]: if_statement

// ------------------------------------

  var arr = [5]int{
//                ^ start blocks[1]
//                █
      1, 2, 3, 4, 5,
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: literal_value

// ------------------------------------

  var dictionary = map[string]string{
//                                  ^ start blocks[1]
//                                  █
      "apple": "A fruit",
      "book":  "Something you read",
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: literal_value

// ------------------------------------

  type Shape interface {
//           ^ start blocks[1]
//                     █
      Area() float64
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: interface_type

