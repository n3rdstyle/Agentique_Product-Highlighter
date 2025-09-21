/**
 * Groq LLM Enhancement for Product Highlighter
 * Adds intelligent product understanding using Groq's fast inference
 */

class GroqProductEnhancer {
  constructor() {
    // API key - replace with your own Groq API key
    this.apiKey = 'YOUR_GROQ_API_KEY_HERE';
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = 'llama-3.1-8b-instant'; // Current fast model
    this.isEnabled = true; // Always enabled since we have the key
    this.cache = new Map(); // Cache LLM responses to reduce API calls
    this.batchQueue = []; // Queue for batching requests
    this.batchTimer = null;
    this.batchSize = 5; // Process 5 products at once
    this.batchDelay = 50; // 50ms delay to collect items for batching
    // Rate limiter removed - no limits

    // Smart usage tracking
    this.usageStats = {
      totalCalls: 0,
      cacheHits: 0,
      costSavings: 0,
      monthlyTokens: 0,
      sessionsWithLLM: 0,
      batchedRequests: 0
    };

    this.loadUsageStats();

    this.init();
  }

  async init() {
    await this.loadSettings();
  }

  async loadUsageStats() {
    try {
      const result = await chrome.storage.local.get(['groqUsageStats']);
      if (result.groqUsageStats) {
        this.usageStats = { ...this.usageStats, ...result.groqUsageStats };
      }
    } catch (error) {
      console.log('Failed to load usage stats:', error);
    }
  }

  async saveUsageStats() {
    try {
      await chrome.storage.local.set({ groqUsageStats: this.usageStats });
    } catch (error) {
      console.log('Failed to save usage stats:', error);
    }
  }

  getUsageReport() {
    // Updated cost estimate for full LLM mode
    // Conservative estimate: 300 tokens per product evaluation
    const avgTokensPerCall = 300;
    const estimatedTokens = this.usageStats.totalCalls * avgTokensPerCall;
    const estimatedCost = (estimatedTokens / 1000000) * 0.10; // $0.10 per 1M tokens

    // Calculate efficiency
    const totalRequests = this.usageStats.totalCalls + this.usageStats.cacheHits;
    const cacheHitRate = totalRequests > 0 ?
      ((this.usageStats.cacheHits / totalRequests) * 100).toFixed(1) + '%' : '0%';

    return {
      mode: 'Full LLM',
      totalAPICalls: this.usageStats.totalCalls,
      batchedRequests: this.usageStats.batchedRequests,
      cacheHitRate: cacheHitRate,
      estimatedTokens: estimatedTokens,
      estimatedMonthlyCost: '$' + estimatedCost.toFixed(2),
      efficiency: `${this.usageStats.batchedRequests}/${this.usageStats.totalCalls} batched`
    };
  }

  async loadSettings() {
    // No longer need to load API key from storage since it's hardcoded
    // Keep this method for potential future settings
    this.isEnabled = true; // Always enabled with hardcoded key

    // Test API connection if enabled
    if (this.isEnabled) {
      console.log('🧪 Testing Groq API connection...');
      this.testAPIConnection();
    }
  }

  async testAPIConnection() {
    try {
      const testPrompt = 'Rate this test from 0.0 to 1.0: "This is a test". Return only a number.';
      const response = await this.callGroqAPI(testPrompt, 50);
      console.log('✅ API Test Success:', response);
    } catch (error) {
      console.error('❌ API Test Failed:', error);
      this.isEnabled = false; // Disable if test fails
    }
  }

  /**
   * FULL LLM: Evaluate products using only LLM intelligence
   */
  async evaluateProductBatch(products, userQuery) {
    if (!this.isEnabled || !this.apiKey) {
      console.log('LLM disabled or no API key, returning zeros');
      return products.map(() => 0); // Return zeros if disabled
    }

    // Check cache first
    const results = [];
    const uncachedProducts = [];
    const uncachedIndices = [];

    products.forEach((product, index) => {
      const cacheKey = `eval_${this.hashString(product.text + userQuery)}`;
      if (this.cache.has(cacheKey)) {
        results[index] = this.cache.get(cacheKey);
        this.usageStats.cacheHits++;
      } else {
        uncachedProducts.push(product);
        uncachedIndices.push(index);
      }
    });

    // If all cached, return immediately
    if (uncachedProducts.length === 0) {
      return results;
    }

    // Estimate tokens for batch request
    const estimatedTokens = Math.min(uncachedProducts.length * 100 + 200, 1000);

    // Batch evaluate uncached products - no rate limiting

    try {
      const prompt = this.createBatchEvaluationPrompt(uncachedProducts, userQuery);
      const response = await this.callGroqAPI(prompt, 500); // More tokens for batch
      const scores = this.parseBatchScores(response, uncachedProducts.length);

      // Cache and store results
      uncachedProducts.forEach((product, i) => {
        const score = scores[i];
        const cacheKey = `eval_${this.hashString(product.text + userQuery)}`;
        this.cache.set(cacheKey, score);
        results[uncachedIndices[i]] = score;
      });

      this.usageStats.totalCalls++;
      this.usageStats.batchedRequests++;

      return results;
    } catch (error) {
      console.log('Batch evaluation failed:', error);
      // Fallback to very low scores to avoid false positives
      uncachedIndices.forEach(index => {
        results[index] = 0.1;
      });
      return results;
    }
  }

  /**
   * Queue-based single product evaluation for full LLM mode
   */
  async evaluateProduct(productText, userQuery) {
    if (!this.isEnabled || !this.apiKey) {
      console.log('LLM disabled or no API key, returning 0');
      return 0;
    }

    const cacheKey = `eval_${this.hashString(productText + userQuery)}`;
    if (this.cache.has(cacheKey)) {
      this.usageStats.cacheHits++;
      return this.cache.get(cacheKey);
    }

    return new Promise((resolve) => {
      // Add to batch queue
      this.batchQueue.push({
        text: productText,
        query: userQuery,
        resolve,
        cacheKey
      });

      // Start or reset batch timer
      if (this.batchTimer) clearTimeout(this.batchTimer);

      this.batchTimer = setTimeout(() => {
        this.processBatchQueue();
      }, this.batchDelay);

      // Process immediately if batch is full
      if (this.batchQueue.length >= this.batchSize) {
        clearTimeout(this.batchTimer);
        this.processBatchQueue();
      }
    });
  }

  async processBatchQueue() {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.batchSize);

    // No rate limiting - process all requests

    try {
      const products = batch.map(item => ({ text: item.text }));
      const userQuery = batch[0].query; // All should have same query

      const prompt = this.createBatchEvaluationPrompt(products, userQuery);
      const response = await this.callGroqAPI(prompt, 500);
      const scores = this.parseBatchScores(response, batch.length);

      batch.forEach((item, i) => {
        const score = scores[i];
        this.cache.set(item.cacheKey, score);
        item.resolve(score);
      });

      this.usageStats.totalCalls++;
      this.usageStats.batchedRequests++;
    } catch (error) {
      console.log('Batch processing failed:', error);
      batch.forEach(item => item.resolve(0.1));
    }
  }

  /**
   * SMART HYBRID: Intelligent product detection for ambiguous elements
   */
  async smartProductDetection(element, userQuery) {
    if (!this.isEnabled) {
      return null;
    }

    const elementText = this.extractElementContext(element);
    const cacheKey = `detect_${this.hashString(elementText)}`;

    if (this.cache.has(cacheKey)) {
      this.usageStats.cacheHits++;
      return this.cache.get(cacheKey);
    }

    try {
      const prompt = this.createProductDetectionPrompt(elementText, userQuery);
      const response = await this.callGroqAPI(prompt);
      const detection = this.parseProductDetection(response);

      this.cache.set(cacheKey, detection);
      this.usageStats.totalCalls++;
      return detection;
    } catch (error) {
      console.log('Smart product detection failed:', error);
      return null;
    }
  }

  /**
   * Enhanced product understanding for complex queries
   */
  async deepProductAnalysis(productText, userQuery, ruleBasedScore) {
    if (!this.isEnabled) {
      return ruleBasedScore;
    }

    // Use LLM for:
    // 1. Complex queries (multiple criteria)
    // 2. Ambiguous rule-based scores (0.3-0.7 range)
    // 3. High-value potential matches
    const isComplexQuery = this.isComplexQuery(userQuery);
    const isAmbiguous = ruleBasedScore >= 0.3 && ruleBasedScore <= 0.7;
    const hasHighPotential = ruleBasedScore > 0.5;

    if (!isComplexQuery && !isAmbiguous && !hasHighPotential) {
      return ruleBasedScore;
    }

    const cacheKey = `analysis_${this.hashString(productText + userQuery)}`;
    if (this.cache.has(cacheKey)) {
      this.usageStats.cacheHits++;
      return this.cache.get(cacheKey);
    }

    try {
      const prompt = this.createDeepAnalysisPrompt(productText, userQuery, ruleBasedScore);
      const response = await this.callGroqAPI(prompt);
      const analysis = this.parseDeepAnalysis(response);

      // Smart score combination based on confidence
      const finalScore = this.smartScoreCombination(ruleBasedScore, analysis);

      this.cache.set(cacheKey, finalScore);
      this.usageStats.totalCalls++;
      return finalScore;
    } catch (error) {
      console.log('Deep product analysis failed:', error);
      return ruleBasedScore;
    }
  }

  /**
   * Legacy method - now uses deepProductAnalysis
   */
  async evaluateProductWithLLM(productText, userQuery, ruleBasedScore) {
    return await this.deepProductAnalysis(productText, userQuery, ruleBasedScore);
  }

  createQueryAnalysisPrompt(userQuery) {
    return `Analyze this product search query and extract structured information.

Query: "${userQuery}"

Return a JSON object with:
{
  "keywords": ["main", "product", "keywords"],
  "category": "electronics|clothing|home|sports|other",
  "brand": "brand_name_if_mentioned",
  "priceConstraints": {
    "type": "max|min|range",
    "value": number,
    "currency": "EUR|USD|GBP"
  },
  "attributes": ["color", "size", "features"],
  "intent": "specific_product|browsing|comparison|budget_shopping"
}

Focus on extracting the core product intent while filtering out query syntax words.`;
  }

  createBatchEvaluationPrompt(products, userQuery) {
    // Limit product text to prevent overly long prompts
    const productList = products.map((p, i) =>
      `Product ${i + 1}: "${p.text.substring(0, 150).replace(/[^\w\s€$£\-.,]/g, '')}"`
    ).join('\n\n');

    const prompt = `You are an expert product matching system. Evaluate how well each product matches the user's search intent.

User Query: "${userQuery.substring(0, 100)}"

Products to evaluate:
${productList}

EVALUATION CRITERIA (be very strict):

1. PRODUCT TYPE MATCH (40% weight):
   - Does the product category match what the user wants?
   - Example: If user wants "sneakers", rate boots/dress shoes very low (0.1-0.2)

2. SPECIFIC REQUIREMENTS (30% weight):
   - Colors: If user specifies "white shoes", non-white shoes get 0.0-0.3
   - Price: If user says "under €100", €150+ items get 0.0-0.2
   - Brands: If user wants "Nike", other brands get lower scores
   - Features: wireless, waterproof, etc.

3. SEMANTIC UNDERSTANDING (20% weight):
   - "Running shoes" should match athletic/sport shoes highly
   - "Dress shoes" should match formal shoes, not sneakers
   - "Casual" vs "formal" distinction matters

4. QUALITY INDICATORS (10% weight):
   - Product description completeness
   - Clear pricing and details

SCORING SCALE (be strict):
- 0.0-0.1: Completely wrong category/type
- 0.2-0.3: Wrong category but related (boots when wanting sneakers)
- 0.4-0.5: Right category, missing key requirements
- 0.6-0.7: Good match, minor mismatches
- 0.8-0.9: Very good match, meets most criteria
- 0.95-1.0: Perfect match, meets all criteria exactly

IMPORTANT: Be very conservative with high scores. Most products should score 0.1-0.4 unless they truly match.

Return ONLY a JSON array of ${products.length} scores: [0.2, 0.8, 0.1, 0.6, 0.3]`;

    // Ensure prompt isn't too long (Groq has token limits)
    if (prompt.length > 4000) {
      console.warn('Prompt too long, truncating products');
      return this.createBatchEvaluationPrompt(products.slice(0, 3), userQuery);
    }

    return prompt;
  }

  createProductEvaluationPrompt(productText, userQuery) {
    return `You are an expert product matching system. Evaluate this product against the user's search.

User Query: "${userQuery}"
Product: "${productText.substring(0, 300)}"

STRICT EVALUATION:
1. Product type must match (sneakers ≠ boots ≠ dress shoes)
2. Specified colors/brands/features must be present
3. Price constraints must be met
4. Semantic intent must align (running ≠ formal ≠ casual)

SCORING (be conservative):
- 0.0-0.1: Wrong product type entirely
- 0.2-0.3: Related but wrong (boots when wanting sneakers)
- 0.4-0.5: Right type, missing key requirements
- 0.6-0.7: Good match with minor issues
- 0.8-0.9: Very good match
- 0.95-1.0: Perfect match

Return only a number 0.0-1.0.`;
  }

  async callGroqAPI(prompt, maxTokens = 200) {
    // Check API key first
    if (!this.apiKey || this.apiKey.length < 10) {
      throw new Error('Invalid or missing API key');
    }

    const payload = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false
    };

    console.log('🔍 Groq API Debug:', {
      model: this.model,
      promptLength: prompt.length,
      maxTokens,
      apiKeyPresent: !!this.apiKey,
      apiKeyLength: this.apiKey?.length || 0,
      apiKeyPrefix: this.apiKey?.substring(0, 8) + '...',
      payloadSize: JSON.stringify(payload).length
    });

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error Details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        promptPreview: prompt.substring(0, 200)
      });
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  parseQueryAnalysis(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.log('Failed to parse query analysis:', error);
    }
    return null;
  }

  parseBatchScores(response, expectedCount) {
    try {
      console.log('🔍 Parsing LLM response:', response.substring(0, 200));

      // Try to extract JSON array - be more flexible with the pattern
      let jsonMatch = response.match(/\[[\d\.\s,]+\]/);

      if (!jsonMatch) {
        // Try to find scores in different formats
        const scoreMatches = response.match(/\d+\.?\d*/g);
        if (scoreMatches && scoreMatches.length >= expectedCount) {
          const scores = scoreMatches.slice(0, expectedCount).map(s => parseFloat(s));
          console.log('📊 Extracted scores from text:', scores);
          return scores.map(s => Math.min(Math.max(s, 0), 1));
        }
      } else {
        const scores = JSON.parse(jsonMatch[0]);
        console.log('📊 Extracted scores from JSON:', scores);

        // Ensure we have the right number of scores
        while (scores.length < expectedCount) {
          scores.push(0.1); // Low default for missing items
        }

        // Clamp all scores between 0 and 1
        return scores.slice(0, expectedCount).map(s =>
          Math.min(Math.max(parseFloat(s) || 0.1, 0), 1)
        );
      }
    } catch (error) {
      console.log('Failed to parse batch scores:', error, response);
    }

    // Return low default scores if parsing fails
    console.log('⚠️ Using default scores due to parsing failure');
    return Array(expectedCount).fill(0.1);
  }

  parseProductScore(response) {
    try {
      // Extract number from response
      const scoreMatch = response.match(/([0-9]*\.?[0-9]+)/);
      if (scoreMatch) {
        const score = parseFloat(scoreMatch[1]);
        return Math.min(Math.max(score, 0), 1); // Clamp between 0-1
      }
    } catch (error) {
      console.log('Failed to parse product score:', error);
    }
    return 0.1; // Low default to prevent false positives
  }

  combineScores(ruleBasedScore, llmScore) {
    // Weighted combination: 60% rule-based, 40% LLM
    // Rule-based is fast and reliable, LLM adds intelligence
    return (ruleBasedScore * 0.6) + (llmScore * 0.4);
  }

  // ============================================================================
  // SMART HYBRID DETECTION METHODS
  // ============================================================================

  extractElementContext(element) {
    // Get meaningful context from DOM element
    const text = element.textContent?.trim() || '';
    const classes = element.className || '';
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.includes('data') || attr.name.includes('id'))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(' ');

    return `
Text: ${text.substring(0, 300)}
Classes: ${classes}
Attributes: ${dataAttrs}
Tag: ${element.tagName}
    `.trim();
  }

  createProductDetectionPrompt(elementText, userQuery) {
    return `Analyze this webpage element and determine if it represents a product listing.

Element Context:
${elementText}

User is searching for: "${userQuery}"

Respond with JSON:
{
  "isProduct": true/false,
  "confidence": 0.0-1.0,
  "productType": "electronics|clothing|home|other",
  "reasoning": "brief explanation",
  "extractedInfo": {
    "name": "product name if found",
    "price": "price if found",
    "brand": "brand if found"
  }
}

Consider:
- Product listings typically have titles, prices, images
- Navigation elements, filters, ads are NOT products
- Reviews, descriptions, specs might be product-related but not listings`;
  }

  createDeepAnalysisPrompt(productText, userQuery, ruleBasedScore) {
    return `Perform deep analysis of this product match.

Product Information:
${productText.substring(0, 500)}

User Query: "${userQuery}"
Rule-based Score: ${ruleBasedScore}

Analyze:
1. Semantic relevance beyond keyword matching
2. Intent satisfaction (does this product meet user needs?)
3. Quality indicators (completeness, clarity)
4. Context appropriateness

Respond with JSON:
{
  "semanticRelevance": 0.0-1.0,
  "intentMatch": 0.0-1.0,
  "qualityScore": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "recommendation": "highlight|ignore|uncertain"
}`;
  }

  isComplexQuery(userQuery) {
    const query = userQuery.toLowerCase();

    // Complex if it has multiple criteria
    const hasPriceConstraint = /\b(under|below|above|over|\$|€|£|\d+)\b/.test(query);
    const hasColorConstraint = /\b(white|black|red|blue|green|yellow|pink|purple|gray|brown)\b/.test(query);
    const hasBrandConstraint = /\b(nike|adidas|apple|samsung|sony)\b/.test(query);
    const hasMultipleWords = query.split(/\s+/).length > 2;

    const criteriaCount = [hasPriceConstraint, hasColorConstraint, hasBrandConstraint].filter(Boolean).length;

    return criteriaCount >= 2 || (criteriaCount >= 1 && hasMultipleWords);
  }

  parseProductDetection(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isProduct: parsed.isProduct || false,
          confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
          productType: parsed.productType || 'other',
          extractedInfo: parsed.extractedInfo || {}
        };
      }
    } catch (error) {
      console.log('Failed to parse product detection:', error);
    }

    return { isProduct: false, confidence: 0, productType: 'other', extractedInfo: {} };
  }

  parseDeepAnalysis(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          semanticRelevance: Math.min(Math.max(parsed.semanticRelevance || 0, 0), 1),
          intentMatch: Math.min(Math.max(parsed.intentMatch || 0, 0), 1),
          qualityScore: Math.min(Math.max(parsed.qualityScore || 0, 0), 1),
          confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
          recommendation: parsed.recommendation || 'uncertain'
        };
      }
    } catch (error) {
      console.log('Failed to parse deep analysis:', error);
    }

    return { semanticRelevance: 0.1, intentMatch: 0.1, qualityScore: 0.1, confidence: 0.1, recommendation: 'uncertain' };
  }

  smartScoreCombination(ruleBasedScore, analysis) {
    // Dynamic weighting based on LLM confidence
    const llmWeight = analysis.confidence;
    const ruleWeight = 1 - llmWeight;

    // Calculate LLM composite score
    const llmScore = (analysis.semanticRelevance * 0.4 +
                     analysis.intentMatch * 0.4 +
                     analysis.qualityScore * 0.2);

    // Override logic for high-confidence LLM recommendations
    if (analysis.confidence > 0.8) {
      if (analysis.recommendation === 'ignore') return 0;
      if (analysis.recommendation === 'highlight') return Math.max(llmScore, 0.7);
    }

    // Weighted combination
    return Math.min((ruleBasedScore * ruleWeight) + (llmScore * llmWeight), 1.0);
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Batch processing for multiple products
   */
  async batchEvaluateProducts(products, userQuery) {
    // Process in small batches to respect rate limits
    const batchSize = 3;
    const results = [];

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const batchPromises = batch.map(product =>
        this.evaluateProductWithLLM(product.text, userQuery, product.ruleScore)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}

// Rate limiter removed - no API limits enforced

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GroqProductEnhancer;
}