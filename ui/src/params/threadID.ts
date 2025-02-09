import { type ThreadID, isThreadID } from '@sourcegraph/cody-shared'
import type { ParamMatcher } from '@sveltejs/kit'

export const match = ((param: string): param is ThreadID => isThreadID(param)) satisfies ParamMatcher
