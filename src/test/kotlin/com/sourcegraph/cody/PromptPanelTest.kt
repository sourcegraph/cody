package com.sourcegraph.cody

import junit.framework.TestCase

class PromptPanelTest : TestCase() {
  fun `test findAtExpressions`() {
    data class Case(val text: String, val expected: List<AtExpression>)
    val cases =
        listOf(
            Case(
                "@some-file what does this file do?",
                listOf(AtExpression(0, "@some-file".length, "@some-file", "some-file"))),
            Case(
                "foo @file1 @file2 bar @file3",
                listOf(
                    AtExpression("foo ".length, "foo ".length + "@file1".length, "@file1", "file1"),
                    AtExpression(
                        "foo @file1 ".length,
                        "foo @file1 ".length + "@file2".length,
                        "@file2",
                        "file2"),
                    AtExpression(
                        "foo @file1 @file2 bar ".length,
                        "foo @file1 @file2 bar ".length + "@file3".length,
                        "@file3",
                        "file3"),
                )),
            Case(
                """foo @file\ with\ spaces bar""",
                listOf(
                    AtExpression(
                        "foo ".length,
                        "foo ".length + "@file\\ with\\ spaces".length,
                        "@file\\ with\\ spaces",
                        "file with spaces"),
                )),
            Case("@", listOf(AtExpression(0, 1, "@", ""))),
            Case("foo @", listOf(AtExpression("foo ".length, "foo @".length, "@", ""))),
            Case("@ foo", listOf(AtExpression(0, 1, "@", ""))),
            Case("foo@email.com", listOf()),
        )

    for (case in cases) {
      assertEquals(case.expected, PromptPanel.findAtExpressions(case.text))
    }
  }
}
