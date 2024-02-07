package com.sourcegraph.cody.chat.actions

import com.sourcegraph.cody.commands.CommandId

class SmellCommand : BaseCommandAction() {

  override fun myCommandId() = CommandId.Smell
}
