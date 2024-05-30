import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import { extractTestType, isTestFileForOriginal, isValidTestFile } from './test-commands'

describe('extractTestType', () => {
    it('extracts "unit" from test type', () => {
        const text = 'add unit tests here'
        const expected = 'unit'

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })

    it('extracts "e2e" from test type', () => {
        const text = 'missing e2e test coverage'
        const expected = 'e2e'

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })

    it('extracts "integration" from test type', () => {
        const text = 'needs more integration testing'
        const expected = 'integration'

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })

    it('returns empty string if no match', () => {
        const text = 'test this function'
        const expected = ''

        const result = extractTestType(text)

        expect(result).toEqual(expected)
    })
})

describe('isValidTestFile', () => {
    it.each([
        ['/path/to/testFile.java', false],
        ['/path/to/testFile.js', false],
        ['/path/to/test_file.py', true],
        ['/path/to/test-file.js', false],
        ['/path/to/node_modules/file.js', false],
        ['/path/to/node_modules/file_test.ts', true],
        ['/path/to/file.js', false],

        // Examples from various programming languages
        ['test_example.py', true],
        ['example.test.js', true],
        ['ExampleTest.java', true],
        ['example_spec.rb', true],
        ['ExampleTest.cs', true],
        ['ExampleTest.php', true],
        ['ExampleSpec.scala', true],
        ['example_test.go', true],
        ['ExampleTest.kt', true],
        ['ExampleTests.swift', true],
        ['example.spec.ts', true],
        ['ExampleTest.pl', true],
        ['example_test.rs', true],
        ['ExampleSpec.groovy', true],
        ['example_test.cpp', true],
        ['example_test.js', true],
        ['test_example.rb', true],
        ['test_logic.ts', false],
        ['test_logic.spec.ts', true],

        // Should not cache false positives
        ['contest.ts', false],
    ])('for filename %j it returns %j', (path, condition) => {
        expect(isValidTestFile(URI.file(path))).toBe(condition)
    })
})

describe('isTestFileForOriginal', () => {
    it.each([
        ['/path/to/file.java', '/path/to/testFile.java', true],
        ['/path/to/test/file.js', '/path/to/testFile.js', false],
        ['/path/to/test/file.py', '/path/to/test_file.py', false],
        ['/path/to/file.py', '/path/to/test_file.py', true],
        ['/path/to/file.js', '/path/to/test-file.js', true],
        ['/path/to/node_modules/file.js', '/path/to/node_modules/file_test.js', true],
        ['/path/to/node_modules/file_test.js', '/path/to/node_modules/file.js', true],
        ['example.rb', 'example_spec.rb', true],
        ['Example.cs', 'ExampleTest.cs', true],
        ['Example.groovy', 'ExampleSpec.groovy', true],
        ['example.rb', 'test_example.rb', true],
        ['/path/test/to/file.js', '/path/to/test-file.js', false],
        ['testClient.ts', 'testClient.test.ts', true],
        ['/src/main/java/com/example/MyClass.java', '/src/test/java/com/example/MyClassTest.java', true], // This follows the Maven/Gradle standard directory layout for Java.
        ['/src/main/kotlin/com/example/MyClass.kt', '/src/test/kotlin/com/example/MyClassTest.kt', true], // This is the preferred way to structure tests in Kotlin projects using Gradle or Maven.
        ['/src/main/scala/com/my/MyClass.scala', '/src/test/scala/com/my/MyClassSpec.scala', true], // This follows the sbt standard directory layout for Scala.
        ['/src/components/Button.js', '/src/components/__tests__/Button.test.js', true], // Jest encourages placing tests in a `__tests__` directory adjacent to the files they are testing.
        ['/src/server/app.ts', '/test/app.test.ts', true], // Common structure for backend projects using Mocha where test files are placed in a separate `test` directory.
        ['/src/server/models/User.js', '/src/server/models/User.spec.js', true], // Some projects prefer keeping tests next to the files they are testing with a `.spec.js` suffix.
        ['/project/module.py', '/tests/test_module.py', true], // This follows the convention of placing tests in a separate `tests` directory with a `test_` prefix.
        ['/project/package/module.py', '/project/package/test_module.py', true], // pytest allows tests to be placed in the same directory as the code with a `test_` prefix.
        ['/project/module.py', '/tests/module_tests.py', true], // Some projects using nose place tests in a separate `tests` directory with a `_tests` suffix.
        ['/src/project/main.go', '/src/project/main_test.go', true], // The Go testing package expects test files to be in the same directory with a `_test.go` suffix.
        ['/src/project/main.go', '/test/project/main_test.go', true], // Some projects prefer placing tests in a separate `test` directory.
        ['/test_logic.ts', 'test_logic.ts', false],
        ['a/b/Client.py', 'test/Client.py', true], // Test file located in a `test` directory adjacent to the file being tested.
        ['a/b/test_logic.ts', 'c/d/test_logic.ts', false], // Test file located in a different directory.
        ['a/b/Client.py', 'test/client.py', false], // Test file located in a `test` directory adjacent to the file being tested.
    ])('for file %j and test file %j it returns %j', (file, testFile, condition) => {
        expect(isTestFileForOriginal(URI.file(file), URI.file(testFile))).toBe(condition)
    })
})
