package com.sourcegraph.vcs

import com.intellij.testFramework.UsefulTestCase.assertThrows
import junit.framework.TestCase

class ConvertUtilTest : TestCase() {

  fun `test conversion Azure DevOps UR`() {
    assertEquals(
        "dev.azure.com/organization/project/repository",
        convertGitCloneURLToCodebaseNameOrError(
            "https://dev.azure.com/organization/project/_git/repository"))
  }

  fun `test conversion GitHub SSH UR`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@github.com:sourcegraph/sourcegraph.git"))
  }

  fun `test conversion GitHub SSH URL with different user`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError(
            "jdsbcnuqwew@github.com:sourcegraph/sourcegraph.git"))
  }

  fun `test conversion GitHub SSH URL with the port number`() {
    assertEquals(
        "gitlab-my-company.net/path/repo",
        convertGitCloneURLToCodebaseNameOrError(
            "ssh://git@gitlab-my-company.net:20022/path/repo.git"))
  }

  fun `test conversion GitHub SSH URL no trailing git`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@github.com:sourcegraph/sourcegraph"))
  }

  fun `test conversion GitHub HTTPS UR`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("https://github.com/sourcegraph/sourcegraph"))
  }

  fun `test conversion Bitbucket HTTPS UR`() {
    assertEquals(
        "bitbucket.org/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError(
            "https://username@bitbucket.org/sourcegraph/sourcegraph.git"))
  }

  fun `test conversion Bitbucket SSH UR`() {
    assertEquals(
        "bitbucket.sgdev.org/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError(
            "git@bitbucket.sgdev.org:sourcegraph/sourcegraph.git"))
  }

  fun `test conversion GitLab SSH UR`() {
    assertEquals(
        "gitlab.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@gitlab.com:sourcegraph/sourcegraph.git"))
  }

  fun `test conversion GitLab HTTPS UR`() {

    assertEquals(
        "gitlab.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("https://gitlab.com/sourcegraph/sourcegraph.git"))
  }

  fun `test conversion GitHub SSH URL with Git`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("git@github.com:sourcegraph/sourcegraph.git"))
  }

  fun `test conversion Eriks SSH Alias UR`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("github:sourcegraph/sourcegraph"))
  }

  fun `test conversion HTTP UR`() {
    assertEquals(
        "github.com/sourcegraph/sourcegraph",
        convertGitCloneURLToCodebaseNameOrError("http://github.com/sourcegraph/sourcegraph"))
  }

  private fun invalidConversion() = convertGitCloneURLToCodebaseNameOrError("invalid")

  fun `test if returns null for invalid URL`() {
    assertThrows(Exception::class.java) { invalidConversion() }
  }

  fun `test conversion URLs with dots in the repo name`() {
    assertEquals(
        "github.com/philipp-spiess/philippspiess.com",
        convertGitCloneURLToCodebaseNameOrError(
            "git@github.com:philipp-spiess/philippspiess.com.git"))
  }
}
