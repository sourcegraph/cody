// Copyright 2016 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package shards

import (
	"bytes"
	"context"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"os"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"testing"
	"testing/quick"
	"time"

	"github.com/RoaringBitmap/roaring"
	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/grafana/regexp"

	"github.com/sourcegraph/zoekt"
	"github.com/sourcegraph/zoekt/query"
)

type crashSearcher struct{}

func (s *crashSearcher) Search(ctx context.Context, q query.Q, opts *zoekt.SearchOptions) (*zoekt.SearchResult, error) {
	panic("search")
}

func (s *crashSearcher) List(ctx context.Context, q query.Q, opts *zoekt.ListOptions) (*zoekt.RepoList, error) {
	panic("list")
}

func (s *crashSearcher) Stats() (*zoekt.RepoStats, error) {
	return &zoekt.RepoStats{}, nil
}

func (s *crashSearcher) Close() {}

func (s *crashSearcher) String() string { return "crashSearcher" }

func TestCrashResilience(t *testing.T) {
	out := &bytes.Buffer{}
	log.SetOutput(out)
	defer log.SetOutput(os.Stderr)
	ss := newShardedSearcher(2)
	ss.ranked.Store([]*rankedShard{{Searcher: &crashSearcher{}}})

	var wantCrashes int
	test := func(t *testing.T) {
		q := &query.Substring{Pattern: "hoi"}
		opts := &zoekt.SearchOptions{}
		if res, err := ss.Search(context.Background(), q, opts); err != nil {
			t.Fatalf("Search: %v", err)
		} else if res.Stats.Crashes != wantCrashes {
			t.Errorf("got stats %#v, want crashes = %d", res.Stats, wantCrashes)
		}

		if res, err := ss.List(context.Background(), q, nil); err != nil {
			t.Fatalf("List: %v", err)
		} else if res.Crashes != wantCrashes {
			t.Errorf("got result %#v, want crashes = %d", res, wantCrashes)
		}
	}

	// Before we are marked as ready we have one extra crash
	wantCrashes = 2
	t.Run("loading", test)

	// After marking as ready we should only have the crashSearcher
	// contributing.
	ss.markReady()
	wantCrashes = 1
	t.Run("ready", test)
}

type rankSearcher struct {
	rank uint16
	repo *zoekt.Repository
}

func (s *rankSearcher) Close() {
}

func (s *rankSearcher) String() string {
	return ""
}

func (s *rankSearcher) Search(ctx context.Context, q query.Q, opts *zoekt.SearchOptions) (*zoekt.SearchResult, error) {
	select {
	case <-ctx.Done():
		return &zoekt.SearchResult{}, nil
	default:
	}

	// Ugly, but without sleep it's too fast, and we can't
	// simulate the cutoff.
	time.Sleep(time.Millisecond)
	return &zoekt.SearchResult{
		Files: []zoekt.FileMatch{
			{
				FileName: fmt.Sprintf("f%d", s.rank),
				Score:    float64(s.rank),
			},
		},
		Stats: zoekt.Stats{
			MatchCount: 1,
		},
	}, nil
}

func (s *rankSearcher) List(ctx context.Context, q query.Q, opts *zoekt.ListOptions) (*zoekt.RepoList, error) {
	r := zoekt.Repository{}
	if s.repo != nil {
		r = *s.repo
	}
	r.Rank = s.rank
	return &zoekt.RepoList{
		Repos: []*zoekt.RepoListEntry{
			{Repository: r},
		},
	}, nil
}

func (s *rankSearcher) Repository() *zoekt.Repository { return s.repo }

func TestOrderByShard(t *testing.T) {
	ss := newShardedSearcher(1)

	n := 10 * runtime.GOMAXPROCS(0)
	for i := 0; i < n; i++ {
		ss.replace(map[string]zoekt.Searcher{
			fmt.Sprintf("shard%d", i): &rankSearcher{rank: uint16(i)},
		})
	}

	if res, err := ss.Search(context.Background(), &query.Substring{Pattern: "bla"}, &zoekt.SearchOptions{}); err != nil {
		t.Errorf("Search: %v", err)
	} else if len(res.Files) != n {
		t.Fatalf("empty options: got %d results, want %d", len(res.Files), n)
	}

	opts := zoekt.SearchOptions{
		TotalMaxMatchCount: 3,
	}
	res, err := ss.Search(context.Background(), &query.Substring{Pattern: "bla"}, &opts)
	if err != nil {
		t.Errorf("Search: %v", err)
	}

	if len(res.Files) < opts.TotalMaxMatchCount {
		t.Errorf("got %d results, want %d", len(res.Files), opts.TotalMaxMatchCount)
	}
	if len(res.Files) == n {
		t.Errorf("got %d results, want < %d", len(res.Files), n)
	}
	for i, f := range res.Files {
		rev := n - 1 - i
		want := fmt.Sprintf("f%d", rev)
		got := f.FileName

		if got != want {
			t.Logf("%d: got %q, want %q", i, got, want)
		}
	}
}

func TestShardedSearcher_Ranking(t *testing.T) {
	ss := newShardedSearcher(1)

	var nextShardNum int
	addShard := func(repo string, priority float64, docs ...zoekt.Document) {
		r := &zoekt.Repository{ID: hash(repo), Name: repo}
		r.RawConfig = map[string]string{
			"public":   "1",
			"priority": strconv.FormatFloat(priority, 'f', 2, 64),
		}
		b := testIndexBuilder(t, r, docs...)
		shard := searcherForTest(t, b)
		ss.replace(map[string]zoekt.Searcher{
			fmt.Sprintf("key-%d", nextShardNum): shard,
		})
		nextShardNum++
	}

	addShard("weekend-project", 20, zoekt.Document{Name: "f2", Content: []byte("foo bas")})
	addShard("moderately-popular", 500, zoekt.Document{Name: "f3", Content: []byte("foo bar")})
	addShard("weekend-project-2", 20, zoekt.Document{Name: "f2", Content: []byte("foo bas")})
	addShard("super-star", 5000, zoekt.Document{Name: "f1", Content: []byte("foo bar bas")})

	want := []string{
		"super-star",
		"moderately-popular",
		"weekend-project",
		"weekend-project-2",
	}

	var have []string
	for _, s := range ss.getLoaded().shards {
		for _, r := range s.repos {
			have = append(have, r.Name)
		}
	}

	if !reflect.DeepEqual(want, have) {
		t.Fatalf("\nwant: %s\nhave: %s", want, have)
	}
}

func TestShardedSearcher_DocumentRanking(t *testing.T) {
	ss := newShardedSearcher(1)

	var nextShardNum int
	addShard := func(repo string, priority float64, docs ...zoekt.Document) {
		r := &zoekt.Repository{ID: hash(repo), Name: repo}
		r.RawConfig = map[string]string{
			"public":   "1",
			"priority": strconv.FormatFloat(priority, 'f', 2, 64),
		}
		b := testIndexBuilder(t, r, docs...)
		shard := searcherForTest(t, b)
		ss.replace(map[string]zoekt.Searcher{
			fmt.Sprintf("key-%d", nextShardNum): shard,
		})
		nextShardNum++
	}

	addShard("weekend-project", 20, zoekt.Document{Name: "f1", Content: []byte("foobar")})
	addShard("moderately-popular", 500, zoekt.Document{Name: "f2", Content: []byte("foobaz")})
	addShard("weekend-project-2", 20, zoekt.Document{Name: "f3", Content: []byte("foo bar")})
	addShard("super-star", 5000, zoekt.Document{Name: "f4", Content: []byte("foo baz")},
		zoekt.Document{Name: "f5", Content: []byte("fooooo")})

	// Run a stream search and gather the results
	var results []*zoekt.SearchResult
	opts := &zoekt.SearchOptions{
		UseDocumentRanks: true,
		FlushWallTime:    100 * time.Millisecond,
	}

	err := ss.StreamSearch(context.Background(), &query.Substring{Pattern: "foo"}, opts,
		zoekt.SenderFunc(func(event *zoekt.SearchResult) {
			results = append(results, event)
		}))
	if err != nil {
		t.Fatal(err)
	}

	// There should always be two stream results, first progress-only, then the file results
	if len(results) != 2 {
		t.Fatalf("expected 2 streamed results, but got %d", len(results))
	}

	// The ranking should be determined by whether it's an exact word match,
	// followed by repository priority
	want := []string{"f4", "f3", "f5", "f2", "f1"}

	files := results[1].Files
	got := make([]string, len(files))
	for i := 0; i < len(files); i++ {
		got[i] = files[i].FileName
	}

	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestFilteringShardsByRepoSetOrBranchesReposOrRepoIDs(t *testing.T) {
	ss := newShardedSearcher(1)

	// namePrefix is so we can create a repo:foo filter and match the same set
	// of repos.
	namePrefix := [3]string{"foo", "bar", "baz"}

	repoSetNames := []string{}
	repoIDs := []uint32{}
	n := 10 * runtime.GOMAXPROCS(0)
	for i := 0; i < n; i++ {
		shardName := fmt.Sprintf("shard%d", i)
		repoName := fmt.Sprintf("%s-repository%.3d", namePrefix[i%3], i)
		repoID := hash(repoName)

		if i%3 == 0 {
			repoSetNames = append(repoSetNames, repoName)
			repoIDs = append(repoIDs, repoID)
		}

		ss.replace(map[string]zoekt.Searcher{
			shardName: &rankSearcher{
				repo: &zoekt.Repository{ID: repoID, Name: repoName},
				rank: uint16(n - i),
			},
		})
	}

	res, err := ss.Search(context.Background(), &query.Substring{Pattern: "bla"}, &zoekt.SearchOptions{})
	if err != nil {
		t.Errorf("Search: %v", err)
	}
	if len(res.Files) != n {
		t.Fatalf("no reposet: got %d results, want %d", len(res.Files), n)
	}

	branchesRepos := &query.BranchesRepos{List: []query.BranchRepos{
		{Branch: "HEAD", Repos: roaring.New()},
	}}

	for _, name := range repoSetNames {
		branchesRepos.List[0].Repos.Add(hash(name))
	}

	set := query.NewRepoSet(repoSetNames...)
	sub := &query.Substring{Pattern: "bla"}

	repoIDsQuery := query.NewRepoIDs(repoIDs...)
	repoQuery := &query.Repo{Regexp: regexp.MustCompile("^foo-.*")}

	queries := []query.Q{
		query.NewAnd(set, sub),
		// Test with the same reposet again
		query.NewAnd(set, sub),

		query.NewAnd(branchesRepos, sub),
		// Test with the same repoBranches with IDs again
		query.NewAnd(branchesRepos, sub),

		query.NewAnd(repoIDsQuery, sub),
		// Test with the same repoIDs again
		query.NewAnd(repoIDsQuery, sub),

		query.NewAnd(repoQuery, sub),
		query.NewAnd(repoQuery, sub),

		// List has queries which are just the reposet atoms. We also test twice.
		set,
		set,
		branchesRepos,
		branchesRepos,
		repoIDsQuery,
		repoIDsQuery,
		repoQuery,
		repoQuery,
	}

	for _, q := range queries {
		res, err = ss.Search(context.Background(), q, &zoekt.SearchOptions{})
		if err != nil {
			t.Errorf("Search(%s): %v", q, err)
		}
		// Note: Assertion is based on fact that `rankSearcher` always returns a
		// result and using repoSet will half the number of results
		if len(res.Files) != len(repoSetNames) {
			t.Fatalf("%s: got %d results, want %d", q, len(res.Files), len(repoSetNames))
		}
	}
}

func hash(name string) uint32 {
	h := fnv.New32()
	h.Write([]byte(name))
	return h.Sum32()
}

type memSeeker struct {
	data []byte
}

func (s *memSeeker) Name() string {
	return "memseeker"
}

func (s *memSeeker) Close() {}
func (s *memSeeker) Read(off, sz uint32) ([]byte, error) {
	return s.data[off : off+sz], nil
}

func (s *memSeeker) Size() (uint32, error) {
	return uint32(len(s.data)), nil
}

func TestUnloadIndex(t *testing.T) {
	b := testIndexBuilder(t, nil, zoekt.Document{
		Name:    "filename",
		Content: []byte("needle needle needle"),
	})

	var buf bytes.Buffer
	if err := b.Write(&buf); err != nil {
		t.Fatal(err)
	}
	indexBytes := buf.Bytes()
	indexFile := &memSeeker{indexBytes}
	searcher, err := zoekt.NewSearcher(indexFile)
	if err != nil {
		t.Fatalf("NewSearcher: %v", err)
	}

	ss := newShardedSearcher(2)
	ss.replace(map[string]zoekt.Searcher{"key": searcher})

	var opts zoekt.SearchOptions
	q := &query.Substring{Pattern: "needle"}
	res, err := ss.Search(context.Background(), q, &opts)
	if err != nil {
		t.Fatalf("Search(%s): %v", q, err)
	}

	forbidden := byte(29)
	for i := range indexBytes {
		// non-ASCII
		indexBytes[i] = forbidden
	}

	for _, f := range res.Files {
		if bytes.Contains(f.Content, []byte{forbidden}) {
			t.Errorf("found %d in content %q", forbidden, f.Content)
		}
		if bytes.Contains(f.Checksum, []byte{forbidden}) {
			t.Errorf("found %d in checksum %q", forbidden, f.Checksum)
		}

		for _, l := range f.LineMatches {
			if bytes.Contains(l.Line, []byte{forbidden}) {
				t.Errorf("found %d in line %q", forbidden, l.Line)
			}
		}
	}
}

func TestShardedSearcher_List(t *testing.T) {
	repos := []*zoekt.Repository{
		{
			ID:        1234,
			Name:      "repo-a",
			Branches:  []zoekt.RepositoryBranch{{Name: "main"}, {Name: "dev"}},
			RawConfig: map[string]string{"repoid": "1234"},
		},
		{
			Name:     "repo-b",
			Branches: []zoekt.RepositoryBranch{{Name: "main"}, {Name: "dev"}},
		},
	}

	doc := zoekt.Document{
		Name:     "foo.go",
		Content:  []byte("bar\nbaz"),
		Branches: []string{"main", "dev"},
	}

	// Test duplicate removal when ListOptions.Minimal is true and false
	ss := newShardedSearcher(4)
	ss.replace(map[string]zoekt.Searcher{
		"1": searcherForTest(t, testIndexBuilder(t, repos[0], doc)),
		"2": searcherForTest(t, testIndexBuilder(t, repos[0])),
		"3": searcherForTest(t, testIndexBuilder(t, repos[1], doc)),
		"4": searcherForTest(t, testIndexBuilder(t, repos[1])),
	})
	ss.markReady()

	stats := zoekt.RepoStats{
		Shards:                     2,
		Documents:                  1,
		IndexBytes:                 196,
		ContentBytes:               13,
		NewLinesCount:              1,
		DefaultBranchNewLinesCount: 1,
		OtherBranchesNewLinesCount: 1,
	}

	aggStats := stats
	aggStats.Add(&aggStats) // since both repos have the exact same stats, this works
	aggStats.Repos = 2      // Add doesn't populate Repos, this is done in Shards	based on the response sizes.

	for _, tc := range []struct {
		name string
		opts *zoekt.ListOptions
		want *zoekt.RepoList
	}{
		{
			name: "nil opts",
			opts: nil,
			want: &zoekt.RepoList{
				Repos: []*zoekt.RepoListEntry{
					{
						Repository: *repos[0],
						Stats:      stats,
					},
					{
						Repository: *repos[1],
						Stats:      stats,
					},
				},
				Stats: aggStats,
			},
		},
		{
			name: "default",
			opts: &zoekt.ListOptions{},
			want: &zoekt.RepoList{
				Repos: []*zoekt.RepoListEntry{
					{
						Repository: *repos[0],
						Stats:      stats,
					},
					{
						Repository: *repos[1],
						Stats:      stats,
					},
				},
				Stats: aggStats,
			},
		},
		{
			name: "field=repos",
			opts: &zoekt.ListOptions{Field: zoekt.RepoListFieldRepos},
			want: &zoekt.RepoList{
				Repos: []*zoekt.RepoListEntry{
					{
						Repository: *repos[0],
						Stats:      stats,
					},
					{
						Repository: *repos[1],
						Stats:      stats,
					},
				},
				Stats: aggStats,
			},
		},
		{
			name: "field=reposmap",
			opts: &zoekt.ListOptions{Field: zoekt.RepoListFieldReposMap},
			want: &zoekt.RepoList{
				Repos: []*zoekt.RepoListEntry{
					{
						Repository: *repos[1],
						Stats:      stats,
					},
				},
				ReposMap: zoekt.ReposMap{
					repos[0].ID: {
						HasSymbols: repos[0].HasSymbols,
						Branches:   repos[0].Branches,
					},
				},
				Stats: aggStats,
			},
		},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			q := &query.Repo{Regexp: regexp.MustCompile("repo")}

			res, err := ss.List(context.Background(), q, tc.opts)
			if err != nil {
				t.Fatalf("List(%v, %s): %v", q, tc.opts, err)
			}

			sort.Slice(res.Repos, func(i, j int) bool {
				return res.Repos[i].Repository.Name < res.Repos[j].Repository.Name
			})

			ignored := []cmp.Option{
				cmpopts.EquateEmpty(),
				cmpopts.IgnoreFields(zoekt.MinimalRepoListEntry{}, "IndexTimeUnix"),
				cmpopts.IgnoreFields(zoekt.RepoListEntry{}, "IndexMetadata"),
				cmpopts.IgnoreFields(zoekt.RepoStats{}, "IndexBytes"),
				cmpopts.IgnoreFields(zoekt.Repository{}, "SubRepoMap"),
				cmpopts.IgnoreFields(zoekt.Repository{}, "priority"),
			}

			if diff := cmp.Diff(tc.want, res, ignored...); diff != "" {
				t.Fatalf("mismatch (-want +got):\n%s", diff)
			}
		})
	}
}

func testIndexBuilder(t testing.TB, repo *zoekt.Repository, docs ...zoekt.Document) *zoekt.IndexBuilder {
	b, err := zoekt.NewIndexBuilder(repo)
	if err != nil {
		t.Fatalf("NewIndexBuilder: %v", err)
	}

	for i, d := range docs {
		if err := b.Add(d); err != nil {
			t.Fatalf("Add %d: %v", i, err)
		}
	}
	return b
}

func searcherForTest(t testing.TB, b *zoekt.IndexBuilder) zoekt.Searcher {
	var buf bytes.Buffer
	if err := b.Write(&buf); err != nil {
		t.Fatal(err)
	}
	f := &memSeeker{buf.Bytes()}

	searcher, err := zoekt.NewSearcher(f)
	if err != nil {
		t.Fatalf("NewSearcher: %v", err)
	}

	return searcher
}

func reposForTest(n int) (result []*zoekt.Repository) {
	for i := 0; i < n; i++ {
		result = append(result, &zoekt.Repository{
			ID:   uint32(i + 1),
			Name: fmt.Sprintf("test-repository-%d", i),
		})
	}
	return result
}

func testSearcherForRepo(b testing.TB, r *zoekt.Repository, numFiles int) zoekt.Searcher {
	builder := testIndexBuilder(b, r)

	if err := builder.Add(zoekt.Document{
		Name:    fmt.Sprintf("%s/filename-%d.go", r.Name, 0),
		Content: []byte("needle needle needle haystack"),
	}); err != nil {
		b.Fatal(err)
	}

	for i := 1; i < numFiles; i++ {
		if err := builder.Add(zoekt.Document{
			Name:    fmt.Sprintf("%s/filename-%d.go", r.Name, i),
			Content: []byte("haystack haystack haystack"),
		}); err != nil {
			b.Fatal(err)
		}
	}

	return searcherForTest(b, builder)
}

func BenchmarkShardedSearch(b *testing.B) {
	ss := newShardedSearcher(int64(runtime.GOMAXPROCS(0)))

	filesPerRepo := 300
	repos := reposForTest(3000)
	var repoSetIDs []uint32

	shards := make(map[string]zoekt.Searcher, len(repos))
	for i, r := range repos {
		shards[r.Name] = testSearcherForRepo(b, r, filesPerRepo)
		if i%2 == 0 {
			repoSetIDs = append(repoSetIDs, r.ID)
		}
	}

	ss.replace(shards)

	ctx := context.Background()
	opts := &zoekt.SearchOptions{}

	needleSub := &query.Substring{Pattern: "needle"}
	haystackSub := &query.Substring{Pattern: "haystack"}
	helloworldSub := &query.Substring{Pattern: "helloworld"}
	haystackCap, err := query.Parse("hay(s(t))(a)ck")
	if err != nil {
		b.Fatal(err)
	}

	haystackNonCap, err := query.Parse("hay(?:s(?:t))(?:a)ck")
	if err != nil {
		b.Fatal(err)
	}

	setAnd := func(q query.Q) func() query.Q {
		return func() query.Q {
			return query.NewAnd(query.NewSingleBranchesRepos("head", repoSetIDs...), q)
		}
	}

	search := func(b *testing.B, q query.Q, wantFiles int) {
		b.Helper()

		res, err := ss.Search(ctx, q, opts)
		if err != nil {
			b.Fatalf("Search(%s): %v", q, err)
		}
		if have := len(res.Files); have != wantFiles {
			b.Fatalf("wrong number of file results. have=%d, want=%d", have, wantFiles)
		}
	}

	benchmarks := []struct {
		name      string
		q         func() query.Q
		wantFiles int
	}{
		{"substring all results", func() query.Q { return haystackSub }, len(repos) * filesPerRepo},
		{"substring no results", func() query.Q { return helloworldSub }, 0},
		{"substring some results", func() query.Q { return needleSub }, len(repos)},

		{"regexp all results capture", func() query.Q { return haystackCap }, len(repos) * filesPerRepo},
		{"regexp all results non-capture", func() query.Q { return haystackNonCap }, len(repos) * filesPerRepo},

		{"substring all results and repo set", setAnd(haystackSub), len(repoSetIDs) * filesPerRepo},
		{"substring some results and repo set", setAnd(needleSub), len(repoSetIDs)},
		{"substring no results and repo set", setAnd(helloworldSub), 0},
	}

	for _, bb := range benchmarks {
		b.Run(bb.name, func(b *testing.B) {
			b.ReportAllocs()

			for n := 0; n < b.N; n++ {
				q := bb.q()

				search(b, q, bb.wantFiles)
			}
		})
	}
}

func TestRawQuerySearch(t *testing.T) {
	ss := newShardedSearcher(1)

	var nextShardNum int
	addShard := func(repo string, rawConfig map[string]string, docs ...zoekt.Document) {
		r := &zoekt.Repository{Name: repo}
		r.RawConfig = rawConfig
		b := testIndexBuilder(t, r, docs...)
		shard := searcherForTest(t, b)
		ss.replace(map[string]zoekt.Searcher{fmt.Sprintf("key-%d", nextShardNum): shard})
		nextShardNum++
	}
	addShard("public", map[string]string{"public": "1"}, zoekt.Document{Name: "f1", Content: []byte("foo bar bas")})
	addShard("private_archived", map[string]string{"archived": "1"}, zoekt.Document{Name: "f2", Content: []byte("foo bas")})
	addShard("public_fork", map[string]string{"public": "1", "fork": "1"}, zoekt.Document{Name: "f3", Content: []byte("foo bar")})

	cases := []struct {
		pattern   string
		flags     query.RawConfig
		wantRepos []string
		wantFiles int
	}{
		{
			pattern:   "bas",
			flags:     query.RcOnlyPublic,
			wantRepos: []string{"public"},
			wantFiles: 1,
		},
		{
			pattern:   "foo",
			flags:     query.RcOnlyPublic,
			wantRepos: []string{"public", "public_fork"},
			wantFiles: 2,
		},
		{
			pattern:   "foo",
			flags:     query.RcOnlyPublic | query.RcNoForks,
			wantRepos: []string{"public"},
			wantFiles: 1,
		},
		{
			pattern:   "bar",
			flags:     query.RcOnlyForks,
			wantRepos: []string{"public_fork"},
			wantFiles: 1,
		},
		{
			pattern:   "bas",
			flags:     query.RcNoArchived,
			wantRepos: []string{"public"},
			wantFiles: 1,
		},
		{
			pattern:   "foo",
			flags:     query.RcNoForks,
			wantRepos: []string{"public", "private_archived"},
			wantFiles: 2,
		},
		{
			pattern:   "bas",
			flags:     query.RcOnlyArchived,
			wantRepos: []string{"private_archived"},
			wantFiles: 1,
		},
		{
			pattern:   "foo",
			flags:     query.RcOnlyPrivate,
			wantRepos: []string{"private_archived"},
			wantFiles: 1,
		},
		{
			pattern:   "foo",
			flags:     query.RcOnlyPrivate | query.RcNoArchived,
			wantRepos: []string{},
			wantFiles: 0,
		},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("pattern:%s", c.pattern), func(t *testing.T) {
			q := query.NewAnd(&query.Substring{Pattern: c.pattern}, c.flags)

			sr, err := ss.Search(context.Background(), q, &zoekt.SearchOptions{})
			if err != nil {
				t.Fatal(err)
			}

			if got := len(sr.Files); got != c.wantFiles {
				t.Fatalf("wanted %d, got %d", c.wantFiles, got)
			}

			if c.wantFiles == 0 {
				return
			}

			gotRepos := make([]string, 0, len(sr.RepoURLs))
			for k := range sr.RepoURLs {
				gotRepos = append(gotRepos, k)
			}
			sort.Strings(gotRepos)
			sort.Strings(c.wantRepos)
			if d := cmp.Diff(c.wantRepos, gotRepos); d != "" {
				t.Fatalf("(-want, +got):\n%s", d)
			}
		})
	}
}

func TestPrioritySlice(t *testing.T) {
	p := &prioritySlice{}
	for step, oper := range []struct {
		isAppend    bool
		value       float64
		expectedMax float64
	}{
		{true, 1, 1},
		{true, 3, 3},
		{true, 2, 3},
		{false, 1, 3},
		{false, 3, 2},
		{false, 2, math.Inf(-1)},
	} {
		if oper.isAppend {
			p.append(oper.value)
		} else {
			p.remove(oper.value)
		}
		max := p.max()
		if max != oper.expectedMax {
			t.Errorf("%d: got %f, want %f", step, max, oper.expectedMax)
		}
	}
}

func TestSendByRepository(t *testing.T) {
	wantStats := zoekt.Stats{}
	wantStats.ShardsScanned = 1

	// n1, n2, n3 are the number of file matches for each of the 3 repositories in this
	// test.
	f := func(n1, n2, n3 uint8) bool {
		sr := createMockSearchResult(n1, n2, n3, wantStats)

		mock := &mockSender{}
		sendByRepository(sr, &zoekt.SearchOptions{}, mock)

		if diff := cmp.Diff(wantStats, mock.stats); diff != "" {
			t.Logf("-want,+got\n%s", diff)
			return false
		}

		nonZero := 0
		for _, l := range []uint8{n1, n2, n3} {
			if l > 0 {
				nonZero++
			}
		}
		if l := len(mock.files); l != nonZero {
			t.Logf("wanted results from %d repositores, got %d", nonZero, l)
			return false
		}

		gotTotal := 0
		for _, fs := range mock.files {
			gotTotal += len(fs)
		}
		wantTotal := int(n1) + int(n2) + int(n3)
		if gotTotal != wantTotal {
			t.Logf("wanted %d file matches, got %d", wantTotal, gotTotal)
			return false
		}

		for _, fs := range mock.files {
			if len(fs) == 0 {
				t.Logf("got search result with 0 file matches after split")
				return false
			}
		}
		return true
	}

	if err := quick.Check(f, nil); err != nil {
		t.Error(err)
	}
}

type mockSender struct {
	stats zoekt.Stats
	files [][]zoekt.FileMatch
}

func (s *mockSender) Send(sr *zoekt.SearchResult) {
	s.stats.Add(sr.Stats)
	if len(sr.Files) == 0 {
		return
	}
	s.files = append(s.files, sr.Files)
}

func createMockSearchResult(n1, n2, n3 uint8, stats zoekt.Stats) *zoekt.SearchResult {
	sr := &zoekt.SearchResult{RepoURLs: make(map[string]string)}
	for i, n := range []uint8{n1, n2, n3} {
		if n == 0 {
			continue
		}
		tmp := mkSearchResult(int(n), uint32(i))
		sr.Files = append(sr.Files, tmp.Files...)
		for k := range tmp.RepoURLs {
			sr.RepoURLs[k] = ""
		}
	}
	sr.Stats = stats
	return sr
}

func mkSearchResult(n int, repoID uint32) *zoekt.SearchResult {
	if n == 0 {
		return &zoekt.SearchResult{}
	}
	fm := make([]zoekt.FileMatch, 0, n)
	for i := 0; i < n; i++ {
		fm = append(fm, zoekt.FileMatch{Repository: fmt.Sprintf("repo%d", repoID), RepositoryID: repoID})
	}

	return &zoekt.SearchResult{Files: fm, RepoURLs: map[string]string{fmt.Sprintf("repo%d", repoID): ""}}
}

func TestFileBasedSearch(t *testing.T) {
	cases := []struct {
		name              string
		testShardedSearch func(t *testing.T, q query.Q, ib *zoekt.IndexBuilder, useDocumentRanks bool) []zoekt.FileMatch
	}{
		{"Search", testShardedSearch},
		{"StreamSearch", testShardedStreamSearch},
	}

	c1 := []byte("I love bananas without skin")
	// -----------0123456789012345678901234567890123456789
	c2 := []byte("In Dutch, ananas means pineapple")
	// -----------0123456789012345678901234567890123456789
	b := testIndexBuilder(t, nil,
		zoekt.Document{Name: "f1", Content: c1},
		zoekt.Document{Name: "f2", Content: c2},
	)

	for _, tt := range cases {
		for _, useDocumentRanks := range []bool{false, true} {
			t.Run(tt.name, func(t *testing.T) {
				matches := tt.testShardedSearch(t, &query.Substring{
					CaseSensitive: false,
					Pattern:       "ananas",
				}, b, useDocumentRanks)

				if len(matches) != 2 {
					t.Fatalf("got %v, want 2 matches", matches)
				}
				if matches[0].FileName != "f2" || matches[1].FileName != "f1" {
					t.Fatalf("got %v, want matches {f1,f2}", matches)
				}
				if matches[0].LineMatches[0].LineFragments[0].Offset != 10 || matches[1].LineMatches[0].LineFragments[0].Offset != 8 {
					t.Fatalf("got %#v, want offsets 10,8", matches)
				}
			})
		}
	}
}

func TestWordBoundaryRanking(t *testing.T) {
	cases := []struct {
		name              string
		testShardedSearch func(t *testing.T, q query.Q, ib *zoekt.IndexBuilder, useDocumentRanks bool) []zoekt.FileMatch
	}{
		{"Search", testShardedSearch},
		{"StreamSearch", testShardedStreamSearch},
	}

	b := testIndexBuilder(t, nil,
		zoekt.Document{Name: "f1", Content: []byte("xbytex xbytex")},
		zoekt.Document{Name: "f2", Content: []byte("xbytex\nbytex\nbyte bla")},
		// -----------------------------------------0123456 789012 34567890
		zoekt.Document{Name: "f3", Content: []byte("xbytex ybytex")})

	for _, tt := range cases {
		for _, useDocumentRanks := range []bool{false, true} {
			t.Run(tt.name, func(t *testing.T) {
				files := tt.testShardedSearch(t, &query.Substring{Pattern: "byte"}, b, useDocumentRanks)

				if len(files) != 3 {
					t.Fatalf("got %#v, want 3 files", files)
				}

				file0 := files[0]
				if file0.FileName != "f2" || len(file0.LineMatches) != 3 {
					t.Fatalf("got file %s, num matches %d (%#v), want 3 matches in file f2", file0.FileName, len(file0.LineMatches), file0)
				}

				if file0.LineMatches[0].LineFragments[0].Offset != 13 {
					t.Fatalf("got first match %#v, want full word match", files[0].LineMatches[0])
				}
				if file0.LineMatches[1].LineFragments[0].Offset != 7 {
					t.Fatalf("got second match %#v, want partial word match", files[0].LineMatches[1])
				}
			})
		}
	}
}

func TestAtomCountScore(t *testing.T) {
	cases := []struct {
		name              string
		testShardedSearch func(t *testing.T, q query.Q, ib *zoekt.IndexBuilder, useDocumentRanks bool) []zoekt.FileMatch
	}{
		{"Search", testShardedSearch},
		{"StreamSearch", testShardedStreamSearch},
	}

	b := testIndexBuilder(t,
		&zoekt.Repository{
			Branches: []zoekt.RepositoryBranch{
				{Name: "branches", Version: "v1"},
				{Name: "needle", Version: "v2"},
			},
		},
		zoekt.Document{Name: "f1", Content: []byte("needle the bla"), Branches: []string{"branches"}},
		zoekt.Document{Name: "needle-file-branch", Content: []byte("needle content"), Branches: []string{"needle"}},
		zoekt.Document{Name: "needle-file", Content: []byte("needle content"), Branches: []string{"branches"}})

	for _, tt := range cases {
		for _, useDocumentRanks := range []bool{false, true} {
			t.Run(tt.name, func(t *testing.T) {
				files := tt.testShardedSearch(t,
					query.NewOr(
						&query.Substring{Pattern: "needle"},
						&query.Substring{Pattern: "needle", FileName: true},
						&query.Branch{Pattern: "needle"},
					), b, useDocumentRanks)
				var got []string
				for _, f := range files {
					got = append(got, f.FileName)
				}
				want := []string{"needle-file-branch", "needle-file", "f1"}
				if !reflect.DeepEqual(got, want) {
					t.Errorf("got %v, want %v", got, want)
				}
			})
		}
	}
}

func TestUseBM25Scoring(t *testing.T) {
	b := testIndexBuilder(t,
		&zoekt.Repository{},
		zoekt.Document{Name: "f1", Content: []byte("one two two three")},
		zoekt.Document{Name: "f2", Content: []byte("one two one two")},
		zoekt.Document{Name: "f3", Content: []byte("one three three three")})

	ss := newShardedSearcher(1)
	searcher := searcherForTest(t, b)
	ss.replace(map[string]zoekt.Searcher{"r1": searcher})

	q := query.NewOr(
		&query.Substring{Pattern: "one"},
		&query.Substring{Pattern: "three"})

	opts := zoekt.SearchOptions{
		UseBM25Scoring: true,
	}

	results, err := ss.Search(context.Background(), q, &opts)
	if err != nil {
		t.Fatal(err)
	}

	var got []string
	for _, f := range results.Files {
		got = append(got, f.FileName)
	}

	want := []string{"f3", "f1", "f2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func testShardedStreamSearch(t *testing.T, q query.Q, ib *zoekt.IndexBuilder, useDocumentRanks bool) []zoekt.FileMatch {
	ss := newShardedSearcher(1)
	searcher := searcherForTest(t, ib)
	ss.replace(map[string]zoekt.Searcher{"r1": searcher})

	var files []zoekt.FileMatch
	sender := zoekt.SenderFunc(func(result *zoekt.SearchResult) {
		files = append(files, result.Files...)
	})

	opts := zoekt.SearchOptions{}
	if useDocumentRanks {
		opts.UseDocumentRanks = true
		opts.FlushWallTime = 10 * time.Millisecond
	}
	if err := ss.StreamSearch(context.Background(), q, &opts, sender); err != nil {
		t.Fatal(err)
	}
	return files
}

func testShardedSearch(t *testing.T, q query.Q, ib *zoekt.IndexBuilder, useDocumentRanks bool) []zoekt.FileMatch {
	ss := newShardedSearcher(1)
	searcher := searcherForTest(t, ib)
	ss.replace(map[string]zoekt.Searcher{"r1": searcher})

	opts := zoekt.SearchOptions{}
	if useDocumentRanks {
		opts.UseDocumentRanks = true
		opts.FlushWallTime = 50 * time.Millisecond
	}
	sres, _ := ss.Search(context.Background(), q, &opts)
	return sres.Files
}

// Ensure we work on empty shard directories.
func TestNewDirectorySearcher_empty(t *testing.T) {
	ctx := context.Background()

	test := func(t *testing.T, ss zoekt.Streamer) {
		res, err := ss.Search(ctx, &query.Const{Value: true}, nil)
		if err != nil {
			t.Fatal("Search non-nil error", err)
		}

		if diff := cmp.Diff(&zoekt.SearchResult{}, res, cmpopts.IgnoreFields(zoekt.Stats{}, "Duration", "Wait"), cmpopts.EquateEmpty()); diff != "" {
			t.Fatalf("Search had non empty results (-want, +got):\n%s", diff)
		}

		rl, err := ss.List(ctx, &query.Const{Value: true}, nil)
		if err != nil {
			t.Fatal("List non-nil error", err)
		}
		if diff := cmp.Diff(&zoekt.RepoList{}, rl, cmpopts.EquateEmpty()); diff != "" {
			t.Fatalf("List had non empty results (-want, +got):\n%s", diff)
		}
	}

	dir := t.TempDir()
	t.Run("blocking", func(t *testing.T) {
		ss, err := NewDirectorySearcher(dir)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(ss.Close)

		// We expect crashes to be empty as soon as NewDirectorySearcher returns
		// so we can validate straight away.
		test(t, ss)
	})

	t.Run("fast", func(t *testing.T) {
		ss, err := NewDirectorySearcherFast(dir)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(ss.Close)

		deadline := testDeadline(t, 10*time.Second)

		// Wait for scanning of directory to be done. We should be returning
		// non-zero crashes until then.
		waitForPredicate(deadline, 10*time.Millisecond, func() bool {
			res, err := ss.Search(ctx, &query.Const{Value: true}, nil)
			if err != nil {
				t.Fatal(err)
			}
			return res.Stats.Crashes == 0
		})

		test(t, ss)
	})
}

// testDeadline returns the deadline for t, but ensures it is no longer than
// maxTimeout away.
func testDeadline(t *testing.T, maxTimeout time.Duration) time.Time {
	deadline := time.Now().Add(maxTimeout)
	if d, ok := t.Deadline(); ok && d.Before(deadline) {
		// give 1s for us to do a final test run
		deadline = d.Add(-time.Second)
	}
	return deadline
}

func waitForPredicate(deadline time.Time, tick time.Duration, pred func() bool) bool {
	for time.Now().Before(deadline) {
		if pred() {
			return true
		}

		time.Sleep(tick)
	}

	return pred()
}
