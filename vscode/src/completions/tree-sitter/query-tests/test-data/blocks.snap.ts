// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  interface kek {
//              ^ start blocks[1]
//              █
      value: string
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: object_type

// ------------------------------------

  export function pek() {
//                      ^ start blocks[1]
//                      █
      const data: kek = {
          value: 'wow',
      }
      return data
  }
//^ end blocks[1]

  export const hmmm = 1

// Nodes types:
// blocks[1]: statement_block

// ------------------------------------

  class Animal {
//             ^ start blocks[1]
//             █
      constructor() {}
  }
//^ end blocks[1]

// Nodes types:
// blocks[1]: class_body

// ------------------------------------

  export class Doggo extends Animal {
      public bark() {
//                  ^ start blocks[1]
//                  █
          return {}
      }
//    ^ end blocks[1]
  }

// Nodes types:
// blocks[1]: statement_block

// ------------------------------------

  export function inconsistentIndentation() {
      if (Doggo) {
          const value = null; const arrow = () => {
//                                                ^ start blocks[1]
//                                                █
              console.log('Hello World!');
          }
//        ^ end blocks[1]
      } else {
          const a = 1
      }
  }

// Nodes types:
// blocks[1]: statement_block

// ------------------------------------
// Captures the whole if_statement block

  export function whatIf() {
      if (Doggo) {
//    ^ start blocks[1]
//               █
          console.log('You are right!')
      } else {
          console.log('Nope -_-')
      }
//    ^ end blocks[1]
  }

// Nodes types:
// blocks[1]: if_statement

// ------------------------------------
// Captures the whole try_statement block

  export function tryHard() {
      try {
//    ^ start blocks[1]
//        █
          new Doggo()
      } catch (error) {
          console.error('Opps!')
      } finally {
          console.log('Done trying...')
      }
//    ^ end blocks[1]
  }

// Nodes types:
// blocks[1]: try_statement

