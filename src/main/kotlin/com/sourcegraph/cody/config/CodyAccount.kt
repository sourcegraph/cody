package com.sourcegraph.cody.config

import com.intellij.openapi.util.NlsSafe
import com.intellij.util.xmlb.annotations.Attribute
import com.intellij.util.xmlb.annotations.Property
import com.intellij.util.xmlb.annotations.Tag
import com.sourcegraph.cody.auth.ServerAccount
import com.sourcegraph.config.ConfigUtil

enum class AccountType {
  DOTCOM,
  ENTERPRISE
}

@Tag("account")
data class CodyAccount(
    @NlsSafe @Attribute("name") override var name: String = "",
    @Attribute("displayName") var displayName: String? = null,
    @Property(style = Property.Style.ATTRIBUTE, surroundWithTag = false)
    override val server: SourcegraphServerPath =
        SourcegraphServerPath.from(ConfigUtil.DOTCOM_URL, ""),
    @Attribute("id") override var id: String = generateId(),
) : ServerAccount() {

  fun getAccountType(): AccountType {
    if (isDotcomAccount()) {
      return AccountType.DOTCOM
    }
    return AccountType.ENTERPRISE
  }

  fun isDotcomAccount() = server.url.lowercase().startsWith(ConfigUtil.DOTCOM_URL)

  override fun toString(): String = "$server/$name"

  companion object {
    fun create(
        username: String,
        displayName: String?,
        server: SourcegraphServerPath,
        id: String = generateId(),
    ): CodyAccount {
      return CodyAccount(username, displayName ?: username, server, id)
    }

    fun CodyAccount?.isEnterpriseAccount() = this?.isDotcomAccount()?.not() ?: false
  }
}

fun Collection<CodyAccount>.getFirstAccountOrNull() =
    this.firstOrNull { it.isDotcomAccount() } ?: this.firstOrNull()
