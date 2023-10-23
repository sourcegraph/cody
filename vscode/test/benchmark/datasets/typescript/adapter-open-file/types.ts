interface Contact {
    type: 'email' | 'phone' | 'slack'
    value: string
}

export interface User {
    firstName: string
    lastName: string
    contacts: Contact[]
}
