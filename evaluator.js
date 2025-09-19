class ProductHighlighterEvaluator {
  constructor() {
    this.metrics = {
      totalHighlights: 0,
      correctHighlights: 0,
      missedProducts: 0,
      falsePositives: 0,
      userFeedback: [],
      performanceData: [],
      algorithmVersions: new Map()
    };

    this.currentAlgorithmVersion = 'v1.0';
    this.experimentGroups = ['control', 'optimized'];
    this.currentGroup = this.getExperimentGroup();

    this.initEvaluation();
  }

  async initEvaluation() {
    await this.loadMetrics();
    this.setupFeedbackCollection();
    this.startPerformanceMonitoring();
  }

  async loadMetrics() {
    try {
      const result = await chrome.storage.local.get(['evaluationMetrics']);
      if (result.evaluationMetrics) {
        this.metrics = { ...this.metrics, ...result.evaluationMetrics };
      }
    } catch (error) {
      console.log('Failed to load evaluation metrics:', error);
    }
  }

  async saveMetrics() {
    try {
      await chrome.storage.local.set({ evaluationMetrics: this.metrics });
    } catch (error) {
      console.log('Failed to save evaluation metrics:', error);
    }
  }

  getExperimentGroup() {
    const userId = this.getUserId();
    return userId % 2 === 0 ? 'control' : 'optimized';
  }

  getUserId() {
    let userId = localStorage.getItem('productHighlighterUserId');
    if (!userId) {
      userId = Math.floor(Math.random() * 1000000);
      localStorage.setItem('productHighlighterUserId', userId.toString());
    }
    return parseInt(userId);
  }

  setupFeedbackCollection() {
    document.addEventListener('click', (event) => {
      const highlightedElement = event.target.closest('.product-highlight');
      if (highlightedElement) {
        this.showFeedbackDialog(highlightedElement, event);
      }
    });
  }

  showFeedbackDialog(element, event) {
    event.preventDefault();
    event.stopPropagation();

    const existingDialog = document.querySelector('.feedback-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }

    const dialog = document.createElement('div');
    dialog.className = 'feedback-dialog';
    dialog.innerHTML = `
      <div class="feedback-content">
        <h4>Is this highlight correct?</h4>
        <div class="feedback-buttons">
          <button class="feedback-btn correct" data-feedback="correct">✅ Yes</button>
          <button class="feedback-btn incorrect" data-feedback="incorrect">❌ No</button>
          <button class="feedback-btn irrelevant" data-feedback="irrelevant">🚫 Not a product</button>
        </div>
        <button class="feedback-close">×</button>
      </div>
    `;

    const rect = element.getBoundingClientRect();
    dialog.style.cssText = `
      position: fixed;
      top: ${rect.top - 80}px;
      left: ${rect.left}px;
      z-index: 10000;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(dialog);

    dialog.addEventListener('click', (e) => {
      const feedback = e.target.dataset.feedback;
      if (feedback) {
        this.recordFeedback(element, feedback);
        dialog.remove();
      } else if (e.target.classList.contains('feedback-close')) {
        dialog.remove();
      }
    });

    setTimeout(() => {
      if (dialog.parentNode) {
        dialog.remove();
      }
    }, 10000);
  }

  async recordFeedback(element, feedback) {
    const productText = element.textContent.substring(0, 200);
    const matchScore = parseFloat(element.getAttribute('data-match-score') || '0');

    const feedbackData = {
      timestamp: Date.now(),
      feedback,
      productText,
      matchScore,
      algorithmVersion: this.currentAlgorithmVersion,
      experimentGroup: this.currentGroup,
      url: window.location.href,
      userPrompt: await this.getCurrentUserPrompt()
    };

    this.metrics.userFeedback.push(feedbackData);

    if (feedback === 'correct') {
      this.metrics.correctHighlights++;
    } else if (feedback === 'incorrect') {
      this.metrics.falsePositives++;
    }

    this.metrics.totalHighlights++;

    await this.saveMetrics();
    await this.analyzeAndOptimize();
  }

  async getCurrentUserPrompt() {
    try {
      const result = await chrome.storage.sync.get(['userPrompt']);
      return result.userPrompt || '';
    } catch (error) {
      return '';
    }
  }

  startPerformanceMonitoring() {
    const startTime = performance.now();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' &&
            mutation.attributeName === 'class' &&
            mutation.target.classList.contains('product-highlight')) {

          const endTime = performance.now();
          this.recordPerformanceMetric({
            timestamp: Date.now(),
            processingTime: endTime - startTime,
            elementsProcessed: document.querySelectorAll('.product-highlight').length,
            algorithmVersion: this.currentAlgorithmVersion
          });
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    });
  }

  recordPerformanceMetric(data) {
    this.metrics.performanceData.push(data);

    if (this.metrics.performanceData.length > 100) {
      this.metrics.performanceData = this.metrics.performanceData.slice(-50);
    }
  }

  async analyzeAndOptimize() {
    const recentFeedback = this.metrics.userFeedback.slice(-20);
    if (recentFeedback.length < 10) return;

    const accuracy = this.calculateAccuracy(recentFeedback);
    const insights = this.analyzePatterns(recentFeedback);

    if (accuracy < 0.7) {
      const optimizations = this.generateOptimizations(insights);
      await this.applyOptimizations(optimizations);
    }
  }

  calculateAccuracy(feedbackData) {
    const correct = feedbackData.filter(f => f.feedback === 'correct').length;
    const total = feedbackData.length;
    return total > 0 ? correct / total : 0;
  }

  analyzePatterns(feedbackData) {
    const insights = {
      thresholdAnalysis: this.analyzeThresholds(feedbackData),
      keywordEffectiveness: this.analyzeKeywords(feedbackData),
      siteSpecificPatterns: this.analyzeSitePatterns(feedbackData),
      commonMisclassifications: this.findMisclassifications(feedbackData)
    };

    return insights;
  }

  analyzeThresholds(feedbackData) {
    const correctScores = feedbackData
      .filter(f => f.feedback === 'correct')
      .map(f => f.matchScore);

    const incorrectScores = feedbackData
      .filter(f => f.feedback === 'incorrect')
      .map(f => f.matchScore);

    const avgCorrect = correctScores.reduce((a, b) => a + b, 0) / correctScores.length;
    const avgIncorrect = incorrectScores.reduce((a, b) => a + b, 0) / incorrectScores.length;

    return {
      optimalThreshold: (avgCorrect + avgIncorrect) / 2,
      currentAccuracy: correctScores.length / (correctScores.length + incorrectScores.length)
    };
  }

  analyzeKeywords(feedbackData) {
    const keywordPerformance = new Map();

    feedbackData.forEach(item => {
      const words = item.userPrompt.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 2) {
          if (!keywordPerformance.has(word)) {
            keywordPerformance.set(word, { correct: 0, total: 0 });
          }
          const stats = keywordPerformance.get(word);
          stats.total++;
          if (item.feedback === 'correct') {
            stats.correct++;
          }
        }
      });
    });

    return Array.from(keywordPerformance.entries())
      .map(([word, stats]) => ({
        word,
        accuracy: stats.correct / stats.total,
        usage: stats.total
      }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }

  analyzeSitePatterns(feedbackData) {
    const siteStats = new Map();

    feedbackData.forEach(item => {
      const domain = new URL(item.url).hostname;
      if (!siteStats.has(domain)) {
        siteStats.set(domain, { correct: 0, total: 0 });
      }
      const stats = siteStats.get(domain);
      stats.total++;
      if (item.feedback === 'correct') {
        stats.correct++;
      }
    });

    return Array.from(siteStats.entries())
      .map(([domain, stats]) => ({
        domain,
        accuracy: stats.correct / stats.total,
        volume: stats.total
      }));
  }

  findMisclassifications(feedbackData) {
    return feedbackData
      .filter(f => f.feedback === 'incorrect')
      .map(f => ({
        text: f.productText.substring(0, 100),
        score: f.matchScore,
        prompt: f.userPrompt
      }));
  }

  generateOptimizations(insights) {
    const optimizations = [];

    if (insights.thresholdAnalysis.optimalThreshold !== 0.6) {
      optimizations.push({
        type: 'threshold',
        value: insights.thresholdAnalysis.optimalThreshold,
        reason: 'Adjusting based on user feedback patterns'
      });
    }

    const highPerformingKeywords = insights.keywordEffectiveness
      .filter(k => k.accuracy > 0.8 && k.usage > 3)
      .map(k => k.word);

    if (highPerformingKeywords.length > 0) {
      optimizations.push({
        type: 'keywordWeights',
        value: highPerformingKeywords,
        reason: 'Boosting high-performing keywords'
      });
    }

    const lowPerformingSites = insights.siteSpecificPatterns
      .filter(s => s.accuracy < 0.5 && s.volume > 2)
      .map(s => s.domain);

    if (lowPerformingSites.length > 0) {
      optimizations.push({
        type: 'siteSpecificRules',
        value: lowPerformingSites,
        reason: 'Adding site-specific detection rules'
      });
    }

    return optimizations;
  }

  async applyOptimizations(optimizations) {
    for (const opt of optimizations) {
      await this.implementOptimization(opt);
    }

    this.currentAlgorithmVersion = `v${Date.now()}`;
    await this.saveMetrics();
  }

  async implementOptimization(optimization) {
    switch (optimization.type) {
      case 'threshold':
        await chrome.storage.sync.set({
          optimizedThreshold: optimization.value
        });
        break;

      case 'keywordWeights':
        await chrome.storage.sync.set({
          highPerformingKeywords: optimization.value
        });
        break;

      case 'siteSpecificRules':
        await chrome.storage.sync.set({
          problematicSites: optimization.value
        });
        break;
    }
  }

  generateEvalReport() {
    const accuracy = this.metrics.totalHighlights > 0 ?
      this.metrics.correctHighlights / this.metrics.totalHighlights : 0;

    const avgProcessingTime = this.metrics.performanceData.length > 0 ?
      this.metrics.performanceData.reduce((sum, d) => sum + d.processingTime, 0) / this.metrics.performanceData.length : 0;

    return {
      accuracy: (accuracy * 100).toFixed(1) + '%',
      totalFeedback: this.metrics.userFeedback.length,
      avgProcessingTime: avgProcessingTime.toFixed(2) + 'ms',
      currentVersion: this.currentAlgorithmVersion,
      experimentGroup: this.currentGroup
    };
  }
}

// Initialize evaluator
const evaluator = new ProductHighlighterEvaluator();

// Add message listener for analytics requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getAnalytics') {
    const analytics = evaluator.generateEvalReport();
    sendResponse({ analytics });
    return true;
  }
});