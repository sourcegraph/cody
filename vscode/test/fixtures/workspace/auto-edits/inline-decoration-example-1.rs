/*
<<<<
fn main() {
    let blocks = vec![
        Block::new("Orange Concrete").id(5006).build(),
        Block::new("Blue Concrete ").id(5007).build(),
        Block::new("Red Concrete").id(5008).build(),
        Block::new("White Concrete").id(5009).build(),
        Block::new("Ivory").id(5012).build(),

        make_stairs("Oak Stairs", 5013),
        make_stairs("Ivory Stairs", 5014),
        make_stairs("Stone Stairs", 5015),
    ];

    for block in blocks {
        println!("Block: {}, ID: {}", block.name, block.id);
    }
}
====
fn main() {
    let blocks = vec![
        Block::new("Orange Concrete Block").id(5006).build(),
        Block::new("Blue Concrete Block").id(5007).build(),
        Block::new("Red Concrete Block").id(5008).build(),
        Block::new("White Concrete Block").id(5009).build(),
        Block::new("Ivory Block").id(5012).build(),

        make_stairs("Oak Stairs", 5013),
        make_stairs("Ivory Stairs", 5014),
        make_stairs("Stone Stairs", 5015),
    ];

    for block in blocks {
        println!("Block: {}, ID: {}", block.name, block.id);
    }
}
>>>>
*/

fn main() {
    let blocks = vec![
        Block::new("Orange Concrete").id(5006).build(),
        Block::new("Blue Concrete ").id(5007).build(),
        Block::new("Red Concrete").id(5008).build(),
        Block::new("White Concrete").id(5009).build(),
        Block::new("Ivory").id(5012).build(),
        make_stairs("Oak Stairs", 5013),
        make_stairs("Ivory Stairs", 5014),
        make_stairs("Stone Stairs", 5015),
    ];

    for block in blocks {
        println!("Block: {}, ID: {}", block.name, block.id);
    }
}
