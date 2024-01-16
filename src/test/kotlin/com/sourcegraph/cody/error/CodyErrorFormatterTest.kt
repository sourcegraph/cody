package com.sourcegraph.cody.error

import junit.framework.TestCase

class CodyErrorFormatterTest : TestCase() {

  fun `test error markdown formatting`() {
    val error =
        CodyError(
            title = "java.lang.NullPointerException",
            pluginVersion = "5.2.18066-nightly",
            ideVersion = "IU-233.11799.241",
            additionalInfo = null,
            stacktrace =
                """
            java.lang.NullPointerException: Exception description
                at com.example.Some.handle(Some.java:326)
                ... 54 more
            """
                    .trimIndent())
    val markdown = CodyErrorFormatter.formatToMarkdown(error)
    val expectedMarkdown =
        """
            Plugin version: ```5.2.18066-nightly```
            IDE version: ```IU-233.11799.241```
            Exception: ```java.lang.NullPointerException```
            Stacktrace:
            ```text
            java.lang.NullPointerException: Exception description
                at com.example.Some.handle(Some.java:326)
                ... 54 more
            ```
        """
            .trimIndent()
    assertEquals(expectedMarkdown, markdown)
  }

  fun `test null report results empty markdown`() {
    val error = CodyError(null, null, null, null, null)
    val markdown = CodyErrorFormatter.formatToMarkdown(error)
    assertEquals("", markdown)
  }
}
