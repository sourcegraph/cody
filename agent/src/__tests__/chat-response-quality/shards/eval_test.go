package shards

import (
	"context"
	"fmt"
	"testing"

	"github.com/sourcegraph/zoekt"
	"github.com/sourcegraph/zoekt/query"
)

func TestSearchTypeRepo(t *testing.T) {
	ss := newShardedSearcher(2)
	nextShardNum := 1
	addShard := func(docs ...zoekt.Document) {
		b := testIndexBuilder(t, &zoekt.Repository{ID: 1, Name: "reponame"}, docs...)
		shard := searcherForTest(t, b)
		ss.replace(map[string]zoekt.Searcher{fmt.Sprintf("key-%d", nextShardNum): shard})
		nextShardNum++
	}
	addShard(
		zoekt.Document{Name: "f1", Content: []byte("bla the needle")},
		zoekt.Document{Name: "f2", Content: []byte("another file another needle")})
	addShard(
		zoekt.Document{Name: "f3", Content: []byte("another shard")})

	searcher := &typeRepoSearcher{ss}
	search := func(q query.Q, o ...zoekt.SearchOptions) *zoekt.SearchResult {
		t.Helper()
		var opts zoekt.SearchOptions
		if len(o) > 0 {
			opts = o[0]
		}
		res, err := searcher.Search(context.Background(), q, &opts)
		if err != nil {
			t.Fatalf("Search(%s): %v", q, err)
		}
		return res
	}
	wantSingleMatch := func(res *zoekt.SearchResult, want string) {
		t.Helper()
		fmatches := res.Files
		if len(fmatches) != 1 || len(fmatches[0].LineMatches) != 1 {
			t.Fatalf("got %v, want 1 matches", fmatches)
		}
		got := fmt.Sprintf("%s:%d", fmatches[0].FileName, fmatches[0].LineMatches[0].LineFragments[0].Offset)
		if got != want {
			t.Errorf("1: got %s, want %s", got, want)
		}
	}

	// type filter matches in different file
	res := search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "bla"},
		},
		&query.Substring{Pattern: "file"}))
	wantSingleMatch(res, "f2:8")

	// type filter matches in same file. Do not include that result
	res = search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "needle"},
		},
		&query.Substring{Pattern: "file"}))
	wantSingleMatch(res, "f2:8")

	// type filter matches path in different file
	res = search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "f1", FileName: true},
		},
		&query.Substring{Pattern: "file"}))
	wantSingleMatch(res, "f2:8")

	// type filter matches path in same file
	res = search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "f2", FileName: true},
		},
		&query.Substring{Pattern: "file"}))
	wantSingleMatch(res, "f2:8")

	// no match by content
	res = search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "nope"},
		},
		&query.Substring{Pattern: "file"}))
	if len(res.Files) != 0 {
		t.Fatalf("got %v, want 0 matches", len(res.Files))
	}

	// no match by path
	res = search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "nope", FileName: true},
		},
		&query.Substring{Pattern: "file"}))
	if len(res.Files) != 0 {
		t.Fatalf("got %v, want 0 matches", len(res.Files))
	}

	// type filter matches in a different shard
	res = search(query.NewAnd(
		&query.Type{
			Type:  query.TypeRepo,
			Child: &query.Substring{Pattern: "another shard"},
		},
		&query.Substring{Pattern: "file"}))
	wantSingleMatch(res, "f2:8")
}
