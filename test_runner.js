/**
 * Test Runner for Extension Evaluation
 * This script can be run by Claude to evaluate and optimize the extension
 */

class ExtensionTestRunner {
  constructor() {
    this.evaluator = new ExtensionEvaluator();
    this.testResults = [];
    this.optimizationHistory = [];
  }

  /**
   * Main evaluation entry point for Claude
   */
  async runEvaluation() {
    console.log('🚀 Starting Extension Evaluation System...');

    try {
      // Run comprehensive evaluation
      const evaluation = await this.evaluator.runAllTests();

      // Store results
      this.testResults.push(evaluation);

      // Generate optimization report
      const report = this.generateOptimizationReport(evaluation);

      // Return actionable insights for Claude
      return {
        evaluation,
        report,
        actionableInsights: this.generateActionableInsights(evaluation),
        codeOptimizations: this.generateCodeOptimizations(evaluation)
      };

    } catch (error) {
      console.error('❌ Evaluation failed:', error);
      return {
        error: error.message,
        suggestions: ['Check extension dependencies', 'Verify test environment']
      };
    }
  }

  /**
   * Generate specific code optimizations that Claude can implement
   */
  generateCodeOptimizations(evaluation) {
    const optimizations = [];

    // Check for performance issues
    const performanceIssues = evaluation.results.performance.filter(test => !test.passed);
    if (performanceIssues.length > 0) {
      optimizations.push({
        file: 'content.js',
        issue: 'Performance bottlenecks detected',
        priority: 'High',
        optimization: this.generatePerformanceOptimization(performanceIssues),
        expectedImprovement: '40-60% faster processing'
      });
    }

    // Check for algorithm accuracy issues
    const accuracyIssues = evaluation.results.functionality.filter(
      test => test.suite === 'algorithmAccuracy' && test.score < 0.8
    );
    if (accuracyIssues.length > 0) {
      optimizations.push({
        file: 'content.js',
        issue: 'Algorithm accuracy below target',
        priority: 'High',
        optimization: this.generateAccuracyOptimization(accuracyIssues),
        expectedImprovement: '15-25% better matching accuracy'
      });
    }

    // Check for code quality issues
    if (evaluation.results.codeQuality.overall < 0.7) {
      optimizations.push({
        file: 'content.js',
        issue: 'Code maintainability concerns',
        priority: 'Medium',
        optimization: this.generateMaintainabilityOptimization(evaluation.results.codeQuality),
        expectedImprovement: 'Better code organization and maintainability'
      });
    }

    return optimizations;
  }

  /**
   * Generate specific actionable insights for Claude
   */
  generateActionableInsights(evaluation) {
    const insights = [];

    // Overall score analysis
    const overallScore = parseFloat(evaluation.report.summary.overallScore);
    if (overallScore < 80) {
      insights.push({
        category: 'Critical',
        insight: `Overall system score is ${overallScore}% - below target of 80%`,
        action: 'Focus on highest priority optimizations first',
        files: ['content.js', 'evaluator.js']
      });
    }

    // Test failure analysis
    const failedTests = evaluation.results.functionality.filter(test => !test.passed);
    if (failedTests.length > 0) {
      insights.push({
        category: 'Functionality',
        insight: `${failedTests.length} tests failing`,
        action: 'Review and fix failing test cases',
        files: ['content.js'],
        specificTests: failedTests.map(test => test.test)
      });
    }

    // Performance analysis
    const slowTests = evaluation.results.performance.filter(test => test.score < 0.8);
    if (slowTests.length > 0) {
      insights.push({
        category: 'Performance',
        insight: 'Performance benchmarks not met',
        action: 'Implement caching and optimize DOM operations',
        files: ['content.js'],
        expectedImpact: 'Reduce processing time by 40-60%'
      });
    }

    return insights;
  }

  /**
   * Performance optimization code generation
   */
  generatePerformanceOptimization(issues) {
    return {
      description: 'Implement caching and batch processing for better performance',
      code: `
// Add to ProductHighlighter constructor
constructor() {
  // ... existing code ...
  this.analysisCache = new Map();
  this.processingQueue = [];
  this.isProcessing = false;
}

// Optimized detectProducts with caching
detectProducts() {
  if (!this.userPrompt || !this.isEnabled) return;

  const productSelectors = [
    '[data-testid*="product"]',
    '[class*="product"]',
    'article[data-asin]', // Amazon specific
    '.s-result-item', // Amazon
    '.s-item' // eBay
  ];

  const potentialProducts = [];

  productSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      const elementId = this.getElementId(element);

      // Check cache first
      if (this.analysisCache.has(elementId)) {
        const cached = this.analysisCache.get(elementId);
        if (cached.shouldHighlight) {
          this.highlightProduct(element, cached.score);
        }
        return;
      }

      if (!this.highlightedElements.has(element) && this.isVisibleProduct(element)) {
        potentialProducts.push(element);
      }
    });
  });

  // Process in batches to avoid blocking UI
  this.processBatch(potentialProducts);
}

// Batch processing implementation
processBatch(elements, batchSize = 5) {
  if (this.isProcessing) return;

  this.isProcessing = true;
  const batches = [];

  for (let i = 0; i < elements.length; i += batchSize) {
    batches.push(elements.slice(i, i + batchSize));
  }

  batches.forEach((batch, index) => {
    setTimeout(() => {
      batch.forEach(element => this.analyzeProductCached(element));

      if (index === batches.length - 1) {
        this.isProcessing = false;
      }
    }, index * 16); // ~60fps
  });
}

// Cached analysis method
async analyzeProductCached(element) {
  const elementId = this.getElementId(element);

  const productText = this.extractProductInfo(element);
  if (!productText) return;

  const score = await this.calculateMatchScore(productText, this.userPrompt);
  const shouldHighlight = score >= this.threshold;

  // Cache result
  this.analysisCache.set(elementId, { score, shouldHighlight });

  if (shouldHighlight) {
    this.highlightProduct(element, score);
    this.highlightedElements.add(element);
  }
}

// Element ID generation for caching
getElementId(element) {
  return element.dataset.productId ||
         element.getAttribute('data-asin') ||
         element.className + '-' + element.textContent.substring(0, 50).replace(/\\s+/g, '');
}`,
      tests: [
        'Performance should improve by 40-60%',
        'UI should remain responsive during processing',
        'Memory usage should not increase significantly'
      ]
    };
  }

  /**
   * Algorithm accuracy optimization
   */
  generateAccuracyOptimization(issues) {
    return {
      description: 'Enhance matching algorithm with better semantic understanding',
      code: `
// Enhanced calculateMatchScore with weighted scoring
async calculateMatchScore(productText, userPrompt) {
  try {
    const keywords = this.extractKeywords(userPrompt);
    const productLower = productText.toLowerCase();

    // Enhanced scoring components
    const scores = {
      exact: this.calculateExactMatches(productLower, keywords),
      partial: this.calculatePartialMatches(productLower, keywords),
      semantic: this.calculateSemanticSimilarity(productText, userPrompt),
      brand: this.calculateBrandMatch(productLower, userPrompt),
      category: this.calculateCategoryMatch(productLower, userPrompt),
      price: this.calculatePriceRelevance(productText, userPrompt)
    };

    // Adaptive weighting based on query type
    const weights = this.getAdaptiveWeights(userPrompt);

    return this.combineScoresAdaptive(scores, weights);
  } catch (error) {
    console.error('Error calculating match score:', error);
    return 0;
  }
}

// Enhanced keyword extraction
extractKeywords(prompt) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  return prompt.toLowerCase()
    .split(/[\\s,]+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.replace(/[^a-z0-9]/g, ''));
}

// Brand recognition
calculateBrandMatch(productText, userPrompt) {
  const brands = ['apple', 'samsung', 'sony', 'nike', 'adidas', 'microsoft', 'google'];
  const promptBrands = brands.filter(brand => userPrompt.toLowerCase().includes(brand));
  const productBrands = brands.filter(brand => productText.includes(brand));

  const commonBrands = promptBrands.filter(brand => productBrands.includes(brand));
  return promptBrands.length > 0 ? commonBrands.length / promptBrands.length : 0;
}

// Category matching
calculateCategoryMatch(productText, userPrompt) {
  const categories = {
    electronics: ['phone', 'laptop', 'tablet', 'computer', 'headphones', 'speaker'],
    clothing: ['shirt', 'pants', 'shoes', 'dress', 'jacket', 'hat'],
    home: ['furniture', 'lamp', 'table', 'chair', 'bed', 'sofa']
  };

  let maxCategoryScore = 0;

  Object.values(categories).forEach(categoryWords => {
    const promptMatches = categoryWords.filter(word => userPrompt.toLowerCase().includes(word)).length;
    const productMatches = categoryWords.filter(word => productText.includes(word)).length;

    if (promptMatches > 0) {
      const score = productMatches / categoryWords.length;
      maxCategoryScore = Math.max(maxCategoryScore, score);
    }
  });

  return maxCategoryScore;
}

// Adaptive weights based on query characteristics
getAdaptiveWeights(userPrompt) {
  const hasPrice = /\\$|price|cost|cheap|expensive/i.test(userPrompt);
  const hasBrand = /apple|samsung|sony|nike/i.test(userPrompt);
  const hasCategory = /phone|laptop|shirt|shoes/i.test(userPrompt);

  return {
    exact: 0.25,
    partial: 0.20,
    semantic: hasCategory ? 0.15 : 0.25,
    brand: hasBrand ? 0.20 : 0.05,
    category: hasCategory ? 0.15 : 0.05,
    price: hasPrice ? 0.10 : 0.05
  };
}`,
      tests: [
        'Accuracy should improve by 15-25%',
        'Brand matching should be more accurate',
        'Category-based searches should work better'
      ]
    };
  }

  /**
   * Generate test report for Claude to review
   */
  generateOptimizationReport(evaluation) {
    const report = {
      timestamp: new Date().toISOString(),
      overallScore: evaluation.report.summary.overallScore,
      criticalIssues: [],
      optimizationOpportunities: [],
      implementationPriority: []
    };

    // Identify critical issues
    if (parseFloat(evaluation.report.summary.overallScore) < 70) {
      report.criticalIssues.push('Overall performance below acceptable threshold');
    }

    const failedTests = evaluation.results.functionality.filter(test => !test.passed);
    if (failedTests.length > 2) {
      report.criticalIssues.push(`Multiple test failures: ${failedTests.map(t => t.test).join(', ')}`);
    }

    // Optimization opportunities
    evaluation.optimizations.forEach(opt => {
      report.optimizationOpportunities.push({
        area: opt.category,
        impact: opt.priority,
        description: opt.suggestion
      });
    });

    // Implementation priority
    report.implementationPriority = [
      'Fix critical functionality issues',
      'Optimize performance bottlenecks',
      'Improve algorithm accuracy',
      'Enhance code maintainability'
    ].filter((_, index) => {
      const priorities = ['High', 'High', 'Medium', 'Low'];
      return evaluation.optimizations.some(opt => opt.priority === priorities[index]);
    });

    return report;
  }

  /**
   * Quick health check that Claude can run
   */
  async quickHealthCheck() {
    const issues = [];

    try {
      // Test basic functionality
      const highlighter = new ProductHighlighter();
      if (typeof highlighter.calculateMatchScore !== 'function') {
        issues.push('calculateMatchScore method missing or corrupted');
      }

      // Test performance
      const start = performance.now();
      await highlighter.calculateMatchScore('test product', 'test query');
      const duration = performance.now() - start;

      if (duration > 50) {
        issues.push(`Algorithm performance slow: ${duration.toFixed(2)}ms`);
      }

      return {
        healthy: issues.length === 0,
        issues,
        recommendations: issues.length > 0 ? ['Run full evaluation', 'Check for optimization opportunities'] : ['System functioning normally']
      };

    } catch (error) {
      return {
        healthy: false,
        issues: [`Critical error: ${error.message}`],
        recommendations: ['Check for syntax errors', 'Verify dependencies']
      };
    }
  }
}

// Make available for Claude to use
const testRunner = new ExtensionTestRunner();

// Quick test function for Claude
async function runQuickEvaluation() {
  console.log('🔍 Running quick evaluation...');
  const result = await testRunner.runEvaluation();
  console.log('📊 Evaluation complete:', result);
  return result;
}

// Health check function for Claude
async function checkExtensionHealth() {
  console.log('🏥 Running health check...');
  const result = await testRunner.quickHealthCheck();
  console.log('💊 Health check complete:', result);
  return result;
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExtensionTestRunner, runQuickEvaluation, checkExtensionHealth };
}