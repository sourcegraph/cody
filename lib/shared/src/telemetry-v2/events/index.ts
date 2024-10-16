import { events as atMentionEvents } from './at-mention'
import { events as chatQuestionEvents } from './chat-question'

export const events = objectFromPairs([...atMentionEvents, ...chatQuestionEvents] as const)

// Function to create an object from pairs with correct typing
type FromPairs<T extends readonly (readonly [PropertyKey, any])[]> = {
    [K in T[number][0]]: Extract<T[number], readonly [K, any]>[1]
}

function objectFromPairs<T extends readonly (readonly [PropertyKey, any])[]>(pairs: T): FromPairs<T> {
    return Object.fromEntries(pairs) as FromPairs<T>
}
