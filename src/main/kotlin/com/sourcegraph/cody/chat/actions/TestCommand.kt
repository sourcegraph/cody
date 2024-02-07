package com.sourcegraph.cody.chat.actions

import com.sourcegraph.cody.commands.CommandId

class TestCommand : BaseCommandAction() {

  override fun myCommandId() = CommandId.Test
}
