// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  /* wrapper */
  void wrapper() {
      printf("wrapper\n");
      void test() {
//    ^ start range.function[1]
//           █
      }
//    ^ end range.function[1]
  }

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  void test() {
//^ start range.function[1]
//       █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  static void twoSum(int* nums, int numsSize, int target, int* returnSize) {
//^ start range.function[1]
      if (numsSize < 2) {
          return;
      } else {
          for (int i = 0; i < numsSize; i++) {
              for (int j = i + 1; j < numsSize; j++) {
                  if (nums[i] + nums[j] == target) {
//                        █
                      returnSize[0] = i;
                      returnSize[1] = j;
                      return;
                  }
              }
          }
      }
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  void test_multiline_func_declaration(
//^ start range.function[1]
//                    █
      int val,
      int val2
  ) {
      wrapper();
  }
//^ end range.function[1]


// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  void test_parameter(int val) {
//^ start range.function[1]
//                    █
      wrapper();
  }
//^ end range.function[1]


// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  typedef struct Agent {
//        ^ start range.function[1]
//         █
  } Agent;
//^ end range.function[1]


// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  typedef struct AgentMultiLine {
//        ^ start range.function[1]
//         █
      void (*__init__)(struct AgentMultiLine* self, char* name);
  } AgentMultiLine;
//^ end range.function[1]


// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  void AgentMultiLine__init__(struct AgentMultiLine* self, char* name) {
//^ start range.function[1]
//       █
      self->name = name;
  }
//^ end range.function[1]


// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  typedef struct Agent {
//        ^ start range.function[1]
      char* name;
//            █
  } Agent;
//^ end range.function[1]


// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  void Agent_test(struct Agent* self) {
//^ start range.function[1]
//         █
  }
//^ end range.function[1]


// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  void return_statement() {
//^ start range.function[1]
      return;
//         █
  }
//^ end range.function[1]


// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

return_statement('value');
//       |


// ------------------------------------

  char* user_name = "Tom";
//^^^^^^^^^^^^^^^^^^^^^^^^ symbol.identifier[1], range.identifier[1]
//        █

// Nodes types:
// symbol.identifier[1]: declaration
// range.identifier[1]: declaration

// ------------------------------------

  enum Level {
//^ start range.identifier[1]
//     ^^^^^ symbol.identifier[1]
//        █
      LOW,
      MEDIUM,
      HIGH
  };
//^ end range.identifier[1]

// Nodes types:
// symbol.identifier[1]: type_identifier
// range.identifier[1]: enum_specifier

