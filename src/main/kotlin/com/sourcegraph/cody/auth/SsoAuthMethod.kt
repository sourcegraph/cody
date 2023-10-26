package com.sourcegraph.cody.auth

enum class SsoAuthMethod(val value: String) {
  GITHUB("Sign in with GitHub"),
  GITLAB("Sign in with GitLab"),
  GOOGLE("Sign in with Google"),
  DEFAULT("");

  companion object {
    fun from(value: String): SsoAuthMethod = values().firstOrNull { it.value == value } ?: DEFAULT
  }
}
