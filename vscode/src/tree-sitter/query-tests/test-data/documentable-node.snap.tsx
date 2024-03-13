// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  function ComponentProp() {
//^ start range.function[1]
      return <button onClick={}>Click me</button>
//                       █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

// ------------------------------------

  function ComponentTag() {
//^ start range.function[1]
      return <div color="">Hello</div>
//             █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_declaration

