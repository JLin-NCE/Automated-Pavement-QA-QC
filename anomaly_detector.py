import pandas as pd
import numpy as np
import matplotlib
# Use non-interactive backend to prevent Tkinter errors
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from io import BytesIO
import base64

from data_processor import (
    get_section_id_column, 
    get_pci_column, 
    get_date_columns, 
    get_distress_columns,
    get_category_columns
)

def detect_anomalies(current_data, historical_data, maintenance_data):
    """
    Detect anomalies in the pavement data using multiple approaches:
    1. Statistical outliers in current data
    2. Unexpected rate of deterioration compared to historical data
    3. Inconsistencies with maintenance history
    
    Parameters:
    current_data (pandas.DataFrame): Current PMP data
    historical_data (pandas.DataFrame): Historical PMP data
    maintenance_data (pandas.DataFrame): Maintenance history data
    
    Returns:
    list: List of dictionaries containing anomaly information
    """
    anomalies = []
    
    # Extract section IDs for consistent referencing
    section_id_col = get_section_id_column(current_data)
    
    # 1. Detect statistical outliers in PCI values
    anomalies.extend(detect_pci_outliers(current_data, section_id_col))
    
    # 2. Check for inconsistent distress types and severities
    anomalies.extend(detect_distress_inconsistencies(current_data, section_id_col))
    
    # 3. Compare with historical data to check for unrealistic deterioration rates
    if not historical_data.empty and section_id_col in historical_data.columns:
        anomalies.extend(detect_deterioration_anomalies(
            current_data, historical_data, maintenance_data, section_id_col
        ))
    
    # 4. Check for inconsistencies with maintenance history
    if not maintenance_data.empty and section_id_col in maintenance_data.columns:
        anomalies.extend(detect_maintenance_inconsistencies(
            current_data, maintenance_data, section_id_col
        ))
    
    return anomalies

def detect_pci_outliers(data, section_id_col, manual_ranges=None):
    """
    Detect statistical outliers in PCI values and incorporate manual review ranges
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    section_id_col (str): Name of section ID column
    manual_ranges (dict): Dictionary of manual PCI ranges {section_id: (min_pci, max_pci)}
    
    Returns:
    list: Anomalies related to PCI outliers
    """
    anomalies = []
    pci_col = get_pci_column(data)
    
    if pci_col:
        # Use IQR method to detect outliers
        Q1 = data[pci_col].quantile(0.25)
        Q3 = data[pci_col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        # Find PCI outliers
        pci_outliers = data[(data[pci_col] < lower_bound) | 
                            (data[pci_col] > upper_bound)]
        
        for _, row in pci_outliers.iterrows():
            section_id = row[section_id_col]
            
            # Check if section has manual review range
            if manual_ranges and section_id in manual_ranges:
                min_pci, max_pci = manual_ranges[section_id]
                if row[pci_col] < min_pci or row[pci_col] > max_pci:
                    anomalies.append({
                        'section_id': section_id,
                        'reason': f'PCI value ({row[pci_col]}) is outside manual review range ({min_pci}-{max_pci})',
                        'review_type': 'field',
                        'confidence': 'high'
                    })
            else:
                # Use statistical outlier detection
                anomalies.append({
                    'section_id': section_id,
                    'reason': f'PCI value ({row[pci_col]}) is outside normal range ({lower_bound:.1f}-{upper_bound:.1f})',
                    'review_type': 'desktop',
                    'confidence': 'high' if (row[pci_col] < lower_bound - IQR or row[pci_col] > upper_bound + IQR) else 'medium'
                })
    
    return anomalies

def detect_distress_inconsistencies(data, section_id_col):
    """
    Detect inconsistent distress patterns
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    section_id_col (str): Name of section ID column
    
    Returns:
    list: Anomalies related to inconsistent distress patterns
    """
    anomalies = []
    distress_columns = get_distress_columns(data)
    
    if distress_columns:
        # Look for inconsistent combinations of distresses
        for idx, row in data.iterrows():
            # Example rule: High severity transverse cracking without any longitudinal cracking is suspicious
            if ('transverse_crack_high' in distress_columns and 
                'longitudinal_crack' in ''.join(distress_columns) and
                row.get('transverse_crack_high', 0) > 3 and
                all(row.get(col, 0) < 1 for col in distress_columns if 'longitudinal_crack' in col)):
                
                anomalies.append({
                    'section_id': row[section_id_col],
                    'reason': 'Inconsistent distress pattern: high transverse cracking without longitudinal cracking',
                    'review_type': 'field',
                    'confidence': 'medium'
                })
    
    return anomalies

def detect_deterioration_anomalies(current_data, historical_data, maintenance_data, section_id_col):
    """
    Detect unrealistic deterioration rates
    
    Parameters:
    current_data (pandas.DataFrame): Current PMP data
    historical_data (pandas.DataFrame): Historical PMP data 
    maintenance_data (pandas.DataFrame): Maintenance history data
    section_id_col (str): Name of section ID column
    
    Returns:
    list: Anomalies related to deterioration rates
    """
    anomalies = []
    
    # Find common sections between current and historical data
    common_sections = set(current_data[section_id_col]).intersection(set(historical_data[section_id_col]))
    
    # Get PCI columns
    pci_col_current = get_pci_column(current_data)
    pci_col_historical = get_pci_column(historical_data)
    
    if not pci_col_current or not pci_col_historical:
        return anomalies
    
    # Get date columns
    date_cols_current = get_date_columns(current_data)
    date_cols_historical = get_date_columns(historical_data)
    
    if not date_cols_current or not date_cols_historical:
        return anomalies
    
    for section in common_sections:
        current_section = current_data[current_data[section_id_col] == section]
        historical_section = historical_data[historical_data[section_id_col] == section]
        
        try:
            current_date = pd.to_datetime(current_section[date_cols_current[0]].iloc[0])
            historical_date = pd.to_datetime(historical_section[date_cols_historical[0]].iloc[0])
            
            years_diff = (current_date - historical_date).days / 365.25
            
            if years_diff > 0:
                current_pci = current_section[pci_col_current].iloc[0]
                historical_pci = historical_section[pci_col_historical].iloc[0]
                
                pci_change = historical_pci - current_pci
                annual_deterioration = pci_change / years_diff
                
                # Flag if deterioration rate is too high or PCI improved without maintenance
                if annual_deterioration > 15:  # More than 15 points per year is suspicious
                    anomalies.append({
                        'section_id': section,
                        'reason': f'Excessive deterioration rate: {annual_deterioration:.1f} PCI points/year',
                        'review_type': 'field',
                        'confidence': 'high'
                    })
                elif annual_deterioration < -5:  # PCI improved by more than 5 points
                    # Check if maintenance was performed
                    if not maintenance_data.empty and section_id_col in maintenance_data.columns:
                        section_maintenance = maintenance_data[maintenance_data[section_id_col] == section]
                        
                        if section_maintenance.empty:
                            anomalies.append({
                                'section_id': section,
                                'reason': f'PCI improved by {-annual_deterioration:.1f} points/year without recorded maintenance',
                                'review_type': 'desktop',
                                'confidence': 'high'
                            })
        except (ValueError, TypeError, IndexError) as e:
            # Handle date conversion errors
            print(f"Error processing section {section}: {e}")
    
    return anomalies

def detect_maintenance_inconsistencies(current_data, maintenance_data, section_id_col):
    """
    Detect inconsistencies with maintenance history
    
    Parameters:
    current_data (pandas.DataFrame): Current PMP data
    maintenance_data (pandas.DataFrame): Maintenance history data
    section_id_col (str): Name of section ID column
    
    Returns:
    list: Anomalies related to maintenance inconsistencies
    """
    anomalies = []
    
    # Get date columns for maintenance data
    maint_date_cols = get_date_columns(maintenance_data)
    
    if not maint_date_cols:
        return anomalies
    
    # Get PCI column
    pci_col = get_pci_column(current_data)
    
    if not pci_col:
        return anomalies
    
    # Get current data collection date
    date_cols_current = get_date_columns(current_data)
    
    if not date_cols_current:
        return anomalies
    
    for idx, row in current_data.iterrows():
        section = row[section_id_col]
        section_maintenance = maintenance_data[maintenance_data[section_id_col] == section]
        
        if section_maintenance.empty:
            continue
        
        try:
            current_pci = row[pci_col]
            current_date = pd.to_datetime(row[date_cols_current[0]])
            latest_maintenance_date = pd.to_datetime(section_maintenance[maint_date_cols[0]]).max()
            
            # If maintenance was done within 2 years before data collection
            if latest_maintenance_date <= current_date and (current_date - latest_maintenance_date).days / 365.25 <= 2:
                maint_type_cols = [col for col in maintenance_data.columns if 'type' in col.lower() or 'work' in col.lower()]
                
                if maint_type_cols:
                    # Get type of latest maintenance
                    latest_maint_idx = section_maintenance[maint_date_cols[0]].idxmax()
                    maint_type = section_maintenance.loc[latest_maint_idx, maint_type_cols[0]]
                    
                    # Major treatments should result in high PCI
                    major_treatments = ['rehabilitation', 'overlay', 'reconstruction', 'mill and fill']
                    if any(treatment in str(maint_type).lower() for treatment in major_treatments) and current_pci < 85:
                        anomalies.append({
                            'section_id': section,
                            'reason': f'Recent {maint_type} but PCI only {current_pci}. Expected > 85',
                            'review_type': 'field',
                            'confidence': 'high'
                        })
        except (ValueError, TypeError, IndexError) as e:
            # Handle date conversion errors
            print(f"Error processing maintenance for section {section}: {e}")
    
    return anomalies

def generate_visualizations(current_data, historical_data, anomalies):
    """
    Generate visualization plots for the data and anomalies
    
    Parameters:
    current_data (pandas.DataFrame): Current PMP data
    historical_data (pandas.DataFrame): Historical PMP data
    anomalies (list): List of detected anomalies
    
    Returns:
    dict: Dictionary of base64-encoded plot images
    """
    plots = {}
    
    try:
        # 1. PCI Distribution
        pci_distribution_plot = generate_pci_distribution(current_data)
        if pci_distribution_plot:
            plots['pci_distribution'] = pci_distribution_plot
        
        # 2. PCI by road category
        pci_by_category_plot = generate_pci_by_category(current_data)
        if pci_by_category_plot:
            plots['pci_by_category'] = pci_by_category_plot
        
        # 3. Comparison of current vs historical PCI
        if not historical_data.empty:
            pci_comparison_plot = generate_pci_comparison(current_data, historical_data)
            if pci_comparison_plot:
                plots['pci_comparison'] = pci_comparison_plot
        
        # 4. Map of anomalies if geo data is available
        anomaly_map_plot = generate_anomaly_map(current_data, anomalies)
        if anomaly_map_plot:
            plots['anomaly_map'] = anomaly_map_plot
    
    except Exception as e:
        print(f"Error generating visualizations: {e}")
    
    return plots

def generate_pci_distribution(data):
    """
    Generate PCI distribution histogram
    
    Parameters:
    data (pandas.DataFrame): Dataset to visualize
    
    Returns:
    str or None: Base64-encoded image or None if visualization failed
    """
    pci_col = get_pci_column(data)
    
    if not pci_col:
        return None
    
    plt.figure(figsize=(10, 6))
    sns.histplot(data[pci_col], kde=True)
    plt.title('Distribution of PCI Values')
    plt.xlabel('PCI')
    plt.ylabel('Frequency')
    
    return save_plot_to_base64()

def generate_pci_by_category(data):
    """
    Generate PCI by road category boxplot
    
    Parameters:
    data (pandas.DataFrame): Dataset to visualize
    
    Returns:
    str or None: Base64-encoded image or None if visualization failed
    """
    pci_col = get_pci_column(data)
    category_cols = get_category_columns(data)
    
    if not pci_col or not category_cols:
        return None
    
    plt.figure(figsize=(12, 6))
    sns.boxplot(x=category_cols[0], y=pci_col, data=data)
    plt.title('PCI by Road Category')
    plt.xticks(rotation=45)
    
    return save_plot_to_base64()

def generate_pci_comparison(current_data, historical_data):
    """
    Generate comparison of current vs historical PCI
    
    Parameters:
    current_data (pandas.DataFrame): Current PMP data
    historical_data (pandas.DataFrame): Historical PMP data
    
    Returns:
    str or None: Base64-encoded image or None if visualization failed
    """
    # Extract section IDs for consistent referencing
    section_id_col = get_section_id_column(current_data)
    
    # Get PCI columns
    pci_col_current = get_pci_column(current_data)
    pci_col_historical = get_pci_column(historical_data)
    
    if not pci_col_current or not pci_col_historical or section_id_col not in historical_data.columns:
        return None
    
    # Find common sections
    common_sections = set(current_data[section_id_col]).intersection(set(historical_data[section_id_col]))
    
    if not common_sections:
        return None
    
    comparison_data = []
    
    for section in common_sections:
        try:
            current_pci = current_data[current_data[section_id_col] == section][pci_col_current].iloc[0]
            historical_pci = historical_data[historical_data[section_id_col] == section][pci_col_historical].iloc[0]
            
            comparison_data.append({
                'section_id': section,
                'current_pci': current_pci,
                'historical_pci': historical_pci
            })
        except (IndexError, KeyError) as e:
            print(f"Error processing comparison for section {section}: {e}")
    
    if not comparison_data:
        return None
    
    comparison_df = pd.DataFrame(comparison_data)
    
    plt.figure(figsize=(10, 10))
    plt.scatter(comparison_df['historical_pci'], comparison_df['current_pci'], alpha=0.6)
    
    # Add reference line for no change
    min_val = min(comparison_df['historical_pci'].min(), comparison_df['current_pci'].min())
    max_val = max(comparison_df['historical_pci'].max(), comparison_df['current_pci'].max())
    plt.plot([min_val, max_val], [min_val, max_val], 'r--')
    
    plt.title('Historical vs Current PCI Comparison')
    plt.xlabel('Historical PCI')
    plt.ylabel('Current PCI')
    
    return save_plot_to_base64()

def generate_anomaly_map(data, anomalies):
    """
    Generate map of anomalies
    
    Parameters:
    data (pandas.DataFrame): Dataset to visualize
    anomalies (list): List of detected anomalies
    
    Returns:
    str or None: Base64-encoded image or None if visualization failed
    """
    if 'longitude' not in data.columns or 'latitude' not in data.columns:
        return None
    
    # Extract section IDs for consistent referencing
    section_id_col = get_section_id_column(data)
    
    # Create flag for anomalies
    anomaly_sections = [a['section_id'] for a in anomalies]
    data_copy = data.copy()
    data_copy['is_anomaly'] = data_copy[section_id_col].isin(anomaly_sections)
    
    plt.figure(figsize=(12, 8))
    sns.scatterplot(
        x='longitude', 
        y='latitude', 
        hue='is_anomaly',
        palette={True: 'red', False: 'blue'},
        data=data_copy
    )
    plt.title('Geographic Distribution of Anomalies')
    plt.xlabel('Longitude')
    plt.ylabel('Latitude')
    
    return save_plot_to_base64()

def save_plot_to_base64():
    """
    Save current matplotlib plot to a base64 string
    
    Returns:
    str: Base64-encoded image
    """
    try:
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        image_png = buffer.getvalue()
        return base64.b64encode(image_png).decode('utf-8')
    except Exception as e:
        print(f"Error saving plot: {e}")
        return None
    finally:
        plt.close('all')
        buffer.close()
