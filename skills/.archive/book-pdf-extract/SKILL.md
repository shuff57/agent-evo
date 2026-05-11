---
name: book-pdf-extract
description: Use when extracting content from a PDF textbook into markdown format for processing through the bookSHelf pipeline. Supports LlamaParse for advanced document structure detection, tables, and math expressions.
disable-model-invocation: true
---

# Book PDF Extract

> Extract content from PDF textbooks into markdown format suitable for the bookSHelf pipeline. Primary method is **Docling** - layout-aware extraction with image support and math formula detection. Also supports LiteParse (local, CLI-based) and pdfplumber (fallback).

## Prerequisites
- Python 3.8+
- PDF textbook file (.pdf) to process
- **LlamaParse:** LlamaCloud API key for cloud extraction (via `--llamaparse-key` or `LLAMA_CLOUD_API_KEY` env variable)
- **Docling:** `pip install docling` (optional, best for complex layouts)
- **Pdfplumber:** `pip install pdfplumber` (fallback, simpler text extraction)

## LlamaParse API Key Options

You can provide the LlamaParse API key in two ways:

1. **Environment variable:** Set `LLAMA_CLOUD_API_KEY` in your environment
2. **Command-line argument:** Use `--llamaparse-key <your-api-key>` when calling the extraction script

Example:
```bash
# Using environment variable
export LLAMA_CLOUD_API_KEY=your_api_key_here
python pdf_extract.py --pdf input.pdf --output output.md --method llamaparse

# Or using command-line argument
python pdf_extract.py --pdf input.pdf --output output.md --method llamaparse --llamaparse-key your_api_key_here
```

## When to Use
- User has uploaded a PDF textbook that needs to be converted to markdown
- Starting a new textbook project from a PDF source
- User needs to extract content from scanned or digital PDF textbooks

## When NOT to Use
- Source content is already in markdown format (use book-scrape instead)
- PDF contains images that need OCR (use book-ocr-extract instead)

## Guardrails

> ⚠️ **Must NOT:**
> - Skip validation of output markdown
> - Overwrite existing markdown files without confirmation
> - Process corrupted or malformed PDFs without user warning
> - Use LlamaParse without API key if using cloud features

## Extraction Methods

### Method 1: LlamaParse (Best for Textbooks)
- Uses LlamaIndex's LlamaParse model
- Excellent at detecting document structure
- Handles math formulas well
- Preserves table formatting
- **Setup:** Set `LLAMA_CLOUD_API_KEY` environment variable or use `--llamaparse-key` argument
- **Install:** `pip install llama-parse`

### Method 2: Docling (Primary - Recommended)
- Focuses on layout-aware extraction
- Excellent for textbooks with mixed text/images
- Automatically extracts `<!-- image -->` placeholders
- Generates proper markdown with `##` headers
- **Install:** `pip install docling`
- **CLI:** `docling <file.pdf> --output <file.md>`

### Method 3: Pdfplumber (Fallback)
- Works without API keys
- Simple text extraction with page-by-page processing
- **Install:** `pip install pdfplumber Pillow`

## Quick Start
1. Verify PDF file exists and is valid
2. Choose extraction method based on availability
3. Run extraction with --verbose for progress
4. Check extracted markdown quality
5. Proceed to next pipeline stage

## Workflow

### Phase 1: Validate Input
- **INPUT:** PDF file path
- **ACTION:** Check file exists, verify it's a PDF, check size (<1GB for local methods)
- **OUTPUT:** Confirmed PDF file info (pages, size)

### Phase 2: Extract Content ( Method selection)
- **LlamaParse (preferred):** Uses LlamaParse for structure-aware extraction
- **Docling (alternative):** Layout-aware extraction from docling
- **Pdfplumber (fallback):** Page-by-page text extraction

### Phase 3: Format Output
- **INPUT:** Extracted text
- **ACTION:** 
  - Convert headings to markdown headers
  - Preserve basic formatting
  - Handle page breaks
  - Extract tables as markdown tables (if available)
- **OUTPUT:** `full.md` in extracted directory

### Phase 4: Validation
- **INPUT:** Extracted markdown
- **ACTION:** 
  - Check file size is reasonable (>1KB)
  - Verify headings structure
  - Check for excessive page numbers/artifacts
- **OUTPUT:** Validation report + extracted file location

## Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `bookSHelf/scripts/workflows/pdf_extract.py` | Default extraction (auto-selects best method, supports llamaparse with --llamaparse-key) | PDF path | full.md in source_files/extracted/ |

## Error Handling

| Problem | Action |
|---------|--------|
| PDF file not found | Report error with file path |
| File too large (>1GB) | Warn user, ask to proceed or use chunked extraction |
| API key not set for LlamaParse | Fall back to pdfplumber automatically |
| Extraction fails with all methods | Report detailed error, suggest manual scraping |
| Poor quality output | Suggest using docling with better layout handling |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not setting LlamaParse API key | Use docling or pdfplumber instead |
| Using image-heavy PDFs | Recommend OCR approach or manual scraping |
| Ignoring extraction warnings | Review output, consider alternative sources |
| Not validating output | Always check extracted markdown quality |
| Processing corrupted PDFs | Use PDF repair tool first or manual extraction |
