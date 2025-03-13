// pavement-analysis.js - Analysis and Visualization Components for Pavement QA/QC System
document.addEventListener('DOMContentLoaded', function() {
// Constants for confidence and review types with correct color mapping
const CONFIDENCE_COLORS = {
    'high': '#ef4444',    // Red for high confidence (critical issues)
    'medium': '#f59e0b',  // Orange/amber for medium confidence
    'low': '#10b981'      // Green for low confidence (less critical issues)
};

// Initialize anomaly filters
const anomalyFilters = {
    confidence: [],
    type: [],
    section: [],
    manualRange: []
};
    
    const REVIEW_TYPE_COLORS = {
        'desktop': '#3b82f6', // Blue for desktop reviews
        'field': '#8b5cf6'    // Purple for field reviews
    };

    // ===== Display Analysis Results =====
    window.displayAnalysisResults = function(result) {
        // Update summary statistics
        if (document.getElementById('totalSections')) {
            document.getElementById('totalSections').textContent = result.summary.total_sections;
        }
        if (document.getElementById('anomaliesCount')) {
            document.getElementById('anomaliesCount').textContent = result.summary.anomalies_count;
        }
        if (document.getElementById('reviewPercentage')) {
            document.getElementById('reviewPercentage').textContent = result.summary.review_percentage + '%';
        }
        
        // Display manual ranges if present
        if (result.manual_ranges && result.manual_ranges.length > 0) {
            const manualRangesSection = document.createElement('div');
            manualRangesSection.className = 'results-section manual-ranges';
            manualRangesSection.innerHTML = `
                <h3>Manual PCI Ranges</h3>
                <div class="ranges-list">
                    ${result.manual_ranges.map(range => `
                        <div class="range-item">
                            <span class="range">${range.start}-${range.end}</span>
                            <span class="anomalies-count">${range.anomalies_count} anomalies</span>
                        </div>
                    `).join('')}
                </div>
            `;
            document.getElementById('analysisResults').prepend(manualRangesSection);
        }
        
        // Display visualizations
        const visualizations = result.visualizations;
        
        if (window.pavementApp) {
            window.pavementApp.updateChartIfAvailable('pciDistributionChart', visualizations.pci_distribution);
            window.pavementApp.updateChartIfAvailable('pciCategoryChart', visualizations.pci_by_category);
            window.pavementApp.updateChartIfAvailable('pciComparisonChart', visualizations.pci_comparison);
            window.pavementApp.updateChartIfAvailable('anomalyMapChart', visualizations.anomaly_map);
        }
        
        // Display anomalies
        const anomalyList = document.getElementById('anomalyList');
        if (!anomalyList) return;
        
        anomalyList.innerHTML = '';
        
        result.anomalies.forEach(anomaly => {
            const item = document.createElement('li');
            item.className = `anomaly-item ${anomaly.confidence}`;
            item.dataset.confidence = anomaly.confidence;
            item.dataset.reviewType = anomaly.review_type;
            
            // Extract PCI value if present in the reason text
            const pciMatch = anomaly.reason.match(/PCI.*?(\d+\.?\d*)/i);
            if (pciMatch) {
                item.dataset.pciValue = parseFloat(pciMatch[1]);
            }
            
            // Apply correct color styles based on confidence
            item.style.borderLeftColor = CONFIDENCE_COLORS[anomaly.confidence];
            
            const header = document.createElement('div');
            header.className = 'anomaly-header';
            
            const sectionId = document.createElement('div');
            sectionId.className = 'anomaly-section';
            sectionId.textContent = anomaly.section_id;
            
            const reviewType = document.createElement('div');
            reviewType.className = 'anomaly-type';
            reviewType.innerHTML = `<i class="fas ${anomaly.review_type === 'field' ? 'fa-car' : 'fa-desktop'}"></i> ${anomaly.review_type.charAt(0).toUpperCase() + anomaly.review_type.slice(1)} Review`;
            
            header.appendChild(sectionId);
            header.appendChild(reviewType);
            
            const reason = document.createElement('div');
            reason.className = 'anomaly-reason';
            reason.textContent = anomaly.reason;
            
            // Add manual range indicator if applicable
            if (pciMatch) {
                const rangeIndicator = document.createElement('span');
                rangeIndicator.className = 'pci-range-indicator';
                rangeIndicator.textContent = `PCI: ${pciMatch[1]}`;
                item.appendChild(rangeIndicator);
            }

            const confidence = document.createElement('span');
            confidence.className = `anomaly-confidence ${anomaly.confidence}`;
            confidence.style.backgroundColor = CONFIDENCE_COLORS[anomaly.confidence];
            confidence.textContent = anomaly.confidence.charAt(0).toUpperCase() + anomaly.confidence.slice(1) + ' Confidence';
            
            // Adjust text color for medium confidence to be dark
            if (anomaly.confidence === 'medium') {
                confidence.style.color = '#7c2d12'; // Dark brown for better contrast on yellow
            }
            
            item.appendChild(header);
            item.appendChild(reason);
            item.appendChild(confidence);
            
            anomalyList.appendChild(item);
        });
        
        // Initialize the improved filter UI
        setupFilterUI();
        
        // Setup chart modal for larger views
        setupChartModal();
    };
    
    // ===== Improved Filter UI =====
    function setupFilterUI() {
        // Update confidence filter colors
        updateFilterColors();
        
        // Toggle filter sections
        document.querySelectorAll('.filter-section-header').forEach(header => {
            if (!header) return;
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                if (!content) return;
                header.classList.toggle('collapsed');
                content.classList.toggle('collapsed');
            });
        });

        // Update active filters
        updateActiveFilters();
        
        // Setup filter events
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            if (!checkbox) return;
            checkbox.addEventListener('change', () => {
                updateActiveFilters();
                filterAnomalies();
            });
        });

        const searchBox = document.getElementById('searchAnomalies');
        if (searchBox) {
            searchBox.addEventListener('input', () => {
                updateActiveFilters();
                filterAnomalies();
            });
        }

        // Range slider events
        setupRangeSliders();

        // Clear all filters button
        const clearAllBtn = document.getElementById('clearAllFilters');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
                    checkbox.checked = true;
                });
                
                if (searchBox) {
                    searchBox.value = '';
                }
                
                const minSlider = document.getElementById('min-pci');
                const maxSlider = document.getElementById('max-pci');
                
                if (minSlider && maxSlider) {
                    minSlider.value = 0;
                    maxSlider.value = 100;
                    
                    const minValue = document.getElementById('min-value');
                    const maxValue = document.getElementById('max-value');
                    
                    if (minValue && maxValue) {
                        minValue.textContent = '0';
                        maxValue.textContent = '100';
                    }
                }
                
                updateActiveFilters();
                filterAnomalies();
            });
        }
        
        // Initial filtering to update counters
        filterAnomalies();
    }
    
    function updateFilterColors() {
        // Update confidence level filter colors
        document.querySelectorAll('.filter-option label i').forEach(icon => {
            if (!icon) return;
            if (icon.parentElement && icon.parentElement.htmlFor) {
                const forValue = icon.parentElement.htmlFor;
                
                if (forValue === 'highConfidence') {
                    icon.style.color = CONFIDENCE_COLORS.high;
                } else if (forValue === 'mediumConfidence') {
                    icon.style.color = CONFIDENCE_COLORS.medium;
                } else if (forValue === 'lowConfidence') {
                    icon.style.color = CONFIDENCE_COLORS.low;
                } else if (forValue === 'desktopReview') {
                    icon.style.color = REVIEW_TYPE_COLORS.desktop;
                } else if (forValue === 'fieldReview') {
                    icon.style.color = REVIEW_TYPE_COLORS.field;
                }
            }
        });
    }
    
// Add this code to your setupRangeSliders function in pavement-analysis.js
function setupRangeSliders() {
    const minSlider = document.getElementById('min-pci');
    const maxSlider = document.getElementById('max-pci');
    const minValue = document.getElementById('min-value');
    const maxValue = document.getElementById('max-value');
    const minPciInput = document.getElementById('min-pci-input');
    const maxPciInput = document.getElementById('max-pci-input');
    const applyPciRangeBtn = document.getElementById('applyPciRange');

    if (!minSlider || !maxSlider || !minValue || !maxValue) return;

    minSlider.addEventListener('input', () => {
        const minVal = parseInt(minSlider.value);
        const maxVal = parseInt(maxSlider.value);
        
        if (minVal > maxVal) {
            minSlider.value = maxVal;
            minValue.textContent = maxVal;
            minPciInput.value = maxVal;
        } else {
            minValue.textContent = minVal;
            minPciInput.value = minVal;
        }
        updateActiveFilters();
        filterAnomalies();
    });

    maxSlider.addEventListener('input', () => {
        const minVal = parseInt(minSlider.value);
        const maxVal = parseInt(maxSlider.value);
        
        if (maxVal < minVal) {
            maxSlider.value = minVal;
            maxValue.textContent = minVal;
            maxPciInput.value = minVal;
        } else {
            maxValue.textContent = maxVal;
            maxPciInput.value = maxVal;
        }
        updateActiveFilters();
        filterAnomalies();
    });
    
    // Update input fields when sliders change
    minSlider.addEventListener('input', () => {
        minPciInput.value = minSlider.value;
    });

    maxSlider.addEventListener('input', () => {
        maxPciInput.value = maxSlider.value;
    });

    // Apply button click handler
    applyPciRangeBtn.addEventListener('click', () => {
        const minVal = parseInt(minPciInput.value);
        const maxVal = parseInt(maxPciInput.value);
        
        // Validate input values
        if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal > 100 || minVal > maxVal) {
            alert('Please enter valid PCI values (0-100) with Min ≤ Max');
            return;
        }
        
        // Update slider values
        minSlider.value = minVal;
        maxSlider.value = maxVal;
        
        // Update displayed values
        minValue.textContent = minVal;
        maxValue.textContent = maxVal;
        
        updateActiveFilters();
        filterAnomalies();
    });
}
    
    function updateActiveFilters() {
        const activeFilters = document.getElementById('activeFilters');
        if (!activeFilters) return;
        
        activeFilters.innerHTML = '';
        
        // Add confidence filters
        const highConfidence = document.getElementById('highConfidence');
        const mediumConfidence = document.getElementById('mediumConfidence');
        const lowConfidence = document.getElementById('lowConfidence');
        
        if (highConfidence && highConfidence.checked) {
            addFilterBadge('High Confidence', 'highConfidence');
        }
        if (mediumConfidence && mediumConfidence.checked) {
            addFilterBadge('Medium Confidence', 'mediumConfidence');
        }
        if (lowConfidence && lowConfidence.checked) {
            addFilterBadge('Low Confidence', 'lowConfidence');
        }
        
        // Add review type filters
        const desktopReview = document.getElementById('desktopReview');
        const fieldReview = document.getElementById('fieldReview');
        
        if (desktopReview && desktopReview.checked) {
            addFilterBadge('Desktop Review', 'desktopReview');
        }
        if (fieldReview && fieldReview.checked) {
            addFilterBadge('Field Review', 'fieldReview');
        }
        
        // Add search filter if text exists
        const searchText = document.getElementById('searchAnomalies');
        if (searchText && searchText.value) {
            addFilterBadge(`Search: ${searchText.value}`, 'searchText');
        }
        
        // Add manual range filters
        const manualRangeFilters = document.querySelectorAll('.manual-range-filter');
        manualRangeFilters.forEach(filter => {
            if (filter.checked) {
                addFilterBadge(`Manual Range: ${filter.value}`, filter.id);
            }
        });

        // Add PCI range if not default
        const minPCI = document.getElementById('min-pci');
        const maxPCI = document.getElementById('max-pci');
        
        if (minPCI && maxPCI) {
            const minValue = parseInt(minPCI.value);
            const maxValue = parseInt(maxPCI.value);
            
            if (minValue > 0 || maxValue < 100) {
                addFilterBadge(`PCI: ${minValue}-${maxValue}`, 'pciRange');
            }
        }
    }

    function addFilterBadge(text, id) {
        const activeFilters = document.getElementById('activeFilters');
        if (!activeFilters) return;
        
        const badge = document.createElement('div');
        badge.className = 'filter-badge';
        badge.innerHTML = `${text} <i class="fas fa-times" data-id="${id}"></i>`;
        
        // Add click handler to remove this filter
        const closeIcon = badge.querySelector('i');
        if (closeIcon) {
            closeIcon.addEventListener('click', (e) => {
                const filterId = e.target.getAttribute('data-id');
                if (filterId === 'searchText') {
                    const searchBox = document.getElementById('searchAnomalies');
                    if (searchBox) searchBox.value = '';
                } else if (filterId === 'pciRange') {
                    const minPCI = document.getElementById('min-pci');
                    const maxPCI = document.getElementById('max-pci');
                    const minValue = document.getElementById('min-value');
                    const maxValue = document.getElementById('max-value');
                    
                    if (minPCI) minPCI.value = 0;
                    if (maxPCI) maxPCI.value = 100;
                    if (minValue) minValue.textContent = '0';
                    if (maxValue) maxValue.textContent = '100';
                } else {
                    const checkbox = document.getElementById(filterId);
                    if (checkbox) checkbox.checked = false;
                }
                updateActiveFilters();
                filterAnomalies();
            });
        }
        
        activeFilters.appendChild(badge);
    }
    
    function filterAnomalies() {
        const anomalyItems = document.querySelectorAll('.anomaly-item');
        if (!anomalyItems || anomalyItems.length === 0) return;
        
        const searchInput = document.getElementById('searchAnomalies');
        const searchText = searchInput ? searchInput.value.toLowerCase() : '';
        
        const minPCI = document.getElementById('min-pci');
        const maxPCI = document.getElementById('max-pci');
        
        const minPCIVal = minPCI ? parseInt(minPCI.value) : 0;
        const maxPCIVal = maxPCI ? parseInt(maxPCI.value) : 100;
        
        // Update counter displays
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        let desktopCount = 0;
        let fieldCount = 0;
        
        anomalyItems.forEach(item => {
            if (!item) return;
            
            const confidence = item.dataset.confidence;
            const reviewType = item.dataset.reviewType;
            const text = item.textContent.toLowerCase();
            
            // Extract PCI value from the dataset attribute if present
            let pciValue = item.dataset.pciValue ? parseFloat(item.dataset.pciValue) : null;
            
            // If not in dataset, try to extract from the text (for backward compatibility)
            if (pciValue === null) {
                const pciMatch = text.match(/pci.*?(\d+\.?\d*)/i);
                if (pciMatch) {
                    pciValue = parseFloat(pciMatch[1]);
                }
            }
            
            // Check manual range matches
            const manualRangeFilters = document.querySelectorAll('.manual-range-filter:checked');
            let manualRangeMatch = true;
            
            if (manualRangeFilters.length > 0) {
                manualRangeMatch = false;
                manualRangeFilters.forEach(filter => {
                    const [rangeStart, rangeEnd] = filter.value.split('-').map(Number);
                    if (pciValue !== null && pciValue >= rangeStart && pciValue <= rangeEnd) {
                        manualRangeMatch = true;
                    }
                });
            }

            const pciRangeMatch = (pciValue === null || (pciValue >= minPCIVal && pciValue <= maxPCIVal)) && manualRangeMatch;
            
            // Check confidence match
            const highConfidence = document.getElementById('highConfidence');
            const mediumConfidence = document.getElementById('mediumConfidence');
            const lowConfidence = document.getElementById('lowConfidence');
            
            const confidenceMatch = (
                (confidence === 'high' && highConfidence && highConfidence.checked) ||
                (confidence === 'medium' && mediumConfidence && mediumConfidence.checked) ||
                (confidence === 'low' && lowConfidence && lowConfidence.checked)
            );
            
            // Check review type match
            const desktopReview = document.getElementById('desktopReview');
            const fieldReview = document.getElementById('fieldReview');
            
            const reviewTypeMatch = (
                (reviewType === 'desktop' && desktopReview && desktopReview.checked) ||
                (reviewType === 'field' && fieldReview && fieldReview.checked)
            );
            
            // Check search text match
            const searchMatch = searchText === '' || text.includes(searchText);
            
            // Display or hide based on all criteria
            const display = confidenceMatch && reviewTypeMatch && searchMatch && pciRangeMatch ? 'block' : 'none';
            item.style.display = display;
            
            // Count visible items for counters
            if (display === 'block') {
                if (confidence === 'high') highCount++;
                if (confidence === 'medium') mediumCount++;
                if (confidence === 'low') lowCount++;
                if (reviewType === 'desktop') desktopCount++;
                if (reviewType === 'field') fieldCount++;
            }
        });
        
        // Update counters
        updateCounterElement('highConfidence', highCount);
        updateCounterElement('mediumConfidence', mediumCount);
        updateCounterElement('lowConfidence', lowCount);
        updateCounterElement('desktopReview', desktopCount);
        updateCounterElement('fieldReview', fieldCount);
    }
    
    function updateCounterElement(id, count) {
        const labelElement = document.querySelector(`label[for="${id}"]`);
        if (labelElement) {
            const countElement = labelElement.nextElementSibling;
            if (countElement && countElement.classList.contains('count')) {
                countElement.textContent = count;
            }
        }
    }
    
    function setupChartModal() {
        const modal = document.getElementById('chartModal');
        const modalImg = document.getElementById('modalChartImage');
        const modalTitle = document.getElementById('modalChartTitle');
        const closeBtn = document.querySelector('.close');
        const closeModalBtn = document.getElementById('closeModalBtn');
        
        if (!modal || !modalImg || !modalTitle) return;
        
        const chartImages = document.querySelectorAll('.chart-image');
        const expandButtons = document.querySelectorAll('.chart-actions button');
        
        for (let i = 0; i < expandButtons.length; i++) {
            const button = expandButtons[i];
            const img = chartImages[i];
            
            if (!button || !img) continue;
            
            button.addEventListener('click', () => {
                const titleElement = button.closest('.chart-card').querySelector('.chart-title');
                const title = titleElement ? titleElement.textContent : 'Chart';
                
                modalImg.src = img.src;
                modalTitle.textContent = title;
                modal.style.display = 'block';
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Initialize the filter UI on page load
    updateFilterColors();
    setupFilterUI();
    setupChartModal();
});
