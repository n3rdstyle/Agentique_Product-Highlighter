class ProductHighlighter {
  constructor() {
    console.log('🏗️ ProductHighlighter constructor called');

    this.userPrompt = '';
    this.threshold = 0.6;
    this.isEnabled = false; // Start deactivated by default on new websites
    this.highlightedElements = new Set();
    this.processedProducts = new Set(); // Track processed product IDs/signatures
    this.optimizedWeights = { keyword: 0.4, exact: 0.3, semantic: 0.3 };
    this.highPerformingKeywords = [];
    this.siteSpecificRules = new Map();

    // RAG system integration
    console.log('🧠 Initializing RAG System...');
    this.ragSystem = new ProductRAGSystem();

    // Vector search integration (fallback)
    console.log('🔍 Initializing Vector Search...');
    this.vectorSearch = new VectorProductSearch();

    // Groq LLM integration (for verification only)
    console.log('🤖 Initializing GroqProductEnhancer...');
    this.groqEnhancer = new GroqProductEnhancer();
    window.groqProductEnhancer = this.groqEnhancer;
    this.useGroq = true; // Always use Groq since we have hardcoded API key

    // Toolbar state
    this.toolbar = null;
    this.toggleButton = null;
    this.edgeTab = null;
    this.autoCollapseTimer = null;
    this.isCapturing = false;
    this.captureCompleted = false;

    console.log('🚀 Starting init...');
    this.init();
  }

  async init() {
    console.log('🔄 Init started');
    await this.loadSettings();
    console.log('⚙️ Settings loaded, creating toolbar...');
    this.createToolbar();
    this.detectProducts(); // Make sure this gets called
    this.setupScrollListener();
    this.setupMessageListener();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'userPrompt', 'threshold', 'isEnabled',
        'optimizedThreshold', 'highPerformingKeywords', 'problematicSites'
      ]);

      this.userPrompt = result.userPrompt || '';
      this.threshold = result.optimizedThreshold || result.threshold || 0.6;
      this.isEnabled = false; // Always start deactivated on website entry
      this.highPerformingKeywords = result.highPerformingKeywords || [];
      this.useGroq = true; // Always use Groq since we have hardcoded API key

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
        this.useGroq = true; // Always use Groq

        // Groq enhancer is always enabled with hardcoded key
        if (this.groqEnhancer) {
          this.groqEnhancer.isEnabled = true;
          // No rate limiting anymore
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
            console.log('🔄 Scroll detected, checking for NEW products...');
            lastScrollRun = now;
            this.detectNewProducts(); // Only detect NEW products
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
      // NEW RAG APPROACH: Retrieval-Augmented Generation
      console.log('🧠 Using RAG system for product detection...');

      // Phase 1: Capture and process products for RAG knowledge base (only once)
      if (!this.captureCompleted) {
        await this.captureAndIndexProductsForRAG();
        this.captureCompleted = true;
      }

      // Phase 2: RAG-based search and generation
      console.log('🔍 Phase 2: RAG retrieval and generation...');
      const ragResults = await this.ragSystem.generateWithRAG(this.userPrompt);
      console.log(`Found ${ragResults.matches.length} matches via RAG system`);

      // Phase 3: Highlight matched products
      console.log('✅ Phase 3: Highlighting RAG matches...');
      await this.highlightRAGMatches(ragResults.matches);

      // Phase 4: Mark all current products as processed
      console.log('📝 Phase 4: Marking all current products as processed...');
      this.markAllCurrentProductsAsProcessed();

      console.log('✅ RAG-based product detection complete');

    } catch (error) {
      console.error('❌ RAG detection failed, falling back to vector search:', error);
      // Fallback to vector search if RAG fails
      await this.fallbackToVectorSearch();
    }
  }

  async captureAndIndexProductsForRAG() {
    if (this.isCapturing) return;

    this.isCapturing = true;
    console.log('📸 Starting product capture for RAG knowledge base...');

    // Show progress indicator
    this.showCaptureProgress();

    try {
      // Capture all products using vector search
      const products = await this.vectorSearch.captureAllProducts((progress) => {
        console.log(`📊 Capture progress: ${progress.percentage}% (${progress.captured} products)`);
        this.updateCaptureProgress(progress);
      });

      // Process products for RAG system
      console.log('🧠 Processing products for RAG knowledge base...');
      await this.ragSystem.processProductsForRAG(products);

      console.log('✅ RAG knowledge base created');
    } finally {
      this.isCapturing = false;
      this.hideCaptureProgress();
    }
  }

  async highlightRAGMatches(matches) {
    console.log(`🎯 Highlighting ${matches.length} RAG matches`);

    // Track processed products to avoid duplicates
    const processedProducts = new Set();
    let successfulHighlights = 0;

    for (const match of matches) {
      try {
        // Skip if we already processed this product
        if (processedProducts.has(match.productId)) {
          console.log(`⏭️ Skipping duplicate product: ${match.productId}`);
          continue;
        }

        processedProducts.add(match.productId);

        // Find the DOM element for this product
        const element = await this.findProductElement(match);
        if (element) {
          // Check if element is already highlighted
          if (element.classList.contains('modern-badge')) {
            console.log(`⏭️ Element already highlighted: ${match.title}`);
            continue;
          }

          this.highlightElement(element, {
            reason: match.reason,
            confidence: match.confidence,
            retrievalScore: match.retrievalScore
          });
          successfulHighlights++;
        } else {
          console.warn(`❌ Could not find DOM element for: ${match.title}`);
        }
      } catch (error) {
        console.error('❌ Failed to highlight RAG match:', error, match);
      }
    }

    console.log(`✅ Successfully highlighted ${successfulHighlights}/${matches.length} products`);
  }

  async findProductElement(productMeta) {
    console.log(`🔍 Finding element for product: ${productMeta.title}`);
    console.log(`📊 Element info available:`, productMeta.elementInfo);

    // Method 1: Use stored element info if available (most accurate)
    if (productMeta.elementInfo) {
      const { tag, classes, index } = productMeta.elementInfo;

      if (tag && classes) {
        // Try to find by tag, classes, and position
        const selector = `${tag.toLowerCase()}${classes ? '.' + classes.split(' ').join('.') : ''}`;
        const elements = document.querySelectorAll(selector);

        if (elements.length > 0) {
          // If index is provided, try to get exact element
          if (typeof index === 'number' && elements[index]) {
            const candidateElement = elements[index];
            const text = candidateElement.textContent?.toLowerCase() || '';
            const title = productMeta.title?.toLowerCase() || '';

            // Verify this is still the right element by checking title match
            if (title && text.includes(title.substring(0, Math.min(20, title.length)))) {
              console.log(`✅ Found element by stored metadata: ${productMeta.title}`);
              return candidateElement;
            }
          }

          // Fallback: find the best match among elements with same tag/classes
          for (const element of elements) {
            const text = element.textContent?.toLowerCase() || '';
            const title = productMeta.title?.toLowerCase() || '';

            if (title && text.includes(title.substring(0, Math.min(20, title.length)))) {
              console.log(`✅ Found element by tag/classes fallback: ${productMeta.title}`);
              return element;
            }
          }
        }
      }
    }

    // Method 2: Intelligent text matching with multiple selectors
    const productSelectors = [
      'article',
      'a[href*="/"]',
      '[class*="product"]',
      '[class*="item"]',
      '[data-testid*="product"]'
    ];

    const title = productMeta.title?.toLowerCase() || '';
    const brand = productMeta.brand?.toLowerCase() || '';
    const price = productMeta.price || '';

    for (const selector of productSelectors) {
      const elements = document.querySelectorAll(selector);

      for (const element of elements) {
        const text = element.textContent?.toLowerCase() || '';

        // Multi-factor matching for better accuracy
        let matchScore = 0;

        // Title matching (most important)
        if (title && title.length > 3) {
          const titleWords = title.split(/\s+/).filter(w => w.length > 2);
          const matchingWords = titleWords.filter(word => text.includes(word));
          matchScore += (matchingWords.length / titleWords.length) * 0.7;
        }

        // Brand matching
        if (brand && text.includes(brand)) {
          matchScore += 0.2;
        }

        // Price matching
        if (price && text.includes(price.toString())) {
          matchScore += 0.1;
        }

        // Require at least 60% match confidence
        if (matchScore >= 0.6) {
          console.log(`✅ Found element with ${(matchScore * 100).toFixed(1)}% confidence: ${productMeta.title}`);
          return element;
        }
      }
    }

    console.warn(`⚠️ Could not find element for: ${productMeta.title} (tried ${productSelectors.length} selector types)`);
    return null;
  }

  highlightElement(element, options = {}) {
    if (!element) return;

    // Skip if already highlighted to preserve existing highlights
    if (element.classList.contains('modern-badge')) {
      console.log('⏭️ Element already highlighted, skipping...');
      return;
    }

    // Remove any existing highlighting classes (only if not already highlighted)
    element.classList.remove('product-highlight', 'product-highlight-strong', 'product-highlight-medium');

    // Determine highlight strength based on confidence
    const confidence = options.confidence || 0;
    let highlightClass = 'product-highlight';

    if (confidence >= 0.8) {
      highlightClass = 'product-highlight-strong';
    } else if (confidence >= 0.6) {
      highlightClass = 'product-highlight-medium';
    }

    // Apply the highlight class AND the modern badge class
    element.classList.add(highlightClass, 'modern-badge');

    // Store match information for tooltips/debugging
    element.setAttribute('data-match-confidence', confidence.toFixed(3));
    element.setAttribute('data-match-reason', options.reason || '');

    console.log(`✨ Highlighted NEW element with modern badge: ${highlightClass}, confidence: ${confidence.toFixed(3)}`);
  }

  /**
   * Only detect and highlight NEW products (for scroll/infinite scroll)
   */
  async detectNewProducts() {
    if (!this.userPrompt || !this.isEnabled) {
      console.log('❌ Early exit: no prompt or disabled');
      return;
    }

    console.log('🆕 Detecting only NEW products...');

    // Get all current products on page
    const currentProducts = this.getAllProductsOnPage();
    const newProducts = [];

    // Filter out already processed products
    for (const product of currentProducts) {
      const productSignature = this.getProductSignature(product);
      if (!this.processedProducts.has(productSignature)) {
        newProducts.push(product);
        this.processedProducts.add(productSignature);
      }
    }

    console.log(`📊 Found ${newProducts.length} NEW products out of ${currentProducts.length} total`);

    if (newProducts.length === 0) {
      console.log('✅ No new products to process');
      return;
    }

    // Process only new products with RAG system
    try {
      const ragResponse = await this.ragSystem.generateWithRAG(this.userPrompt);

      console.log(`🎯 Highlighting ${ragResponse.matches.length} RAG matches`);
      await this.highlightRAGMatches(ragResponse.matches);

    } catch (error) {
      console.error('❌ New product detection failed:', error);
    }
  }

  /**
   * Get a unique signature for a product to track if we've seen it
   */
  getProductSignature(product) {
    // Use title + price + first 50 chars of text as signature
    const title = product.title || '';
    const price = product.price || '';
    const text = (product.text || '').substring(0, 50);
    return `${title}|${price}|${text}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Get all products currently visible on page
   */
  getAllProductsOnPage() {
    const products = [];
    const selectors = ['article', 'a[href*="/"]'];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const title = element.textContent?.trim() || '';
        if (title.length > 10) { // Basic filter for actual products
          products.push({
            title: title.substring(0, 100),
            text: title,
            element: element
          });
        }
      }
    }

    return products;
  }

  /**
   * Find DOM element by product metadata
   */
  findElementByProduct(productMeta) {
    const selectors = ['article', 'a[href*="/"]'];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const elementText = element.textContent?.trim() || '';
        if (elementText.includes(productMeta.title?.substring(0, 20))) {
          return element;
        }
      }
    }
    return null;
  }

  /**
   * Mark all products currently on page as processed to avoid re-processing on scroll
   */
  markAllCurrentProductsAsProcessed() {
    const currentProducts = this.getAllProductsOnPage();
    let marked = 0;

    for (const product of currentProducts) {
      const productSignature = this.getProductSignature(product);
      if (!this.processedProducts.has(productSignature)) {
        this.processedProducts.add(productSignature);
        marked++;
      }
    }

    console.log(`📝 Marked ${marked} products as processed (total tracked: ${this.processedProducts.size})`);
  }

  async fallbackToVectorSearch() {
    console.log('🔄 Falling back to vector search method...');

    try {
      // Phase 1: Capture all products if not done yet
      if (!this.isCapturing) {
        await this.captureAndIndexProducts();
      }

      // Phase 2: Vector similarity search
      console.log('🔍 Vector similarity search...');
      const topMatches = await this.vectorSearch.searchProducts(this.userPrompt, 20);
      console.log(`Found ${topMatches.length} potential matches via vector search`);

      // Phase 3: Use LLM only for top matches verification
      console.log('✅ LLM verification of top matches...');
      await this.verifyTopMatchesWithLLM(topMatches);

      console.log('✅ Fallback detection complete');

    } catch (error) {
      console.error('❌ Fallback to vector search also failed:', error);
    }
  }

  async captureAndIndexProducts() {
    if (this.isCapturing) return;

    this.isCapturing = true;
    console.log('📸 Starting product capture and indexing...');

    // Show progress indicator
    this.showCaptureProgress();

    try {
      // Auto-scroll and capture all products
      await this.vectorSearch.captureAllProducts((progress) => {
        console.log(`📊 Capture progress: ${progress.percentage}% (${progress.captured} products)`);
        this.updateCaptureProgress(progress);
      });

      console.log('✅ Product capture complete');
    } finally {
      this.hideCaptureProgress();
    }
  }

  async verifyTopMatchesWithLLM(topMatches) {
    // Only verify matches with high similarity scores
    const candidatesForLLM = topMatches.filter(match => match.similarity > 0.2);
    console.log(`🤖 Verifying ${candidatesForLLM.length} candidates with LLM`);

    if (candidatesForLLM.length === 0) {
      console.log('❌ No good matches found via vector search');
      return;
    }

    // Batch verify with Groq LLM (much more cost-effective)
    const verifiedProducts = [];

    for (const candidate of candidatesForLLM.slice(0, 10)) { // Max 10 LLM calls
      try {
        const llmScore = await this.groqEnhancer.evaluateProduct(candidate.text, this.userPrompt);

        if (llmScore >= this.threshold) {
          verifiedProducts.push({
            element: candidate.element,
            score: llmScore,
            vectorScore: candidate.similarity
          });
        }
      } catch (error) {
        console.error('LLM verification failed for product:', error);
      }
    }

    // Highlight verified products
    console.log(`✅ Highlighting ${verifiedProducts.length} verified products`);
    verifiedProducts.forEach(product => {
      if (product.element) {
        this.highlightProduct(product.element, product.score);
        this.highlightedElements.add(product.element);
      }
    });
  }

  // Keep old method as fallback
  async detectProductsLegacy() {
    console.log('⚠️ Falling back to legacy detection method...');
    // [Previous detection code here]
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

    if (!this.useGroq) {
      console.log('⚠️ Skipping LLM detection: disabled');
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
    // Remove all highlight classes including modern-badge
    this.highlightedElements.forEach(element => {
      element.classList.remove(
        'product-highlight',
        'product-highlight-strong',
        'product-highlight-medium',
        'modern-badge'
      );
      element.removeAttribute('data-match-score');
    });
    this.highlightedElements.clear();

    // Also clear any elements that might have been highlighted outside the tracked set
    const allHighlighted = document.querySelectorAll('.product-highlight, .product-highlight-strong, .product-highlight-medium, .modern-badge');
    allHighlighted.forEach(element => {
      element.classList.remove(
        'product-highlight',
        'product-highlight-strong',
        'product-highlight-medium',
        'modern-badge'
      );
      element.removeAttribute('data-match-score');
    });

    console.log(`🧹 Cleared ${allHighlighted.length} highlighted elements`);
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

  createToolbar() {
    console.log('🔧 Creating toolbar...');

    // Check if toolbar already exists
    if (document.getElementById('ph-toolbar-container')) {
      console.log('⚠️ Toolbar already exists, skipping creation');
      return;
    }

    console.log('📐 Body element:', document.body);
    if (!document.body) {
      console.error('❌ document.body not available!');
      return;
    }

    // Create toolbar container
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'ph-toolbar-container';
    this.toolbar.className = 'ph-toolbar';

    // Create prompt container (appears on hover when active)
    const promptContainer = document.createElement('div');
    promptContainer.className = 'ph-prompt-container';

    // Create prompt input
    const promptInput = document.createElement('input');
    promptInput.type = 'text';
    promptInput.className = 'ph-prompt-input';
    promptInput.placeholder = 'I search for white sneakers.';
    promptInput.value = this.userPrompt || '';

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'ph-toggle-button';
    this.toggleButton.setAttribute('aria-label', 'Toggle Product Highlighter');

    // Set initial state
    if (!this.isEnabled) {
      this.toggleButton.classList.add('inactive');
    }

    // Add prompt input to container
    promptContainer.appendChild(promptInput);

    // Add click handler for toggle
    this.toggleButton.addEventListener('click', (e) => {
      // If toolbar is extended and clicking the button, just toggle without closing prompt
      if (this.toolbar.classList.contains('extended')) {
        e.stopPropagation();
      }

      this.handleToggle();

      // Add ripple effect
      this.toggleButton.classList.add('ripple');
      setTimeout(() => {
        this.toggleButton.classList.remove('ripple');
      }, 600);
    });

    // Show search bar on button hover (only if there's a query)
    this.toggleButton.addEventListener('mouseenter', () => {
      if (this.isEnabled && this.userPrompt && this.userPrompt.trim().length > 0) {
        this.toolbar.classList.add('extended');
      }
    });

    // Hide search bar when mouse leaves button (if extended by hover)
    this.toggleButton.addEventListener('mouseleave', () => {
      // Only collapse if we're not actively typing AND no auto-collapse timer is active
      const promptInput = this.toolbar.querySelector('.ph-prompt-input');
      if (!this.autoCollapseTimer && (!promptInput || document.activeElement !== promptInput)) {
        this.toolbar.classList.remove('extended');
      }
    });

    // Also hide when mouse leaves the entire toolbar (unless input is focused or timer is active)
    this.toolbar.addEventListener('mouseleave', () => {
      const promptInput = this.toolbar.querySelector('.ph-prompt-input');
      if (!this.autoCollapseTimer && (!promptInput || document.activeElement !== promptInput)) {
        this.toolbar.classList.remove('extended');
        // Save any changes made to the prompt
        if (promptInput && promptInput.value !== this.userPrompt) {
          this.updatePrompt(promptInput.value);
        }
      }
    });

    // Handle prompt input
    promptInput.addEventListener('input', (e) => {
      // Update prompt in real-time for immediate feedback
      this.userPrompt = e.target.value;
    });

    promptInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.updatePrompt(promptInput.value);
        this.toolbar.classList.remove('extended');
        promptInput.blur();
      }
    });

    // Collapse search bar when input loses focus (after typing)
    promptInput.addEventListener('blur', () => {
      // Only collapse if no auto-collapse timer is active
      if (!this.autoCollapseTimer) {
        // Small delay to allow mouse leave events to be processed first
        setTimeout(() => {
          this.toolbar.classList.remove('extended');
          // Save any changes made to the prompt
          if (promptInput.value !== this.userPrompt) {
            this.updatePrompt(promptInput.value);
          }
        }, 100);
      }
    });

    // Prevent toolbar from closing when interacting with input
    promptInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Create edge tab (appears when toolbar is hidden)
    this.edgeTab = document.createElement('div');
    this.edgeTab.className = 'ph-edge-tab';
    this.edgeTab.setAttribute('aria-label', 'Show Product Highlighter');

    // Ensure edge tab starts hidden
    this.edgeTab.classList.remove('visible');

    // Edge tab click handler - brings back the toolbar with extended search
    this.edgeTab.addEventListener('click', () => {
      this.showToolbar(true); // Pass true to indicate this came from edge tab
    });

    // Assemble toolbar
    this.toolbar.appendChild(promptContainer);
    this.toolbar.appendChild(this.toggleButton);

    // Add to page
    console.log('➕ Adding toolbar and edge tab to page...');
    try {
      document.body.appendChild(this.toolbar);
      document.body.appendChild(this.edgeTab);
      console.log('✅ Toolbar and edge tab successfully added to page');

      // Force a style recalculation to ensure CSS is applied
      this.toolbar.offsetHeight;

      // Set initial toolbar state based on isEnabled
      if (!this.isEnabled) {
        // Start hidden with edge tab visible
        this.toolbar.classList.add('hidden');
        setTimeout(() => {
          this.edgeTab.classList.add('visible');
          console.log('🏷️ Edge tab made visible (toolbar disabled)');
        }, 500); // Wait for initial animations to complete
      } else {
        // If enabled, start with search bar collapsed and hide edge tab
        this.toolbar.classList.remove('extended');
        this.edgeTab.classList.remove('visible');
        console.log('🏷️ Edge tab hidden (toolbar enabled, search collapsed)');
      }

      // Log computed styles for debugging
      const computedStyle = window.getComputedStyle(this.toolbar);
      console.log('🎨 Toolbar styles:', {
        position: computedStyle.position,
        right: computedStyle.right,
        top: computedStyle.top,
        width: computedStyle.width,
        height: computedStyle.height,
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        zIndex: computedStyle.zIndex
      });
    } catch (error) {
      console.error('❌ Failed to add toolbar:', error);
    }
  }

  updatePrompt(newPrompt) {
    this.userPrompt = newPrompt;

    // Save to storage
    chrome.storage.sync.set({ userPrompt: this.userPrompt });

    // Clear existing highlights
    this.clearHighlights();

    // Re-run detection with new prompt
    if (this.isEnabled && this.userPrompt) {
      this.detectProducts();
    }

    // Notify popup/background of the change
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      userPrompt: this.userPrompt
    });
  }

  handleToggle() {
    // Toggle the enabled state
    this.isEnabled = !this.isEnabled;

    // Update button appearance and toolbar visibility
    if (this.isEnabled) {
      this.showToolbar();
    } else {
      this.hideToolbar();
    }

    // Save state to storage
    chrome.storage.sync.set({ isEnabled: this.isEnabled });

    // Handle highlighting
    if (this.isEnabled) {
      // Re-run detection when enabled
      if (this.userPrompt) {
        this.detectProducts();
      }
    } else {
      // Clear all highlights when disabled
      this.clearHighlights();
      // Reset capture state
      this.isCapturing = false;
    }

    // Notify background script
    chrome.runtime.sendMessage({
      action: 'toggleHighlighter',
      isEnabled: this.isEnabled
    });
  }

  showToolbar(extendSearch = false) {
    this.isEnabled = true;
    this.toggleButton.classList.remove('inactive');
    this.toolbar.classList.remove('hidden');
    this.edgeTab.classList.remove('visible');

    if (extendSearch) {
      // Extend search bar when coming from edge tab
      this.toolbar.classList.add('extended');

      // Focus the input after animation completes
      setTimeout(() => {
        const promptInput = this.toolbar.querySelector('.ph-prompt-input');
        if (promptInput) {
          promptInput.focus();
        }
      }, 400);

      // Clear any existing auto-collapse timer
      if (this.autoCollapseTimer) {
        clearTimeout(this.autoCollapseTimer);
      }

      // Auto-collapse search bar after 30 seconds (0.5 minutes)
      this.autoCollapseTimer = setTimeout(() => {
        if (this.toolbar && this.toolbar.classList.contains('extended')) {
          this.toolbar.classList.remove('extended');
          console.log('🕐 Search bar auto-collapsed after 30 seconds');
        }
        this.autoCollapseTimer = null;
      }, 30000); // 30 seconds = 0.5 minutes

      console.log('✅ Toolbar shown with search bar extended (from edge tab, auto-collapse in 30s)');
    } else {
      // Start with search bar collapsed - only extend on hover if query exists
      this.toolbar.classList.remove('extended');
      console.log('✅ Toolbar shown with search bar collapsed');
    }
  }

  hideToolbar() {
    this.isEnabled = false;
    this.toggleButton.classList.add('inactive');

    // Clear all highlights when hiding toolbar
    this.clearHighlights();
    this.isCapturing = false;

    // Collapse search bar first, then slide out toolbar
    this.toolbar.classList.remove('extended');

    // Wait for search bar collapse animation, then slide out toolbar
    setTimeout(() => {
      this.toolbar.classList.add('hidden');
    }, 100); // Small delay to let search bar start collapsing

    // Show edge tab after slide-out animation completes
    setTimeout(() => {
      this.edgeTab.classList.add('visible');
    }, 500); // 100ms + 400ms slide-out animation

    console.log('✅ Toolbar hidden and highlights cleared');
  }

  showCaptureProgress() {
    // Create progress overlay
    const progressOverlay = document.createElement('div');
    progressOverlay.id = 'ph-capture-progress';
    progressOverlay.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
      color: white;
      padding: 15px 25px;
      border-radius: 30px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
      z-index: 1000000;
      display: flex;
      align-items: center;
      gap: 15px;
    `;

    progressOverlay.innerHTML = `
      <div style="
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top: 3px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <div>
        <div id="ph-progress-text">Scanning products...</div>
        <div id="ph-progress-stats" style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
          0% complete • 0 products found
        </div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(progressOverlay);
  }

  updateCaptureProgress(progress) {
    const statsElement = document.getElementById('ph-progress-stats');
    if (statsElement) {
      statsElement.textContent = `${progress.percentage}% complete • ${progress.captured} products found`;
    }
  }

  hideCaptureProgress() {
    const progressOverlay = document.getElementById('ph-capture-progress');
    if (progressOverlay) {
      progressOverlay.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => progressOverlay.remove(), 300);
    }
  }
}

console.log('🚀 Content script loading...', { readyState: document.readyState });

// Create global instance variable
let productHighlighterInstance = null;

function initializeProductHighlighter() {
  if (productHighlighterInstance) {
    console.log('⚠️ ProductHighlighter already initialized');
    return;
  }

  console.log('📄 Creating ProductHighlighter instance...');
  productHighlighterInstance = new ProductHighlighter();

  // Verify toolbar was created
  setTimeout(() => {
    const toolbar = document.getElementById('ph-toolbar-container');
    if (!toolbar) {
      console.error('❌ Toolbar not found after initialization! Retrying...');
      if (productHighlighterInstance) {
        productHighlighterInstance.createToolbar();
      }
    } else {
      console.log('✅ Toolbar confirmed in DOM');
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProductHighlighter);
} else {
  // Document already loaded, init immediately
  initializeProductHighlighter();
}