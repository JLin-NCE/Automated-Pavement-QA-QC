import pandas as pd

def load_datasets(file_paths):
    """
    Load and combine multiple datasets from file paths
    
    Parameters:
    file_paths (list): List of paths to CSV or Excel files
    
    Returns:
    pandas.DataFrame: Combined dataset
    """
    combined_df = pd.DataFrame()
    
    for file_path in file_paths:
        try:
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path)
            elif file_path.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(file_path)
            else:
                continue
                
            if combined_df.empty:
                combined_df = df
            else:
                # Assuming datasets have common keys to merge on
                # Adjust the merge strategy based on your data structure
                common_cols = list(set(combined_df.columns) & set(df.columns))
                if len(common_cols) > 0:
                    combined_df = pd.merge(combined_df, df, on=common_cols, how='outer')
                else:
                    combined_df = pd.concat([combined_df, df], ignore_index=True)
        except Exception as e:
            print(f"Error loading file {file_path}: {e}")
    
    return combined_df

def get_section_id_column(data):
    """
    Determine the section ID column name in the dataset
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    
    Returns:
    str: Name of the section ID column
    """
    if 'section_id' in data.columns:
        return 'section_id'
    elif 'sectionid' in data.columns:
        return 'sectionid'
    else:
        # Try to find any column that might contain section identifiers
        id_columns = [col for col in data.columns if 'id' in col.lower() or 'section' in col.lower()]
        return id_columns[0] if id_columns else data.index.name or 'index'

def get_pci_column(data):
    """
    Find the PCI column in the dataset
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    
    Returns:
    str or None: Name of the PCI column if found, None otherwise
    """
    if 'pci' in data.columns.str.lower():
        return data.columns[data.columns.str.lower() == 'pci'][0]
    return None

def get_date_columns(data):
    """
    Find date columns in the dataset
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    
    Returns:
    list: List of column names that likely contain dates
    """
    return [col for col in data.columns if 'date' in col.lower()]

def get_distress_columns(data):
    """
    Find columns related to pavement distress in the dataset
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    
    Returns:
    list: List of column names related to pavement distress
    """
    distress_types = [
        'crack', 'rut', 'pothole', 'patch', 'bleed', 'rail', 'swell',
        'raveling', 'weathering', 'aggregate', 'distress'
    ]
    
    return [col for col in data.columns if any(
        distress_type in col.lower() for distress_type in distress_types
    )]

def get_category_columns(data):
    """
    Find columns related to road category or classification
    
    Parameters:
    data (pandas.DataFrame): Dataset to analyze
    
    Returns:
    list: List of column names related to road categories
    """
    category_keywords = ['class', 'category', 'function', 'type']
    
    return [col for col in data.columns if any(
        category in col.lower() for category in category_keywords
    )]