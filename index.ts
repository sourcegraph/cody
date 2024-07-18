interface Person {
    CodyAutocompleteLatencyExperimentBasedFeatureFlag: boolean
    CodyAutocompleteHotStreak: boolean
    CodyAutocompleteSmartThrottle: boolean
    CodyAutocompleteSmartThrottleExtended: boolean
}

const generatePerson = () => {
    const person: Person = {
        CodyAutocompleteLatencyExperimentBasedFeatureFlag: Math.random() < 0.75, // 75% of total users in the combined group
        CodyAutocompleteHotStreak: Math.random() < 0.33, // 25% of remaining users in hot streak
        CodyAutocompleteSmartThrottle: Math.random() < 1, // 75% of remaining users in smart throttle (50% of group)
        CodyAutocompleteSmartThrottleExtended: Math.random() < 0.5, // 50% of total users in smart throttle extended (25% of group)
    }

    return person
}

const getLatencyExperimentGroup = (
    person: Person
): 'hotStreak' | 'smartThrottle' | 'smartThrottleExtended' | 'control' => {
    if (person.CodyAutocompleteLatencyExperimentBasedFeatureFlag) {
        if (person.CodyAutocompleteHotStreak) {
            return 'hotStreak'
        }

        if (person.CodyAutocompleteSmartThrottle) {
            if (person.CodyAutocompleteSmartThrottleExtended) {
                return 'smartThrottleExtended'
            }
            return 'smartThrottle'
        }
    }

    return 'control'
}

const run = () => {
    const results = {
        hotStreak: 0,
        smartThrottle: 0,
        smartThrottleExtended: 0,
        control: 0,
        total: 0,
    }

    for (let i = 0; i < 10000; i++) {
        const person = generatePerson()
        const group = getLatencyExperimentGroup(person)
        results[group]++
        results.total++
    }

    console.log(results)
}

run()

// Example result:
// {
//     hotStreak: 2447,
//     smartThrottle: 2514,
//     smartThrottleExtended: 2496,
//     control: 2543,
//     total: 10000
//   }
