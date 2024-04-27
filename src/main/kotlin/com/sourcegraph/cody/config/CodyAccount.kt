package com.sourcegraph.cody.config

import com.intellij.openapi.util.NlsSafe
import com.intellij.util.xmlb.annotations.Attribute
import com.intellij.util.xmlb.annotations.Property
import com.intellij.util.xmlb.annotations.Tag
import com.sourcegraph.cody.auth.ServerAccount
import com.sourcegraph.config.ConfigUtil
import java.io.File

@Tag("account")
data class CodyAccount(
    @NlsSafe @Attribute("name") override var name: String = "",
    @Attribute("displayName") var displayName: String? = name,
    @Property(style = Property.Style.ATTRIBUTE, surroundWithTag = false)
    override val server: SourcegraphServerPath =
        SourcegraphServerPath.from(ConfigUtil.DOTCOM_URL, ""),
    @Attribute("id") override var id: String = generateId(),
) : ServerAccount() {

  fun isDotcomAccount(): Boolean = server.url.lowercase().startsWith(ConfigUtil.DOTCOM_URL)

  fun isEnterpriseAccount(): Boolean = isDotcomAccount().not()

  override fun toString(): String = File(server.toString(), name).path
}

fun Collection<CodyAccount>.getFirstAccountOrNull() =
    this.firstOrNull { it.isDotcomAccount() } ?: this.firstOrNull()
