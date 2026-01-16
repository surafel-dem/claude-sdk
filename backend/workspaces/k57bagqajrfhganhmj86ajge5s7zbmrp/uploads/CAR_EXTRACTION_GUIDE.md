# Car Listing Extraction System - Developer Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture & Flow](#architecture--flow)
3. [Input Configuration](#input-configuration)
4. [Google URL Context Setup](#google-url-context-setup)
5. [Prompt Engineering](#prompt-engineering)
6. [Data Extraction Process](#data-extraction-process)
7. [Data Cleaning & Normalization](#data-cleaning--normalization)
8. [Schema & Validation](#schema--validation)
9. [Common Issues & Solutions](#common-issues--solutions)
10. [Platform-Specific Patterns](#platform-specific-patterns)
11. [Code Reference](#code-reference)
12. [Best Practices](#best-practices)

---

## Overview

This system extracts car listing data from Irish car websites (cars.ie, donedeal.ie) using Google's URL Context AI tool. It transforms unstructured HTML into clean, structured JSON data with comprehensive car details including images, pricing, and specifications.

### Key Features
- ✅ **Image Extraction**: Gets actual car photos from both platforms
- ✅ **Data Normalization**: Standardizes data across different site structures
- ✅ **Error Handling**: Robust error handling for blocked sites and parsing issues
- ✅ **Clean UI**: Simple interface - just paste URL and extract
- ✅ **Production Ready**: No debug logging, structured errors, proper sanitization

---

## Architecture & Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                           │
│  - URL: https://www.cars.ie/used-cars?make=BMW              │           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Route                         │
│  File: app/api/extract/google/route.ts                      │
│  - Receives POST request                                    │
│  - Validates URL                                            │
│  - Calls extractWithGoogle()                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Google URL Context Extractor                 │
│  File: lib/extractors/google.ts                             │
│  - Setup: Model, prompt, generation config                 │
│  - Call Google AI with URL Context tool                    │
│  - Receive raw response                                    │
│  - Extract and sanitize JSON                               │
│  - Handle errors                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Data Cleaning & Normalization                  │
│  File: lib/extractors/prepare-cars.ts                       │
│  - Platform-agnostic normalization                         │
│  - Data validation                                         │
│  - Field mapping                                           │
│  - URL cleaning                                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Zod Schema Validation                      │
│  File: lib/car-schema.ts                                   │
│  - Type safety                                             │
│  - Data validation                                         │
│  - Field requirements                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      CarCard UI                             │
│  File: components/car-card.tsx                             │
│  - Display extracted data                                  │
│  - Image rendering                                         │
│  - Price, location, specs                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Input Configuration

### API Route Input
**File**: `app/api/extract/google/route.ts`

```typescript
// Request body
{
  "url": "https://www.cars.ie/used-cars?make=BMW"
}

// No additional settings needed - everything is configured in the extractor
```

### Extractor Configuration
**File**: `lib/extractors/google.ts` (Lines 34-37)

```typescript
// Constants for maintainability
const MODEL_NAME = 'gemini-2.5-flash-lite';        // Model selection
const MAX_OUTPUT_TOKENS = 8192;                     // Token limit mostly donedeal need more tokens
const TEMPERATURE = 0.1;                            // Creativity (lower = more consistent)
```

**Configuration Explanation**:
- **MODEL_NAME**: Using `gemini-2.5-flash-lite` for fast, cost-effective extraction
- **MAX_OUTPUT_TOKENS**: 8192 tokens handles long responses with donedeal's image URLs
- **TEMPERATURE**: 0.1 ensures consistent JSON output (lower = more predictable)

---

## Google URL Context Setup

### Initialize Google AI Client

**File**: `lib/extractors/google.ts` (Lines 62-72)

```typescript
export async function extractWithGoogle(url: string): Promise<ExtractionResult> {
  try {
    // 1. Check API key
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new ExtractionError('GOOGLE_GENERATIVE_AI_API_KEY not configured', 'CONFIG');
    }

    // 2. Initialize client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // 3. Generate content with URL Context tool
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: EXTRACTION_PROMPT }, { text: url }] }],
      generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS },
      tools: [{ urlContext: {} }] as any,
    });

    // Continue extraction...
  }
}
```

### Generation Config
```typescript
generationConfig: {
  temperature: 0.1,        // Low creativity for consistent output
  maxOutputTokens: 8192,   // Allow long responses with many cars
}
```

### Tool Configuration
```typescript
tools: [{ urlContext: {} }]
```

**What URL Context Tool Does**:
- Automatically fetches content from the provided URL
- Google's AI analyzes the HTML structure
- AI can see and understand the page content
- Returns structured response based on our prompt

---

## Prompt Engineering

### The Prompt Structure
**File**: `lib/extractors/google.ts` (Lines 5-37)

The prompt is critical for accurate extraction. It has 5 sections:

#### 1. JSON Structure Definition
```typescript
Return ONLY valid JSON matching this structure:
{"cars":[
  {
    "make":"BMW","model":"3 Series","year":2021,"price":25990,
    "mileage":52000,"location":"Dublin","fuel_type":"Diesel",
    "transmission":"Automatic","listing_url":"https://example.com","image_url":"https://example.com/img.jpg"
  }
]}
```

**Why this works**:
- Sets exact JSON format expectations
- Shows example data
- AI knows what to return

#### 2. Rules Section
```typescript
Rules:
- Extract all available listings from the visible grid/list
- Required fields: make, model, year, price, mileage, location
- Use 0 for missing numeric fields, "" for missing strings
```

**Key Points**:
- Tells AI to extract from visible grid/list (not detail pages)
- Defines required vs optional fields
- Instructs how to handle missing data

#### 3. Image URL Extraction (Most Critical)
**File**: `lib/extractors/google.ts` (Lines 22-33)

```typescript
image_url (CRITICAL - Platform-Specific):

1. CARS.IE (cars.ie):
   - Find <img class="car-listing-photo"> tags
   - The image URL is in the style attribute: style="background-image: url('https://c0.carsie.ie/[64-char-hash].jpg')"
   - Example: https://c0.carsie.ie/d43864c90df075c94489ddbe4ca5ffe931599f64d7d37e77fe305ebec6e2427b.jpg
   - DO NOT use the src attribute (it contains a placeholder like "no_bg.png")
   - Extract the full URL from background-image CSS property

2. DONEDEAL.IE (donedeal.ie):
   - Look for <img src="https://media.donedeal.ie/..."> URLs
   - Full signed URLs with signature query parameters
```

**Why this is detailed**:
- Each platform has different HTML structure
- Tells AI EXACTLY where to find images
- Provides real URL examples
- Warns about common mistakes (using src instead of style)

**Common Issue**: Without this detailed guidance, AI often returns empty image URLs or wrong attributes.

#### 4. Listing URL
```typescript
listing_url: Absolute URL to the individual car listing page
```

#### 5. Output Format
```typescript
Output strictly JSON only, no prose or markdown
```

**Critical**: This prevents AI from adding explanations or markdown formatting.

---

## Data Extraction Process

### Step 1: Extract Response Text
**File**: `lib/extractors/google.ts` (Lines 145-148)

```typescript
// Extract response text from Google AI result
function extractResponseText(result: any): string {
  const parts = result?.response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => ('text' in p ? p.text : '')).join('').trim() || result?.response?.text() || '';
}
```

**What it does**:
- Extracts text from Google's response structure
- Joins all parts into single string
- Handles edge cases (empty parts)

### Step 2: Parse JSON
**File**: `lib/extractors/google.ts` (Lines 160-180)

```typescript
function extractJson(text: string): string | null {
  if (!text) return null;

  let jsonText = text.trim();

  // Remove markdown code fences if present
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  jsonText = fenceMatch?.[1]?.trim() || jsonText;

  // Sanitize control characters that break JSON.parse
  jsonText = jsonText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Validate it's proper JSON
  try {
    JSON.parse(jsonText);
    return jsonText;
  } catch {
    return null;
  }
}
```

**What it does**:
1. Removes markdown code fences: ```json ... ```
2. Sanitizes control characters (common in long responses)
3. Validates JSON is parseable

**Critical Issue**: Long responses from Google often contain invalid control characters. Without sanitization, JSON.parse() fails.

### Step 3: Check for Access Errors
**File**: `lib/extractors/google.ts` (Lines 106-113)

```typescript
if (text.includes('I am sorry') || text.includes('unable to access')) {
  throw new ExtractionError(
    'Unable to access the URL. The site may be blocking Google\'s crawlers or requires authentication.',
    'RETRIEVAL'
  );
}
```

**Why this matters**:
- Some sites (carsireland.ie) block Google's crawlers
- AI returns "I am sorry..." message instead of data
- We detect this and throw proper error

### Step 4: Parse & Normalize
**File**: `lib/extractors/google.ts` (Lines 118-123)

```typescript
const parsed = JSON.parse(jsonStr);                    // Parse JSON string
const normalized = prepareCarsPayload(parsed, url);    // Normalize data
const validated = CarsResponseSchema.parse(normalized); // Validate with Zod
```

---

## Data Cleaning & Normalization

**File**: `lib/extractors/prepare-cars.ts`

This file is critical - it makes data from different platforms consistent.

### Purpose
- Convert platform-specific data to standardized format
- Handle missing/invalid data
- Clean URLs and normalize text
- Apply platform-specific rules

### Key Functions

#### 1. prepareCarsPayload()
**File**: `lib/extractors/prepare-cars.ts` (Lines 21-45)

```typescript
export function prepareCarsPayload(data: any, sourceUrl: string) {
  // 1. Get cars array
  const cars = data?.cars || data || [];
  if (!Array.isArray(cars)) return { cars: [] };

  // 2. Normalize each car
  const normalizedCars = cars.map((car) => normalizeCar(car, sourceUrl));

  // 3. Filter invalid cars
  const validCars = normalizedCars.filter(
    (car) => car.make && car.model && car.year > 0
  );

  return { cars: validCars };
}
```

**What it does**:
- Extracts cars array from response
- Normalizes each car
- Filters out invalid entries (missing make/model/year)

#### 2. normalizeCar()
**File**: `lib/extractors/prepare-cars.ts` (Lines 47-89)

```typescript
function normalizeCar(car: any, sourceUrl: string) {
  const urlDomain = extractDomain(sourceUrl);

  return {
    make: sanitizeString(car.make),
    model: sanitizeString(car.model),
    year: sanitizeYear(car.year),
    price: sanitizePrice(car.price),
    mileage: sanitizeMileage(car.mileage),
    location: sanitizeString(car.location),
    fuel_type: sanitizeString(car.fuel_type),
    transmission: sanitizeString(car.transmission),
    listing_url: sanitizeUrl(car.listing_url, urlDomain),
    image_url: sanitizeImageUrl(car.image_url, urlDomain),
  };
}
```

**Key Points**:
- **Platform detection**: `extractDomain()` determines which site we're scraping
- **Per-field sanitization**: Each field has its own sanitization logic
- **URL handling**: Converts relative URLs to absolute URLs

#### 3. Platform-Specific Image Handling

**File**: `lib/extractors/prepare-cars.ts` (Lines 91-107)

```typescript
function sanitizeImageUrl(imageUrl: any, domain: string): string {
  if (!imageUrl || typeof imageUrl !== 'string') return '';
  if (isPlaceholderImage(imageUrl)) return '';

  if (domain.includes('cars.ie')) {
    return imageUrl.startsWith('http')
      ? imageUrl.replace(/^https?:\/\/[^/]+/, 'https://c0.carsie.ie')
      : `https://c0.carsie.ie/${imageUrl.replace(/^\//, '')}`;
  }

  if (domain.includes('donedeal')) {
    return imageUrl.startsWith('http')
      ? imageUrl
      : `https://media.donedeal.ie${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
  }

  return imageUrl;
}
```

**What this does**:
- For **cars.ie**: Ensures URLs use `https://c0.carsie.ie` domain
- For **donedeal.ie**: Ensures URLs use `https://media.donedeal.ie` domain
- Removes placeholder images
- Converts relative URLs to absolute

#### 4. Image Filtering
**File**: `lib/extractors/prepare-cars.ts` (Lines 109-117)

```typescript
function isPlaceholderImage(url: string): boolean {
  if (!url) return true;
  const urlLower = url.toLowerCase();
  return (
    urlLower.includes('no-image') ||
    urlLower.includes('placeholder') ||
    urlLower.includes('logo') ||
    urlLower.includes('svg') ||
    urlLower.endsWith('/no_bg.png')
  );
}
```

**Critical for cars.ie**: The AI might still return empty or placeholder URLs. This filters them out.

---

## Schema & Validation

**File**: `lib/car-schema.ts`

### Car Schema Definition

```typescript
export const CarSchema = z.object({
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  price: z.number().int().min(0),
  mileage: z.number().int().min(0),
  location: z.string().default(''),
  fuel_type: z.string().default(''),
  transmission: z.string().default(''),
  listing_url: z.string().url().optional().or(z.literal('')),
  image_url: z.string().url().optional().or(z.literal('')),
});

export const CarsResponseSchema = z.object({
  cars: z.array(CarSchema),
});
```

### Validation Rules

| Field | Type | Rules |
|-------|------|-------|
| **make** | string | Required, non-empty |
| **model** | string | Required, non-empty |
| **year** | number | Integer, between 1900 and current year + 2 |
| **price** | number | Integer, non-negative (0 if missing) |
| **mileage** | number | Integer, non-negative (0 if missing) |
| **location** | string | Optional, default '' |
| **fuel_type** | string | Optional, default '' |
| **transmission** | string | Optional, default '' |
| **listing_url** | string | Valid URL or empty string |
| **image_url** | string | Valid URL or empty string |

### Why Validation Matters
1. **Type Safety**: Prevents runtime errors from wrong types
2. **Data Quality**: Ensures all cars have required fields
3. **UI Stability**: Prevents crashes from invalid data
4. **API Contract**: Ensures consistent output format

---

## Common Issues & Solutions

### 1. Empty Image URLs (cars.ie)

**Symptom**: All `image_url` fields are empty strings

**Root Cause**: AI doesn't know to look in `style="background-image: url('...')"` attribute

**Solution**: Make prompt explicit (as shown in prompt section)

**Code Reference**: `lib/extractors/google.ts` lines 22-33

---

### 2. JSON Parse Errors (donedeal.ie)

**Symptom**: `SyntaxError: Bad control character in string literal`

**Root Cause**: Long responses with donedeal's signed image URLs contain invalid control characters

**Solution**: Sanitize control characters in `extractJson()` function

**Code Reference**: `lib/extractors/google.ts` line 171

```typescript
jsonText = jsonText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
```

---

### 3. Site Blocking Access (carsireland.ie)

**Symptom**: Response is "I am sorry, but I am unable to access..."

**Root Cause**: Site blocks Google's crawlers (robots.txt, anti-bot measures)

**Solution**: Detect and throw user-friendly error

**Code Reference**: `lib/extractors/google.ts` lines 107-113

---

### 4. URL Limit Exceeded

**Symptom**: "Number of urls to lookup exceeds the limit (21 > 20)"

**Root Cause**: Page has more than 20 links/images, exceeding Google URL Context limit

**Solution**: Detect error and show helpful message

**Code Reference**: `lib/extractors/google.ts` lines 132-139

---

### 5. Truncated JSON Responses

**Symptom**: Response cuts off mid-parsing

**Root Cause**: `maxOutputTokens` too small for number of cars

**Solution**: Increase `MAX_OUTPUT_TOKENS` (currently 8192)

**Code Reference**: `lib/extractors/google.ts` line 36

---

## Platform-Specific Patterns

### cars.ie

**URLs**: `https://c0.carsie.ie/[64-char-hash].jpg`

**Image Location**:
```html
<img src="no_bg.png" class="car-listing-photo"
     style="background-image: url('https://c0.carsie.ie/d43864c90df075c94489ddbe4ca5ffe9...jpg')">
```

**Notes**:
- Image URL is in **style attribute**, NOT src
- src contains placeholder image
- Hash is 64 characters long
- Need to normalize domain to `c0.carsie.ie`

---

### donedeal.ie

**URLs**: `https://media.donedeal.ie/eyJ.../photo_xxx.jpg?signature=xxx`

**Image Location**:
```html
<img src="https://media.donedeal.ie/eyJ.../photo_xxx.jpg?signature=xxx">
```

**Notes**:
- Direct img src attribute
- URLs are signed (contain ?signature=...)
- Can be very long (200+ characters)
- Need to sanitize control characters

---

## Code Reference

### File Structure
```
lib/
├── extractors/
│   ├── google.ts          # Main Google URL Context extractor
│   ├── prepare-cars.ts    # Data cleaning & normalization
│   └── firecrawl.ts       # Removed (no longer used)
├── car-schema.ts          # Zod schema validation
└── utils.ts              # Utilities

app/
├── api/extract/
│   └── google/
│       └── route.ts       # Next.js API route
└── page.tsx              # Main UI page

components/
└── car-card.tsx          # Car display component
```

### Key Functions Reference

#### google.ts
- `extractWithGoogle()` - Main entry point (line 58)
- `extractJson()` - JSON parsing with sanitization (line 160)
- `extractResponseText()` - Extract text from AI response (line 145)

#### prepare-cars.ts
- `prepareCarsPayload()` - Normalize car data (line 21)
- `normalizeCar()` - Clean individual car (line 47)
- `sanitizeImageUrl()` - Clean and normalize image URLs (line 91)
- `isPlaceholderImage()` - Filter placeholder images (line 109)

#### car-schema.ts
- `CarSchema` - Individual car validation (line 11)
- `CarsResponseSchema` - Response validation (line 24)

---

## Best Practices

### 1. Prompt Engineering

✅ **DO**:
- Provide specific HTML structure examples
- Show real URL examples
- Warn about common mistakes
- Be explicit about where to find data

❌ **DON'T**:
- Use generic instructions
- Assume AI knows platform structures
- Forget to specify data format

---

### 2. Error Handling

✅ **DO**:
- Check for API key configuration
- Detect and handle blocked sites
- Sanitize all user-facing errors
- Log errors server-side for debugging

❌ **DON'T**:
- Expose internal errors to users
- Ignore missing API keys
- Let unhandled errors crash the app

---

### 3. Data Validation

✅ **DO**:
- Validate all data with Zod
- Filter invalid cars
- Handle missing/empty values gracefully
- Normalize URLs

❌ **DON'T**:
- Trust AI output blindly
- Skip validation for performance
- Pass invalid data to UI

---

### 4. Token Limits

✅ **DO**:
- Set `maxOutputTokens` appropriately (8192 for car extraction)
- Test with maximum expected response size
- Monitor token usage in production

❌ **DON'T**:
- Set too low (truncated responses)
- Set too high (unnecessary cost)
- Ignore token count in usage metadata

---

## Testing Checklist

### Basic Functionality
- [ ] cars.ie URL extracts with images
- [ ] donedeal.ie URL extracts with images
- [ ] No JSON parse errors
- [ ] Error handling works for blocked sites

### Image Extraction
- [ ] cars.ie images from background-image CSS
- [ ] donedeal.ie images from img src
- [ ] Placeholder images filtered out
- [ ] Empty URLs handled gracefully

### Data Quality
- [ ] All required fields present
- [ ] Years are valid numbers
- [ ] Prices/mileage are non-negative
- [ ] URLs are absolute and valid

### Error Scenarios
- [ ] Blocked site (carsireland.ie) shows friendly error
- [ ] Invalid URL shows validation error
- [ ] API key missing shows configuration error
- [ ] URL limit exceeded shows helpful message

---

## Summary

The extraction system works in 5 stages:

1. **Input**: URL from user
2. **Google AI**: Analyze page with URL Context tool using our detailed prompt
3. **Parse**: Extract and sanitize JSON from response
4. **Normalize**: Clean and standardize data for platform differences
5. **Validate**: Ensure data quality with Zod schema
6. **Render**: Display in CarCard UI

**Critical Success Factors**:
- ✅ Detailed, platform-specific prompts
- ✅ Control character sanitization for long responses
- ✅ Proper error handling for blocked sites
- ✅ Data normalization for platform differences
- ✅ Schema validation for data quality

**Common Pitfalls to Avoid**:
- ❌ Vague prompts → empty images
- ❌ No sanitization → JSON parse errors
- ❌ No error detection → confusing error messages
- ❌ Skipping normalization → inconsistent data
- ❌ No validation → UI crashes

---

## Quick Reference

### For Junior Developer

**To implement Google URL Context**:

1. Install dependency:
   ```bash
   npm install @google/generative-ai
   ```

2. Set environment variable:
   ```
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
   ```

3. Call extractor:
   ```typescript
   import { extractWithGoogle } from '@/lib/extractors/google';

   const result = await extractWithGoogle(url);
   if (!result.success) {
     throw new Error(result.error);
   }

   const cars = result.data.cars;
   ```

4. Render in UI:
   ```typescript
   {cars.map((car) => (
     <CarCard key={car.listing_url} car={car} />
   ))}
   ```

**Critical files to reference**:
- `lib/extractors/google.ts` - Extractor implementation
- `lib/extractors/prepare-cars.ts` - Data cleaning
- `lib/car-schema.ts` - Validation
- This documentation - Understanding patterns

---

**Need Help?** Check the Common Issues section or review the code reference for specific implementations.
