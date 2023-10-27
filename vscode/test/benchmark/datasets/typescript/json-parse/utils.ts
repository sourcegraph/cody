export function getAge(dateOfBirth: string): number {
    const birthDate = new Date(dateOfBirth)
    const currentDate = new Date()
    let age = currentDate.getFullYear() - birthDate.getFullYear()
    if (currentDate < new Date(currentDate.getFullYear(), birthDate.getMonth(), birthDate.getDate())) {
        age--
    }
    return age
}
