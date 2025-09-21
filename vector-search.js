/**
 * Vector-based Product Search System
 * Efficient in-browser vector search using embeddings
 */

class VectorProductSearch {
  constructor() {
    this.products = [];
    this.embeddings = new Map();
    this.dbName = 'ProductVectorDB';
    this.dbVersion = 1;
    this.db = null;
    this.isScrolling = false;
    this.scrollSpeed = 500; // ms between scroll steps
    this.captureThreshold = 0.8; // Capture when 80% of viewport scrolled

    this.init();
  }

  async init() {
    await this.openDatabase();
    console.log('🗄️ Vector database initialized');
  }

  async openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store for products with embeddings
        if (!db.objectStoreNames.contains('products')) {
          const store = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('domain', 'domain');
        }

        // Store for search queries and their embeddings
        if (!db.objectStoreNames.contains('queries')) {
          const store = db.createObjectStore('queries', { keyPath: 'id', autoIncrement: true });
          store.createIndex('query', 'query');
        }
      };
    });
  }

  /**
   * Capture all products from DOM (with fake scrolling animation for UX)
   */
  async captureAllProducts(onProgress) {
    if (this.isScrolling) {
      console.log('⚠️ Already capturing');
      return;
    }

    this.isScrolling = true;

    try {
      // Wait for initial page load
      await this.waitForProducts();

      // Extract all products from DOM immediately
      console.log('📸 Capturing all products from DOM...');
      const allProducts = this.captureAllProductsFromDOM();
      console.log(`✅ Found ${allProducts.length} products on page`);

      // Fake progress animation for better UX
      await this.simulateProgressAnimation(allProducts.length, onProgress);

      // Store products in database
      await this.storeProducts(allProducts);

      return allProducts;

    } finally {
      this.isScrolling = false;
    }
  }

  /**
   * Extract all products from the entire DOM at once
   */
  captureAllProductsFromDOM() {
    const products = [];
    const seenElements = new Set();

    // Debug: Let's see what's actually on the page
    console.log('🔍 DEBUG: Analyzing page structure...');
    console.log('  Articles found:', document.querySelectorAll('article').length);
    console.log('  Links found:', document.querySelectorAll('a[href*="/"]').length);
    console.log('  Divs with classes:', document.querySelectorAll('div[class]').length);

    // Simple selectors that work
    const productSelectors = [
      'article', // Zalando uses article tags for products
      'a[href*="/"][class]' // Product links
    ];

    console.log(`🔍 Extracting products using ${productSelectors.length} selectors...`);

    productSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`  Found ${elements.length} elements with selector: ${selector}`);
        }

        elements.forEach(element => {
          // Skip if already processed
          if (seenElements.has(element)) return;

          // Skip if element is too small or hidden
          const rect = element.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 50) return;

          seenElements.add(element);

          const productData = this.extractProductData(element);
          if (productData && productData.text && productData.text.length > 20) {
            console.log(`  ✅ Captured product: ${productData.text.substring(0, 50)}...`);

            // Store product data without the DOM element (for IndexedDB)
            const storeableProduct = {
              title: productData.title,
              price: productData.price,
              description: productData.description,
              brand: productData.brand,
              image: productData.image,
              link: productData.link,
              text: productData.text,
              htmlContent: productData.htmlContent,
              timestamp: Date.now(),
              domain: window.location.hostname,
              url: window.location.href,
              // Store element selector info for later retrieval
              elementTag: element.tagName,
              elementClasses: element.className,
              elementIndex: Array.from(element.parentNode?.children || []).indexOf(element)
            };

            products.push({
              ...storeableProduct,
              element: element // Keep element reference for immediate use
            });
          }
        });
      } catch (error) {
        console.error(`Error with selector ${selector}:`, error);
      }
    });

    return products;
  }

  /**
   * Simulate progress animation for better UX
   */
  async simulateProgressAnimation(totalProducts, onProgress) {
    const steps = 10;
    const stepDelay = 100; // ms

    for (let i = 0; i <= steps; i++) {
      const percentage = Math.round((i / steps) * 100);
      const productsShown = Math.round((i / steps) * totalProducts);

      if (onProgress) {
        onProgress({
          captured: productsShown,
          scrollPosition: 0,
          totalHeight: 100,
          percentage: percentage
        });
      }

      await this.wait(stepDelay);
    }
  }


  /**
   * Extract structured data from a product element
   */
  extractProductData(element) {
    // Extract text content - Zalando specific and generic selectors
    const title = element.querySelector('h2, h3, h4, [class*="title"], [class*="name"], [class*="articleName"]')?.textContent?.trim() || '';
    const price = this.extractPrice(element);
    const description = element.querySelector('[class*="description"], p')?.textContent?.trim() || '';

    // Brand extraction for Zalando
    const brand = element.querySelector('[class*="brand"], [class*="manufacturer"], h3, span[class*="brand"]')?.textContent?.trim() ||
                  element.querySelector('h3')?.textContent?.trim() || '';

    // Extract all text from the element if specific selectors fail
    const fullText = element.textContent?.trim() || '';

    // Extract image
    const img = element.querySelector('img');
    const image = img?.src || img?.dataset?.src || '';

    // Extract link
    const link = element.querySelector('a')?.href || element.closest('a')?.href || '';

    // Combine all text for embedding - use full text if specific fields are empty
    const text = (title || brand || description || price)
      ? [title, brand, description, price].filter(Boolean).join(' ')
      : fullText;

    // Only return if we have meaningful content
    if (!text || text.length < 10) return null;

    return {
      element: element,
      title,
      price,
      description,
      brand,
      image,
      link,
      text,
      htmlContent: element.outerHTML.substring(0, 1000) // Store limited HTML
    };
  }

  /**
   * Extract price from element
   */
  extractPrice(element) {
    const pricePatterns = [
      /[\$€£]\s*\d+(?:[.,]\d{2})?/,
      /\d+(?:[.,]\d{2})?\s*[\$€£]/
    ];

    const text = element.textContent || '';
    for (const pattern of pricePatterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }

    // Look for price in specific elements
    const priceElement = element.querySelector('[class*="price"], [data-price]');
    if (priceElement) {
      return priceElement.textContent?.trim() || '';
    }

    return '';
  }

  /**
   * Generate embedding for text using semantic keyword matching
   * Much better than hash-based approach for product search
   */
  generateEmbedding(text) {
    const cleanText = text.toLowerCase();

    // Define semantic categories with their keywords
    const categories = {
      // Colors
      colors: ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey', 'gray', 'beige', 'navy', 'gold', 'silver'],

      // Footwear
      footwear: ['sneaker', 'sneakers', 'shoe', 'shoes', 'boot', 'boots', 'sandal', 'sandals', 'heel', 'heels', 'flat', 'flats', 'trainer', 'trainers', 'runner', 'running'],

      // Clothing types
      clothing: ['shirt', 'shirts', 'dress', 'dresses', 'pant', 'pants', 'jean', 'jeans', 'jacket', 'jackets', 'coat', 'coats', 'sweater', 'sweaters', 'hoodie', 'hoodies'],

      // Materials
      materials: ['cotton', 'leather', 'denim', 'wool', 'silk', 'polyester', 'canvas', 'suede', 'nylon', 'mesh'],

      // Brands (common ones)
      brands: ['nike', 'adidas', 'puma', 'converse', 'vans', 'new balance', 'asics', 'reebok', 'under armour', 'jordan'],

      // Sizes
      sizes: ['small', 'medium', 'large', 'xl', 'xxl', 'xs', 's', 'm', 'l'],

      // Gender
      gender: ['men', 'women', 'mens', 'womens', 'male', 'female', 'unisex'],

      // Style descriptors
      style: ['casual', 'formal', 'sport', 'athletic', 'vintage', 'classic', 'modern', 'trendy', 'comfortable', 'slim', 'loose', 'tight']
    };

    // Create embedding vector
    const embedding = new Float32Array(200); // Smaller, more focused vector
    let index = 0;

    // Score each category based on keyword matches
    Object.entries(categories).forEach(([category, keywords]) => {
      let categoryScore = 0;
      keywords.forEach(keyword => {
        if (cleanText.includes(keyword)) {
          categoryScore += 1;
        }
      });

      // Normalize by category size and boost important matches
      embedding[index] = categoryScore / Math.sqrt(keywords.length);
      index++;
    });

    // Add exact phrase matching for better precision
    const words = cleanText.split(/\W+/).filter(w => w.length > 2);

    // Boost score for each word that appears
    words.forEach((word, i) => {
      if (index < embedding.length - 10) {
        // Simple hash but with better distribution
        const hashIndex = Math.abs(this.hashWord(word)) % 50;
        embedding[index + hashIndex] += 0.5;
      }
    });

    // Normalize the entire vector
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / norm;
      }
    }

    return embedding;
  }

  /**
   * Generate embedding from LLM-extracted keywords
   */
  generateKeywordEmbedding(keywords) {
    const embedding = new Float32Array(200);
    let index = 0;

    // Map LLM categories to embedding positions
    const categoryWeights = {
      colors: 3.0,    // High weight for colors
      types: 4.0,     // Highest weight for product types
      brands: 2.0,    // Medium weight for brands
      materials: 2.5, // Medium-high weight for materials
      styles: 1.5,    // Lower weight for styles
      sizes: 1.0,     // Lower weight for sizes
      gender: 1.5,    // Lower weight for gender
      other: 1.0      // Base weight for other keywords
    };

    // Fill embedding based on extracted keywords
    Object.entries(keywords).forEach(([category, keywordList]) => {
      const weight = categoryWeights[category] || 1.0;

      if (keywordList && keywordList.length > 0) {
        // Set high values for this category
        embedding[index] = keywordList.length * weight;

        // Also boost related positions
        keywordList.forEach((keyword, i) => {
          if (index + i + 1 < embedding.length) {
            embedding[index + i + 1] = weight * 0.8;
          }
        });
      }
      index += 10; // Move to next category block
    });

    // Normalize the vector
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / norm;
      }
    }

    return embedding;
  }

  /**
   * Simple hash function for word to index mapping
   */
  hashWord(word) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (norm1 * norm2);
  }

  /**
   * Extract search keywords using LLM
   */
  async extractSearchKeywords(query) {
    const prompt = `Extract relevant product search keywords from this query: "${query}"

Return ONLY a JSON object with these categories (use empty arrays if no matches):
{
  "colors": ["color1", "color2"],
  "types": ["product_type1", "product_type2"],
  "brands": ["brand1", "brand2"],
  "materials": ["material1", "material2"],
  "styles": ["style1", "style2"],
  "sizes": ["size1", "size2"],
  "gender": ["men", "women", "unisex"],
  "other": ["keyword1", "keyword2"]
}

Examples:
Query: "white nike sneakers" → {"colors":["white"],"types":["sneakers"],"brands":["nike"],"materials":[],"styles":[],"sizes":[],"gender":[],"other":[]}
Query: "red leather jacket for women" → {"colors":["red"],"types":["jacket"],"brands":[],"materials":["leather"],"styles":[],"sizes":[],"gender":["women"],"other":[]}`;

    try {
      // Use the groq enhancer to get keywords
      const groqEnhancer = window.groqProductEnhancer;
      if (!groqEnhancer) {
        console.log('⚠️ GroqEnhancer not available, using fallback');
        return this.fallbackKeywordExtraction(query);
      }

      const response = await groqEnhancer.callGroqAPI(prompt, 200);

      // Parse the JSON response
      const keywords = JSON.parse(response.trim());
      console.log('🎯 LLM extracted keywords:', keywords);
      return keywords;
    } catch (error) {
      console.error('❌ Failed to extract keywords:', error);
      // Fallback to simple word extraction
      return this.fallbackKeywordExtraction(query);
    }
  }

  /**
   * Fallback keyword extraction if LLM fails
   */
  fallbackKeywordExtraction(query) {
    const cleanQuery = query.toLowerCase();
    const words = cleanQuery.split(/\W+/).filter(w => w.length > 2);

    // Simple pattern matching for fallback
    const result = {
      colors: [],
      types: [],
      brands: [],
      materials: [],
      styles: [],
      sizes: [],
      gender: [],
      other: []
    };

    // Define basic patterns for each category
    const patterns = {
      colors: ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey', 'gray', 'beige', 'navy'],
      types: ['sneaker', 'sneakers', 'shoe', 'shoes', 'boot', 'boots', 'sandal', 'sandals', 'heel', 'heels', 'trainer', 'trainers'],
      brands: ['nike', 'adidas', 'puma', 'converse', 'vans', 'reebok', 'jordan'],
      materials: ['leather', 'cotton', 'denim', 'wool', 'canvas'],
      gender: ['men', 'women', 'mens', 'womens', 'male', 'female'],
      styles: ['casual', 'formal', 'sport', 'athletic', 'vintage']
    };

    // Match words against patterns
    words.forEach(word => {
      let matched = false;
      Object.entries(patterns).forEach(([category, categoryWords]) => {
        if (categoryWords.includes(word)) {
          result[category].push(word);
          matched = true;
        }
      });

      if (!matched) {
        result.other.push(word);
      }
    });

    console.log('🔄 Fallback keywords extracted:', result);
    return result;
  }

  /**
   * Search for products using vector similarity with LLM-extracted keywords
   */
  async searchProducts(query, topK = 10) {
    console.log(`🔍 Searching for: "${query}"`);

    // Extract keywords using LLM
    const searchKeywords = await this.extractSearchKeywords(query);

    // Generate embedding for query using extracted keywords
    const queryEmbedding = this.generateKeywordEmbedding(searchKeywords);

    // Get all products from database
    const products = await this.getAllProducts();

    // Calculate similarities
    const similarities = products.map(product => {
      const productEmbedding = this.generateEmbedding(product.text);
      const similarity = this.cosineSimilarity(queryEmbedding, productEmbedding);

      return {
        ...product,
        similarity,
        score: similarity,
        matchedKeywords: searchKeywords
      };
    });

    // Sort by similarity and return top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topMatches = similarities.slice(0, topK);

    console.log(`📊 Found ${topMatches.length} matches with scores:`,
      topMatches.map(m => m.score.toFixed(3)));

    return topMatches;
  }

  /**
   * Store products in IndexedDB
   */
  async storeProducts(products) {
    const transaction = this.db.transaction(['products'], 'readwrite');
    const store = transaction.objectStore('products');

    for (const product of products) {
      // Remove the DOM element before storing
      const { element, ...storeableProduct } = product;
      await store.add(storeableProduct);
    }

    console.log(`💾 Stored ${products.length} products in database`);
  }

  /**
   * Get all products from database
   */
  async getAllProducts() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['products'], 'readonly');
      const store = transaction.objectStore('products');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear product database
   */
  async clearDatabase() {
    const transaction = this.db.transaction(['products'], 'readwrite');
    const store = transaction.objectStore('products');
    await store.clear();
    console.log('🗑️ Database cleared');
  }

  /**
   * Utility: wait for specified milliseconds
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for products to be loaded on the page
   */
  async waitForProducts(maxWait = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      // Check for common product indicators
      const hasProducts = document.querySelector('article') ||
                         document.querySelector('[class*="product"]') ||
                         document.querySelector('[class*="item"]') ||
                         document.querySelector('[class*="catalog"]');

      if (hasProducts) {
        console.log('✅ Products detected on page');
        return true;
      }

      await this.wait(500);
    }

    console.log('⚠️ Timeout waiting for products');
    return false;
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VectorProductSearch;
}