import { Transcript } from './transcript'

type Brand<T, B> = T & { readonly __brand: B }

type TranscriptID = Brand<string, 'TranscriptID'>

export class ChatHandler {
    constructor(transcripts: Map<TranscriptID, Transcript>) {}
}
