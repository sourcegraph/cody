package com.sourcegraph.vcs

import com.intellij.dvcs.repo.VcsRepositoryManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.vcsUtil.VcsUtil
import git4idea.GitLocalBranch
import git4idea.GitStandardRemoteBranch
import git4idea.repo.GitBranchTrackInfo
import git4idea.repo.GitRemote
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryManager
import org.junit.Test
import org.mockito.Mockito
import org.mockito.Mockito.`when`

class RepoUtilTest : BasePlatformTestCase() {

  @Test
  fun testGetRepoInfo_WithNonNullRepoRootPath() {
    val project = myFixture.project
    val file = myFixture.createFile("file.txt", "")

    val gitRemote =
        GitRemote(
            /* name = */ GitRemote.ORIGIN,
            /* urls = */ listOf("https://github.com/sourcegraph/jetbrains.git"),
            /* pushUrls = */ emptyList(),
            /* fetchRefSpecs = */ emptyList(),
            /* pushRefSpecs = */ emptyList())

    val gitLocalBranch = GitLocalBranch("mkondratek/great-new-feature")
    val gitRemoteBranch = GitStandardRemoteBranch(gitRemote, "mkondratek/great-new-feature")

    val gitRepo = Mockito.mock(GitRepository::class.java)
    `when`(gitRepo.root).thenReturn(file.parent)
    `when`(gitRepo.currentBranch).thenReturn(gitLocalBranch)
    `when`(gitRepo.remotes).thenReturn(mutableListOf(gitRemote))
    `when`(gitRepo.getBranchTrackInfo(Mockito.anyString()))
        .thenReturn(GitBranchTrackInfo(gitLocalBranch, gitRemoteBranch, false))

    val vcsUtil = Mockito.mockStatic(VcsUtil::class.java)
    vcsUtil.`when`<VirtualFile> { VcsUtil.getVcsRootFor(project, file) }.thenReturn(file.parent)

    val vcsRepositoryManagerInstance = Mockito.mock(VcsRepositoryManager::class.java)
    `when`(vcsRepositoryManagerInstance.getRepositoryForFile(file)).thenReturn(gitRepo)
    val gitRepositoryManagerInstance = Mockito.mock(GitRepositoryManager::class.java)
    `when`(gitRepositoryManagerInstance.getRepositoryForRoot(file.parent)).thenReturn(gitRepo)

    val vcsRepositoryManager = Mockito.mockStatic(VcsRepositoryManager::class.java)
    vcsRepositoryManager
        .`when`<VcsRepositoryManager> { VcsRepositoryManager.getInstance(project) }
        .thenReturn(vcsRepositoryManagerInstance)

    val gitRepositoryManager = Mockito.mockStatic(GitRepositoryManager::class.java)
    gitRepositoryManager
        .`when`<GitRepositoryManager> { GitRepositoryManager.getInstance(project) }
        .thenReturn(gitRepositoryManagerInstance)

    val repoInfo = RepoUtil.getRepoInfo(project, file)

    assertEquals(VCSType.GIT, repoInfo.vcsType)
    assertEquals("github.com/sourcegraph/jetbrains", repoInfo.remoteUrl)
    assertEquals("mkondratek/great-new-feature", repoInfo.remoteBranchName)
    assertEquals("file.txt", repoInfo.relativePath)
  }
}
