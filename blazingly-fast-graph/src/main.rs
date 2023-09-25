use gix::traverse::tree::Recorder;
use gix::traverse::tree::recorder::Entry;

fn main() {
    let repo = gix::open("/Users/olafurpg/dev/sourcegraph/sourcegraph/.git").expect("git repo");
    let tree = repo.rev_parse_single(&*"HEAD")?.object()?.peel_to_tree()?;
    let mut recorder = Recorder::default();
    tree.traverse().breadthfirst(&mut recorder)?;
    let entries = recorder
        .records
        .into_iter()
        // .filter(|entry| args.tree_recursing || args.tree_only || entry.mode != Tree)
        // .filter(|entry| !args.tree_only || (entry.mode == Tree))
        .map(|entry| Entry::(entry.mode, entry.oid, entry.filepath))
        .collect::<Vec<_>>();

    println!("entries: {:?}", entries);
}
