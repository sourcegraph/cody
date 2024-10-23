package com.intellij.codeInsight.inline.completion.suggestion

import com.intellij.codeInsight.inline.completion.elements.InlineCompletionElement
import com.intellij.openapi.util.UserDataHolderBase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.FlowCollector

interface InlineCompletionSuggestion {

  object Empty : InlineCompletionSuggestion {}
}

interface InlineCompletionSingleSuggestion : InlineCompletionSuggestion {

  companion object {

    /** @see [InlineCompletionVariant.build] */
    fun build(
        data: UserDataHolderBase = UserDataHolderBase(),
        buildElements:
            suspend FlowCollector<InlineCompletionElement>.(data: UserDataHolderBase) -> Unit
    ): InlineCompletionSingleSuggestion {
      return object : InlineCompletionSingleSuggestion {}
    }

    /** @see InlineCompletionVariant.build */
    fun build(
        data: UserDataHolderBase = UserDataHolderBase(),
        elements: Flow<InlineCompletionElement>
    ): InlineCompletionSingleSuggestion {
      return object : InlineCompletionSingleSuggestion {}
    }
  }
}
