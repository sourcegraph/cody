// PLG ES access is disabled after July 23, 2025 10:00 AM PST
const PLG_ES_ACCESS_DISABLE_DATE = new Date('2025-07-24T18:00:00.000Z')

export function isPlgEsAccessDisabled(): boolean {
    return new Date() > PLG_ES_ACCESS_DISABLE_DATE
}
