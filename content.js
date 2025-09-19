class ProductHighlighter {
  constructor() {
    console.log('🏗️ ProductHighlighter constructor called');

    this.userPrompt = '';
    this.threshold = 0.6;
    this.isEnabled = true;
    this.highlightedElements = new Set();
    this.optimizedWeights = { keyword: 0.4, exact: 0.3, semantic: 0.3 };
    this.highPerformingKeywords = [];
    this.siteSpecificRules = new Map();

    // Groq LLM integration
    console.log('🤖 Initializing GroqProductEnhancer...');
    this.groqEnhancer = new GroqProductEnhancer();
    this.useGroq = false;

    console.log('🚀 Starting init...');
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.detectProducts(); // Make sure this gets called
    this.setupScrollListener();
    this.setupMessageListener();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'userPrompt', 'threshold', 'isEnabled',
        'optimizedThreshold', 'highPerformingKeywords', 'problematicSites',
        'groqApiKey', 'groqEnabled'
      ]);

      this.userPrompt = result.userPrompt || '';
      this.threshold = result.optimizedThreshold || result.threshold || 0.6;
      this.isEnabled = result.isEnabled !== false;
      this.highPerformingKeywords = result.highPerformingKeywords || [];
      this.useGroq = result.groqEnabled && !!result.groqApiKey;

      if (result.problematicSites) {
        const currentDomain = window.location.hostname;
        if (result.problematicSites.includes(currentDomain)) {
          this.applySiteSpecificOptimizations(currentDomain);
        }
      }
    } catch (error) {
      console.log('Failed to load settings:', error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateSettings') {
        this.userPrompt = message.userPrompt || '';
        this.threshold = message.threshold || 0.6;
        this.isEnabled = message.isEnabled !== false;
        this.useGroq = message.groqEnabled && !!message.groqApiKey;

        // Update Groq enhancer settings
        if (this.groqEnhancer) {
          this.groqEnhancer.apiKey = message.groqApiKey;
          this.groqEnhancer.isEnabled = this.useGroq;
          // Reset rate limiter on settings update
          this.groqEnhancer.rateLimiter = new RateLimiter(25, 60000);
        }

        this.clearHighlights();
        if (this.isEnabled && this.userPrompt) {
          console.log('Triggering product detection from message listener...');
          this.detectProducts();
        }
        sendResponse({ success: true });
      }
    });
  }

  setupScrollListener() {
    let scrollTimeout;
    let lastScrollRun = 0;
    const scrollCooldown = 5000; // 5 seconds between scroll-triggered detections

    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (this.isEnabled && this.userPrompt) {
          const now = Date.now();
          if (now - lastScrollRun > scrollCooldown) {
            console.log('🔄 Scroll detected, running product detection...');
            lastScrollRun = now;
            this.detectProducts();
          } else {
            console.log('⏳ Scroll detection skipped (cooldown active)');
          }
        }
      }, 1000); // Increased delay to 1 second
    });
  }

  async detectProducts() {
    console.log('🔍 detectProducts called', {
      userPrompt: this.userPrompt,
      isEnabled: this.isEnabled
    });

    if (!this.userPrompt || !this.isEnabled) {
      console.log('❌ Early exit: no prompt or disabled');
      return;
    }

    try {
      // Phase 1: Rule-based detection (fast, free)
      console.log('Phase 1: Rule-based detection...');
      const ruleBasedProducts = this.getRuleBasedProducts();
      console.log(`Found ${ruleBasedProducts.length} rule-based products`);

      if (ruleBasedProducts.length === 0) {
        console.log('❌ No rule-based products found!');
        return;
      }

      // Phase 2: Smart LLM enhancement for ambiguous cases
      console.log('Phase 2: Smart enhancement...');
      const enhancedProducts = await this.smartProductEnhancement(ruleBasedProducts);
      console.log(`Enhanced to ${enhancedProducts.length} products`);

      // Phase 3: Analyze all discovered products
      console.log('Phase 3: Analyzing products...');

      // FULL LLM MODE: Batch process for efficiency
      if (this.useGroq && this.groqEnhancer) {
        await this.batchAnalyzeProducts(enhancedProducts);
      } else {
        // Fallback to individual analysis if no LLM
        const analysisPromises = enhancedProducts.map(element => this.analyzeProduct(element));
        await Promise.all(analysisPromises);
      }

      console.log('✅ Product detection complete');

    } catch (error) {
      console.error('❌ detectProducts failed:', error);
    }
  }


  getRuleBasedProducts() {
    const productSelectors = [
      '[data-testid*="product"]',
      '[class*="product"]',
      '[class*="item"]',
      '[class*="result"]',
      'article',
      '.search-result',
      '[data-cy*="product"]',
      '[data-qa*="product"]'
    ];

    const potentialProducts = [];

    productSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!this.highlightedElements.has(element) && this.isVisibleProduct(element)) {
          potentialProducts.push({
            element,
            confidence: this.estimateProductConfidence(element),
            source: 'rule-based'
          });
        }
      });
    });

    return potentialProducts;
  }

  async smartProductEnhancement(ruleBasedProducts) {
    const allProducts = [...ruleBasedProducts];

    // For sentence queries, try additional rule-based detection with extracted keywords
    const isSentenceQuery = this.userPrompt.split(' ').length > 2;
    if (isSentenceQuery) {
      console.log('🔤 Sentence query detected, extracting keywords...');
      const extractedKeywords = this.extractKeywordsFromSentence(this.userPrompt);
      console.log('📝 Extracted keywords:', extractedKeywords);

      // Try rule-based detection with individual keywords
      extractedKeywords.forEach(keyword => {
        const keywordProducts = this.getRuleBasedProductsForKeyword(keyword);
        keywordProducts.forEach(product => {
          // Avoid duplicates
          if (!allProducts.some(p => p.element === product.element)) {
            allProducts.push({
              ...product,
              source: 'keyword-extracted'
            });
          }
        });
      });
    }

    // Only use LLM for complex queries or when we have few rule-based matches
    const shouldUseLLM = this.shouldUseLLMDetection(ruleBasedProducts);

    if (shouldUseLLM && this.useGroq) {
      // Look for additional products using LLM for ambiguous elements
      const ambiguousElements = this.findAmbiguousElements();
      const llmDetections = await this.batchLLMDetection(ambiguousElements);

      llmDetections.forEach(detection => {
        if (detection.isProduct && detection.confidence > 0.6) {
          allProducts.push({
            element: detection.element,
            confidence: detection.confidence,
            source: 'llm-detected'
          });
        }
      });
    }

    // Return sorted by confidence
    return allProducts
      .sort((a, b) => b.confidence - a.confidence)
      .map(item => item.element);
  }

  estimateProductConfidence(element) {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on element characteristics
    const text = element.textContent || '';
    const classes = element.className || '';

    // Price indicators
    if (/[\$€£]\d+|price/i.test(text)) confidence += 0.2;

    // Product-specific classes
    if (/product|item|card/i.test(classes)) confidence += 0.15;

    // Has images
    if (element.querySelector('img')) confidence += 0.1;

    // Has links (clickable products)
    if (element.querySelector('a')) confidence += 0.05;

    // Data attributes
    if (element.dataset.asin || element.dataset.productId) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  shouldUseLLMDetection(ruleBasedProducts) {
    // Use LLM when:
    // 1. Complex query that needs better understanding
    // 2. Very few rule-based matches found (< 3 for rate limit conservation)
    // 3. User has Groq enabled
    // 4. API rate limit allows it

    if (!this.useGroq || !this.groqEnhancer.rateLimiter.canMakeRequest()) {
      console.log('⚠️ Skipping LLM detection: disabled or rate limited');
      return false;
    }

    const isComplexQuery = this.groqEnhancer?.isComplexQuery(this.userPrompt) || false;
    const veryFewMatches = ruleBasedProducts.length < 3; // Reduced threshold to save API calls

    return isComplexQuery || veryFewMatches;
  }

  findAmbiguousElements() {
    // Find elements that might be products but weren't caught by rule-based selectors
    const isSentenceQuery = this.userPrompt.split(' ').length > 2;

    const ambiguousSelectors = [
      'div[class*="card"]',
      'div[class*="tile"]',
      'div[class*="box"]',
      'li',
      'article',
      'section',
      // More aggressive selectors for sentence queries
      ...(isSentenceQuery ? [
        'div[data-testid]',
        'div[class*="grid"]',
        'div[class*="list"]',
        'div[class*="row"]',
        'div[class*="col"]'
      ] : [])
    ];

    const candidates = [];
    const maxCandidates = isSentenceQuery ? 30 : 20; // More candidates for sentences

    ambiguousSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      Array.from(elements).slice(0, maxCandidates).forEach(element => {
        if (this.couldBeProduct(element) && !this.isAlreadyAnalyzed(element)) {
          candidates.push(element);
        }
      });
    });

    return candidates.slice(0, maxCandidates);
  }

  couldBeProduct(element) {
    const text = element.textContent || '';
    const isSentenceQuery = this.userPrompt.split(' ').length > 2;

    const hasReasonableLength = text.length > 50 && text.length < 1000;
    const isVisible = this.isVisibleProduct(element);

    // For sentence queries, be more lenient about product indicators
    if (isSentenceQuery) {
      const hasProductIndicators = /price|buy|add to cart|\$|€|£|size|color|brand|model/i.test(text);
      const hasImageOrLink = element.querySelector('img, a');
      const hasProductClasses = /item|card|tile|product|listing/i.test(element.className || '');

      return hasReasonableLength && isVisible && (hasProductIndicators || hasImageOrLink || hasProductClasses);
    } else {
      // Original strict criteria for keyword queries
      const hasProductKeywords = /price|buy|add to cart|\$|€|£/i.test(text);
      return hasReasonableLength && hasProductKeywords && isVisible;
    }
  }

  isAlreadyAnalyzed(element) {
    // Check if this element or a parent is already in our rule-based results
    const productSelectors = '[class*="product"], [class*="item"], [class*="result"]';
    return element.closest(productSelectors) !== null;
  }

  async batchLLMDetection(elements) {
    if (!this.groqEnhancer || elements.length === 0) return [];

    const detections = [];
    const batchSize = 3; // Process in small batches

    for (let i = 0; i < elements.length; i += batchSize) {
      const batch = elements.slice(i, i + batchSize);
      const batchPromises = batch.map(element =>
        this.groqEnhancer.smartProductDetection(element, this.userPrompt)
      );

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((result, index) => {
        if (result) {
          detections.push({
            element: batch[index],
            ...result
          });
        }
      });

      // Small delay between batches to be API-friendly
      if (i + batchSize < elements.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return detections;
  }

  isVisibleProduct(element) {
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    const hasContent = element.textContent.trim().length > 10;
    const hasReasonableSize = rect.width > 100 && rect.height > 50;

    return isVisible && hasContent && hasReasonableSize;
  }

  async analyzeProduct(element) {
    const productText = this.extractProductInfo(element);
    if (!productText) {
      console.log('⚠️ No product text extracted from element');
      return;
    }

    console.log('🔍 Analyzing product:', {
      element: element.className || element.tagName,
      textPreview: productText.substring(0, 100),
      userPrompt: this.userPrompt
    });

    let finalScore = 0;

    // FULL LLM MODE: Use only LLM for evaluation
    if (this.useGroq && this.groqEnhancer) {
      try {
        // Use LLM to evaluate product relevance
        finalScore = await this.groqEnhancer.evaluateProduct(productText, this.userPrompt);

        console.log('🤖 LLM Evaluation:', {
          element: element.className,
          score: finalScore.toFixed(2),
          threshold: this.threshold
        });
      } catch (error) {
        console.log('LLM evaluation failed:', error);
        // When LLM fails, skip highlighting
        finalScore = 0;
      }
    } else {
      // No LLM available - skip highlighting
      console.log('📝 No LLM available - skipping product');
      finalScore = 0;
    }

    // Dynamic threshold adjustment for better results
    const adjustedThreshold = this.getAdjustedThreshold();

    console.log(`🎯 Final score: ${finalScore.toFixed(3)} (threshold: ${adjustedThreshold.toFixed(2)})`);

    if (finalScore >= adjustedThreshold) {
      console.log('✅ HIGHLIGHTING product!');
      this.highlightProduct(element, finalScore);
      this.highlightedElements.add(element);
    } else {
      console.log('❌ Score below threshold, not highlighting');
    }
  }


  // Extract meaningful keywords from sentence queries
  extractKeywordsFromSentence(sentence) {
    const stopWords = ['i', 'am', 'looking', 'for', 'want', 'need', 'find', 'show', 'me', 'get', 'buy', 'purchase', 'a', 'an', 'the', 'and', 'or', 'with', 'that', 'have', 'has', 'is', 'are', 'in', 'on', 'at', 'to', 'from'];

    const words = sentence.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !stopWords.includes(word))
      .filter(word => !/^\d+$/.test(word)); // Remove standalone numbers

    // Prioritize likely product keywords
    const productKeywords = words.filter(word =>
      /shoe|sneaker|boot|shirt|dress|jacket|phone|laptop|watch|bag|hat|jean|trouser|skirt/i.test(word)
    );

    return productKeywords.length > 0 ? productKeywords : words.slice(0, 3);
  }

  // Search for products using a specific keyword
  getRuleBasedProductsForKeyword(keyword) {
    const productSelectors = [
      '[data-testid*="product"]',
      '[class*="product"]',
      '[class*="item"]',
      '[class*="result"]',
      'article',
      '.search-result'
    ];

    const potentialProducts = [];

    productSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!this.highlightedElements.has(element) && this.isVisibleProduct(element)) {
          const text = this.extractProductInfo(element).toLowerCase();
          if (text.includes(keyword.toLowerCase())) {
            potentialProducts.push({
              element,
              confidence: this.estimateProductConfidence(element),
              source: `keyword-${keyword}`
            });
          }
        }
      });
    });

    return potentialProducts;
  }

  // Dynamic threshold adjustment based on query complexity
  getAdjustedThreshold() {
    const baseThreshold = this.threshold;
    const isSentence = this.userPrompt.split(' ').length > 2;
    const hasSpecificRequirements = /\b(white|black|red|blue|green|nike|adidas|under|below|above|\$|€|£)\b/i.test(this.userPrompt);

    // Lower threshold for complex queries to be more inclusive
    if (isSentence && hasSpecificRequirements) {
      return Math.max(baseThreshold - 0.1, 0.2); // More lenient for complex queries
    }

    // Higher threshold for simple keyword queries to be more precise
    if (!isSentence) {
      return Math.min(baseThreshold + 0.1, 0.8); // More strict for simple queries
    }

    return baseThreshold;
  }

  // Batch analyze products for better LLM efficiency
  async batchAnalyzeProducts(elements) {
    console.log(`🚀 Batch analyzing ${elements.length} products with LLM`);

    // Check rate limit before processing
    if (!this.groqEnhancer.rateLimiter.canMakeRequest()) {
      console.log('🚫 Rate limited - skipping LLM batch analysis completely');
      return;
    }

    // Extract product info for all elements
    const products = elements.map(element => ({
      element,
      text: this.extractProductInfo(element)
    })).filter(p => p.text);

    if (products.length === 0) return;

    try {
      // Batch evaluate with LLM
      const scores = await this.groqEnhancer.evaluateProductBatch(
        products,
        this.userPrompt
      );

      // Apply highlighting based on scores
      products.forEach((product, index) => {
        const score = scores[index] || 0;
        const productPreview = product.text.substring(0, 50);

        console.log(`🤖 LLM Batch Result [${index}]:`, {
          product: productPreview,
          score: score.toFixed(3),
          threshold: this.threshold,
          willHighlight: score >= this.threshold
        });

        const adjustedThreshold = this.getAdjustedThreshold();

        if (score >= adjustedThreshold) {
          console.log(`✅ HIGHLIGHTING product ${index}: "${productPreview}"`);
          this.highlightProduct(product.element, score);
          this.highlightedElements.add(product.element);
        } else {
          console.log(`❌ NOT highlighting product ${index}: "${productPreview}" (score ${score.toFixed(3)} < ${adjustedThreshold.toFixed(2)})`);
        }
      });

      // Report cache efficiency
      const usage = this.groqEnhancer.getUsageReport();
      console.log('📊 LLM Usage Stats:', usage);

    } catch (error) {
      console.error('Batch analysis failed:', error);
      // No fallback - just skip when LLM fails
    }
  }

  extractProductInfo(element) {
    const textElements = element.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], [class*="description"], p, span');
    let productInfo = '';

    textElements.forEach(el => {
      const text = el.textContent.trim();
      if (text && text.length > 3) {
        productInfo += text + ' ';
      }
    });

    return productInfo.trim().substring(0, 500);
  }

  async calculateMatchScore(productText, userPrompt) {
    try {
      // Enhanced query parsing
      const queryAnalysis = this.analyzeQuery(userPrompt);
      const productLower = productText.toLowerCase();

      // NEW APPROACH: Check ALL required criteria first
      const criteriaSatisfied = this.checkAllRequiredCriteria(productText, queryAnalysis);

      // Debug logging for all queries to see what's happening
      if (queryAnalysis.keywords.length > 0) {
        console.log('Criteria Check Debug:', {
          userPrompt,
          productText: productText.substring(0, 150),
          queryAnalysis: {
            keywords: queryAnalysis.keywords,
            colors: queryAnalysis.colors,
            brands: queryAnalysis.brands,
            priceConstraints: queryAnalysis.priceConstraints
          },
          criteriaSatisfied
        });
      }

      // Fallback: if no meaningful criteria extracted, use simple keyword matching
      if (queryAnalysis.keywords.length === 0 &&
          queryAnalysis.colors.length === 0 &&
          queryAnalysis.brands.length === 0 &&
          queryAnalysis.priceConstraints.length === 0) {

        console.log('No criteria extracted, falling back to simple matching for:', userPrompt);

        // Simple fallback: just check if the original prompt words appear in product
        const promptWords = userPrompt.toLowerCase().split(/\s+/)
          .filter(word => word.length > 2);

        const matches = promptWords.filter(word =>
          productLower.includes(word)).length;

        const simpleScore = matches / Math.max(promptWords.length, 1);
        return simpleScore > 0.5 ? simpleScore : 0;
      }

      // Use a more flexible approach - require core keywords but be more lenient with attributes
      if (!this.checkCoreRequirements(productText, queryAnalysis)) {
        return 0;
      }

      // If all required criteria are met, calculate quality score
      const scores = {
        keyword: this.calculateKeywordScore(productLower, queryAnalysis.keywords),
        exact: this.calculateExactScore(productLower, queryAnalysis.keywords),
        semantic: this.calculateSemanticSimilarity(productText, queryAnalysis.coreQuery),
        price: this.calculatePriceScore(productText, queryAnalysis.priceConstraints),
        brand: this.calculateBrandScore(productLower, queryAnalysis.brands),
        category: this.calculateCategoryScore(productLower, queryAnalysis.categories),
        color: this.calculateColorScore(productLower, queryAnalysis.colors),
        attributes: this.calculateAttributeScore(productLower, queryAnalysis.attributes)
      };

      // Adaptive weighting based on query type
      const weights = this.getAdaptiveWeights(queryAnalysis);

      // Combine scores with adaptive weights
      const baseScore = this.combineScores(scores, weights);

      // Boost for high-performing keywords
      const highPerformingBoost = this.calculateHighPerformingBoost(queryAnalysis.keywords);

      const finalScore = Math.min(baseScore + highPerformingBoost, 1.0);

      // Debug logging for multi-criteria queries
      if ((queryAnalysis.hasPrice || queryAnalysis.hasColor || queryAnalysis.hasBrand) && finalScore >= 0) {
        console.log('Multi-Criteria Debug:', {
          userPrompt,
          queryAnalysis: {
            keywords: queryAnalysis.keywords,
            colors: queryAnalysis.colors,
            brands: queryAnalysis.brands,
            priceConstraints: queryAnalysis.priceConstraints,
            attributes: queryAnalysis.attributes
          },
          criteriaSatisfied,
          productText: productText.substring(0, 100),
          scores,
          weights,
          finalScore
        });
      }

      return finalScore;
    } catch (error) {
      console.log('Error calculating match score:', error);
      return 0;
    }
  }

  analyzeQuery(userPrompt) {
    const prompt = userPrompt.toLowerCase();

    // Extract price constraints
    const priceConstraints = this.extractPriceConstraints(prompt);

    // Extract brands
    const brands = this.extractBrands(prompt);

    // Extract categories
    const categories = this.extractCategories(prompt);

    // Extract colors and attributes
    const colors = this.extractColors(prompt);
    const attributes = this.extractAttributes(prompt);

    // Clean query by removing price words, brands, and filter words
    const cleanedQuery = this.cleanQuery(prompt, priceConstraints, brands, colors, attributes);

    // Extract meaningful keywords from cleaned query
    const keywords = this.extractMeaningfulKeywords(cleanedQuery);

    return {
      coreQuery: cleanedQuery,
      keywords,
      priceConstraints,
      brands,
      categories,
      colors,
      attributes,
      requiredCriteria: this.identifyRequiredCriteria(keywords, colors, attributes, brands, priceConstraints),
      hasPrice: priceConstraints.length > 0,
      hasBrand: brands.length > 0,
      hasColor: colors.length > 0,
      hasAttributes: attributes.length > 0
    };
  }

  extractPriceConstraints(prompt) {
    const constraints = [];

    // Match various price patterns
    const pricePatterns = [
      /(?:under|below|less than|max|maximum)\s*(\€|\$|£|usd|eur|gbp)?\s*(\d+(?:[.,]\d+)?)/gi,
      /(?:above|over|more than|min|minimum)\s*(\€|\$|£|usd|eur|gbp)?\s*(\d+(?:[.,]\d+)?)/gi,
      /(\€|\$|£)\s*(\d+(?:[.,]\d+)?)\s*(?:or less|max|maximum)/gi,
      /(\d+(?:[.,]\d+)?)\s*(\€|\$|£|usd|eur|gbp)\s*(?:or less|max|maximum)/gi
    ];

    pricePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        const value = parseFloat(match[2] || match[1]);
        if (!isNaN(value)) {
          constraints.push({
            type: prompt.includes('under') || prompt.includes('below') || prompt.includes('less') || prompt.includes('max') ? 'max' : 'min',
            value: value,
            currency: match[1] || match[2] || '€'
          });
        }
      }
    });

    return constraints;
  }

  extractBrands(prompt) {
    const commonBrands = [
      'nike', 'adidas', 'apple', 'samsung', 'sony', 'microsoft', 'google',
      'amazon', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'lg', 'philips',
      'bosch', 'siemens', 'whirlpool', 'dyson', 'bose', 'beats', 'jbl'
    ];

    return commonBrands.filter(brand => prompt.includes(brand));
  }

  extractCategories(prompt) {
    const categories = {
      electronics: ['phone', 'laptop', 'tablet', 'computer', 'headphones', 'speaker', 'tv', 'monitor'],
      clothing: ['sneakers', 'shoes', 'shirt', 'pants', 'dress', 'jacket', 'hat', 'clothing'],
      home: ['furniture', 'lamp', 'table', 'chair', 'bed', 'sofa', 'kitchen'],
      sports: ['fitness', 'gym', 'running', 'basketball', 'football', 'tennis']
    };

    const detected = [];
    Object.entries(categories).forEach(([category, words]) => {
      if (words.some(word => prompt.includes(word))) {
        detected.push(category);
      }
    });

    return detected;
  }

  extractColors(prompt) {
    const colors = [
      'white', 'black', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
      'gray', 'grey', 'silver', 'gold', 'beige', 'navy', 'turquoise', 'lime', 'maroon', 'olive'
    ];

    return colors.filter(color => {
      const regex = new RegExp(`\\b${color}\\b`, 'i');
      return regex.test(prompt);
    });
  }

  extractAttributes(prompt) {
    const attributes = {
      size: ['small', 'medium', 'large', 'xl', 'xxl', 'xs', 'size'],
      material: ['cotton', 'leather', 'wool', 'silk', 'polyester', 'denim', 'canvas'],
      style: ['casual', 'formal', 'sporty', 'vintage', 'modern', 'classic'],
      features: ['waterproof', 'wireless', 'bluetooth', 'rechargeable', 'portable', 'lightweight']
    };

    const detected = [];
    Object.entries(attributes).forEach(([type, words]) => {
      words.forEach(word => {
        if (prompt.includes(word)) {
          detected.push({ type, value: word });
        }
      });
    });

    return detected;
  }

  identifyRequiredCriteria(keywords, colors, attributes, brands, priceConstraints) {
    const criteria = [];

    // All keywords are required (product type, etc.)
    keywords.forEach(keyword => {
      criteria.push({ type: 'keyword', value: keyword, required: true });
    });

    // Colors are strictly required
    colors.forEach(color => {
      criteria.push({ type: 'color', value: color, required: true });
    });

    // Brands are strictly required
    brands.forEach(brand => {
      criteria.push({ type: 'brand', value: brand, required: true });
    });

    // Price constraints are strictly required
    priceConstraints.forEach(constraint => {
      criteria.push({ type: 'price', value: constraint, required: true });
    });

    // Attributes can be less strict depending on context
    attributes.forEach(attr => {
      criteria.push({ type: 'attribute', value: attr, required: true });
    });

    return criteria;
  }

  cleanQuery(prompt, priceConstraints, brands, colors, attributes) {
    let cleaned = prompt;

    // Remove price-related words
    const priceWords = ['under', 'below', 'less than', 'max', 'maximum', 'above', 'over', 'more than', 'min', 'minimum', 'cost', 'price', 'budget', 'cheap', 'expensive'];
    priceWords.forEach(word => {
      cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    });

    // Remove currency symbols and numbers
    cleaned = cleaned.replace(/[€$£]\s*\d+(?:[.,]\d+)?/g, '');
    cleaned = cleaned.replace(/\d+(?:[.,]\d+)?\s*[€$£]/g, '');

    // Remove brands (they're handled separately)
    brands.forEach(brand => {
      cleaned = cleaned.replace(new RegExp(`\\b${brand}\\b`, 'gi'), '');
    });

    // Remove colors (they're handled separately)
    colors.forEach(color => {
      cleaned = cleaned.replace(new RegExp(`\\b${color}\\b`, 'gi'), '');
    });

    // Remove attributes (they're handled separately)
    attributes.forEach(attr => {
      cleaned = cleaned.replace(new RegExp(`\\b${attr.value}\\b`, 'gi'), '');
    });

    // Remove common filter words
    const filterWords = ['that', 'in', 'with', 'for', 'or', 'and', 'the', 'a', 'an'];
    filterWords.forEach(word => {
      cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    });

    return cleaned.trim();
  }

  extractMeaningfulKeywords(cleanedQuery) {
    const keywords = cleanedQuery.split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !/^\d+$/.test(word)); // Remove standalone numbers

    // Debug: log what keywords we extracted
    console.log('Extracted keywords from:', cleanedQuery, '->', keywords);

    return keywords;
  }

  calculateKeywordScore(productText, keywords) {
    if (keywords.length === 0) return 0;

    const matchCount = keywords.filter(keyword =>
      productText.includes(keyword)).length;

    return matchCount / keywords.length;
  }

  calculateExactScore(productText, keywords) {
    if (keywords.length === 0) return 0;

    const exactMatches = keywords.filter(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(productText);
    }).length;

    return exactMatches / keywords.length;
  }

  calculatePriceScore(productText, priceConstraints) {
    if (priceConstraints.length === 0) return 1; // No price constraint = perfect score

    // Extract prices from product text
    const prices = this.extractPricesFromText(productText);
    if (prices.length === 0) return 0.5; // No price found = neutral

    // Check if any extracted price meets the constraints
    return prices.some(price =>
      priceConstraints.every(constraint =>
        this.checkPriceConstraint(price, constraint)
      )
    ) ? 1 : 0;
  }

  extractPricesFromText(text) {
    const prices = [];
    const pricePatterns = [
      /(\€|\$|£)\s*(\d+(?:[.,]\d+)?)/g,
      /(\d+(?:[.,]\d+)?)\s*(\€|\$|£)/g
    ];

    pricePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = parseFloat((match[2] || match[1]).replace(',', '.'));
        if (!isNaN(value)) {
          prices.push(value);
        }
      }
    });

    return prices;
  }

  checkPriceConstraint(price, constraint) {
    return constraint.type === 'max' ? price <= constraint.value : price >= constraint.value;
  }

  calculateBrandScore(productText, brands) {
    if (brands.length === 0) return 1; // No brand requirement = perfect score

    const matchingBrands = brands.filter(brand => productText.includes(brand));
    return matchingBrands.length / brands.length;
  }

  calculateCategoryScore(productText, categories) {
    if (categories.length === 0) return 1; // No category requirement = perfect score

    // This is a simplified implementation - could be enhanced with more sophisticated category matching
    return 1;
  }

  getAdaptiveWeights(queryAnalysis) {
    const baseWeights = {
      keyword: 0.25,
      exact: 0.2,
      semantic: 0.15,
      price: 0.05,
      brand: 0.05,
      category: 0.05,
      color: 0.15,
      attributes: 0.1
    };

    // Adjust weights based on query characteristics
    if (queryAnalysis.hasPrice) {
      baseWeights.price = 0.15;
      baseWeights.keyword = 0.2;
    }

    if (queryAnalysis.hasBrand) {
      baseWeights.brand = 0.15;
      baseWeights.keyword = 0.2;
    }

    if (queryAnalysis.hasColor) {
      baseWeights.color = 0.2;
      baseWeights.keyword = 0.2;
    }

    if (queryAnalysis.hasAttributes) {
      baseWeights.attributes = 0.15;
      baseWeights.keyword = 0.2;
    }

    return baseWeights;
  }

  combineScores(scores, weights) {
    return Object.entries(weights).reduce((total, [key, weight]) => {
      return total + (scores[key] || 0) * weight;
    }, 0);
  }

  calculateHighPerformingBoost(keywords) {
    const highPerformingMatches = keywords.filter(keyword =>
      this.highPerformingKeywords.includes(keyword)).length;
    return highPerformingMatches * 0.05; // Small boost per high-performing keyword
  }

  /**
   * More flexible core requirements check
   */
  checkCoreRequirements(productText, queryAnalysis) {
    const productLower = productText.toLowerCase();

    // 1. At least ONE core keyword must match (product type)
    if (queryAnalysis.keywords.length > 0) {
      const keywordMatches = queryAnalysis.keywords.filter(keyword => {
        // Check both exact match and similar words
        return productLower.includes(keyword) ||
               productLower.includes(keyword + 's') ||  // plural
               productLower.includes(keyword.slice(0, -1)) || // singular
               (keyword === 'sneakers' && productLower.includes('sneaker')) || // sneakers -> sneaker
               (keyword === 'sneaker' && productLower.includes('sneakers'));   // sneaker -> sneakers
      }).length;

      console.log(`🔍 Keyword matching: ${keywordMatches}/${queryAnalysis.keywords.length} keywords found`);
      console.log(`Keywords: ${queryAnalysis.keywords}, Product text: ${productLower.substring(0, 100)}`);

      // Require at least 50% of keywords to match
      const keywordThreshold = Math.max(1, Math.ceil(queryAnalysis.keywords.length * 0.5));
      if (keywordMatches < keywordThreshold) {
        console.log(`❌ Not enough keywords matched: ${keywordMatches} < ${keywordThreshold}`);
        return false;
      }
    }

    // 2. If color is specified, it's REQUIRED (strict)
    if (queryAnalysis.colors.length > 0) {
      const colorMatches = queryAnalysis.colors.some(color => {
        const regex = new RegExp(`\\b${color}\\b`, 'i');
        return regex.test(productText);
      });
      if (!colorMatches) {
        return false;
      }
    }

    // 3. If brand is specified, it's REQUIRED (strict)
    if (queryAnalysis.brands.length > 0) {
      const brandMatches = queryAnalysis.brands.some(brand => {
        const regex = new RegExp(`\\b${brand}\\b`, 'i');
        return regex.test(productText);
      });
      if (!brandMatches) {
        return false;
      }
    }

    // 4. Price constraints are REQUIRED if specified (strict)
    if (queryAnalysis.priceConstraints.length > 0) {
      const prices = this.extractPricesFromText(productText);
      if (prices.length === 0) {
        // No price found - be lenient for now
        return true;
      }

      const priceMatches = prices.some(price =>
        queryAnalysis.priceConstraints.every(constraint =>
          this.checkPriceConstraint(price, constraint)
        )
      );
      if (!priceMatches) {
        return false;
      }
    }

    // 5. Attributes are less strict (optional boost)
    // Don't block products for missing attributes

    return true;
  }

  /**
   * CRITICAL: Check that ALL required criteria are satisfied (AND logic)
   */
  checkAllRequiredCriteria(productText, queryAnalysis) {
    const productLower = productText.toLowerCase();
    const missing = [];

    // Check ALL keywords are present
    for (const keyword of queryAnalysis.keywords) {
      if (!productLower.includes(keyword)) {
        missing.push(`keyword:${keyword}`);
      }
    }

    // Check ALL colors are present
    for (const color of queryAnalysis.colors) {
      const colorRegex = new RegExp(`\\b${color}\\b`, 'i');
      if (!colorRegex.test(productText)) {
        missing.push(`color:${color}`);
      }
    }

    // Check ALL brands are present
    for (const brand of queryAnalysis.brands) {
      const brandRegex = new RegExp(`\\b${brand}\\b`, 'i');
      if (!brandRegex.test(productText)) {
        missing.push(`brand:${brand}`);
      }
    }

    // Check ALL price constraints are satisfied
    if (queryAnalysis.priceConstraints.length > 0) {
      const prices = this.extractPricesFromText(productText);
      if (prices.length === 0) {
        missing.push('price:no_price_found');
      } else {
        const priceMatches = prices.some(price =>
          queryAnalysis.priceConstraints.every(constraint =>
            this.checkPriceConstraint(price, constraint)
          )
        );
        if (!priceMatches) {
          missing.push('price:constraint_not_met');
        }
      }
    }

    // Check ALL attributes are present
    for (const attr of queryAnalysis.attributes) {
      const attrRegex = new RegExp(`\\b${attr.value}\\b`, 'i');
      if (!attrRegex.test(productText)) {
        missing.push(`attribute:${attr.value}`);
      }
    }

    return {
      allRequired: missing.length === 0,
      missing: missing,
      satisfied: queryAnalysis.keywords.length + queryAnalysis.colors.length +
                queryAnalysis.brands.length + queryAnalysis.attributes.length - missing.length
    };
  }

  calculateColorScore(productText, colors) {
    if (colors.length === 0) return 1; // No color requirement = perfect score

    const matchingColors = colors.filter(color => {
      const regex = new RegExp(`\\b${color}\\b`, 'i');
      return regex.test(productText);
    });

    return matchingColors.length / colors.length;
  }

  calculateAttributeScore(productText, attributes) {
    if (attributes.length === 0) return 1; // No attribute requirement = perfect score

    const matchingAttributes = attributes.filter(attr => {
      const regex = new RegExp(`\\b${attr.value}\\b`, 'i');
      return regex.test(productText);
    });

    return matchingAttributes.length / attributes.length;
  }

  calculateSemanticSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 2);

    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;

    return commonWords.length / Math.max(totalWords, 1);
  }

  highlightProduct(element, score) {
    element.classList.remove('product-highlight', 'product-highlight-strong', 'product-highlight-medium');

    if (score >= 0.8) {
      element.classList.add('product-highlight', 'product-highlight-strong');
    } else if (score >= 0.7) {
      element.classList.add('product-highlight', 'product-highlight-medium');
    } else {
      element.classList.add('product-highlight');
    }

    element.setAttribute('data-match-score', score.toFixed(2));
  }

  clearHighlights() {
    this.highlightedElements.forEach(element => {
      element.classList.remove('product-highlight', 'product-highlight-strong', 'product-highlight-medium');
      element.removeAttribute('data-match-score');
    });
    this.highlightedElements.clear();
  }

  applySiteSpecificOptimizations(domain) {
    switch (domain) {
      case 'amazon.com':
      case 'amazon.co.uk':
        this.siteSpecificRules.set('selectors', [
          '[data-component-type="s-search-result"]',
          '[data-asin]',
          '.s-result-item'
        ]);
        break;
      case 'ebay.com':
        this.siteSpecificRules.set('selectors', [
          '.s-item',
          '[data-view="mi:1686|iid:1"]'
        ]);
        break;
      case 'etsy.com':
        this.siteSpecificRules.set('selectors', [
          '[data-test-id="listing-card"]',
          '.listing-link'
        ]);
        break;
      default:
        this.optimizedWeights = { keyword: 0.5, exact: 0.35, semantic: 0.15 };
        break;
    }
  }
}

console.log('🚀 Content script loading...', { readyState: document.readyState });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOMContentLoaded - Creating ProductHighlighter...');
    new ProductHighlighter();
  });
} else {
  console.log('📄 Document ready - Creating ProductHighlighter...');
  new ProductHighlighter();
}