/* wrapper */
void wrapper()
{
    void test()
    {
        // |
    }
}

// ------------------------------------

void test()
{
    // |
}

// ------------------------------------

static void twoSum(int *nums, int numsSize, int target, int *returnSize)
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
                    //  |
                    returnSize[0] = i;
                    returnSize[1] = j;
                    return;
                }
            }
        }
    }
}

// ------------------------------------

void test_multiline_func_declaration(
    //              |
    int val,
    int val2)
{
    wrapper();
}

// ------------------------------------

void test_parameter(int val)
{
    //              |
    wrapper();
}

// ------------------------------------

typedef struct
{
    //   |
} Agent;

// ------------------------------------

typedef struct
{
    //   |
    void (*__init__)(struct AgentMultiLine *self, char *name);
} AgentMultiLine;

// ------------------------------------

void AgentMultiLine__init__(AgentMultiLine *self, char *name)
{
    // |
    self->name = name;
}

// ------------------------------------

typedef struct
{
    char *name;
    //      |
} Agent;

// ------------------------------------

void Agent_test(Agent *self)
{
    //   |
}

// ------------------------------------

void return_statement()
{
    return;
    //   |
}

// ------------------------------------

return_statement('value');
//       |

// ------------------------------------

char *user_name = "Tom";
//  |

// ------------------------------------

enum Level
{
    //  |
    LOW,
    MEDIUM,
    HIGH
};
