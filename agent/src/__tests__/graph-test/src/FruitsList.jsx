import { Fruits } from './Fruits'

export const FruitsList = () => {
    return (
        <ul>
            {['apple', 'orange'].map(fruit => (
                <Fruits /* CURSOR */ />
            ))}
        </ul>
    )
}
