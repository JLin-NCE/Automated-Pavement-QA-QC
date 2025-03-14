from flask import Flask, request, jsonify, send_file, send_from_directory, Response
import os
import numpy as np
import datetime
import tempfile
import pandas as pd
import io
import csv

# Import from our modules
from data_processor import load_datasets, get_section_id_column, get_pci_column, get_date_columns
from anomaly_detector import detect_anomalies, generate_visualizations

# Configure the app with explicit static path
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload

# Create necessary directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('static', exist_ok=True)

ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    files = request.files.getlist('file')
    file_types = request.form.get('fileTypes', 'current')  # 'current', 'historical', 'maintenance'
    
    file_paths = []
    for file in files:
        if file and allowed_file(file.filename):
            from werkzeug.utils import secure_filename
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{file_types}_{filename}")
            file.save(file_path)
            file_paths.append(file_path)
    
    return jsonify({'message': f'Uploaded {len(file_paths)} files successfully', 'file_paths': file_paths})

@app.route('/api/analyze', methods=['POST'])
def analyze_data():
    data = request.json
    current_data_paths = data.get('current_data_paths', [])
    historical_data_paths = data.get('historical_data_paths', [])
    maintenance_data_paths = data.get('maintenance_data_paths', [])
    manual_ranges = data.get('manual_ranges', {})  # {section_id: [min_pci, max_pci]}
    
    # Load datasets
    current_data = load_datasets(current_data_paths)
    historical_data = load_datasets(historical_data_paths)
    maintenance_data = load_datasets(maintenance_data_paths)
    
    if current_data.empty:
        return jsonify({'error': 'No current data found'}), 400
    
    # Run anomaly detection with manual ranges
    anomalies = detect_anomalies(current_data, historical_data, maintenance_data)
    
    # Generate visualizations
    plots = generate_visualizations(current_data, historical_data, anomalies)
    
    return jsonify({
        'anomalies': anomalies,
        'visualizations': plots,
        'summary': {
            'total_sections': len(current_data),
            'anomalies_count': len(anomalies),
            'review_percentage': round(len(anomalies) / len(current_data) * 100, 2) if len(current_data) > 0 else 0
        }
    })

@app.route('/api/sample-data', methods=['GET'])
def get_sample_data():
    """Return message about using existing CSV files"""
    return jsonify({
        'message': 'Using existing CSV files in uploads directory for testing.'
    })

@app.route('/api/export-for-minitab', methods=['GET'])
def export_for_minitab():
    """
    Export all data in a Minitab-compatible format
    """
    try:
        print("Starting export for Minitab")
        # Get all data from upload folder
        current_data_paths = [os.path.join(app.config['UPLOAD_FOLDER'], f) for f in os.listdir(app.config['UPLOAD_FOLDER']) 
                             if f.startswith('current_') and os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
        
        historical_data_paths = [os.path.join(app.config['UPLOAD_FOLDER'], f) for f in os.listdir(app.config['UPLOAD_FOLDER']) 
                               if f.startswith('historical_') and os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
        
        maintenance_data_paths = [os.path.join(app.config['UPLOAD_FOLDER'], f) for f in os.listdir(app.config['UPLOAD_FOLDER']) 
                                if f.startswith('maintenance_') and os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
        
        print(f"Found data files - Current: {len(current_data_paths)}, Historical: {len(historical_data_paths)}, Maintenance: {len(maintenance_data_paths)}")
        
        # Load datasets
        current_data = load_datasets(current_data_paths)
        historical_data = load_datasets(historical_data_paths)
        maintenance_data = load_datasets(maintenance_data_paths)
        
        # Create combined dataset for Minitab
        combined_data = create_minitab_dataset(current_data, historical_data, maintenance_data)
        
        # Convert to CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(combined_data.columns)
        
        # Write data
        for _, row in combined_data.iterrows():
            writer.writerow(row)
        
        # Create response
        response = Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename=pavement_data_minitab_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
            }
        )
        
        print("Export for Minitab completed successfully")
        return response
        
    except Exception as e:
        print(f"Error exporting for Minitab: {e}")
        return jsonify({'error': str(e)}), 500

def create_minitab_dataset(current_data, historical_data, maintenance_data):
    """
    Create a combined dataset optimized for Minitab analysis
    
    Parameters:
    current_data (pandas.DataFrame): Current PMP data
    historical_data (pandas.DataFrame): Historical PMP data
    maintenance_data (pandas.DataFrame): Maintenance history data
    
    Returns:
    pandas.DataFrame: Combined dataset for Minitab
    """
    print("Starting to create Minitab dataset")
    
    # Start with current data
    minitab_data = current_data.copy()
    
    # Add data source identifier
    minitab_data['data_source'] = 'current'
    
    # Extract section IDs for joining
    section_id_col = get_section_id_column(current_data)
    print(f"Using section ID column: {section_id_col}")
    
    # Get PCI columns
    pci_col_current = get_pci_column(current_data)
    print(f"Using PCI column: {pci_col_current}")
    
    # Add columns for Minitab analysis if they don't exist
    if pci_col_current and pci_col_current in minitab_data.columns:
        print(f"Adding PCI categories for Minitab analysis")
        # Create PCI categories for stratified analysis using numpy select instead of pd.cut
        if 'pci_category' not in minitab_data.columns:
            try:
                # Create conditions for each category
                conditions = [
                    (minitab_data[pci_col_current] < 25),
                    (minitab_data[pci_col_current] >= 25) & (minitab_data[pci_col_current] < 50),
                    (minitab_data[pci_col_current] >= 50) & (minitab_data[pci_col_current] < 75),
                    (minitab_data[pci_col_current] >= 75)
                ]
                choices = ['Poor', 'Fair', 'Good', 'Excellent']
                minitab_data['pci_category'] = np.select(conditions, choices, default='Unknown')
                print("PCI categories created successfully")
            except Exception as e:
                print(f"Error creating PCI categories: {e}")
                # If there's an error, skip adding this column
                pass
    
    # Add historical data comparison if available
    if not historical_data.empty and section_id_col in historical_data.columns:
        print("Adding historical data comparison")
        pci_col_historical = get_pci_column(historical_data)
        
        if pci_col_historical:
            try:
                # Get historical PCI values
                historical_pci = historical_data[[section_id_col, pci_col_historical]].copy()
                historical_pci.columns = [section_id_col, 'historical_pci']
                
                # Add to minitab data
                minitab_data = pd.merge(
                    minitab_data,
                    historical_pci,
                    on=section_id_col,
                    how='left'
                )
                
                # Calculate PCI change
                if pci_col_current and 'historical_pci' in minitab_data.columns:
                    minitab_data['pci_change'] = minitab_data[pci_col_current] - minitab_data['historical_pci']
                    
                    # Calculate annual rate of change if dates are available
                    date_cols_current = get_date_columns(current_data)
                    date_cols_historical = get_date_columns(historical_data)
                    
                    if date_cols_current and date_cols_historical:
                        try:
                            # Add dates for time-based analysis
                            current_dates = current_data[[section_id_col, date_cols_current[0]]].copy()
                            current_dates.columns = [section_id_col, 'current_date']
                            
                            historical_dates = historical_data[[section_id_col, date_cols_historical[0]]].copy()
                            historical_dates.columns = [section_id_col, 'historical_date']
                            
                            # Merge dates
                            minitab_data = pd.merge(minitab_data, current_dates, on=section_id_col, how='left')
                            minitab_data = pd.merge(minitab_data, historical_dates, on=section_id_col, how='left')
                            
                            # Convert to datetime
                            minitab_data['current_date'] = pd.to_datetime(minitab_data['current_date'])
                            minitab_data['historical_date'] = pd.to_datetime(minitab_data['historical_date'])
                            
                            # Calculate years between measurements
                            minitab_data['years_between'] = (minitab_data['current_date'] - minitab_data['historical_date']).dt.days / 365.25
                            
                            # Calculate annual rate of deterioration
                            minitab_data['annual_deterioration'] = minitab_data['pci_change'] / minitab_data['years_between']
                            
                            print("Historical comparison metrics calculated successfully")
                        except Exception as e:
                            print(f"Error calculating date-based metrics: {e}")
                            # Continue without these metrics if there's an error
            except Exception as e:
                print(f"Error processing historical data: {e}")
    
    # Add maintenance information if available
    if not maintenance_data.empty and section_id_col in maintenance_data.columns:
        print("Adding maintenance information")
        try:
            # Flag for sections with maintenance
            sections_with_maintenance = maintenance_data[section_id_col].unique()
            minitab_data['has_maintenance'] = minitab_data[section_id_col].isin(sections_with_maintenance)
            minitab_data['has_maintenance'] = minitab_data['has_maintenance'].astype(int)  # Convert boolean to 0/1 for Minitab
            
            # Get maintenance count for each section
            maintenance_counts = maintenance_data.groupby(section_id_col).size().reset_index(name='maintenance_count')
            minitab_data = pd.merge(minitab_data, maintenance_counts, on=section_id_col, how='left')
            minitab_data['maintenance_count'] = minitab_data['maintenance_count'].fillna(0)
            
            # Get latest maintenance date and type if available
            maint_date_cols = get_date_columns(maintenance_data)
            if maint_date_cols:
                # Create a dataframe with latest maintenance information
                maintenance_data['maintenance_date'] = pd.to_datetime(maintenance_data[maint_date_cols[0]])
                
                # Group by section_id and find the latest maintenance date
                latest_maint_indices = maintenance_data.groupby(section_id_col)['maintenance_date'].idxmax()
                latest_maintenance = maintenance_data.loc[latest_maint_indices]
                
                # Get maintenance type
                maint_type_cols = [col for col in maintenance_data.columns if 'type' in col.lower() or 'work' in col.lower()]
                if maint_type_cols:
                    try:
                        maint_type_col = maint_type_cols[0]
                        latest_maintenance_subset = latest_maintenance[[section_id_col, 'maintenance_date', maint_type_col]].copy()
                        latest_maintenance_subset.columns = [section_id_col, 'latest_maintenance_date', 'latest_maintenance_type']
                        
                        # Merge with minitab data
                        minitab_data = pd.merge(minitab_data, latest_maintenance_subset, on=section_id_col, how='left')
                        
                        # Calculate time since last maintenance
                        if 'current_date' in minitab_data.columns and 'latest_maintenance_date' in minitab_data.columns:
                            # Convert to datetime again if needed
                            if not pd.api.types.is_datetime64_dtype(minitab_data['current_date']):
                                minitab_data['current_date'] = pd.to_datetime(minitab_data['current_date'])
                            
                            # Calculate years since maintenance where maintenance data exists
                            mask = ~minitab_data['latest_maintenance_date'].isna()
                            if mask.any():
                                minitab_data.loc[mask, 'years_since_maintenance'] = (
                                    minitab_data.loc[mask, 'current_date'] - 
                                    minitab_data.loc[mask, 'latest_maintenance_date']
                                ).dt.days / 365.25
                            
                            print("Maintenance metrics calculated successfully")
                    except Exception as e:
                        print(f"Error processing maintenance type information: {e}")
                        
        except Exception as e:
            print(f"Error processing maintenance data for Minitab: {e}")
    
    # Clean up any missing values for Minitab compatibility
    # Convert all object columns containing NaN to string type
    for col in minitab_data.select_dtypes(include=['object']).columns:
        minitab_data[col] = minitab_data[col].astype(str)
        minitab_data[col] = minitab_data[col].replace('nan', '')
    
    # Fill numeric NaN values with 0
    minitab_data = minitab_data.fillna(0)
    
    print("Minitab dataset created successfully")
    return minitab_data

if __name__ == '__main__':
    print("Server starting... Open http://localhost:5000 in your browser")
    app.run(debug=True)