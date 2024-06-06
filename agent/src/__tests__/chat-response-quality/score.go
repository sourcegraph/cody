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

package zoekt

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

const maxUInt16 = 0xffff

// addScore increments the score of the FileMatch by the computed score. If
// debugScore is true, it also adds a debug string to the FileMatch. If raw is
// -1, it is ignored. Otherwise, it is added to the debug string.
func (m *FileMatch) addScore(what string, computed float64, raw float64, debugScore bool) {
	if computed != 0 && debugScore {
		var b strings.Builder
		fmt.Fprintf(&b, "%s", what)
		if raw != -1 {
			fmt.Fprintf(&b, "(%s)", strconv.FormatFloat(raw, 'f', -1, 64))
		}
		fmt.Fprintf(&b, ":%.2f, ", computed)
		m.Debug += b.String()
	}
	m.Score += computed
}

func (m *FileMatch) addBM25Score(score float64, sumTf float64, L float64, debugScore bool) {
	if debugScore {
		m.Debug += fmt.Sprintf("bm25-score:%.2f (sum-tf: %.2f, length-ratio: %.2f)", score, sumTf, L)
	}
	m.Score += score
}

// scoreFile computes a score for the file match using various scoring signals, like
// whether there's an exact match on a symbol, the number of query clauses that matched, etc.
func (d *indexData) scoreFile(fileMatch *FileMatch, doc uint32, mt matchTree, known map[matchTree]bool, opts *SearchOptions) {
	atomMatchCount := 0
	visitMatchAtoms(mt, known, func(mt matchTree) {
		atomMatchCount++
	})

	addScore := func(what string, computed float64) {
		fileMatch.addScore(what, computed, -1, opts.DebugScore)
	}

	// atom-count boosts files with matches from more than 1 atom. The
	// maximum boost is scoreFactorAtomMatch.
	if atomMatchCount > 0 {
		fileMatch.addScore("atom", (1.0-1.0/float64(atomMatchCount))*scoreFactorAtomMatch, float64(atomMatchCount), opts.DebugScore)
	}

	maxFileScore := 0.0
	for i := range fileMatch.LineMatches {
		if maxFileScore < fileMatch.LineMatches[i].Score {
			maxFileScore = fileMatch.LineMatches[i].Score
		}

		// Order by ordering in file.
		fileMatch.LineMatches[i].Score += scoreLineOrderFactor * (1.0 - (float64(i) / float64(len(fileMatch.LineMatches))))
	}

	for i := range fileMatch.ChunkMatches {
		if maxFileScore < fileMatch.ChunkMatches[i].Score {
			maxFileScore = fileMatch.ChunkMatches[i].Score
		}

		// Order by ordering in file.
		fileMatch.ChunkMatches[i].Score += scoreLineOrderFactor * (1.0 - (float64(i) / float64(len(fileMatch.ChunkMatches))))
	}

	// Maintain ordering of input files. This
	// strictly dominates the in-file ordering of
	// the matches.
	addScore("fragment", maxFileScore)

	if opts.UseDocumentRanks && len(d.ranks) > int(doc) {
		weight := scoreFileRankFactor
		if opts.DocumentRanksWeight > 0.0 {
			weight = opts.DocumentRanksWeight
		}

		ranks := d.ranks[doc]
		// The ranks slice always contains one entry representing the file rank (unless it's empty since the
		// file doesn't have a rank). This is left over from when documents could have multiple rank signals,
		// and we plan to clean this up.
		if len(ranks) > 0 {
			// The file rank represents a log (base 2) count. The log ranks should be bounded at 32, but we
			// cap it just in case to ensure it falls in the range [0, 1].
			normalized := math.Min(1.0, ranks[0]/32.0)
			addScore("file-rank", weight*normalized)
		}
	}

	md := d.repoMetaData[d.repos[doc]]
	addScore("doc-order", scoreFileOrderFactor*(1.0-float64(doc)/float64(len(d.boundaries))))
	addScore("repo-rank", scoreRepoRankFactor*float64(md.Rank)/maxUInt16)

	if opts.DebugScore {
		fileMatch.Debug = strings.TrimSuffix(fileMatch.Debug, ", ")
	}
}

// scoreFileUsingBM25 computes a score for the file match using an approximation to BM25, the most common scoring
// algorithm for text search: https://en.wikipedia.org/wiki/Okapi_BM25. It implements all parts of the formula
// except inverse document frequency (idf), since we don't have access to global term frequency statistics.
//
// Filename matches count twice as much as content matches. This mimics a common text search strategy where you
// 'boost' matches on document titles.
//
// This scoring strategy ignores all other signals including document ranks. This keeps things simple for now,
// since BM25 is not normalized and can be tricky to combine with other scoring signals.
func (d *indexData) scoreFileUsingBM25(fileMatch *FileMatch, doc uint32, cands []*candidateMatch, opts *SearchOptions) {
	// Treat each candidate match as a term and compute the frequencies. For now, ignore case
	// sensitivity and treat filenames and symbols the same as content.
	termFreqs := map[string]int{}
	for _, cand := range cands {
		term := string(cand.substrLowered)

		if cand.fileName {
			termFreqs[term] += 5
		} else {
			termFreqs[term]++
		}
	}

	// Compute the file length ratio. Usually the calculation would be based on terms, but using
	// bytes should work fine, as we're just computing a ratio.
	fileLength := float64(d.boundaries[doc+1] - d.boundaries[doc])
	numFiles := len(d.boundaries)
	averageFileLength := float64(d.boundaries[numFiles-1]) / float64(numFiles)

	// This is very unlikely, but explicitly guard against division by zero.
	if averageFileLength == 0 {
		averageFileLength++
	}
	L := fileLength / averageFileLength

	// Use standard parameter defaults (used in Lucene and academic papers)
	k, b := 1.2, 0.75
	sumTf := 0.0 // Just for debugging
	score := 0.0
	for _, freq := range termFreqs {
		tf := float64(freq)
		sumTf += tf
		score += ((k + 1.0) * tf) / (k*(1.0-b+b*L) + tf)
	}

	fileMatch.addBM25Score(score, sumTf, L, opts.DebugScore)
}
