import pandas as pd
def main():
    def custom_parser_v3(line):
        
        parts = line.split("  ")
        parts = [part for part in parts if part.strip()] 

        parsed_fields = []
        for part in parts:
            if ':' in part and 'UTC' in part: 
                parsed_fields.append(part.strip())
            else:
                parsed_fields.extend(part.split())

        if len(parsed_fields) > 10:
            parsed_fields = parsed_fields[:9] + [' '.join(parsed_fields[9:])]
        return parsed_fields
    parsed_data_v3 = []
    file_path = r'M:\sys\net\netstat-v.txt'
    with open(file_path, 'r') as file:
        next(file)
        for line in file:
            if line.strip() and not line.startswith('-'):
                parsed_data_v3.append(custom_parser_v3(line))
    df_custom_v3 = pd.DataFrame(parsed_data_v3, columns=['#', 'PID', 'Proto', 'State', 'Src', 'Dst', 'Process', 'Time', 'Object Address', 'Process Path'])

    #打印表头，转为列表
    return list(df_custom_v3.columns), df_custom_v3.values.tolist()
