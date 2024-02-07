package com.sourcegraph.cody.chat.actions

import com.sourcegraph.cody.commands.CommandId

class ExplainCommand : BaseCommandAction() {

  override fun myCommandId() = CommandId.Explain
}
