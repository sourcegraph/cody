package utils

import com.intellij.openapi.util.TextRange
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.text.findTextRange
import com.sourcegraph.utils.CodyFormatter
import junit.framework.TestCase

class CodyFormatterTest : BasePlatformTestCase() {
  private val argsString = "String[] args"
  private val testFileContent =
      """|
         |public class HelloWorld {
         |    public static void main(${argsString}) {
         |        System.out.println("Hello World!");
         |        // MAIN
         |    }
         |    // CLASS
         |}"""
          .trimMargin()

  private var argListOffset = testFileContent.indexOf(argsString)
  private var insideMainOffset = testFileContent.indexOf("// MAIN")
  private var insideClassOffset = testFileContent.indexOf("// CLASS")

  private fun formatText(
      toFormat: String,
      offset: Int,
      range: TextRange = TextRange(offset, offset),
      fileContent: String = testFileContent
  ): String {
    val psiFile = myFixture.addFileToProject("CodyFormatterTest.java", fileContent)
    return CodyFormatter.formatStringBasedOnDocument(
        toFormat, myFixture.project, psiFile.viewProvider.document, range, offset)
  }

  fun `test single line formatting`() {
    TestCase.assertEquals("int x = 2;", formatText("int   x =   2;", insideMainOffset))
  }

  fun `test single line formatting with overlapping range`() {
    val range = TextRange(argListOffset, argListOffset + argsString.length)
    // 'String[]   args' is existing text in the editor, so we do not want to reformat it, but we
    // want to format the rest
    TestCase.assertEquals(
        "String[]   args, int n", formatText("String[]   args,   int   n", range.endOffset))
  }

  fun `test single line formatting to multiline`() {
    TestCase.assertEquals(
        """|
           |    public static int fib(int n) {
           |        if (n <= 1) {
           |            return n;
           |        }
           |        return fib(n - 1) + fib(n - 2);
           |    }"""
            .trimMargin(),
        formatText(
            "public static int fib(int n) { if (n <= 1) { return n; } return fib(n-1) + fib(n-2);  }",
            insideClassOffset))
  }

  fun `test formatting into fewer lines`() {
    val original =
        """|
           |    public static void fib(
           |    int n,
           |
           |
           |
           |
           |    int dummy
           |    ) {
           |    }"""
            .trimMargin()
    val originalEndOffset = insideClassOffset + original.length
    val testFileContent = testFileContent.replace("// CLASS", original)
    TestCase.assertEquals(
        """|
           |    public static void fib(
           |            int n,
           |
           |
           |            int dummy
           |    ) {
           |    }"""
            .trimMargin(),
        formatText(
            original,
            insideClassOffset,
            TextRange(insideClassOffset, originalEndOffset),
            testFileContent))
  }

  fun `test fix for IJ formatter bug`() {
    val existingLine = "    public static void test()    "
    val completion = "$existingLine  { }"
    val testFileContent =
        """|public class HelloWorld {
           |$existingLine
           |}"""
            .trimMargin()

    val rangeStart = testFileContent.indexOf(existingLine)
    val rangeEnd = rangeStart + existingLine.length

    TestCase.assertEquals(
        """|    public static void test()    {
           |    }"""
            .trimMargin(),
        formatText(completion, rangeEnd, TextRange(rangeStart, rangeEnd), testFileContent))
  }

  fun `test formatting with cursor in the middle of the line`() {
    val existingLine = "VirtualFile vcsRoot = VcsUtil.getVcsRootFor(project, file);"
    val testFileContent = testFileContent.replace("// MAIN", existingLine)
    val range = testFileContent.findTextRange(existingLine)
    val offset = testFileContent.indexOf("file")

    TestCase.assertEquals(existingLine, formatText(existingLine, offset, range!!, testFileContent))
  }
}
