package com.sourcegraph.vcs

import com.intellij.testFramework.UsefulTestCase.assertThrows
import junit.framework.TestCase

class ConvertUtilTest : TestCase() {

  fun `test conversion Azure DevOps URL`() {
    assertEquals(
        "dev.azure.com/organization/project/repository",
        convertGitCloneURLToCodebaseNameOrError(
                "https://dev.azure.com/organization/project/_git/repository")
            .value)
  }

  fun `test conversion GitHub SSH URL`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@github.com:sourcegraph/sourcegraph.git").value)
  }

  fun `test conversion GitHub SSH URL with different user`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError(
                "jdsbcnuqwew@github.com:sourcegraph/sourcegraph.git")
            .value)
  }

  fun `test conversion GitHub SSH URL with the port number`() {
    assertEquals(
        "gitlab-my-company.net/path/repo",
        convertGitCloneURLToCodebaseNameOrError(
                "ssh://git@gitlab-my-company.net:20022/path/repo.git")
            .value)
  }

  fun `test conversion GitHub SSH URL no trailing git`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@github.com:sourcegraph/sourcegraph").value)
  }

  fun `test conversion GitHub HTTPS URL`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("https://github.com/sourcegraph/sourcegraph").value)
  }

  fun `test conversion Bitbucket HTTPS URL`() {
    assertEquals(
        "bitbucket.org/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError(
                "https://username@bitbucket.org/sourcegraph/sourcegraph.git")
            .value)
  }

  fun `test conversion Bitbucket SSH URL`() {
    assertEquals(
        "bitbucket.sgdev.org/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError(
                "git@bitbucket.sgdev.org:sourcegraph/sourcegraph.git")
            .value)
  }

  fun `test conversion GitLab SSH URL`() {
    assertEquals(
        "gitlab.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@gitlab.com:sourcegraph/sourcegraph.git").value)
  }

  fun `test conversion GitLab HTTPS URL`() {

    assertEquals(
        "gitlab.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("https://gitlab.com/sourcegraph/sourcegraph.git")
            .value)
  }

  fun `test conversion GitHub SSH URL with Git`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@github.com:sourcegraph/sourcegraph.git").value)
  }

  fun `test conversion Eriks SSH Alias URL`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("github:sourcegraph/sourcegraph").value)
  }

  fun `test conversion HTTP URL`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("http://github.com/sourcegraph/sourcegraph").value)
  }

  fun `test conversion URL`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("github.com/sourcegraph/sourcegraph").value)
  }

  private fun invalidConversion() = convertGitCloneURLToCodebaseNameOrError("invalid")

  fun `test if returns null for invalid URL`() {
    assertThrows(Exception::class.java) { invalidConversion() }
  }

  fun `test conversion URLs with dots in the repo name`() {
    assertEquals(
        "github.com/philipp-spiess/philippspiess.com",
        convertGitCloneURLToCodebaseNameOrError(
                "git@github.com:philipp-spiess/philippspiess.com.git")
            .value)
  }

  // sourcegraph/jetbrains#1194 the add repository dialog has a fallback when the user enters a repo
  // name instead of a clone URL. If changing the failure behavior here, ensure the add repository
  // dialog can still add "literal" repo names successfully.
  fun `converting "URLs" without protocols, paths should throw`() {
    assertThrows(Exception::class.java, "Cody could not extract repo name from clone URL host") {
      convertGitCloneURLToCodebaseNameOrError("cool-repo-name")
    }
  }
}
