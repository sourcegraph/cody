package com.sourcegraph.vcs

import java.net.URL
import java.util.regex.Pattern

fun convertGitCloneURLToCodebaseNameOrError(cloneURL: String): String {

  // Handle common Git SSH URL format
  val sshUrlRegexMatchResult =
      Regex("""^[\w-]+@([^:]+):([\w-]+)/([\w-]+)(\.git)?$""").find(cloneURL)
  if (sshUrlRegexMatchResult != null) {
    val (host, owner, repo) = sshUrlRegexMatchResult.destructured
    return "$host/$owner/$repo"
  }
  val url = addSchemaIfNeededAndConvertURL(cloneURL) ?: return ""

  // Handle Azure DevOps URLs
  if (url.host?.contains("dev.azure") == true && url.path.isNotEmpty()) {
    return "${url.host}${url.path.replace("/_git", "")}"
  }

  // Handle GitHub URLs
  if (url.protocol?.startsWith("github") == true || url.toString().startsWith("github")) {
    return "github.com/${url.path.replace(".git", "")}"
  }

  // Handle GitLab URLs
  if (url.protocol?.startsWith("gitlab") == true || url.toString().startsWith("gitlab")) {
    return "gitlab.com/${url.path.replace(".git", "")}"
  }

  // Handle HTTPS URLs
  if (url.protocol?.startsWith("http") == true && url.host != null && url.path.isNotEmpty()) {
    return "${url.host}${url.path.replace(".git", "")}"
  }

  // Generic URL
  if (url.host != null && url.path.isNotEmpty()) {
    return "${url.host}${url.path.replace(".git", "")}"
  }

  return ""
}

private fun addSchemaIfNeededAndConvertURL(cloneURL: String): URL? {
  // 1 - schema, 2 - host, 4 - port, 5 - path
  val urlRegex =
      Pattern.compile("^(https?://)?([^/?:]+)(:(\\d+))?((/[^/?#]+)*)?/?", Pattern.CASE_INSENSITIVE)

  val matcher = urlRegex.matcher(cloneURL)
  if (!matcher.matches()) return null
  val extractedSchema = matcher.group(1)
  val url = if (extractedSchema.isNullOrEmpty()) URL("http://$cloneURL") else URL(cloneURL)
  return url
}
