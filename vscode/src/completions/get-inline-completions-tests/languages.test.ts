import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { getInlineCompletionsWithInlinedChunks } from './helpers'

describe('[getInlineCompletions] languages', () => {
    it('works with python', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            `for i in range(11):
                if i % 2 == 0:
                    █print(i)
                elif i % 3 == 0:
                    print(f"Multiple of 3: {i}")
                else:
                    print(f"ODD {i}")

            for i in range(12):
                print("unrelated")█
            `,
            {
                languageId: 'python',
            }
        )

        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "print(i)
              elif i % 3 == 0:
                  print(f"Multiple of 3: {i}")
              else:
                  print(f"ODD {i}")"
        `)
    })

    it('works with java', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            dedent`
                for (int i = 0; i < 11; i++) {
                    if (i % 2 == 0) {
                        █System.out.println(i);
                    } else if (i % 3 == 0) {
                        System.out.println("Multiple of 3: " + i);
                    } else {
                        System.out.println("ODD " + i);
                    }
                }

                for (int i = 0; i < 12; i++) {
                    System.out.println("unrelated");
                }█`,
            {
                languageId: 'java',
            }
        )
        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "System.out.println(i);
          } else if (i % 3 == 0) {
              System.out.println("Multiple of 3: " + i);
          } else {
              System.out.println("ODD " + i);
          }"
        `)
    })

    // TODO: Detect `}\nelse\n{` pattern for else skip logic
    it('works with csharp', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            dedent`
                for (int i = 0; i < 11; i++) {
                    if (i % 2 == 0)
                    {
                        █Console.WriteLine(i);
                    }
                    else if (i % 3 == 0)
                    {
                        Console.WriteLine("Multiple of 3: " + i);
                    }
                    else
                    {
                        Console.WriteLine("ODD " + i);
                    }

                }

                for (int i = 0; i < 12; i++)
                {
                    Console.WriteLine("unrelated");
                }█
            `,
            {
                languageId: 'csharp',
            }
        )
        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "Console.WriteLine(i);
          }"
        `)
    })

    it('works with c++', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            dedent`
                for (int i = 0; i < 11; i++) {
                    if (i % 2 == 0) {
                        █std::cout << i;
                    } else if (i % 3 == 0) {
                        std::cout << "Multiple of 3: " << i;
                    } else  {
                        std::cout << "ODD " << i;
                    }
                }

                for (int i = 0; i < 12; i++) {
                    std::cout << "unrelated";
                }█`,
            {
                languageId: 'cpp',
            }
        )

        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "std::cout << i;
          } else if (i % 3 == 0) {
              std::cout << "Multiple of 3: " << i;
          } else  {
              std::cout << "ODD " << i;
          }"
        `)
    })

    it('works with c', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            dedent`
                for (int i = 0; i < 11; i++) {
                    if (i % 2 == 0) {
                        █printf("%d", i);
                    } else if (i % 3 == 0) {
                        printf("Multiple of 3: %d", i);
                    } else {
                        printf("ODD %d", i);
                    }
                }

                for (int i = 0; i < 12; i++) {
                    printf("unrelated");
                }█`,
            {
                languageId: 'c',
            }
        )

        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "printf("%d", i);
          } else if (i % 3 == 0) {
              printf("Multiple of 3: %d", i);
          } else {
              printf("ODD %d", i);
          }"
        `)
    })

    it('works with php', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            dedent`
                for ($i = 0; $i < 11; $i++) {
                    if ($i % 2 == 0) {
                        █echo $i;
                    } else if ($i % 3 == 0) {
                        echo "Multiple of 3: " . $i;
                    } else {
                        echo "ODD " . $i;
                    }
                }

                for ($i = 0; $i < 12; $i++) {
                    echo "unrelated";
                }█`,
            {
                languageId: 'c',
            }
        )

        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "echo $i;
          } else if ($i % 3 == 0) {
              echo "Multiple of 3: " . $i;
          } else {
              echo "ODD " . $i;
          }"
        `)
    })

    it('works with dart', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            dedent`
                for (int i = 0; i < 11; i++) {
                    if (i % 2 == 0) {
                        █print(i);
                    } else if (i % 3 == 0) {
                        print('Multiple of 3: $i');
                    } else {
                        print('ODD $i');
                    }
                    }

                    for (int i = 0; i < 12; i++) {
                    print('unrelated');
                    }█`,
            {
                languageId: 'dart',
            }
        )

        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "print(i);
          } else if (i % 3 == 0) {
              print('Multiple of 3: $i');
          } else {
              print('ODD $i');
          }"
        `)
    })

    it('works with kotlin', async () => {
        const { items, docContext } = await getInlineCompletionsWithInlinedChunks(
            `fun main() {
                for (i in 0..10) {
                    if (i % 2 == 0) {
                        █println(i)
                    } else if (i % 3 == 0) {
                        println("Multiple of 3: $i")
                    } else {
                        println("ODD $i")
                    }
                }

                for (i in 0..11) {
                    println("unrelated")
                }
            }█`,
            {
                languageId: 'kotlin',
            }
        )

        expect(docContext.multilineTrigger).toBeTruthy()
        expect(items[0].insertText).toMatchInlineSnapshot(`
          "println(i)
                  } else if (i % 3 == 0) {
                      println("Multiple of 3: $i")
                  } else {
                      println("ODD $i")
                  }"
        `)
    })
})
