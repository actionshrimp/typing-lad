package words

import "strings"

// Level represents a keyboard zone difficulty level.
type Level int

const (
	HomeRow  Level = 1 // asdfghjkl;
	TopRow   Level = 2 // + qwertyuiop
	BottomRow Level = 3 // + zxcvbnm
	FullAlpha Level = 4 // all letters
)

// Word represents a practice word with its difficulty level and frequency rank.
type Word struct {
	Text  string
	Level Level
	Rank  int
}

// homeRowKeys are the keys reachable at Level 1.
var homeRowKeys = "asdfghjkl"

// topRowKeys adds the top row to home row keys.
var topRowKeys = homeRowKeys + "qwertyuiop"

// bottomRowKeys adds the bottom row to home+top keys.
var bottomRowKeys = topRowKeys + "zxcvbnm"

// KeysForLevel returns the set of valid keys for a given level.
func KeysForLevel(level Level) string {
	switch level {
	case HomeRow:
		return homeRowKeys
	case TopRow:
		return topRowKeys
	case BottomRow:
		return bottomRowKeys
	case FullAlpha:
		return bottomRowKeys // same as all alpha keys
	default:
		return ""
	}
}

// UsesOnlyKeys reports whether text uses only the given set of keys.
func UsesOnlyKeys(text string, keys string) bool {
	for _, ch := range text {
		if !strings.ContainsRune(keys, ch) {
			return false
		}
	}
	return true
}

func makeWords(level Level, texts []string) []Word {
	words := make([]Word, len(texts))
	for i, t := range texts {
		words[i] = Word{Text: t, Level: level, Rank: i + 1}
	}
	return words
}

// Home row words — only uses a, s, d, f, g, h, j, k, l
var homeRowWords = makeWords(HomeRow, []string{
	"a", "as", "ad", "ah", "ha", "la",
	"add", "ads", "ahs", "all", "ash", "ask",
	"dad", "fad", "gag", "gal", "gas", "had",
	"hag", "has", "jag", "lag", "lad", "lass",
	"sad", "sag", "shall", "shag", "slag",
	"glad", "dash", "gash", "lash", "hash",
	"flash", "flask", "glass", "salad", "slash",
	"fall", "hall", "half", "gaff",
})

// Top row words — uses home row + q, w, e, r, t, y, u, i, o, p
var topRowWords = makeWords(TopRow, []string{
	"the", "is", "it", "to", "of", "he", "we",
	"at", "or", "if", "so", "up", "do", "go",
	"this", "that", "with", "they", "your",
	"what", "will", "just", "said", "its",
	"were", "like", "our", "his", "her",
	"did", "get", "use", "out", "got",
	"who", "old", "let", "put", "set",
	"also", "she", "for", "are", "was",
	"off", "see", "too", "day", "way",
	"oil", "sit", "hot", "yet", "try",
	"top", "red", "tie", "eye", "dog",
	"high", "keep", "side", "still", "where",
	"right", "while", "world", "light", "their",
	"house", "those", "after", "other", "would",
	"year", "first", "these", "third", "thought",
	"head", "left", "page", "work", "life",
	"edit", "told", "here", "type", "quote",
	"quite", "figure", "leader", "fight", "wish",
})

// Bottom row words — uses home+top + z, x, c, v, b, n, m
var bottomRowWords = makeWords(BottomRow, []string{
	"in", "on", "an", "no", "am",
	"can", "but", "not", "one", "man",
	"run", "own", "now", "new", "two",
	"been", "come", "back", "much", "name",
	"even", "know", "only", "most", "give",
	"some", "time", "than", "once", "from",
	"them", "when", "then", "have", "made",
	"more", "long", "make", "many", "over",
	"such", "down", "number", "became",
	"never", "begin", "cabin", "bacon", "bunch",
	"climb", "combine", "album", "blank",
	"above", "before", "chance", "dance",
	"examine", "connect", "balance", "consider",
	"machine", "becoming", "blacksmith",
	"convince", "excellent", "uncommon",
})

// Full alpha words — longer/complex words using all keys
var fullAlphaWords = makeWords(FullAlpha, []string{
	"question", "example", "between", "because",
	"government", "important", "different", "education",
	"following", "possible", "children", "remember",
	"together", "something", "personal", "recognize",
	"anything", "everybody", "knowledge", "beautiful",
	"community", "beginning", "certainly", "character",
	"challenge", "dangerous", "equipment", "establish",
	"furniture", "guarantee", "happiness", "influence",
	"journalist", "landscape", "meanwhile", "necessary",
	"operation", "paragraph", "qualified", "recommend",
	"satisfied", "technique", "universal", "volunteer",
	"wonderful", "apologize", "breakfast", "celebrate",
	"democracy", "emphasize", "fantastic", "gratitude",
})

var allWords []Word

func init() {
	allWords = make([]Word, 0, len(homeRowWords)+len(topRowWords)+len(bottomRowWords)+len(fullAlphaWords))
	allWords = append(allWords, homeRowWords...)
	allWords = append(allWords, topRowWords...)
	allWords = append(allWords, bottomRowWords...)
	allWords = append(allWords, fullAlphaWords...)
}

// AllWords returns all practice words across all levels.
func AllWords() []Word {
	result := make([]Word, len(allWords))
	copy(result, allWords)
	return result
}

// WordsByLevel returns words for a specific level.
func WordsByLevel(level Level) []Word {
	var result []Word
	for _, w := range allWords {
		if w.Level == level {
			result = append(result, w)
		}
	}
	return result
}

// WordByText finds a word by its text. Returns the word and true if found.
func WordByText(text string) (Word, bool) {
	for _, w := range allWords {
		if w.Text == text {
			return w, true
		}
	}
	return Word{}, false
}
