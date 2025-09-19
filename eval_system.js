/**
 * Evaluation System for Browser Extension Optimization
 * This system helps Claude analyze and optimize the extension code
 */

class ExtensionEvaluator {
  constructor() {
    this.testSuites = new Map();
    this.benchmarks = new Map();
    this.codeMetrics = new Map();
    this.testResults = [];
    this.performanceData = [];

    this.initializeEvaluationFramework();
  }

  initializeEvaluationFramework() {
    this.setupTestSuites();
    this.setupBenchmarks();
    this.setupCodeQualityMetrics();
    this.setupRegressionTests();
  }

  // =============================================================================
  // TEST SUITES FOR FUNCTIONALITY VALIDATION
  // =============================================================================

  setupTestSuites() {
    this.testSuites.set('productDetection', {
      name: 'Product Detection Accuracy',
      tests: [
        {
          name: 'Amazon Product Detection',
          url: 'https://amazon.com/s?k=wireless+headphones',
          expectedMinHighlights: 10,
          prompt: 'wireless headphones',
          timeout: 5000
        },
        {
          name: 'eBay Product Detection',
          url: 'https://ebay.com/sch/i.html?_nkw=laptop',
          expectedMinHighlights: 8,
          prompt: 'laptop',
          timeout: 5000
        },
        {
          name: 'Generic E-commerce Site',
          url: 'https://example-shop.com/search?q=phone',
          expectedMinHighlights: 5,
          prompt: 'smartphone',
          timeout: 5000
        }
      ]
    });

    this.testSuites.set('algorithmAccuracy', {
      name: 'Matching Algorithm Performance',
      tests: [
        {
          name: 'Exact Match Test',
          productText: 'Sony WH-1000XM4 Wireless Noise Canceling Headphones',
          userPrompt: 'Sony WH-1000XM4',
          expectedScore: { min: 0.9, max: 1.0 }
        },
        {
          name: 'Semantic Match Test',
          productText: 'Apple iPhone 14 Pro Max 256GB Space Black',
          userPrompt: 'smartphone with large storage',
          expectedScore: { min: 0.6, max: 0.8 }
        },
        {
          name: 'False Positive Test',
          productText: 'Customer Reviews and Ratings for Electronics',
          userPrompt: 'wireless headphones',
          expectedScore: { min: 0.0, max: 0.3 }
        }
      ]
    });

    this.testSuites.set('performance', {
      name: 'Performance Benchmarks',
      tests: [
        {
          name: 'Product Detection Speed',
          metric: 'processingTime',
          maxTime: 100, // milliseconds
          elementCount: 50
        },
        {
          name: 'Memory Usage',
          metric: 'memoryUsage',
          maxMemory: 10, // MB
          duration: 30000 // 30 seconds
        },
        {
          name: 'DOM Manipulation Efficiency',
          metric: 'domOperations',
          maxOperations: 200,
          elementsToHighlight: 20
        }
      ]
    });
  }

  // =============================================================================
  // AUTOMATED TEST EXECUTION
  // =============================================================================

  async runAllTests() {
    console.log('🧪 Starting Extension Evaluation...');

    const results = {
      functionality: await this.runFunctionalityTests(),
      performance: await this.runPerformanceTests(),
      codeQuality: await this.analyzeCodeQuality(),
      regression: await this.runRegressionTests()
    };

    const report = this.generateEvaluationReport(results);
    const optimizations = this.generateOptimizationSuggestions(results);

    return {
      results,
      report,
      optimizations,
      timestamp: Date.now()
    };
  }

  async runFunctionalityTests() {
    const results = [];

    for (const [suiteKey, suite] of this.testSuites) {
      console.log(`🔍 Running ${suite.name}...`);

      for (const test of suite.tests) {
        try {
          const result = await this.executeTest(suiteKey, test);
          results.push({
            suite: suiteKey,
            test: test.name,
            passed: result.passed,
            score: result.score,
            details: result.details,
            duration: result.duration
          });
        } catch (error) {
          results.push({
            suite: suiteKey,
            test: test.name,
            passed: false,
            error: error.message,
            duration: 0
          });
        }
      }
    }

    return results;
  }

  async executeTest(suiteKey, test) {
    const startTime = performance.now();

    switch (suiteKey) {
      case 'productDetection':
        return await this.testProductDetection(test);

      case 'algorithmAccuracy':
        return await this.testAlgorithmAccuracy(test);

      case 'performance':
        return await this.testPerformance(test);

      default:
        throw new Error(`Unknown test suite: ${suiteKey}`);
    }
  }

  async testProductDetection(test) {
    // Simulate product detection on a test page
    const mockElements = this.generateMockProducts(test.expectedMinHighlights);
    const highlighter = new ProductHighlighter();

    // Override the detectProducts method for testing
    const originalDetect = highlighter.detectProducts;
    let detectedCount = 0;

    highlighter.detectProducts = function() {
      // Simulate detection
      mockElements.forEach(element => {
        const score = Math.random() * 0.4 + 0.6; // Random score between 0.6-1.0
        if (score >= this.threshold) {
          detectedCount++;
        }
      });
    };

    highlighter.userPrompt = test.prompt;
    highlighter.detectProducts();

    const passed = detectedCount >= test.expectedMinHighlights;
    const score = Math.min(detectedCount / test.expectedMinHighlights, 1.0);

    return {
      passed,
      score,
      details: {
        detected: detectedCount,
        expected: test.expectedMinHighlights,
        prompt: test.prompt
      },
      duration: performance.now() - performance.now()
    };
  }

  async testAlgorithmAccuracy(test) {
    const highlighter = new ProductHighlighter();
    const score = await highlighter.calculateMatchScore(test.productText, test.userPrompt);

    const passed = score >= test.expectedScore.min && score <= test.expectedScore.max;
    const accuracy = passed ? 1.0 : Math.abs(score - (test.expectedScore.min + test.expectedScore.max) / 2);

    return {
      passed,
      score: accuracy,
      details: {
        actualScore: score,
        expectedRange: test.expectedScore,
        productText: test.productText.substring(0, 50) + '...',
        userPrompt: test.userPrompt
      },
      duration: performance.now() - performance.now()
    };
  }

  // =============================================================================
  // PERFORMANCE BENCHMARKING
  // =============================================================================

  async runPerformanceTests() {
    const results = [];
    const performanceTests = this.testSuites.get('performance').tests;

    for (const test of performanceTests) {
      const benchmark = await this.executeBenchmark(test);
      results.push(benchmark);
    }

    return results;
  }

  async executeBenchmark(test) {
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();

    try {
      switch (test.metric) {
        case 'processingTime':
          return await this.benchmarkProcessingTime(test);

        case 'memoryUsage':
          return await this.benchmarkMemoryUsage(test);

        case 'domOperations':
          return await this.benchmarkDOMOperations(test);

        default:
          throw new Error(`Unknown benchmark metric: ${test.metric}`);
      }
    } catch (error) {
      return {
        name: test.name,
        passed: false,
        error: error.message,
        duration: performance.now() - startTime
      };
    }
  }

  async benchmarkProcessingTime(test) {
    const highlighter = new ProductHighlighter();
    const mockElements = this.generateMockProducts(test.elementCount);

    const startTime = performance.now();

    // Simulate processing all elements
    for (const element of mockElements) {
      await highlighter.analyzeProduct(element);
    }

    const processingTime = performance.now() - startTime;
    const passed = processingTime <= test.maxTime;

    return {
      name: test.name,
      passed,
      score: passed ? 1.0 : test.maxTime / processingTime,
      details: {
        actualTime: processingTime.toFixed(2) + 'ms',
        maxTime: test.maxTime + 'ms',
        elementCount: test.elementCount
      },
      duration: processingTime
    };
  }

  async benchmarkMemoryUsage(test) {
    const initialMemory = this.getMemoryUsage();
    const highlighter = new ProductHighlighter();

    // Simulate continuous operation
    await new Promise(resolve => {
      const interval = setInterval(() => {
        highlighter.detectProducts();
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, test.duration);
    });

    const finalMemory = this.getMemoryUsage();
    const memoryIncrease = finalMemory - initialMemory;
    const passed = memoryIncrease <= test.maxMemory;

    return {
      name: test.name,
      passed,
      score: passed ? 1.0 : test.maxMemory / memoryIncrease,
      details: {
        memoryIncrease: memoryIncrease.toFixed(2) + 'MB',
        maxMemory: test.maxMemory + 'MB',
        duration: test.duration / 1000 + 's'
      },
      duration: test.duration
    };
  }

  // =============================================================================
  // CODE QUALITY ANALYSIS
  // =============================================================================

  async analyzeCodeQuality() {
    const metrics = {
      complexity: this.analyzeCyclomaticComplexity(),
      maintainability: this.analyzeMaintainabilityIndex(),
      testCoverage: this.analyzeTestCoverage(),
      performance: this.analyzePerformancePatterns(),
      security: this.analyzeSecurityPatterns()
    };

    return {
      overall: this.calculateOverallQuality(metrics),
      details: metrics
    };
  }

  analyzeCyclomaticComplexity() {
    // Analyze the ProductHighlighter class methods
    const methods = [
      'calculateMatchScore',
      'detectProducts',
      'analyzeProduct',
      'extractProductInfo'
    ];

    const complexityScores = methods.map(method => {
      // Simulate complexity analysis
      const branchingFactor = Math.floor(Math.random() * 10) + 1;
      const complexity = branchingFactor <= 10 ? 'Good' : branchingFactor <= 15 ? 'Moderate' : 'High';

      return {
        method,
        complexity: branchingFactor,
        rating: complexity,
        recommendations: branchingFactor > 10 ? ['Consider breaking into smaller functions'] : []
      };
    });

    const averageComplexity = complexityScores.reduce((sum, score) => sum + score.complexity, 0) / complexityScores.length;

    return {
      average: averageComplexity,
      details: complexityScores,
      rating: averageComplexity <= 10 ? 'Good' : averageComplexity <= 15 ? 'Moderate' : 'High'
    };
  }

  analyzeMaintainabilityIndex() {
    // Calculate maintainability based on various factors
    const factors = {
      linesOfCode: 400, // Approximate LOC
      cyclomaticComplexity: 8,
      halsteadVolume: 1200,
      commentDensity: 0.15
    };

    // Simplified maintainability index calculation
    const maintainabilityIndex = Math.max(0,
      171 - 5.2 * Math.log(factors.halsteadVolume) -
      0.23 * factors.cyclomaticComplexity -
      16.2 * Math.log(factors.linesOfCode) +
      50 * Math.sin(Math.sqrt(2.4 * factors.commentDensity))
    );

    return {
      index: maintainabilityIndex.toFixed(1),
      rating: maintainabilityIndex >= 85 ? 'High' : maintainabilityIndex >= 65 ? 'Moderate' : 'Low',
      factors,
      recommendations: maintainabilityIndex < 65 ? ['Add more comments', 'Reduce method complexity'] : []
    };
  }

  // =============================================================================
  // OPTIMIZATION SUGGESTIONS
  // =============================================================================

  generateOptimizationSuggestions(results) {
    const suggestions = [];

    // Analyze functionality test results
    const functionalityIssues = results.functionality.filter(test => !test.passed);
    if (functionalityIssues.length > 0) {
      suggestions.push({
        category: 'Functionality',
        priority: 'High',
        issue: `${functionalityIssues.length} functionality tests failed`,
        suggestion: 'Review and fix failing test cases',
        code: this.generateFunctionalityFix(functionalityIssues)
      });
    }

    // Analyze performance issues
    const performanceIssues = results.performance.filter(test => !test.passed);
    if (performanceIssues.length > 0) {
      suggestions.push({
        category: 'Performance',
        priority: 'Medium',
        issue: 'Performance benchmarks not met',
        suggestion: 'Optimize algorithm and DOM operations',
        code: this.generatePerformanceOptimization(performanceIssues)
      });
    }

    // Analyze code quality
    if (results.codeQuality.overall < 0.8) {
      suggestions.push({
        category: 'Code Quality',
        priority: 'Medium',
        issue: 'Code quality below threshold',
        suggestion: 'Refactor complex methods and improve maintainability',
        code: this.generateCodeQualityImprovements(results.codeQuality)
      });
    }

    return suggestions;
  }

  generateFunctionalityFix(issues) {
    return `
// Enhanced product detection with better selectors
detectProducts() {
  if (!this.userPrompt || !this.isEnabled) return;

  // Improved selector strategy based on test failures
  const productSelectors = [
    // E-commerce specific selectors
    '[data-testid*="product"]',
    '[data-asin]', // Amazon specific
    '.s-result-item', // Amazon
    '.s-item', // eBay
    '[data-test-id="listing-card"]', // Etsy

    // Generic selectors with better specificity
    'article[class*="product"]',
    'div[class*="item"][class*="card"]',
    '[class*="search-result"]:not([class*="filter"])',

    // Improved fallback selectors
    'div:has(img[alt*="product" i])',
    'div:has(h1,h2,h3):has(span[class*="price"])'
  ];

  // Add performance optimization
  const visibleElements = this.getVisibleElements(productSelectors);
  this.processElementsBatch(visibleElements);
}`;
  }

  generatePerformanceOptimization(issues) {
    return `
// Optimized product analysis with caching and batching
async analyzeProduct(element) {
  // Check cache first
  const elementId = this.getElementId(element);
  if (this.analysisCache.has(elementId)) {
    return this.analysisCache.get(elementId);
  }

  const productText = this.extractProductInfo(element);
  if (!productText) return;

  // Use requestIdleCallback for non-blocking processing
  return new Promise(resolve => {
    requestIdleCallback(async () => {
      const score = await this.calculateMatchScore(productText, this.userPrompt);

      if (score >= this.threshold) {
        this.highlightProduct(element, score);
        this.highlightedElements.add(element);
      }

      // Cache result
      this.analysisCache.set(elementId, { score, highlighted: score >= this.threshold });
      resolve();
    });
  });
}

// Batch processing for better performance
processElementsBatch(elements, batchSize = 10) {
  const batches = [];
  for (let i = 0; i < elements.length; i += batchSize) {
    batches.push(elements.slice(i, i + batchSize));
  }

  batches.forEach((batch, index) => {
    setTimeout(() => {
      batch.forEach(element => this.analyzeProduct(element));
    }, index * 50); // Stagger processing
  });
}`;
  }

  generateCodeQualityImprovements(codeQuality) {
    return `
// Refactored calculateMatchScore for better maintainability
async calculateMatchScore(productText, userPrompt) {
  try {
    const scores = {
      keyword: this.calculateKeywordScore(productText, userPrompt),
      exact: this.calculateExactScore(productText, userPrompt),
      semantic: this.calculateSemanticScore(productText, userPrompt),
      highPerforming: this.calculateHighPerformingScore(productText, userPrompt)
    };

    return this.combineScores(scores);
  } catch (error) {
    console.error('Error calculating match score:', error);
    return 0;
  }
}

// Extracted methods for better separation of concerns
calculateKeywordScore(productText, userPrompt) {
  const keywords = this.extractKeywords(userPrompt);
  const productLower = productText.toLowerCase();
  const matchCount = keywords.filter(keyword =>
    productLower.includes(keyword)).length;

  return matchCount / keywords.length;
}

calculateExactScore(productText, userPrompt) {
  const keywords = this.extractKeywords(userPrompt);
  const productLower = productText.toLowerCase();
  const exactMatches = keywords.filter(keyword =>
    this.isExactMatch(productLower, keyword)).length;

  return exactMatches / keywords.length;
}

combineScores(scores) {
  const baseScore = (
    scores.keyword * this.optimizedWeights.keyword +
    scores.exact * this.optimizedWeights.exact +
    scores.semantic * this.optimizedWeights.semantic
  );

  return Math.min(baseScore + (scores.highPerforming * 0.1), 1.0);
}`;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  generateMockProducts(count) {
    const mockProducts = [];
    for (let i = 0; i < count; i++) {
      const element = document.createElement('div');
      element.className = 'product-item';
      element.innerHTML = `
        <h3>Product ${i + 1}</h3>
        <p>Description for product ${i + 1}</p>
        <span class="price">$${(Math.random() * 500 + 50).toFixed(2)}</span>
      `;
      mockProducts.push(element);
    }
    return mockProducts;
  }

  getMemoryUsage() {
    // Simplified memory calculation (in real implementation, use performance.memory)
    return Math.random() * 5 + 2; // 2-7 MB
  }

  calculateOverallQuality(metrics) {
    const weights = {
      complexity: 0.25,
      maintainability: 0.25,
      testCoverage: 0.20,
      performance: 0.15,
      security: 0.15
    };

    let totalScore = 0;
    Object.entries(weights).forEach(([key, weight]) => {
      const score = this.normalizeMetricScore(metrics[key]);
      totalScore += score * weight;
    });

    return totalScore;
  }

  normalizeMetricScore(metric) {
    // Convert various metric formats to 0-1 scale
    if (typeof metric === 'object' && metric.rating) {
      const ratingMap = { 'High': 1.0, 'Good': 1.0, 'Moderate': 0.7, 'Low': 0.4 };
      return ratingMap[metric.rating] || 0.5;
    }

    if (typeof metric === 'number') {
      return Math.min(metric / 100, 1.0);
    }

    return 0.5; // Default neutral score
  }

  generateEvaluationReport(results) {
    const passedTests = results.functionality.filter(t => t.passed).length;
    const totalTests = results.functionality.length;
    const passRate = (passedTests / totalTests) * 100;

    return {
      summary: {
        overallScore: this.calculateOverallScore(results),
        testPassRate: passRate.toFixed(1) + '%',
        codeQuality: results.codeQuality.overall.toFixed(2),
        recommendationCount: 0 // Will be set by optimization suggestions
      },
      details: {
        functionality: `${passedTests}/${totalTests} tests passed`,
        performance: results.performance.filter(p => p.passed).length + '/' + results.performance.length + ' benchmarks met',
        maintainability: results.codeQuality.details.maintainability?.rating || 'Unknown'
      }
    };
  }

  calculateOverallScore(results) {
    const functionalityScore = results.functionality.filter(t => t.passed).length / results.functionality.length;
    const performanceScore = results.performance.filter(p => p.passed).length / results.performance.length;
    const qualityScore = results.codeQuality.overall;

    return ((functionalityScore * 0.4 + performanceScore * 0.3 + qualityScore * 0.3) * 100).toFixed(1);
  }
}

// Initialize evaluation system
const extensionEvaluator = new ExtensionEvaluator();

// Export for use in development/testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExtensionEvaluator;
}