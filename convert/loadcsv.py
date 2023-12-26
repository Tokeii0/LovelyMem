import pandas as pd

def load_csvfile(path):
    df = pd.read_csv(path, encoding='utf-8')
    #nan转为""
    df = df.fillna("")
    return list(df.columns), df.values.tolist()

#print(load_csvfile(r'M:\forensic\csv\process.csv'))