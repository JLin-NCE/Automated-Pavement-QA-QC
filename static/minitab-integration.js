// minitab-integration.js - Minitab integration for Pavement QA/QC System

// Add debug logs to help troubleshoot
console.log('Minitab integration script loading...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('Minitab integration DOM loaded');
    
    // Add Minitab export button to UI
    const exportButtonContainer = document.getElementById('exportAnomaliesBtn');
    console.log('Export button container found:', !!exportButtonContainer);
    
    if (exportButtonContainer) {
        const container = exportButtonContainer.parentNode;
        
        // Create the Minitab export button
        const minitabExportBtn = document.createElement('button');
        minitabExportBtn.className = 'btn btn-secondary btn-sm';
        minitabExportBtn.id = 'exportToMinitabBtn';
        minitabExportBtn.innerHTML = '<i class="fas fa-chart-line"></i> Export to Minitab';
        minitabExportBtn.style.marginLeft = '10px';
        
        // Add button to container
        container.appendChild(minitabExportBtn);
        console.log('Minitab export button added to DOM');
        
        // Add click event
        minitabExportBtn.addEventListener('click', () => {
            console.log('Minitab export button clicked');
            exportForMinitab();
        });
    }
    
    // Function to export data in Minitab-friendly format
    function exportForMinitab() {
        console.log('Starting exportForMinitab function');
        
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
                
                // Add numeric confidence for Minitab analysis
                let confidenceValue = 0;
                if (confidence === 'high') confidenceValue = 3;
                else if (confidence === 'medium') confidenceValue = 2;
                else if (confidence === 'low') confidenceValue = 1;
                
                // Add numeric review type for Minitab analysis
                const reviewTypeValue = reviewType === 'field' ? 2 : 1;
                
                anomalies.push({
                    section_id: sectionId,
                    reason: reason.replace(/,/g, ';'),
                    review_type: reviewType,
                    review_type_value: reviewTypeValue,
                    confidence: confidence,
                    confidence_value: confidenceValue,
                    pci: pci || ''
                });
            }
        });
        
        console.log(`Found ${anomalies.length} anomalies to export`);
        
        if (anomalies.length === 0) {
            console.log('No anomalies to export');
            window.pavementApp.showAlert('errorAlert', 'No anomalies to export.');
            return;
        }
        
        // Create CSV content in Minitab-friendly format
        let csvContent = 'data:text/csv;charset=utf-8,';
        
        // Create a header row with column descriptions and data types for Minitab
        csvContent += 'Section ID,Reason,Review Type,Review Type Value (1=Desktop;2=Field),';
        csvContent += 'Confidence,Confidence Value (1=Low;2=Medium;3=High),PCI\n';
        
        anomalies.forEach(anomaly => {
            csvContent += `${anomaly.section_id},${anomaly.reason},${anomaly.review_type},${anomaly.review_type_value},`;
            csvContent += `${anomaly.confidence},${anomaly.confidence_value},${anomaly.pci}\n`;
        });
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `pavement_minitab_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        
        console.log('CSV link created, triggering download');
        
        // Trigger download
        link.click();
        document.body.removeChild(link);
        
        window.pavementApp.showAlert('successAlert', `Exported ${anomalies.length} anomalies in Minitab-compatible format.`);
        
        // Show instructions modal for importing to Minitab
        showMinitabInstructions();
    }
    
    // Function to show instructions for importing to Minitab
    function showMinitabInstructions() {
        console.log('Showing Minitab instructions modal');
        
        // Create modal element if it doesn't exist
        let minitabModal = document.getElementById('minitabModal');
        
        if (!minitabModal) {
            minitabModal = document.createElement('div');
            minitabModal.id = 'minitabModal';
            minitabModal.className = 'modal';
            
            // Create modal content
            minitabModal.innerHTML = `
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <div class="modal-header">
                        <h2 class="modal-title">Import Data to Minitab</h2>
                    </div>
                    <div class="modal-body">
                        <h3>Instructions:</h3>
                        <ol>
                            <li>Open Minitab Statistical Software</li>
                            <li>Go to <strong>File > Open</strong> and select the CSV file you just downloaded</li>
                            <li>In the import dialog, ensure that:
                                <ul>
                                    <li>First row contains column names is checked</li>
                                    <li>Numeric data is selected for numeric columns</li>
                                    <li>Text data is selected for text columns</li>
                                </ul>
                            </li>
                            <li>Click <strong>OK</strong> to import the data</li>
                            <li>To create statistical analysis:
                                <ul>
                                    <li>Go to <strong>Stat > Basic Statistics</strong> or other analysis options</li>
                                    <li>Select the columns to analyze (e.g., PCI, Confidence Value)</li>
                                    <li>Follow Minitab prompts to create your analysis</li>
                                </ul>
                            </li>
                        </ol>
                        <div class="alert alert-info">
                            <div class="alert-content">
                                <i class="fas fa-info-circle"></i>
                                <div>The exported file includes numeric values for confidence levels and review types to facilitate statistical analysis in Minitab.</div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" id="closeMinitabModalBtn">Got it</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(minitabModal);
            console.log('Minitab modal created and added to DOM');
            
            // Add close modal functionality
            const closeBtn = minitabModal.querySelector('.close');
            const closeModalBtn = minitabModal.querySelector('#closeMinitabModalBtn');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    minitabModal.style.display = 'none';
                });
            }
            
            if (closeModalBtn) {
                closeModalBtn.addEventListener('click', () => {
                    minitabModal.style.display = 'none';
                });
            }
            
            window.addEventListener('click', (e) => {
                if (e.target === minitabModal) {
                    minitabModal.style.display = 'none';
                }
            });
        }
        
        // Show the modal
        minitabModal.style.display = 'block';
    }
    
    // Add Minitab Import function to the server-side export API
    const exportAnomaliesServerBtn = document.createElement('button');
    exportAnomaliesServerBtn.className = 'btn btn-secondary btn-sm';
    exportAnomaliesServerBtn.id = 'exportToMinitabServerBtn';
    exportAnomaliesServerBtn.innerHTML = '<i class="fas fa-database"></i> Export All Data for Minitab';
    
    // Add it to the analysis tab
    const analysisTab = document.getElementById('analysis');
    if (analysisTab) {
        console.log('Analysis tab found');
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'btn-group';
        btnContainer.style.marginTop = '1rem';
        btnContainer.appendChild(exportAnomaliesServerBtn);
        
        const cardHeader = analysisTab.querySelector('.card-header');
        if (cardHeader && cardHeader.parentNode) {
            cardHeader.parentNode.insertBefore(btnContainer, cardHeader.nextSibling);
            console.log('Server export button added to DOM');
        } else {
            console.log('Card header or parent node not found');
        }
    } else {
        console.log('Analysis tab not found');
    }
    
    // Add event listener to the server export button
    exportAnomaliesServerBtn.addEventListener('click', async () => {
        console.log('Server export button clicked');
        window.pavementApp.showLoading();
        
        try {
            const response = await fetch('/api/export-for-minitab', {
                method: 'GET'
            });
            
            console.log('Server response status:', response.status);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pavement_full_data_minitab_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                window.pavementApp.showAlert('successAlert', 'Full dataset exported for Minitab analysis.');
                showMinitabInstructions();
            } else {
                const error = await response.json();
                console.error('Server returned error:', error);
                window.pavementApp.showAlert('errorAlert', `Export failed: ${error.error}`);
            }
        } catch (error) {
            console.error('Error exporting for Minitab:', error);
            window.pavementApp.showAlert('errorAlert', `Export error: ${error.message}`);
        } finally {
            window.pavementApp.hideLoading();
        }
    });
    
    // Add test button for direct debugging
    const testButton = document.createElement('button');
    testButton.textContent = 'Test Minitab Export';
    testButton.style.position = 'fixed';
    testButton.style.top = '10px';
    testButton.style.right = '10px';
    testButton.style.zIndex = '9999';
    testButton.style.padding = '10px';
    testButton.style.backgroundColor = 'red';
    testButton.style.color = 'white';
    
    testButton.addEventListener('click', function() {
        console.log('Test button clicked!');
        alert('Test button clicked - Starting Minitab export');
        exportForMinitab();
    });
    
    document.body.appendChild(testButton);
    console.log('Test button added to page');
});