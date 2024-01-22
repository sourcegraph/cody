package com.sourcegraph.vcs

import java.net.URL

fun convertGitCloneURLToCodebaseNameOrError(cloneURL: String): String {

  // Handle common Git SSH URL format
  val matchResult = Regex("""^[\w-]+@([^:]+):([\w-]+)/([\w-]+)(\.git)?$""").find(cloneURL)
  if (matchResult != null) {
    val (host, owner, repo) = matchResult.destructured
    return "$host/$owner/$repo"
  }

  val uri = URL(cloneURL)

  // Handle Azure DevOps URLs
  if (uri.host?.contains("dev.azure") == true && uri.path.isNotEmpty()) {
    return "${uri.host}${uri.path.replace("/_git", "")}"
  }

  // Handle GitHub URLs
  if (uri.protocol?.startsWith("github") == true || uri.toString().startsWith("github")) {
    return "github.com/${uri.path.replace(".git", "")}"
  }

  // Handle GitLab URLs
  if (uri.protocol?.startsWith("gitlab") == true || uri.toString().startsWith("gitlab")) {
    return "gitlab.com/${uri.path.replace(".git", "")}"
  }

  // Handle HTTPS URLs
  if (uri.protocol?.startsWith("http") == true && uri.host != null && uri.path.isNotEmpty()) {
    return "${uri.host}${uri.path.replace(".git", "")}"
  }

  // Generic URL
  if (uri.host != null && uri.path.isNotEmpty()) {
    return "${uri.host}${uri.path.replace(".git", "")}"
  }

  return ""
}
