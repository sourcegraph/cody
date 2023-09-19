// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// Tree-sitter query:
//
// (_ ("{")) @blocks
// 
// [(try_statement)
//  (if_statement)] @parents
// ------------------------------------

  interface kek {
//              █
      value: string
//    ^^^^^^ ^^^^^^
  }
//^

// ------------------------------------

  export function pek() {
//                      █
      const data: kek = {
//    ^^^^^ ^^^^^ ^^^ ^ ^
          value: 'wow',
//        ^^^^^^ ^^^^^^
      }
//    ^
      return data
//    ^^^^^^ ^^^^
  }
//^

  export const hmmm = 1

// ------------------------------------

  class Animal {
//             █
      constructor() {}
//    ^^^^^^^^^^^^^ ^^
  }
//^

// ------------------------------------

  export class Doggo extends Animal {
      public bark() {
//                  █
          return {}
//        ^^^^^^ ^^
      }
//    ^
  }

// ------------------------------------

  export function inconsistentIndentation() {
      if (Doggo) {
          const value = null; const arrow = () => {
//                                                █
              console.log('Hello World!');
//            ^^^^^^^^^^^^^^^^^^ ^^^^^^^^^
          }
//        ^
      } else {
          const a = 1
      }
  }

// ------------------------------------
// Captures the whole if_statement block

  export function whatIf() {
      if (Doggo) {
//    ^^ ^^^^^^^ █
          console.log('You are right!')
//        ^^^^^^^^^^^^^^^^ ^^^ ^^^^^^^^
      } else {
//    ^ ^^^^ ^
          console.log('Nope -_-')
//        ^^^^^^^^^^^^^^^^^ ^^^^^
      }
//    ^
  }

// ------------------------------------
// Captures the whole try_statement block

  export function tryHard() {
      try {
//    ^^^ █
          new Doggo()
//        ^^^ ^^^^^^^
      } catch (error) {
//    ^ ^^^^^ ^^^^^^^ ^
          console.error('Opps!')
//        ^^^^^^^^^^^^^^^^^^^^^^
      } finally {
//    ^ ^^^^^^^ ^
          console.log('Done trying...')
//        ^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^
      }
//    ^
  }
