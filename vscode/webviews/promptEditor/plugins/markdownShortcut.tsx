/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { CODE, INLINE_CODE, type Transformer } from '@lexical/markdown'
import { MarkdownShortcutPlugin as _MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'

const TRANSFORMERS: Transformer[] = [CODE, INLINE_CODE]

export default function MarkdownShortcutPlugin(): JSX.Element {
    return <_MarkdownShortcutPlugin transformers={TRANSFORMERS} />
}
