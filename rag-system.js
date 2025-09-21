/**
 * RAG (Retrieval-Augmented Generation) System for Product Detection
 * Combines semantic search with LLM generation for better product matching
 */

class ProductRAGSystem {
  constructor() {
    this.dbName = 'ProductRAGDB_v4';
    this.dbVersion = 1;
    this.db = null;
    this.chunkSize = 200; // Characters per chunk
    this.maxRetrievedChunks = 100;
    this.similarityThreshold = 0.1;
    this.model = null; // Universal Sentence Encoder

    this.init();
  }

  async init() {
    await this.openDatabase();
    await this.initEmbeddingModel();
    console.log('🧠 RAG System initialized with lightweight embeddings');
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
        const oldVersion = event.oldVersion;

        // Product chunks store with embeddings
        if (!db.objectStoreNames.contains('productChunks')) {
          const store = db.createObjectStore('productChunks', { keyPath: 'id', autoIncrement: true });
          store.createIndex('productId', 'productId');
          store.createIndex('domain', 'domain');
          store.createIndex('timestamp', 'timestamp');
        }

        // Product metadata store
        if (!db.objectStoreNames.contains('productMeta')) {
          const store = db.createObjectStore('productMeta', { keyPath: 'id', autoIncrement: true });
          store.createIndex('productId', 'productId');
          store.createIndex('domain', 'domain');
          store.createIndex('timestamp', 'timestamp');
        } else if (oldVersion < 2) {
          // Add productId index to existing store
          const transaction = event.target.transaction;
          const store = transaction.objectStore('productMeta');
          if (!store.indexNames.contains('productId')) {
            store.createIndex('productId', 'productId');
          }
        }

        // Query history and results
        if (!db.objectStoreNames.contains('queryHistory')) {
          const store = db.createObjectStore('queryHistory', { keyPath: 'id', autoIncrement: true });
          store.createIndex('query', 'query');
          store.createIndex('timestamp', 'timestamp');
        }
      };
    });
  }

  /**
   * Process and store products in RAG knowledge base
   */
  async processProductsForRAG(products) {
    console.log(`🔄 Processing ${products.length} products for RAG knowledge base...`);

    const chunks = [];
    const metadata = [];

    for (const product of products) {
      // Create consistent product ID based on content
      const productId = product.id || this.generateConsistentProductId(product);

      // Create rich product context
      const productContext = this.createProductContext(product);

      // Chunk the product information
      const productChunks = await this.chunkProductInfo(productContext, productId);
      chunks.push(...productChunks);

      // Store metadata
      metadata.push({
        productId: productId,
        title: product.title,
        brand: product.brand,
        price: product.price,
        link: product.link,
        image: product.image,
        domain: window.location.hostname,
        timestamp: Date.now(),
        rawText: product.text,
        elementInfo: {
          tag: product.elementTag,
          classes: product.elementClasses,
          index: product.elementIndex
        }
      });
    }

    // Store in database
    await this.storeChunks(chunks);
    await this.storeMetadata(metadata);

    console.log(`✅ Processed ${chunks.length} chunks from ${products.length} products`);
    return { chunks: chunks.length, products: products.length };
  }

  /**
   * Generate consistent product ID based on content
   */
  generateConsistentProductId(product) {
    // Create a consistent hash from title, brand, and price
    const key = `${product.title || ''}|${product.brand || ''}|${product.price || ''}|${product.link || ''}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
  }

  /**
   * Create rich contextual information for a product
   */
  createProductContext(product) {
    const context = {
      // Basic info
      title: product.title || '',
      brand: product.brand || '',
      price: product.price || '',
      description: product.description || '',

      // Semantic attributes
      productType: this.extractProductType(product.text),
      colors: this.extractColors(product.text),
      materials: this.extractMaterials(product.text),
      style: this.extractStyle(product.text),
      gender: this.extractGender(product.text),

      // Full text for search
      fullText: product.text,

      // Context clues
      pageContext: window.location.href,
      domain: window.location.hostname
    };

    return context;
  }

  /**
   * Extract product type from text
   */
  extractProductType(text) {
    const types = ['sneaker', 'shoe', 'boot', 'sandal', 'heel', 'flat', 'trainer', 'runner', 'dress', 'shirt', 'pant', 'jacket', 'coat'];
    const lowerText = text.toLowerCase();

    for (const type of types) {
      if (lowerText.includes(type)) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * Extract colors from text
   */
  extractColors(text) {
    const colors = ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey', 'gray', 'beige', 'navy'];
    const lowerText = text.toLowerCase();

    return colors.filter(color => lowerText.includes(color));
  }

  /**
   * Extract materials from text
   */
  extractMaterials(text) {
    const materials = ['leather', 'cotton', 'denim', 'wool', 'silk', 'canvas', 'suede', 'mesh'];
    const lowerText = text.toLowerCase();

    return materials.filter(material => lowerText.includes(material));
  }

  /**
   * Extract style descriptors
   */
  extractStyle(text) {
    const styles = ['casual', 'formal', 'sport', 'athletic', 'vintage', 'classic', 'modern'];
    const lowerText = text.toLowerCase();

    return styles.filter(style => lowerText.includes(style));
  }

  /**
   * Extract gender targeting
   */
  extractGender(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('women') || lowerText.includes('female')) return 'women';
    if (lowerText.includes('men') || lowerText.includes('male')) return 'men';
    return 'unisex';
  }

  /**
   * Chunk product information for better retrieval
   */
  async chunkProductInfo(context, productId) {
    const chunks = [];

    // Create different types of chunks for better retrieval

    // 1. Title + Brand chunk
    if (context.title || context.brand) {
      chunks.push({
        productId: productId,
        type: 'title_brand',
        content: `${context.brand} ${context.title}`.trim(),
        metadata: {
          brand: context.brand,
          title: context.title,
          productType: context.productType
        }
      });
    }

    // 2. Attributes chunk
    const attributes = [];
    if (context.colors.length > 0) attributes.push(`Colors: ${context.colors.join(', ')}`);
    if (context.materials.length > 0) attributes.push(`Materials: ${context.materials.join(', ')}`);
    if (context.style.length > 0) attributes.push(`Style: ${context.style.join(', ')}`);
    if (context.productType !== 'unknown') attributes.push(`Type: ${context.productType}`);
    if (context.gender !== 'unisex') attributes.push(`Gender: ${context.gender}`);
    if (context.price) attributes.push(`Price: ${context.price}`);

    if (attributes.length > 0) {
      chunks.push({
        productId: productId,
        type: 'attributes',
        content: attributes.join('. '),
        metadata: {
          colors: context.colors,
          materials: context.materials,
          style: context.style,
          productType: context.productType,
          gender: context.gender
        }
      });
    }

    // 3. Full description chunks (if long text)
    if (context.fullText && context.fullText.length > this.chunkSize) {
      const textChunks = this.splitIntoChunks(context.fullText, this.chunkSize);
      textChunks.forEach((chunk, index) => {
        chunks.push({
          productId: productId,
          type: 'description',
          content: chunk,
          chunkIndex: index,
          metadata: {
            isDescription: true
          }
        });
      });
    } else if (context.fullText) {
      chunks.push({
        productId: productId,
        type: 'description',
        content: context.fullText,
        metadata: {
          isDescription: true
        }
      });
    }

    // Add embeddings to each chunk (async now)
    for (const chunk of chunks) {
      chunk.embedding = await this.generateEmbedding(chunk.content);
      chunk.timestamp = Date.now();
      chunk.domain = window.location.hostname;
    }

    return chunks;
  }

  /**
   * Split text into overlapping chunks
   */
  splitIntoChunks(text, chunkSize) {
    const chunks = [];
    const overlap = Math.floor(chunkSize * 0.2); // 20% overlap

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.substring(i, i + chunkSize);
      if (chunk.trim()) {
        chunks.push(chunk.trim());
      }
    }

    return chunks;
  }

  /**
   * Initialize lightweight embedding model
   */
  async initEmbeddingModel() {
    try {
      console.log('🔄 Loading lightweight embedding model...');

      // Check if LightweightEmbeddings is available
      if (typeof window.LightweightEmbeddings === 'undefined') {
        throw new Error('LightweightEmbeddings not loaded');
      }

      console.log('✅ LightweightEmbeddings library detected');
      this.model = new window.LightweightEmbeddings();
      console.log('✅ Lightweight embedding model initialized successfully');
    } catch (error) {
      console.error('❌ Failed to load lightweight embedding model:', error);
      console.warn('⚠️ Falling back to simple embeddings');
      // Fallback to simple embeddings if lightweight model fails
      this.model = null;
    }
  }


  /**
   * Generate semantic embeddings using lightweight embedding model
   */
  async generateEmbedding(text) {
    if (!this.model) {
      console.warn('⚠️ Lightweight embedding model not available, using fallback embedding');
      return this.generateFallbackEmbedding(text);
    }

    try {
      const embedding = this.model.generateSentenceEmbedding(text);
      return Array.from(embedding);
    } catch (error) {
      console.error('❌ Lightweight embedding failed:', error);
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Fallback embedding for when USE is not available
   */
  generateFallbackEmbedding(text) {
    const cleanText = text.toLowerCase();

    // Enhanced embedding with semantic categories
    const categories = {
      // Product types (higher weight)
      footwear: ['sneaker', 'sneakers', 'shoe', 'shoes', 'boot', 'boots', 'sandal', 'sandals', 'trainer', 'trainers', 'runner', 'running'],
      clothing: ['shirt', 'dress', 'pant', 'pants', 'jean', 'jeans', 'jacket', 'coat', 'sweater', 'hoodie'],

      // Colors (let embedding model handle semantic differences)
      colors: ['white', 'black', 'grey', 'gray', 'red', 'blue', 'green', 'brown', 'beige', 'navy', 'yellow', 'pink', 'purple', 'orange'],

      // Brands (medium weight)
      brands: ['nike', 'adidas', 'puma', 'converse', 'vans', 'reebok', 'jordan', 'tommy', 'calvin', 'ralph', 'polo'],

      // Materials (medium weight)
      materials: ['leather', 'cotton', 'denim', 'wool', 'silk', 'canvas', 'suede', 'mesh', 'polyester'],

      // Style (lower weight)
      styles: ['casual', 'formal', 'sport', 'athletic', 'vintage', 'classic', 'modern', 'trendy'],

      // Gender (lower weight)
      gender: ['men', 'women', 'mens', 'womens', 'male', 'female', 'unisex']
    };

    const weights = {
      footwear: 4.0,
      clothing: 4.0,
      colors: 3.5,
      brands: 2.5,
      materials: 2.0,
      styles: 1.5,
      gender: 1.0
    };

    const embedding = new Float32Array(300);
    let index = 0;

    // Score categories
    Object.entries(categories).forEach(([category, keywords]) => {
      const weight = weights[category] || 1.0;
      let categoryScore = 0;

      keywords.forEach(keyword => {
        if (cleanText.includes(keyword)) {
          categoryScore += weight;
        }
      });

      // Spread category score across multiple positions
      for (let i = 0; i < 10 && index < embedding.length; i++) {
        embedding[index++] = categoryScore * (1 - i * 0.1); // Decreasing weight
      }
    });

    // Add word-level features
    const words = cleanText.split(/\W+/).filter(w => w.length > 2);
    words.forEach(word => {
      if (index < embedding.length - 50) {
        const hash = this.hashWord(word) % 50;
        embedding[index + hash] += 0.5;
      }
    });

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / norm;
      }
    }

    return embedding;
  }

  /**
   * Hash function for words
   */
  hashWord(word) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Perform semantic search in the knowledge base
   */
  async retrieveRelevantChunks(query, maxChunks = 10) {
    console.log(`🔍 RAG Retrieval: "${query}"`);

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Get all chunks from database
    const chunks = await this.getAllChunks();

    // Calculate similarities
    const similarities = chunks.map(chunk => {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return {
        ...chunk,
        similarity
      };
    });

    // Sort and filter
    similarities.sort((a, b) => b.similarity - a.similarity);
    const relevantChunks = similarities.filter(chunk => chunk.similarity > this.similarityThreshold).slice(0, maxChunks);

    console.log(`📊 Retrieved ${relevantChunks.length} relevant chunks with scores:`, relevantChunks.map(c => c.similarity.toFixed(3)));

    // Debug: Show sample chunks that were retrieved
    if (relevantChunks.length > 0) {
      console.log('🔍 Sample retrieved chunks:');
      relevantChunks.slice(0, 5).forEach((chunk, i) => {
        console.log(`  ${i + 1}. Score: ${chunk.similarity.toFixed(3)} | Content: "${chunk.content.substring(0, 80)}..."`);
      });

      // Special debug: Show all white sneaker related chunks for analysis
      const whiteSneakerChunks = relevantChunks.filter(chunk =>
        chunk.content.toLowerCase().includes('white') &&
        (chunk.content.toLowerCase().includes('sneaker') || chunk.content.toLowerCase().includes('shoe'))
      );

      if (whiteSneakerChunks.length > 0) {
        console.log(`🟡 Found ${whiteSneakerChunks.length} white sneaker chunks:`);
        whiteSneakerChunks.slice(0, 10).forEach((chunk, i) => {
          console.log(`  ${i + 1}. Score: ${chunk.similarity.toFixed(3)} | "${chunk.content.substring(0, 60)}..."`);
        });
      }
    }

    return relevantChunks;
  }

  /**
   * Generate response using semantic RAG with vector similarity
   */
  async generateWithRAG(query) {
    console.log(`🧠 RAG Generation for: "${query}"`);

    try {
      // Step 1: Retrieve semantically similar chunks
      const relevantChunks = await this.retrieveRelevantChunks(query, this.maxRetrievedChunks);

      if (relevantChunks.length === 0) {
        console.log('❌ No relevant chunks found');
        return {
          matches: [],
          reasoning: 'No semantically similar products found',
          retrievedChunks: 0
        };
      }

      console.log(`📊 Found ${relevantChunks.length} relevant chunks`);

      // Step 2: Group by product and calculate product-level scores
      const productScores = {};

      relevantChunks.forEach(chunk => {
        if (!productScores[chunk.productId]) {
          productScores[chunk.productId] = {
            maxSimilarity: 0,
            avgSimilarity: 0,
            chunkCount: 0,
            totalSimilarity: 0
          };
        }

        const score = productScores[chunk.productId];
        score.maxSimilarity = Math.max(score.maxSimilarity, chunk.similarity);
        score.totalSimilarity += chunk.similarity;
        score.chunkCount++;
        score.avgSimilarity = score.totalSimilarity / score.chunkCount;
      });

      // Step 3: Get product metadata and create matches
      const matches = [];

      for (const [productId, scores] of Object.entries(productScores)) {
        const productMeta = await this.getProductMetadata(productId);

        if (productMeta && scores.maxSimilarity > this.similarityThreshold) {
          matches.push({
            productId: productMeta.productId,
            title: productMeta.title,
            brand: productMeta.brand || '',
            price: productMeta.price,
            link: productMeta.link,
            image: productMeta.image,
            elementInfo: productMeta.elementInfo,
            confidence: scores.maxSimilarity,
            avgConfidence: scores.avgSimilarity,
            reason: `Semantic similarity: ${scores.maxSimilarity.toFixed(3)} (${scores.chunkCount} chunks)`,
            retrievalScore: scores.maxSimilarity
          });
        }
      }

      // Enhanced deduplication based on title similarity (not just productId)
      const deduplicatedMatches = new Map();
      matches.forEach((match, index) => {
        // Create a normalized key from title for better deduplication
        const normalizedTitle = (match.title || '').toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s-]/g, '')
          .trim();

        // Use first 30 characters as dedup key
        const dedupKey = normalizedTitle.substring(0, 30);

        if (!deduplicatedMatches.has(dedupKey) ||
            match.confidence > deduplicatedMatches.get(dedupKey).confidence) {
          deduplicatedMatches.set(dedupKey, match);
        }
      });

      const finalMatches = Array.from(deduplicatedMatches.values());

      // Sort by confidence
      finalMatches.sort((a, b) => b.confidence - a.confidence);

      console.log(`✅ Found ${finalMatches.length} semantic matches (${matches.length} before deduplication)`);

      // Debug: Show top matches (after deduplication)
      if (finalMatches.length > 0) {
        console.log('📋 Top semantic matches (deduplicated):');
        finalMatches.slice(0, 5).forEach(match => {
          console.log(`  - ${match.title} (${match.confidence.toFixed(3)}) [ID: ${match.productId}]`);
        });
      }

      return {
        matches: finalMatches,
        reasoning: `Found ${finalMatches.length} products via semantic vector search`,
        retrievedChunks: relevantChunks.length
      };

    } catch (error) {
      console.error('❌ RAG generation failed:', error);
      return {
        matches: [],
        reasoning: `RAG generation failed: ${error.message}`,
        retrievedChunks: 0
      };
    }
  }

  /**
   * Build context string for LLM
   */
  async buildContextForLLM(chunks) {
    const contextParts = [];

    // Group chunks by product
    const productGroups = {};
    chunks.forEach(chunk => {
      if (!productGroups[chunk.productId]) {
        productGroups[chunk.productId] = [];
      }
      productGroups[chunk.productId].push(chunk);
    });

    // Build context for each product
    for (const [productId, productChunks] of Object.entries(productGroups)) {
      const titleChunk = productChunks.find(c => c.type === 'title_brand');
      const attributeChunk = productChunks.find(c => c.type === 'attributes');
      const descChunks = productChunks.filter(c => c.type === 'description');

      let productContext = `Product ID: ${productId}\n`;
      if (titleChunk) productContext += `- Name: ${titleChunk.content}\n`;
      if (attributeChunk) productContext += `- Attributes: ${attributeChunk.content}\n`;
      if (descChunks.length > 0) {
        productContext += `- Description: ${descChunks.map(c => c.content).join(' ')}\n`;
      }

      // Get the actual product metadata from database for better context
      try {
        const metadata = await this.getProductMetadata(productId);
        if (metadata) {
          productContext += `- Full Title: ${metadata.title || 'N/A'}\n`;
          productContext += `- Brand: ${metadata.brand || 'N/A'}\n`;
          productContext += `- Price: ${metadata.price || 'N/A'}\n`;
        } else {
          console.warn(`⚠️ No metadata found for productId: ${productId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error getting metadata for ${productId}:`, error);
      }

      productContext += `- Similarity Score: ${Math.max(...productChunks.map(c => c.similarity)).toFixed(3)}\n`;

      contextParts.push(productContext);
    }

    return contextParts.join('\n');
  }

  /**
   * Query LLM with retrieved context
   */
  async queryLLMWithContext(query, context) {
    console.log('🔍 LLM Context being sent (first 1000 chars):', context.substring(0, 1000));
    console.log('🔍 LLM Context length:', context.length);
    console.log('🔍 Number of products in context:', (context.match(/Product ID:/g) || []).length);

    const prompt = `You are a strict product matching AI. Only match products that EXACTLY contain the search terms.

Query: "${query}"

Products:
${context}

CRITICAL RULES:
1. For "white sneakers": ONLY match products that have "white" (NOT grey, NOT black, NOT any other color) in their name/description
2. A product with "grey" or "gray" does NOT match "white"
3. Check the ACTUAL TEXT - if it says "grey" it is NOT white
4. Only give high confidence (0.8-1.0) if the product ACTUALLY contains the search terms

EXAMPLES OF CORRECT MATCHING:
- Query "white sneakers" + Product "Nike - Sneaker low - white" = MATCH (confidence: 0.9)
- Query "white sneakers" + Product "Tommy - Sneaker low - white" = MATCH (confidence: 0.9)
- Query "white sneakers" + Product "PULL&BEAR - Sneaker low - grey" = NO MATCH (confidence: 0.0)
- Query "white sneakers" + Product "Nike - Sneaker low - black" = NO MATCH (confidence: 0.0)

Return ONLY valid product matches in this JSON format:
{
  "matches": [
    {"productId": "EXACT_ID_FROM_ABOVE", "confidence": 0.9, "reason": "contains white and is a sneaker"}
  ]
}`;

    try {
      const groqEnhancer = window.groqProductEnhancer;
      if (!groqEnhancer) {
        throw new Error('GroqEnhancer not available');
      }

      const response = await groqEnhancer.callGroqAPI(prompt, 1000);
      return response;
    } catch (error) {
      console.error('❌ LLM generation failed:', error);
      return '{"matches": [], "reasoning": "LLM generation failed"}';
    }
  }

  /**
   * Extract product matches from LLM response
   */
  async extractProductMatches(chunks, llmResponse) {
    try {
      // Clean the response - remove any text before/after JSON
      let cleanResponse = llmResponse.trim();

      // Find JSON object boundaries
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}') + 1;

      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleanResponse = cleanResponse.substring(jsonStart, jsonEnd);
      }

      console.log('🔧 Cleaned LLM response:', cleanResponse.substring(0, 200) + '...');

      const parsed = JSON.parse(cleanResponse);
      const matches = [];

      if (parsed.matches && Array.isArray(parsed.matches)) {
        console.log(`✅ Found ${parsed.matches.length} LLM matches`);

        for (const match of parsed.matches) {
          // Get product metadata
          const productMeta = await this.getProductMetadata(match.productId);
          if (productMeta) {
            matches.push({
              ...productMeta,
              confidence: match.confidence,
              reason: match.reason,
              retrievalScore: Math.max(...chunks.filter(c => c.productId == match.productId).map(c => c.similarity))
            });
          } else {
            console.warn(`⚠️ Product metadata not found for ID: ${match.productId}`);
          }
        }
      }

      // If no matches found or all LLM IDs were invalid, use fallback
      if (matches.length === 0) {
        console.log('🔄 LLM provided no valid matches, using fallback');
        return await this.createFallbackMatches(chunks);
      }

      return matches;
    } catch (error) {
      console.error('❌ Failed to parse LLM response:', error);
      console.error('Raw response:', llmResponse);

      // Fallback: use top retrieval matches if JSON parsing fails
      console.log('🔄 Using fallback: top retrieval matches');
      return await this.createFallbackMatches(chunks);
    }
  }

  /**
   * Create fallback matches from top retrieval results
   */
  async createFallbackMatches(chunks) {
    console.log('🔧 Fallback: Available chunk productIds:', chunks.map(c => c.productId).slice(0, 5));

    const topChunks = chunks.slice(0, 3); // Top 3 matches
    const matches = [];

    for (const chunk of topChunks) {
      console.log(`🔧 Fallback: Trying productId ${chunk.productId}`);
      const productMeta = await this.getProductMetadata(chunk.productId);
      if (productMeta) {
        console.log(`✅ Fallback: Found metadata for ${chunk.productId}: ${productMeta.title}`);
        matches.push({
          ...productMeta,
          confidence: chunk.similarity * 0.8, // Slightly lower confidence for fallback
          reason: `High semantic similarity (${chunk.similarity.toFixed(3)})`,
          retrievalScore: chunk.similarity
        });
      } else {
        console.warn(`⚠️ Fallback: No metadata found for chunk productId: ${chunk.productId}`);
      }
    }

    console.log(`🔧 Fallback: Returning ${matches.length} matches`);
    return matches;
  }

  /**
   * Cosine similarity calculation
   */
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < Math.min(vec1.length, vec2.length); i++) {
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
   * Store chunks in database
   */
  async storeChunks(chunks) {
    const transaction = this.db.transaction(['productChunks'], 'readwrite');
    const store = transaction.objectStore('productChunks');

    for (const chunk of chunks) {
      await store.add(chunk);
    }

    console.log(`💾 Stored ${chunks.length} chunks in RAG database`);
  }

  /**
   * Store product metadata
   */
  async storeMetadata(metadata) {
    const transaction = this.db.transaction(['productMeta'], 'readwrite');
    const store = transaction.objectStore('productMeta');

    for (const meta of metadata) {
      await store.add(meta);
    }

    console.log(`💾 Stored ${metadata.length} product metadata entries`);
  }

  /**
   * Get all chunks from database
   */
  async getAllChunks() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['productChunks'], 'readonly');
      const store = transaction.objectStore('productChunks');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get ALL product metadata
   */
  async getAllProductMetadata() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['productMeta'], 'readonly');
      const store = transaction.objectStore('productMeta');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get product metadata by ID
   */
  async getProductMetadata(productId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['productMeta'], 'readonly');
      const store = transaction.objectStore('productMeta');

      // Search by productId field, not the primary key
      const index = store.index('productId');
      const request = index.get(productId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all RAG data
   */
  async clearRAGDatabase() {
    const transaction = this.db.transaction(['productChunks', 'productMeta'], 'readwrite');
    await transaction.objectStore('productChunks').clear();
    await transaction.objectStore('productMeta').clear();
    console.log('🗑️ RAG database cleared');
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductRAGSystem;
}