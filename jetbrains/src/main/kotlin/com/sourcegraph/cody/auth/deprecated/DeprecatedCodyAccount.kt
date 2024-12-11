package com.sourcegraph.cody.auth.deprecated

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.generateServiceName
import com.intellij.openapi.util.NlsSafe
import com.intellij.util.xmlb.annotations.Attribute
import com.intellij.util.xmlb.annotations.Property
import com.intellij.util.xmlb.annotations.Tag
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.config.ConfigUtil
import java.io.File
import java.util.UUID

@Tag("account")
data class DeprecatedCodyAccount(
    @NlsSafe @Attribute("name") var name: String = "",
    @Attribute("displayName") var displayName: String? = name,
    @Property(style = Property.Style.ATTRIBUTE, surroundWithTag = false)
    var server: SourcegraphServerPath = SourcegraphServerPath.from(ConfigUtil.DOTCOM_URL, ""),
    @Attribute("id") var id: String = generateId(),
) {

  fun credentialAttributes(): CredentialAttributes =
      CredentialAttributes(generateServiceName("Sourcegraph", id))

  override fun toString(): String = File(server.toString(), name).path

  override fun equals(other: Any?): Boolean {
    if (this === other) return true
    if (other !is DeprecatedCodyAccount) return false
    return id == other.id
  }

  override fun hashCode(): Int {
    return id.hashCode()
  }

  companion object {
    fun generateId() = UUID.randomUUID().toString()
  }
}
