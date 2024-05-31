// 
// | - query start position in the source file.
// █ – query start position in the annotated file.
// ^ – characters matching the last query result.
//
// ------------------------------------

  /* wrapper */
  void wrapper()
  {
      void test()
//    ^ start range.function[1]
      {
//    ^ start symbol.function[1]
//           █
      }
//    ^ end symbol.function[1], range.function[1]
  }

// Nodes types:
// symbol.function[1]: compound_statement
// range.function[1]: function_definition

// ------------------------------------

  void test()
//^ start range.function[1]
  {
//^ start symbol.function[1]
//       █
  }
//^ end symbol.function[1], range.function[1]

// Nodes types:
// symbol.function[1]: compound_statement
// range.function[1]: function_definition

// ------------------------------------

  static void twoSum(int *nums, int numsSize, int target, int *returnSize)
//^ start range.function[1]
  {
      if (numsSize < 2)
      {
          return;
      }
      else
      {
          for (int i = 0; i < numsSize; i++)
          {
              for (int j = i + 1; j < numsSize; j++)
              {
                  if (nums[i] + nums[j] == target)
                  {
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
      int val2)
  {
      wrapper();
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

  void test_parameter(int val)
//^ start range.function[1]
  {
//^ start symbol.function[1]
//                    █
      wrapper();
  }
//^ end symbol.function[1], range.function[1]

// Nodes types:
// symbol.function[1]: compound_statement
// range.function[1]: function_definition

// ------------------------------------

  typedef struct
//        ^ start range.function[1]
  {
//         █
  } Agent;
//^ end range.function[1]

// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  typedef struct
//        ^ start range.function[1]
  {
//         █
      void (*__init__)(struct AgentMultiLine *self, char *name);
  } AgentMultiLine;
//^ end range.function[1]

// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  void AgentMultiLine__init__(AgentMultiLine *self, char *name)
//^ start range.function[1]
  {
//^ start symbol.function[1]
//       █
      self->name = name;
  }
//^ end symbol.function[1], range.function[1]

// Nodes types:
// symbol.function[1]: compound_statement
// range.function[1]: function_definition

// ------------------------------------

  typedef struct
//        ^ start range.function[1]
  {
      char *name;
//            █
  } Agent;
//^ end range.function[1]

// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  void Agent_test(Agent *self)
//^ start range.function[1]
  {
//^ start symbol.function[1]
//         █
  }
//^ end symbol.function[1], range.function[1]

// Nodes types:
// symbol.function[1]: compound_statement
// range.function[1]: function_definition

// ------------------------------------

  void return_statement()
//^ start range.function[1]
  {
      return;
//         █
  }
//^ end range.function[1]

// Nodes types:
// range.function[1]: function_definition

// ------------------------------------

int nums[] = {2, 7, 11, 15};
//       |

// ------------------------------------

char *user_name = "Tom";
//  |

// ------------------------------------

  enum Level
//^ start range.identifier[1]
  {
//        █
      LOW,
      MEDIUM,
      HIGH
  };
//^ end range.identifier[1]

// Nodes types:
// range.identifier[1]: enum_specifier

// ------------------------------------

#define TEST(name) void test_##name()

TEST(twoSum)
{
    int target = 9;
    int returnSize[2];
    int expected[] = {0, 1};
    // |
};

// ------------------------------------

  template <typename T> struct SampleStruct {
//                      ^ start range.function[1]
    template <typename ParseContext>
      auto parse(ParseContext &ctx) {
//           █
          return ctx.begin();
      }
  };
//^ end range.function[1]

// Nodes types:
// range.function[1]: struct_specifier

// ------------------------------------

  template <typename T> struct SampleStruct {
//                      ^ start range.function[1]
    template <typename ParseContext>
      auto parse(ParseContext &ctx) {
//           █
          return ctx.begin();
      }

        void foo() {
      }
  };
//^ end range.function[1]

// Nodes types:
// range.function[1]: struct_specifier

