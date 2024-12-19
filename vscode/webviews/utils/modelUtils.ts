import { type Model, ModelTag } from '@sourcegraph/cody-shared'

export const isGeminiFlashModel = (model: Model): boolean =>
    model?.tags.includes(ModelTag.BYOK) && model?.id.includes('gemini-2.0-flash')
