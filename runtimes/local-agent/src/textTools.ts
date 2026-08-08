/**
 * Language & Text NLP tools — text analysis, summarization,
 * sentiment analysis, entity extraction, and language detection.
 */
import { z } from "zod";
import type { ToolDef } from "./toolBus.js";

// =============================================================================
// TEXT ANALYZE — word count, readability, sentiment, entities, language
// =============================================================================

export const textAnalyze: ToolDef = {
  name: "text.analyze",
  description: "Analyze text: word/sentence/paragraph count, reading time, readability scores (Flesch-Kincaid), sentiment analysis (positive/negative/neutral with score), keyword extraction (frequency-based), and language detection. Comprehensive text statistics for any input.",
  inputSchema: z.object({
    text: z.string().describe("Text to analyze"),
    operations: z.array(z.enum(["stats", "readability", "sentiment", "keywords", "language", "all"])).default(["all"]).describe("Analysis operations to perform"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    stats: z.object({
      words: z.number(),
      sentences: z.number(),
      paragraphs: z.number(),
      characters: z.number(),
      characters_no_spaces: z.number(),
      reading_time_min: z.number(),
      speaking_time_min: z.number(),
    }).optional(),
    readability: z.object({
      flesch_score: z.number(),
      flesch_grade: z.string(),
      avg_words_per_sentence: z.number(),
      avg_syllables_per_word: z.number(),
    }).optional(),
    sentiment: z.object({
      label: z.string(),
      score: z.number(),
      positive_words: z.array(z.string()).optional(),
      negative_words: z.array(z.string()).optional(),
    }).optional(),
    keywords: z.array(z.object({ word: z.string(), count: z.number() })).optional(),
    language: z.string().optional(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ text, operations }) {
    const steps: string[] = [];
    const doAll = operations.includes("all");
    const result: any = { success: true, result: "", steps, message: "" };

    try {
      // Stats
      if (doAll || operations.includes("stats")) {
        const words = text.trim().split(/\s+/).filter(Boolean);
        const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
        const paragraphs = text.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
        const characters = text.length;
        const charactersNoSpaces = text.replace(/\s/g, "").length;
        const wordCount = words.length;
        const readingTime = Math.ceil(wordCount / 200); // 200 wpm
        const speakingTime = Math.ceil(wordCount / 130); // 130 wpm

        result.stats = {
          words: wordCount,
          sentences: sentences.length,
          paragraphs: paragraphs.length,
          characters,
          characters_no_spaces: charactersNoSpaces,
          reading_time_min: readingTime,
          speaking_time_min: speakingTime,
        };
        steps.push(`Stats: ${wordCount} words, ${sentences.length} sentences, ${paragraphs.length} paragraphs`);
        steps.push(`Reading time: ${readingTime} min, Speaking time: ${speakingTime} min`);
      }

      // Readability
      if (doAll || operations.includes("readability")) {
        const words = text.trim().split(/\s+/).filter(Boolean);
        const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
        const wordCount = words.length;
        const sentenceCount = Math.max(1, sentences.length);

        // Count syllables (approximation)
        const countSyllables = (word: string): number => {
          word = word.toLowerCase().replace(/[^a-z]/g, "");
          if (word.length <= 3) return 1;
          word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
          word = word.replace(/^y/, "");
          const matches = word.match(/[aeiouy]{1,2}/g);
          return matches ? matches.length : 1;
        };

        const totalSyllables = words.reduce((sum: number, w: string) => sum + countSyllables(w), 0);
        const avgWordsPerSentence = wordCount / sentenceCount;
        const avgSyllablesPerWord = totalSyllables / Math.max(1, wordCount);

        // Flesch Reading Ease
        const fleschScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
        let fleschGrade: string;
        if (fleschScore >= 90) fleschGrade = "5th grade (very easy)";
        else if (fleschScore >= 80) fleschGrade = "6th grade (easy)";
        else if (fleschScore >= 70) fleschGrade = "7th grade (fairly easy)";
        else if (fleschScore >= 60) fleschGrade = "8th-9th grade (standard)";
        else if (fleschScore >= 50) fleschGrade = "10th-12th grade (fairly difficult)";
        else if (fleschScore >= 30) fleschGrade = "College (difficult)";
        else fleschGrade = "College graduate (very difficult)";

        result.readability = {
          flesch_score: Math.round(fleschScore * 10) / 10,
          flesch_grade: fleschGrade,
          avg_words_per_sentence: Math.round(avgWordsPerSentence * 10) / 10,
          avg_syllables_per_word: Math.round(avgSyllablesPerWord * 100) / 100,
        };
        steps.push(`Readability: Flesch score ${fleschScore.toFixed(1)} (${fleschGrade})`);
      }

      // Sentiment
      if (doAll || operations.includes("sentiment")) {
        const positiveWords = new Set(["good", "great", "excellent", "amazing", "wonderful", "fantastic", "happy", "love", "best", "awesome", "perfect", "beautiful", "brilliant", "superb", "outstanding", "positive", "success", "win", "joy", "delight", "pleased", "thankful", "grateful", "exciting", "impressive", "remarkable", "terrific", "fabulous", "magnificent", "splendid", "enjoy", "enjoyed", "like", "liked", "recommend", "worthwhile", "beneficial", "favorable", "optimistic", "hopeful", "cheerful", "glad", "satisfied", "content", "thrilled", "elated", "proud", "confident", "encouraged", "inspired", "motivated"]);
        const negativeWords = new Set(["bad", "terrible", "awful", "horrible", "hate", "worst", "disgusting", "ugly", "disappointing", "disappointed", "sad", "angry", "furious", "poor", "fail", "failure", "lost", "lose", "wrong", "stupid", "boring", "annoying", "frustrated", "frustrating", "painful", "difficult", "problem", "issue", "error", "broken", "useless", "worthless", "negative", "unhappy", "depressed", "anxious", "worried", "afraid", "scared", "fear", "dislike", "regret", "sorry", "apology", "complaint", "criticize", "blame", "shame", "embarrassed", "insulted", "offended", "hurt", "suffering", "agony", "torment", "dreadful", "appalling", "lousy", "mediocre", "inferior", "defective", "flawed", "mistake", "wrong"]);

        const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
        let score = 0;
        const foundPositive: string[] = [];
        const foundNegative: string[] = [];

        for (const word of words) {
          if (positiveWords.has(word)) {
            score += 1;
            if (!foundPositive.includes(word)) foundPositive.push(word);
          }
          if (negativeWords.has(word)) {
            score -= 1;
            if (!foundNegative.includes(word)) foundNegative.push(word);
          }
        }

        const label = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
        result.sentiment = {
          label,
          score,
          positive_words: foundPositive,
          negative_words: foundNegative,
        };
        steps.push(`Sentiment: ${label} (score: ${score > 0 ? "+" : ""}${score})`);
        if (foundPositive.length > 0) steps.push(`  Positive: ${foundPositive.join(", ")}`);
        if (foundNegative.length > 0) steps.push(`  Negative: ${foundNegative.join(", ")}`);
      }

      // Keywords
      if (doAll || operations.includes("keywords")) {
        const stopWords = new Set(["the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "can", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they", "what", "which", "who", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "of", "in", "on", "at", "to", "for", "with", "about", "as", "by", "from", "up", "down", "out", "if", "then", "there", "here", "also", "into", "over", "after"]);
        const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
        const counts: Record<string, number> = {};
        for (const word of words) {
          if (word.length < 3 || stopWords.has(word)) continue;
          counts[word] = (counts[word] ?? 0) + 1;
        }
        const keywords = Object.entries(counts)
          .map(([word, count]) => ({ word, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        result.keywords = keywords;
        steps.push(`Keywords: ${keywords.map((k) => `${k.word}(${k.count})`).join(", ")}`);
      }

      // Language detection (simple heuristic)
      if (doAll || operations.includes("language")) {
        const commonWords: Record<string, string[]> = {
          English: ["the", "and", "is", "in", "to", "of", "a", "it", "that", "for"],
          Spanish: ["el", "la", "de", "que", "y", "en", "un", "es", "se", "no"],
          French: ["le", "la", "de", "et", "en", "un", "une", "est", "que", "pour"],
          German: ["der", "die", "das", "und", "in", "den", "von", "zu", "mit", "ist"],
          Italian: ["il", "la", "di", "che", "e", "in", "un", "per", "non", "una"],
        };
        const textWords = new Set(text.toLowerCase().match(/\b[a-z]+\b/g) || []);
        let bestLang = "English";
        let bestScore = 0;
        for (const [lang, words] of Object.entries(commonWords)) {
          const score = words.filter((w) => textWords.has(w)).length;
          if (score > bestScore) {
            bestScore = score;
            bestLang = lang;
          }
        }
        result.language = bestLang;
        steps.push(`Language: ${bestLang} (confidence: ${bestScore}/${10})`);
      }

      result.result = steps.join("; ");
      result.message = `Analysis complete: ${result.stats ? `${result.stats.words} words, ` : ""}${result.sentiment ? `sentiment: ${result.sentiment.label}, ` : ""}${result.readability ? `Flesch: ${result.readability.flesch_score}` : ""}`;
      return result;
    } catch (e: any) {
      return { success: false, result: "", steps, message: e.message ?? String(e) };
    }
  },
};

// =============================================================================
// TEXT SUMMARIZE — extractive summarization
// =============================================================================

export const textSummarize: ToolDef = {
  name: "text.summarize",
  description: "Summarize text using extractive summarization (selects most important sentences). Supports configurable summary length (number of sentences or percentage of original). Uses word frequency scoring to identify key sentences.",
  inputSchema: z.object({
    text: z.string().describe("Text to summarize"),
    sentences_count: z.number().default(3).describe("Number of sentences in summary (alternative to ratio)"),
    ratio: z.number().optional().describe("Summary length as fraction of original (0.1-0.5). Overrides sentences_count if provided."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    summary: z.string(),
    original_sentences: z.number(),
    summary_sentences: z.number(),
    compression_ratio: z.number(),
    steps: z.array(z.string()),
    message: z.string(),
  }),
  permissionsRequired: [],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ text, sentences_count, ratio }) {
    const steps: string[] = [];

    try {
      // Split into sentences
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      if (sentences.length === 0) {
        return { success: false, result: "", summary: "", original_sentences: 0, summary_sentences: 0, compression_ratio: 0, steps, message: "No sentences found" };
      }

      // Determine summary length
      const numSentences = ratio !== undefined
        ? Math.max(1, Math.round(sentences.length * ratio))
        : Math.min(sentences_count, sentences.length);

      // Word frequency scoring
      const stopWords = new Set(["the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they", "in", "on", "at", "to", "for", "of", "with", "as", "by", "from"]);
      const wordFreq: Record<string, number> = {};
      for (const sentence of sentences) {
        const words = sentence.toLowerCase().match(/\b[a-z]+\b/g) || [];
        for (const word of words) {
          if (!stopWords.has(word) && word.length > 2) {
            wordFreq[word] = (wordFreq[word] ?? 0) + 1;
          }
        }
      }

      // Score sentences
      const scored = sentences.map((sentence: string, idx: number) => {
        const words = sentence.toLowerCase().match(/\b[a-z]+\b/g) || [];
        let score = 0;
        for (const word of words) {
          score += wordFreq[word] ?? 0;
        }
        // Normalize by sentence length to avoid bias toward long sentences
        const normalizedScore = words.length > 0 ? score / Math.sqrt(words.length) : 0;
        // Slight bonus to first and last sentences (often contain key info)
        if (idx === 0) normalizedScore * 1.2;
        if (idx === sentences.length - 1) normalizedScore * 1.1;
        return { sentence, idx, score: normalizedScore };
      });

      // Select top sentences, maintain original order
      const topSentences = scored
        .sort((a: { sentence: string; idx: number; score: number }, b: { sentence: string; idx: number; score: number }) => b.score - a.score)
        .slice(0, numSentences)
        .sort((a: { sentence: string; idx: number; score: number }, b: { sentence: string; idx: number; score: number }) => a.idx - b.idx)
        .map((s: { sentence: string; idx: number; score: number }) => s.sentence.trim());

      const summary = topSentences.join(" ");
      const compressionRatio = (summary.length / text.length) * 100;

      steps.push(`Extractive summarization:`);
      steps.push(`  Original: ${sentences.length} sentences, ${text.length} characters`);
      steps.push(`  Summary: ${topSentences.length} sentences, ${summary.length} characters`);
      steps.push(`  Compression: ${compressionRatio.toFixed(1)}% of original`);

      return {
        success: true,
        result: summary,
        summary,
        original_sentences: sentences.length,
        summary_sentences: topSentences.length,
        compression_ratio: Math.round(compressionRatio * 10) / 10,
        steps,
        message: `Summary: ${topSentences.length} sentences (${compressionRatio.toFixed(1)}% of original)`,
      };
    } catch (e: any) {
      return { success: false, result: "", summary: "", original_sentences: 0, summary_sentences: 0, compression_ratio: 0, steps, message: e.message ?? String(e) };
    }
  },
};
