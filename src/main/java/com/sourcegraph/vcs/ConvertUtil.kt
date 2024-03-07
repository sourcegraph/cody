package com.sourcegraph.vcs

import java.net.URI

data class CodebaseName(val value: String)

fun convertGitCloneURLToCodebaseNameOrError(theCloneURL: String): CodebaseName {
  val cloneURL = theCloneURL.lowercase()

  // Handle common Git SSH URL format
  val sshUrlRegexMatchResult = Regex("""^[\w-]+@([^:]+):([\w-]+)/([\w-.]+)$""").find(cloneURL)
  if (sshUrlRegexMatchResult != null) {
    val (host, owner, repo) = sshUrlRegexMatchResult.destructured
    return CodebaseName("$host/$owner/${repo.replace(".git$".toRegex(), "")}")
  }

  var uri = URI(cloneURL)
  if (uri.scheme == null) {
    uri = URI("http://$cloneURL")
  }

  // Handle Azure DevOps URLs
  if (uri.host?.contains("dev.azure") == true && !uri.path.isNullOrEmpty()) {
    return CodebaseName("${uri.host}${uri.path.replace("/_git", "")}")
  }

  // Handle GitHub URLs
  if (uri.scheme?.startsWith("github") == true) {
    return CodebaseName("github.com/${uri.schemeSpecificPart.replace(".git", "")}")
  }

  // Handle GitLab URLs
  if (uri.scheme?.startsWith("gitlab") == true) {
    return CodebaseName("gitlab.com/${uri.schemeSpecificPart.replace(".git", "")}")
  }

  // Handle HTTPS URLs
  if (uri.scheme?.startsWith("http") == true &&
      !uri.host.isNullOrEmpty() &&
      !uri.path.isNullOrEmpty()) {
    return CodebaseName("${uri.host}${uri.path?.replace(".git", "")}")
  }

  // Generic URL
  if (uri.host != null && !uri.path.isNullOrEmpty()) {
    return CodebaseName("${uri.host}${uri.path.replace(".git", "")}")
  }

  throw Exception("Cody could not extract repo name from clone URL $cloneURL")
}
