import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import type { CompletionParameters } from '@sourcegraph/cody-shared'

import { completion } from '../test-helpers'

import { getInlineCompletionsInsertText, params } from './helpers'

describe('[getInlineCompletions] languages', () => {
    it('works with python', async () => {
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for i in range(11):
                        if i % 2 == 0:
                            █
                `,
                [
                    completion`
                            ├print(i)
                        elif i % 3 == 0:
                            print(f"Multiple of 3: {i}")
                        else:
                            print(f"ODD {i}")

                    for i in range(12):
                        print("unrelated")┤`,
                ],
                {
                    languageId: 'python',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )
        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
          "print(i)
              elif i % 3 == 0:
                  print(f"Multiple of 3: {i}")
              else:
                  print(f"ODD {i}")"
        `)
    })

    it('works with java', async () => {
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                [
                    completion`
                            ├System.out.println(i);
                        } else if (i % 3 == 0) {
                            System.out.println("Multiple of 3: " + i);
                        } else {
                            System.out.println("ODD " + i);
                        }
                    }

                    for (int i = 0; i < 12; i++) {
                        System.out.println("unrelated");
                    }┤`,
                ],
                {
                    languageId: 'java',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )
        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
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
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0)
                        {
                            █
                `,
                [
                    completion`
                            ├Console.WriteLine(i);
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
                    }┤`,
                ],
                {
                    languageId: 'csharp',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )
        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
                "Console.WriteLine(i);
                    }"
            `)
    })

    it('works with c++', async () => {
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                [
                    completion`
                            ├std::cout << i;
                        } else if (i % 3 == 0) {
                            std::cout << "Multiple of 3: " << i;
                        } else  {
                            std::cout << "ODD " << i;
                        }
                    }

                    for (int i = 0; i < 12; i++) {
                        std::cout << "unrelated";
                    }┤`,
                ],
                {
                    languageId: 'cpp',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )
        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
          "std::cout << i;
              } else if (i % 3 == 0) {
                  std::cout << "Multiple of 3: " << i;
              } else  {
                  std::cout << "ODD " << i;
              }"
        `)
    })

    it('works with c', async () => {
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                [
                    completion`
                            ├printf("%d", i);
                        } else if (i % 3 == 0) {
                            printf("Multiple of 3: %d", i);
                        } else {
                            printf("ODD %d", i);
                        }
                    }

                    for (int i = 0; i < 12; i++) {
                        printf("unrelated");
                    }┤`,
                ],
                {
                    languageId: 'c',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )

        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
          "printf("%d", i);
              } else if (i % 3 == 0) {
                  printf("Multiple of 3: %d", i);
              } else {
                  printf("ODD %d", i);
              }"
        `)
    })

    it('works with php', async () => {
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for ($i = 0; $i < 11; $i++) {
                        if ($i % 2 == 0) {
                            █
                `,
                [
                    completion`
                            ├echo $i;
                        } else if ($i % 3 == 0) {
                            echo "Multiple of 3: " . $i;
                        } else {
                            echo "ODD " . $i;
                        }
                    }

                    for ($i = 0; $i < 12; $i++) {
                        echo "unrelated";
                    }┤`,
                ],
                {
                    languageId: 'c',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )

        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
          "echo $i;
              } else if ($i % 3 == 0) {
                  echo "Multiple of 3: " . $i;
              } else {
                  echo "ODD " . $i;
              }"
        `)
    })

    it('works with dart', async () => {
        const requests: CompletionParameters[] = []
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                [
                    completion`
                            ├print(i);
                        } else if (i % 3 == 0) {
                          print('Multiple of 3: $i');
                        } else {
                          print('ODD $i');
                        }
                      }

                      for (int i = 0; i < 12; i++) {
                        print('unrelated');
                      }┤`,
                ],
                {
                    languageId: 'dart',
                    onNetworkRequest(params) {
                        requests.push(params)
                    },
                }
            )
        )

        expect(requests).toBeMultiLine()
        expect(items[0]).toMatchInlineSnapshot(`
              "print(i);
                  } else if (i % 3 == 0) {
                      print('Multiple of 3: $i');
                  } else {
                      print('ODD $i');
                  }"
            `)
    })
})
