package com.sourcegraph.vcs

import java.net.URI

fun convertGitCloneURLToCodebaseNameOrError(cloneURL: String): String {

  // Handle common Git SSH URL format
  val sshUrlRegexMatchResult = Regex("""^[\w-]+@([^:]+):([\w-]+)/([\w-.]+)$""").find(cloneURL)
  if (sshUrlRegexMatchResult != null) {
    val (host, owner, repo) = sshUrlRegexMatchResult.destructured
    return "$host/$owner/${repo.replace(".git$".toRegex(), "")}"
  }

  val uri = URI(cloneURL)

  // Handle Azure DevOps URLs
  if (uri.host?.contains("dev.azure") == true && !uri.path.isNullOrEmpty()) {
    return "${uri.host}${uri.path.replace("/_git", "")}"
  }

  // Handle GitHub URLs
  if (uri.scheme?.startsWith("github") == true) {
    return "github.com/${uri.schemeSpecificPart.replace(".git", "")}"
  }

  // Handle GitLab URLs
  if (uri.scheme?.startsWith("gitlab") == true) {
    return "gitlab.com/${uri.schemeSpecificPart.replace(".git", "")}"
  }

  // Handle HTTPS URLs
  if (uri.scheme?.startsWith("http") == true &&
      !uri.host.isNullOrEmpty() &&
      !uri.path.isNullOrEmpty()) {
    return "${uri.host}${uri.path?.replace(".git", "")}"
  }

  // Generic URL
  if (uri.host != null && !uri.path.isNullOrEmpty()) {
    return "${uri.host}${uri.path.replace(".git", "")}"
  }

  throw Exception("Cody could not extract repo name from clone URL $cloneURL")
}
