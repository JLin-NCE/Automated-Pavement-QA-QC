from flask import Flask, request, jsonify, send_file, send_from_directory
import os
import numpy as np
import datetime
import tempfile
import pandas as pd

# Import from our modules
from data_processor import load_datasets
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
    anomalies = detect_anomalies(current_data, historical_data, maintenance_data, manual_ranges)
    
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

if __name__ == '__main__':
    print("Server starting... Open http://localhost:5000 in your browser")
    app.run(debug=True)
