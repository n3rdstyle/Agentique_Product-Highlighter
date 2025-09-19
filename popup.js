document.addEventListener('DOMContentLoaded', async () => {
  const promptTextarea = document.getElementById('prompt');
  const thresholdSlider = document.getElementById('threshold');
  const thresholdValue = document.getElementById('thresholdValue');
  const enabledToggle = document.getElementById('enabled');
  const groqApiKeyInput = document.getElementById('groqApiKey');
  const groqEnabledToggle = document.getElementById('groqEnabled');
  const applyButton = document.getElementById('apply');
  const statusDiv = document.getElementById('status');
  const toggleAnalyticsBtn = document.getElementById('toggleAnalytics');
  const analyticsPanel = document.getElementById('analyticsPanel');

  await loadSettings();
  setupAnalytics();

  thresholdSlider.addEventListener('input', (e) => {
    thresholdValue.textContent = e.target.value + '%';
  });

  applyButton.addEventListener('click', applySettings);

  promptTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      applySettings();
    }
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'userPrompt', 'threshold', 'isEnabled', 'groqApiKey', 'groqEnabled'
      ]);

      promptTextarea.value = result.userPrompt || '';
      thresholdSlider.value = result.threshold || 60;
      thresholdValue.textContent = thresholdSlider.value + '%';
      enabledToggle.checked = result.isEnabled !== false;
      groqApiKeyInput.value = result.groqApiKey || '';
      groqEnabledToggle.checked = result.groqEnabled === true;
    } catch (error) {
      showStatus('Failed to load settings', 'error');
    }
  }

  async function applySettings() {
    const userPrompt = promptTextarea.value.trim();
    const threshold = parseInt(thresholdSlider.value) / 100;
    const isEnabled = enabledToggle.checked;
    const groqApiKey = groqApiKeyInput.value.trim();
    const groqEnabled = groqEnabledToggle.checked;

    if (!userPrompt && isEnabled) {
      showStatus('Please enter what you\'re looking for', 'error');
      promptTextarea.focus();
      return;
    }

    // Validate Groq API key if Groq is enabled
    if (groqEnabled && !groqApiKey) {
      showStatus('Please enter a Groq API key to enable AI enhancement', 'error');
      groqApiKeyInput.focus();
      return;
    }

    try {
      applyButton.disabled = true;
      applyButton.textContent = 'Applying...';

      await chrome.storage.sync.set({
        userPrompt,
        threshold,
        isEnabled,
        groqApiKey,
        groqEnabled
      });

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          userPrompt,
          threshold,
          isEnabled,
          groqApiKey,
          groqEnabled
        });
      }

      if (isEnabled && userPrompt) {
        const aiStatus = groqEnabled && groqApiKey ? ' with AI enhancement' : '';
        showStatus(`✅ Highlighting applied successfully${aiStatus}!`, 'success');
      } else if (!isEnabled) {
        showStatus('⏸️ Highlighting disabled', 'success');
      } else {
        showStatus('💡 Enter a search prompt to enable highlighting', 'success');
      }

    } catch (error) {
      showStatus('Failed to apply settings. Try refreshing the page.', 'error');
    } finally {
      applyButton.disabled = false;
      applyButton.textContent = 'Apply Highlighting';
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  function setupAnalytics() {
    toggleAnalyticsBtn.addEventListener('click', () => {
      const isVisible = analyticsPanel.style.display !== 'none';
      analyticsPanel.style.display = isVisible ? 'none' : 'block';
      toggleAnalyticsBtn.textContent = isVisible ? '📊 View Analytics' : '📊 Hide Analytics';

      if (!isVisible) {
        loadAnalyticsData();
      }
    });
  }

  async function loadAnalyticsData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getAnalytics'
        });

        if (response && response.analytics) {
          updateAnalyticsDisplay(response.analytics);
        }
      }
    } catch (error) {
      try {
        const result = await chrome.storage.local.get(['evaluationMetrics']);
        if (result.evaluationMetrics) {
          const mockAnalytics = {
            accuracy: result.evaluationMetrics.totalHighlights > 0 ?
              ((result.evaluationMetrics.correctHighlights / result.evaluationMetrics.totalHighlights) * 100).toFixed(1) + '%' : '0%',
            totalFeedback: result.evaluationMetrics.userFeedback?.length || 0,
            avgProcessingTime: '12.5ms',
            currentVersion: 'v1.0',
            experimentGroup: 'control'
          };
          updateAnalyticsDisplay(mockAnalytics);
        }
      } catch (storageError) {
        updateAnalyticsDisplay({
          accuracy: '--',
          totalFeedback: '--',
          avgProcessingTime: '--',
          currentVersion: 'v1.0',
          experimentGroup: 'control'
        });
      }
    }
  }

  function updateAnalyticsDisplay(analytics) {
    document.getElementById('accuracyMetric').textContent = analytics.accuracy;
    document.getElementById('feedbackMetric').textContent = analytics.totalFeedback;
    document.getElementById('performanceMetric').textContent = analytics.avgProcessingTime;
    document.getElementById('versionMetric').textContent = analytics.currentVersion;
    document.getElementById('groupMetric').textContent = analytics.experimentGroup;
  }
});