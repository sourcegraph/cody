// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  function ComponentObject() {
      return <button onClick={}></button>
//                           ^^ jsx_attribute.value[1]
//                           █
  }

// Nodes types:
// jsx_attribute.value[1]: jsx_expression

// ------------------------------------

  function ComponentString() {
      return <div color=""></div>
//                      ^^ jsx_attribute.value[1]
//                      █
  }

// Nodes types:
// jsx_attribute.value[1]: string

