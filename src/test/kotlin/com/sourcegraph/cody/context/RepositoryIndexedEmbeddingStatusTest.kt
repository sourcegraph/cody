package com.sourcegraph.cody.context

import junit.framework.TestCase

class RepositoryIndexedEmbeddingStatusTest : TestCase() {

  fun `test simple repository name as-is`() {
    val status = RepositoryIndexedEmbeddingStatus("sourcegraph")
    assertEquals("sourcegraph", status.getMainText())
  }

  fun `test infer repository name from URL path`() {
    val status = RepositoryIndexedEmbeddingStatus("github.com/sourcegraph/")
    assertEquals("sourcegraph", status.getMainText())
  }

  fun `test infer repository name from URL last path segment`() {
    val status = RepositoryIndexedEmbeddingStatus("github.com/sourcegraph/cody")
    assertEquals("cody", status.getMainText())
  }
}
