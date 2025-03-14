// minitab-simple.js - Simplified Minitab integration

document.addEventListener('DOMContentLoaded', function() {
    console.log('Simple Minitab integration loaded!');
    
    // Add export buttons after any existing buttons
    setTimeout(() => {
        // Find existing export button
        const existingButton = document.getElementById('exportAnomaliesBtn');
        if (existingButton) {
            console.log('Found existing export button');
            
            // Create new Minitab button
            const minitabButton = document.createElement('button');
            minitabButton.className = 'btn btn-secondary btn-sm';
            minitabButton.innerHTML = '<i class="fas fa-chart-line"></i> Simple Export';
            minitabButton.style.marginLeft = '10px';
            
            // Add button next to existing button
            existingButton.parentNode.appendChild(minitabButton);
            
            // Add click event
            minitabButton.addEventListener('click', function() {
                console.log('Simple Minitab export button clicked!');
                alert('Starting simplified Minitab export...');
                
                // Get visible anomalies
                const anomalies = [];
                document.querySelectorAll('.anomaly-item').forEach(item => {
                    if (item.style.display !== 'none') {
                        const sectionId = item.querySelector('.anomaly-section').textContent;
                        const reason = item.querySelector('.anomaly-reason').textContent;
                        
                        anomalies.push({
                            section_id: sectionId,
                            reason: reason
                        });
                    }
                });
                
                alert(`Found ${anomalies.length} anomalies to export`);
                
                // Create CSV content
                let csvContent = 'data:text/csv;charset=utf-8,';
                csvContent += 'Section ID,Reason\n';
                
                anomalies.forEach(anomaly => {
                    csvContent += `${anomaly.section_id},${anomaly.reason.replace(/,/g, ';')}\n`;
                });
                
                // Create download link
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement('a');
                link.setAttribute('href', encodedUri);
                link.setAttribute('download', `minitab_simple_export_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                
                // Trigger download
                link.click();
                document.body.removeChild(link);
                
                alert('Simple export complete! CSV file has been downloaded.');
            });
            
            // Add server export button
            const serverButton = document.createElement('button');
            serverButton.className = 'btn btn-secondary btn-sm';
            serverButton.innerHTML = '<i class="fas fa-database"></i> Simple Server Export';
            serverButton.style.marginLeft = '10px';
            
            // Add to same parent
            existingButton.parentNode.appendChild(serverButton);
            
            // Add click event for server export
            serverButton.addEventListener('click', function() {
                console.log('Simple server export button clicked!');
                alert('Starting simple server export...');
                
                // Send request to server
                fetch('/api/export-for-minitab', {
                    method: 'GET'
                })
                .then(response => {
                    if (response.ok) return response.blob();
                    throw new Error('Server export failed');
                })
                .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `minitab_simple_server_export_${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    alert('Simple server export complete! CSV file has been downloaded.');
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert(`Export error: ${error.message}`);
                });
            });
        } else {
            console.warn('Export button not found');
        }
    }, 1000); // Wait for 1 second to ensure other scripts have loaded
});