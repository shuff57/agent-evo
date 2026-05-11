---
name: book-youtube
description: Use when finding and embedding relevant YouTube educational videos for textbook sections, especially during HTML generation or as a standalone enrichment step.
disable-model-invocation: true
---

# Book YouTube

> Find relevant YouTube educational videos for textbook section topics. Searches YouTube Data API v3 with preference for trusted educational channels (Khan Academy, The Organic Chemistry Tutor, mathbff). Produces video query JSON files used by book-html-gen for embedding.

## Prerequisites
- bookSHelf project at `C:\Users\shuff\Documents\GitHub\bookSHelf`
- YouTube Data API v3 key (optional - falls back to search URLs without it)
- Section titles or topics to search for

## When to Use
- After remastering, before or during HTML generation
- Enriching sections with video resources
- Standalone lookup for educational video recommendations

## When NOT to Use
- Section has no mathematical/educational content suitable for video
- Videos already generated for this section (check for *_video_queries.json)

## Guardrails

> ⚠️ **Must NOT:**
> - Search for non-educational content
> - Include videos with fewer than 1000 views (quality threshold)
> - Search for headers like "Table of Contents", "Problem Set", "Summary"
> - Override existing video query files without user confirmation

## Limits
- Max queries per section: ~10-15 (based on subsection headers)
- Excluded headers: table of contents, problem set, exercises, summary, glossary, references

## Quick Start
1. Extract section titles/subtopics from remastered markdown
2. Run youtube_lookup to find videos for each topic
3. Review results and save as video_queries.json
4. Feed to book-html-gen for embedding

## Workflow

### Phase 1: Extract Topics
- **INPUT:** Remastered markdown file path
- **ACTION:** Parse markdown headers (H2, H3) to identify searchable topics. Filter out excluded headers (problem sets, TOC, etc.)
- **OUTPUT:** List of topic strings for YouTube search

### Phase 2: Search Videos
- **INPUT:** Topic list, subject context (e.g., "finite math")
- **ACTION:** Use youtube_lookup module:
```python
from workflows.youtube_lookup import find_videos
videos = find_videos(titles, subject="finite math")
```
Or via command line within bookSHelf:
```bash
cd C:\Users\shuff\Documents\GitHub\bookSHelf && python -c "
from scripts.workflows.youtube_lookup import find_videos
import json
titles = ['topic1', 'topic2']
results = find_videos(titles, subject='finite math')
print(json.dumps(results, indent=2))
"
```
- **OUTPUT:** List of video objects with title, url, channel, view count

### Phase 3: Save Results
- **INPUT:** Video search results
- **ACTION:** Write to `projects/{project}/html/_video_queries_{section_id}.json`
- **OUTPUT:** JSON file ready for book-html-gen consumption

## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/youtube_lookup.py` | Search YouTube API | titles list, subject string | List of video dicts |

## Preferred Channels
1. Khan Academy
2. The Organic Chemistry Tutor
3. mathbff

## Error Handling

| Problem | Action |
|---------|--------|
| No YouTube API key | Falls back to search result URLs |
| No results for topic | Return YouTube search URL as fallback |
| requests module missing | Script handles gracefully |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Searching for generic headers | Filter out "Problem Set", "Summary", etc. |
| Not specifying subject context | Always include subject for better relevance |
| Overwriting existing video files | Check for existing files first |