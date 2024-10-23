// Copyright 2000-2023 JetBrains s.r.o. and contributors. Use of this source code is governed by the
// Apache 2.0 license.
package com.intellij.codeInsight.inline.completion.elements

/**
 * InlineCompletionElement is located in the following packages:
 * - 2023.2 - com.intellij.codeInsight.inline.completion
 * - 2023.3+ - com.intellij.codeInsight.inline.completion.elements
 *
 * We need that class in CodyInlineCompletionProvider::getSuggestion which is an API from 2023.3+ so
 * we need to provide our own stub to make compiler happy with IntelliJ platform 2023.2.
 */
interface InlineCompletionElement
