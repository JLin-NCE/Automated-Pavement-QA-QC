// pavement-core.js - Core functionality for the Pavement QA/QC System
document.addEventListener('DOMContentLoaded', function() {
    // ===== Tab switching =====
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to current tab and content
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // ===== File upload handling =====
    setupFileUpload('currentDataUpload', 'currentData', 'currentFileList');
    setupFileUpload('historicalDataUpload', 'historicalData', 'historicalFileList');
    setupFileUpload('maintenanceDataUpload', 'maintenanceData', 'maintenanceFileList');
    
    function setupFileUpload(dropAreaId, inputId, fileListId) {
        const dropArea = document.getElementById(dropAreaId);
        const input = document.getElementById(inputId);
        const fileList = document.getElementById(fileListId);
        
        if (!dropArea || !input || !fileList) return;
        
        dropArea.addEventListener('click', () => {
            input.click();
        });
        
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = 'var(--primary)';
        });
        
        dropArea.addEventListener('dragleave', () => {
            dropArea.style.borderColor = '#e5e7eb';
        });
        
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = '#e5e7eb';
            
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                updateFileList(input.files, fileList);
            }
        });
        
        input.addEventListener('change', () => {
            updateFileList(input.files, fileList);
        });
        
        function updateFileList(files, listElement) {
            listElement.innerHTML = '';
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const item = document.createElement('li');
                item.className = 'file-item';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'file-name';
                
                const icon = document.createElement('i');
                if (file.name.endsWith('.csv')) {
                    icon.className = 'fas fa-file-csv';
                } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    icon.className = 'fas fa-file-excel';
                } else {
                    icon.className = 'fas fa-file';
                }
                
                nameSpan.appendChild(icon);
                nameSpan.appendChild(document.createTextNode(' ' + file.name));
                
                const actionsSpan = document.createElement('span');
                actionsSpan.className = 'file-actions';
                
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    item.remove();
                    // Create a new FileList without this file
                    // Note: FileList is immutable, so we need to reset the input
                    const dt = new DataTransfer();
                    for (let j = 0; j < files.length; j++) {
                        if (j !== i) {
                            dt.items.add(files[j]);
                        }
                    }
                    input.files = dt.files;
                });
                
                actionsSpan.appendChild(removeBtn);
                
                item.appendChild(nameSpan);
                item.appendChild(actionsSpan);
                
                listElement.appendChild(item);
            }
        }
    }
    
    // ===== Handle the analyze button click =====
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            // Check if current data files are selected or manual ranges provided
            const currentFiles = document.getElementById('currentData').files;
            const manualRanges = document.getElementById('manualRanges').value;
            
            if (currentFiles.length === 0 && !manualRanges) {
                showAlert('errorAlert', 'Please upload at least one current PMP data file or enter manual PCI ranges.');
                return;
            }
            
            showLoading();
            
            // Parse manual ranges if provided
            let manualRangesArray = [];
            if (manualRanges) {
                try {
                    manualRangesArray = manualRanges.split(',').map(range => {
                        const [start, end] = range.split('-').map(Number);
                        if (isNaN(start) || isNaN(end) || start < 0 || end > 100 || start > end) {
                            throw new Error('Invalid range format');
                        }
                        return { start, end };
                    });
                } catch (error) {
                    showAlert('errorAlert', 'Invalid manual PCI ranges format. Use comma-separated ranges like "0-10,20-30"');
                    hideLoading();
                    return;
                }
            }
            
            try {
                // First, upload all files
                const currentDataPaths = await uploadFiles(currentFiles, 'current');
                
                const historicalFiles = document.getElementById('historicalData').files;
                const historicalDataPaths = historicalFiles.length > 0 ? 
                    await uploadFiles(historicalFiles, 'historical') : [];
                
                const maintenanceFiles = document.getElementById('maintenanceData').files;
                const maintenanceDataPaths = maintenanceFiles.length > 0 ? 
                    await uploadFiles(maintenanceFiles, 'maintenance') : [];
                
                // Then, analyze the data
                const analysisData = {
                    current_data_paths: currentDataPaths,
                    historical_data_paths: historicalDataPaths,
                    maintenance_data_paths: maintenanceDataPaths
                };
                
                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(analysisData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    displayAnalysisResults(result);
                    switchToAnalysisTab();
                    showAlert('successAlert', 'Analysis completed successfully! Review the results to identify sections requiring attention.');
                } else {
                    showAlert('errorAlert', `Analysis failed: ${result.error}`);
                }
            } catch (error) {
                console.error('Error during analysis:', error);
                showAlert('errorAlert', `An error occurred: ${error.message}`);
            } finally {
                hideLoading();
            }
        });
    }
    
    async function uploadFiles(files, fileType) {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('file', files[i]);
        }
        formData.append('fileTypes', fileType);
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to upload files');
        }
        
        return result.file_paths;
    }
    
    function updateChartIfAvailable(chartId, chartData) {
        const chartImg = document.getElementById(chartId);
        if (chartImg && chartData) {
            chartImg.src = 'data:image/png;base64,' + chartData;
            // Make parent chart card visible if it was hidden
            const chartCard = chartImg.closest('.chart-card');
            if (chartCard) {
                chartCard.style.display = 'block';
            }
        } else if (chartImg) {
            // Hide parent chart card if no data
            const chartCard = chartImg.closest('.chart-card');
            if (chartCard) {
                chartCard.style.display = 'none';
            }
        }
    }
    
    // ===== Export anomalies to CSV =====
    const exportBtn = document.getElementById('exportAnomaliesBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportAnomalies();
        });
    }
    
    function exportAnomalies() {
        // Get visible anomalies
        const anomalies = [];
        document.querySelectorAll('.anomaly-item').forEach(item => {
            if (item.style.display !== 'none') {
                const sectionId = item.querySelector('.anomaly-section').textContent;
                const reason = item.querySelector('.anomaly-reason').textContent;
                const reviewType = item.dataset.reviewType;
                const confidence = item.dataset.confidence;
                
                // Extract PCI if available
                let pci = item.dataset.pciValue || null;
                if (!pci) {
                    const pciMatch = reason.match(/PCI.*?(\d+\.?\d*)/i);
                    if (pciMatch) {
                        pci = pciMatch[1];
                    }
                }
                
                anomalies.push({
                    section_id: sectionId,
                    reason: reason,
                    review_type: reviewType,
                    confidence: confidence,
                    pci: pci
                });
            }
        });
        
        if (anomalies.length === 0) {
            showAlert('errorAlert', 'No anomalies to export.');
            return;
        }
        
        // Create CSV content
        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'Section ID,Reason,Review Type,Confidence,PCI\n';
        
        anomalies.forEach(anomaly => {
            csvContent += `${anomaly.section_id},${anomaly.reason.replace(/,/g, ';')},${anomaly.review_type},${anomaly.confidence},${anomaly.pci || ''}\n`;
        });
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `pavement_anomalies_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        document.body.removeChild(link);
        
        showAlert('successAlert', `Exported ${anomalies.length} anomalies to CSV.`);
    }
    
    // ===== Manual PCI Range Input =====
    const manualRangeInput = document.getElementById('manualRanges');
    if (manualRangeInput) {
        manualRangeInput.addEventListener('input', (e) => {
            const value = e.target.value;
            // Validate format as user types
            if (value && !/^(\d+-\d+)(,\d+-\d+)*$/.test(value)) {
                e.target.setCustomValidity('Please enter ranges in format "0-10,20-30"');
            } else {
                e.target.setCustomValidity('');
            }
        });
    }

    // ===== Reset button =====
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            // Clear file inputs
            ['currentData', 'historicalData', 'maintenanceData'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
            
            // Clear file lists
            ['currentFileList', 'historicalFileList', 'maintenanceFileList'].forEach(id => {
                const list = document.getElementById(id);
                if (list) list.innerHTML = '';
            });

            // Clear manual ranges
            if (manualRangeInput) {
                manualRangeInput.value = '';
            }
            
            showAlert('successAlert', 'All inputs cleared. Ready for new data.');
        });
    }
    
    // ===== Helper functions =====
    function showAlert(alertId, message) {
        const alert = document.getElementById(alertId);
        if (!alert) return;
        
        const messageEl = alert.querySelector('div[id$="Message"]');
        if (!messageEl) return;
        
        messageEl.textContent = message;
        alert.style.display = 'block';
        
        // Hide the alert after 5 seconds
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
    
    function showLoading() {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'flex';
    }
    
    function hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    }
    
    function switchToAnalysisTab() {
        const analysisTab = document.querySelector('.tab[data-tab="analysis"]');
        if (analysisTab) analysisTab.click();
    }
    
    // Expose functions for other scripts to use
    window.pavementApp = {
        showAlert,
        showLoading,
        hideLoading,
        switchToAnalysisTab,
        updateChartIfAvailable
    };
});
