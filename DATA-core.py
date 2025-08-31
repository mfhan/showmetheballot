#!/usr/bin/env python
# coding: utf-8

# In[ ]:


import warnings
from IPython.core.interactiveshell import InteractiveShell
from IPython.display import display, Markdown, HTML, Javascript
from tqdm import tqdm


def alert(message='Loop completed!'):
    # Check if the system supports 'say' and notifications
    os.system(f'osascript -e \'display notification "{message}" with title "Notification"\'')
    # Speak the alert
    os.system(f'say "{message}"')        

InteractiveShell.ast_node_interactivity = "all"
warnings.filterwarnings("ignore")
tqdm.pandas()


# In[2]:


import geopandas as gpd
import pandas as pd


# In[5]:


area_df = gpd.read_file('data/raw/areas.shp')
area_df['latlng'] = area_df.lookup_lat.fillna(area_df.center_lat).apply(eval)
area_df = area_df.rename(columns={'intersecti': 'intersection_id'})
area_df.head()


# In[ ]:


area_df['district'] = area_df.district.str.replace('00', '01')


# # Define Ballotpedia API lookup
# 
# Caches and retrieves Ballotpedia geographic data for a given latitude/longitude. Uses polite rate limiting and request headers. Function has a 100,000 item cache to avoid duplicate API calls.

# In[6]:


import requests
from functools import lru_cache

@lru_cache(maxsize=100_000)
def get_ballotpedia_data_rigorous(lat, lng, rate_limit=2):
    url = "https://api4.ballotpedia.org/myvote_redistricting_with_historical"
    params = {
        'long': str(lng),
        'lat': str(lat),
        'include_volunteer': 'true'
    }
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Referer': 'https://sblv3.ballotpedia.org/',
        'Origin': 'https://sblv3.ballotpedia.org'
    }

    response = requests.get(url, params=params, headers=headers)

    # Rate limit
    time.sleep(rate_limit)

    if response.json().get('message') == 'Forbidden':
        raise PermissionError

    return response.json()



# # Define processing functions
# 
# Functions to transform raw API election data into a structured format:
# - Process ballot measures and candidate information
# - Calculate decision metrics (number of races and options)
# - Format final output as a pandas DataFrame with location data

# In[7]:


import pandas as pd
from typing import Dict, List, Optional
from collections import defaultdict

def extract_election_data(api_response: Dict) -> List[Dict]:
    return api_response.get('data', {}).get('elections', [])

def process_ballot_measure(measure: Dict, common_data: Dict) -> Dict:
    return {
        **common_data,
        'race_type': 'Ballot Measure',
        'office.name': measure['name'],
        'office.type': 'Ballot Measure',
        'office.level': common_data['district_type'],
        'office.branch': 'N/A',
        'number_of_seats': 1,
        'person.name': 'Yes/No Question',
        'person.url': None,
        'party_affiliation': None,
        'status': 'On the Ballot',
        'is_incumbent': False,
        'running_mate.name': None,
        'measure_id': measure['id'],
        'measure_district_type': measure['district_type']
    }

def process_candidate(candidate: Dict, race: Dict, common_data: Dict) -> Dict:
    office = race['office']
    return {
        **common_data,
        'race_type': 'Candidate',
        'office.name': office['name'],
        'office.type': office['type'],
        'office.level': office['level'],
        'office.branch': office['branch'],
        'number_of_seats': race['number_of_seats'],
        'person.name': candidate['person']['name'],
        'person.url': candidate['person']['url'],
        'party_affiliation': candidate['party_affiliation'],
        'status': candidate['status'],
        'is_incumbent': candidate['is_incumbent'],
        'running_mate.name': candidate['running_mate']['name'] if candidate.get('running_mate') else None,
        'measure_id': None,
        'measure_district_type': None
    }

def process_district(district: Dict, election_date: str) -> List[Dict]:
    common_data = {
        'election_date': election_date,
        'district_name': district['name'],
        'district_type': district['type']
    }

    ballot_measures = [process_ballot_measure(measure, common_data) for measure in district.get('ballot_measures') or []]
    candidates = [process_candidate(candidate, race, common_data) 
                  for race in district.get('races')  or []
                  for candidate in race['candidates']]

    return ballot_measures + candidates

def calculate_decision_metrics(df: pd.DataFrame) -> pd.DataFrame:
    def count_decisions_and_options(group):
        decisions = defaultdict(int)
        for _, row in group.iterrows():
            if row['race_type'] == 'Ballot Measure':
                decisions[row['office.name']] = 2  # Yes/No options
            else:
                decisions[row['office.name']] += 1

        unique_decisions = len(decisions)
        total_options = sum(decisions.values())

        group['unique_decisions'] = unique_decisions
        group['total_options'] = total_options
        return group

    return df.groupby(['district_name', 'district_type']).apply(count_decisions_and_options).reset_index(drop=True)

def process_api_response(api_response: Dict, lat: float, lng: float) -> Optional[pd.DataFrame]:
    if not api_response:
        return None

    elections = extract_election_data(api_response)
    if not elections:
        return None

    processed_data = [
        item for election in elections
        for district in election['districts']
        for item in process_district(district, election['date'])
    ]

    df = pd.DataFrame(processed_data)
    df['group_id'] = df.groupby(['district_name', 'district_type']).ngroup()
    df['lat'], df['lng'] = lat, lng

    df = calculate_decision_metrics(df)

    return df


# # Define main processing loop
# 
# Processes and accumulates data for each geographic point through the Ballotpedia API

# In[8]:


import json
result_df = pd.read_csv('data/archive/results_2024-11-03.csv')


# In[9]:


result_df['zip'] = result_df.zip.astype(str)
result_df['district'] = result_df.district.astype(str).str.slice(-2)
result_df['lat'] = result_df.lat.astype(str).str.slice(0, 12)
result_df['lng'] = result_df.lng.astype(str).str.slice(0, 12)
response_lookup = dict(result_df
                       .drop_duplicates(['zip', 'lat', 'lng'])
                       .set_index(['zip', 'lat', 'lng'])
                       .response.apply(json.loads))
response_lookup.update(dict(result_df
                            .drop_duplicates(['zip', 'county', 'district'])
                            .set_index(['zip', 'county', 'district'])
                            .response.apply(json.loads)))


# In[10]:


import os
import time

def process_dataframe(df):
    all_results = []

    for row in tqdm(df.itertuples(), total=len(df), desc="Processing rows"):

        lat, lng = row.latlng
        key1 = (str(int(row.zip)), str(lat)[:12], str(lng)[:12])
        key2 = (f'{int(row.zip):05}', str(lat)[:12], str(lng)[:12])
        key3 = (str(int(row.zip)), row.county, row.district)
        key4 = (str(int(row.zip)), row.county, None)
        key5 = (str(int(row.zip)), row.county, 'ne')
        key6 = (str(int(row.zip)), row.county, '00')
        key7 = (str(int(row.zip)), row.county, '01')
        for key_ in [key1, key2, key3, key4, key5, key6, key7]:
            if key_ in response_lookup:
                break
        key = key_
        if key in response_lookup:
            response = response_lookup[key]
        else:
            response = None
            for i in range(60):
                try:
                    response = get_ballotpedia_data_rigorous(lat, lng, rate_limit=0.1)
                    if response['data']['districts'] is not None:
                        response['data']['districts'][0]
                    break
                except PermissionError:
                    if i == 0:
                        print('PermissionError:', lat, lng, row.state, row.county)
                    os.system('say "beep"')  # Uses system text-to-speech to make a sound
                    time.sleep(3**(i))
                    continue
                except Exception as e:
                    print('Exception:', e, lat, lng, row.state, row.county)
                    print(response)
                    print(e)
                    time.sleep(2**(i))
                    continue

        result_df = process_api_response(response, lat, lng)
        if result_df is None:
            display(row.zip)
            display(row.county)
            display(row.district)
            continue
        else:
            response_lookup[row.zip, row.county, row.district] = response

        result_df['response'] = json.dumps(response)
        result_df['intersection_id'] = row.intersection_id
        result_df['district'] = row.district
        result_df['county'] = row.county
        result_df['state'] = row.state
        result_df['zip'] = row.zip
        result_df['geometry'] = row.geometry
        results = result_df.to_dict(orient='records')

        all_results.extend(results)

    return pd.DataFrame(all_results)


# In[11]:


result_df = process_dataframe(area_df)


# In[12]:


result_df['district'] = result_df.district.str.replace('00', '01')
import re

def extract_type_district_numbers(text, state):
    # Regular expression pattern to match <TYPE> District <NUMBER>
    pattern = f'U\\.S\\. House \\b{state}\\b (?:D|d)istrict (\\d+)'
    matches = re.findall(pattern, text)

    # Return matches as a list of tuples with <TYPE> and <NUMBER>
    return (matches or [None])[0]


# In[13]:


state_id_lookup = dict(zip(area_df.state, area_df.state_id))


# In[14]:


result_df['state_id'] = result_df.state.map(state_id_lookup)
result_df['district'] = result_df.progress_apply(
    lambda x: f'{x.state_id}-CD{int(str(x.district)[-2:]):02}'
    if x.district is not None and str(x.district)[-3:] != 'nan' else None, axis=1
)
result_df['extracted_district'] = result_df.progress_apply(
    lambda x: extract_type_district_numbers(x.response, x.state) or 0, axis=1
)
result_df['extracted_district'] = result_df.progress_apply(
    lambda x: f'{x.state_id}-CD{int(x.extracted_district):02}', axis=1
)


# In[15]:


result_df['district'] = result_df.district.fillna(result_df.extracted_district)


# In[16]:


index = (result_df.district != result_df.extracted_district) & (~result_df.extracted_district.str.endswith('00'))
result_df.loc[index, 'extracted_district'].value_counts()
result_df.loc[index, 'district'] = result_df.loc[index, 'extracted_district']


# In[17]:


from datetime import date

today = date.today().strftime("%Y-%m-%d")

result_df[[
    'zip', 'county', 'district', 'state', 'lat', 'lng', 'response'
]].drop_duplicates(['zip', 'county', 'district']).to_csv(f'data/archive/results_{today}.csv')


# In[18]:


alert('Complete!')


# # Define ballot complexity analyzer
# 
# Function to analyze ballot complexity using GPT-4:
# - Identifies non-partisan contests
# 
# Uses structured Pydantic models to validate GPT-4 outputs.

# In[19]:


import json
import os
import re

from typing import List, Optional, Union, Literal
from pydantic import BaseModel, Field
from openai import OpenAI
from functools import lru_cache
from typing import List
from collections import Counter

# Initialize OpenAI client
# client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class NonPartisanContest(BaseModel):
    is_non_partisan: bool


# In[20]:


# Updated prompt for remaining indicators and analysis
SYSTEM_PROMPT = """
Determine if this is a non-partisan election contest.

Non-partisan contests typically:
- Don't list party affiliations
- Include local offices like school boards, city councils
- Include most judicial positions
- Are specifically designated as non-partisan

Partisan contests typically:
- List party affiliations
- Include races for Congress, President, Governor
- Are primary elections for political parties
- Include party committee positions

Provide analysis in JSON format:
{
    "is_non_partisan": boolean
}
"""
# Function to analyze a single ballot
@lru_cache(maxsize=100_000)
def analyze_race(race):

    # Create prompt for remaining analysis
    prompt = f"""
    Analyze the following race:
    {race}

    Provide the analysis in the specified structured JSON format.
    """

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            temperature=0.0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            response_format=NonPartisanContest
        )

        # Parse the JSON response
        analysis = json.loads(completion.choices[0].message.content)
        return analysis['is_non_partisan']
    except Exception as e:
        print(f"Error analyzing ballot: {e}")
        return None


# # Define ballot formatting functions
# 
# Functions to create a markdown-formatted ballot display:
# - Sorts races by importance (President → Federal → State → Local → Measures)
# - Formats candidate details including party, incumbent status, and links
# - Creates checkboxes for voting options

# In[21]:


import pandas as pd

def format_and_display_ballot_info(group):
    # Sort the races
    sorted_group = sort_races(group)

    # Start building the markdown output
    markdown_output = f"# Ballot for {sorted_group['county'].iloc[0]} County, {sorted_group['state'].iloc[0]}\n\n"
    markdown_output += f"Election Date: {sorted_group['election_date'].iloc[0]}\n\n"

    # Process races by office
    outputs = []
    for office, office_group in sorted_group.groupby('office.name'):
        outputs.append((format_office(office, office_group), office_group.key.iloc[0]))

    outputs.sort(key=lambda x: x[1])
    for output, key in outputs:
        markdown_output += output

    return markdown_output

def sort_races(group):
    def race_priority(row):
        office = row['office.name'].lower()
        if row['race_type'] == 'Ballot Measure':
            return 5
        elif 'president' in office:
            return 0
        elif office.startswith('u.s.'):
            return 1
        elif 'governor' in office:
            return 2
        elif row['office.level'] == 'State':
            return 3
        else:
            return 4

    group['key'] = group.apply(race_priority, axis=1)
    group = group.sort_values(by='key')

    return group

def format_office(office, office_group):
    first_row = office_group.iloc[0]
    output = f"## {office}\n\n"

    if first_row['race_type'] == 'Ballot Measure':
        output += format_ballot_measure(first_row)
    else:
        output += format_candidate_race(office_group)

    output += "---\n\n"
    return output

def format_ballot_measure(measure):
    output = f"**Type:** Ballot Measure\n"
    output += f"**Level:** {measure['measure_district_type']}\n\n"
    return output

def format_candidate_race(race_group):
    first_row = race_group.iloc[0]
    output = f"**Level:** {first_row['office.level']}\n"
    output += f"**Branch:** {first_row['office.branch']}\n"
    output += f"**Number of Seats:** {first_row['number_of_seats']}\n\n"
    output += "### Candidates:\n"

    for _, candidate in race_group.iterrows():
        output += format_candidate(candidate)

    return output

def format_candidate(candidate):
    party = candidate['party_affiliation']
    party_name = party[0]['name'] if isinstance(party, list) and party else 'Unknown'

    output = f"- **{candidate['person.name']}** ({party_name})\n"
    bullets = []
    if pd.notna(candidate['running_mate.name']):
        bullets.append(f"Running Mate: {candidate['running_mate.name']}\n")
    if pd.notna(candidate['person.url']):
        bullets.append(f"[More Info]({candidate['person.url']})\n")
    if len(bullets) > 1:
        output += '    - ' + '    - '.join(bullets)
    else:
        output += ''.join(bullets)
    output += "\n"
    return output


# In[22]:


for markdown_output in result_df.iloc[:10000].groupby(['intersection_id', 'state']).apply(format_and_display_ballot_info):
    print(markdown_output)
    display(Markdown(markdown_output))
    break


# In[23]:


import markdown
from bs4 import BeautifulSoup

def count_markdown_words(md_text):
    # Convert Markdown to HTML
    html = markdown.markdown(md_text)
    # Extract text from HTML
    text = BeautifulSoup(html, 'html.parser').get_text()
    # Count words
    return len(text.split())


# In[24]:


tqdm.pandas()

rows = []
for group_name, group in tqdm(result_df.groupby(['intersection_id', 'state'])):
    subset = [c for c in group.columns if c not in ['lat', 'lng', 'group_id', 'zip']]
    ballot_text = format_and_display_ballot_info(group.drop_duplicates(['office.name', 'person.name']))

    races = [format_office(office, office_group)
             for office, office_group in group.groupby('office.name')
             if office_group.iloc[0].race_type != 'Ballot Measure']

    measures = [format_office(office, office_group)
                for office, office_group in group.groupby('office.name')
                if office_group.iloc[0].race_type == 'Ballot Measure']

    comp_races = [format_office(office, office_group)
                  for office, office_group in group.groupby('office.name')
                  if office_group.iloc[0].race_type != 'Ballot Measure' and len(office_group) > office_group.iloc[0].number_of_seats]

    non_partisan_races = [r.strip('# ').split('\n')[0] for r in races if 'nonpartisan' in r.lower()]
    ballot_length = len(ballot_text)
    word_count = count_markdown_words(ballot_text)

    row = {
        'intersection_id': group_name[0],
        'lat': group['lat'].iloc[0], 'lng': group['lng'].iloc[0],
        'zip': int(group['zip'].iloc[0]),
        'response': group['response'].iloc[0],
        'ballot_markdown': ballot_text, 
        'state_name': group_name[1],
        'county': group['county'].iloc[0],
        'district': group['district'].iloc[0],
        'unique_decisions':  group['office.name'].nunique(),
        'measures': measures,
        'races': races,
        'comp_races': comp_races,
        'non_partisan_races': non_partisan_races,
        "ballot_length": ballot_length,
        "word_count": word_count,
        'geometry': group['geometry'].iloc[0],
        'total_options': (group.race_type == 'Ballot Measure').sum() * 2 + (group.race_type != 'Ballot Measure').sum()
    }
    rows.append(row)

full_df = pd.DataFrame(rows).set_index(['intersection_id', 'state_name'])


# # Define readability calculator
# 
# Function to calculate Flesch-Kincaid Grade Level score for ballot text:
# - Strips markdown formatting
# - Returns reading grade level (higher score = more complex)

# In[25]:


import re
from textstat import flesch_kincaid_grade

def calculate_flesch_kincaid(text):
    # Remove any markdown formatting
    clean_text = re.sub(r'[#*_`]', '', text)

    # Calculate Flesch-Kincaid Grade Level
    grade_level = flesch_kincaid_grade(clean_text)

    return round(grade_level, 2)


# In[26]:


# Apply the analysis to the DataFramerow['ballot_markdown'])
full_df['flesch_kincaid_grade'] = full_df.ballot_markdown.progress_apply(calculate_flesch_kincaid)
full_df['grade_level'] = full_df.flesch_kincaid_grade.apply(lambda x: f'{x:.1f}')


# In[27]:


full_df = full_df[full_df.ballot_markdown.notna()]


# # Calculate complexity scores
# 
# Function to compute weighted ballot complexity scores based on multiple factors:
# - Technical language and readability (Flesch-Kincaid)
# - Ballot length and word count 
# - Information density
# - Number and complexity of decisions
# - Non-partisan contest presence
# 
# Each factor is normalized against maximum values across all ballots.

# In[28]:


full_df['avg_words_per_decision'] = full_df.word_count / full_df.unique_decisions
full_df['avg_options_per_decision'] = full_df.total_options / full_df.unique_decisions


# In[29]:


def calculate_complexity_score(ballot_analysis, max_avg_options_per_decision, max_avg_words_per_decision, max_unique_decisions,
                               max_ballot_length, max_word_count, max_flesch_kincaid_grade):
    # Define weights for each indicator
    weights = {
        'ballot_length': 0.175,
        'word_count': 0.125,
        'avg_words_per_decision': 0.125,
        'unique_decisions': 0.15,
        'non_partisan_contests': 0.075,  # increased by 0.025
        'avg_options_per_decision': 0.125,
        'flesch_kincaid_grade': 0.125
    }    
    # Extract values with nested field access where necessary
    score = (
        (ballot_analysis['ballot_length'] * weights['ballot_length'] / max_ballot_length) +
        (ballot_analysis['word_count'] * weights['word_count'] / max_word_count) +
        (ballot_analysis['avg_words_per_decision'] * weights['avg_words_per_decision'] / max_avg_words_per_decision) +
        (ballot_analysis['avg_options_per_decision'] * weights['avg_options_per_decision'] / max_avg_options_per_decision) +
        (ballot_analysis['unique_decisions'] * weights['unique_decisions'] / max_unique_decisions) +
        (ballot_analysis['flesch_kincaid_grade'] * weights['flesch_kincaid_grade'] / max_flesch_kincaid_grade) +
        (int(not not ballot_analysis['non_partisan_races']) * weights['non_partisan_contests'])
    )

    return score

full_df['complexity_score'] = full_df.apply(
    calculate_complexity_score,
    max_ballot_length=full_df.ballot_length.max(),
    max_word_count=full_df.word_count.max(),
    max_avg_words_per_decision=full_df.avg_words_per_decision.max(),
    max_avg_options_per_decision=full_df.avg_options_per_decision.max(),
    max_unique_decisions=full_df.unique_decisions.max(),
    max_flesch_kincaid_grade=full_df.flesch_kincaid_grade.max(),
    axis=1
)


# In[30]:


full_df['percentile'] = (full_df.complexity_score.rank() / len(full_df)) * 100


# In[31]:


# # Sort and identify highest and lowest complexity ballots

full_df_sorted = full_df.reset_index().drop_duplicates('intersection_id').sort_values('complexity_score', ascending=False)
full_df_sorted['zip_count'] = full_df_sorted.zip.map(dict(full_df_sorted.zip.value_counts()))

highest_complexity = full_df_sorted.head(20000)
lowest_complexity = full_df_sorted.tail(50000)

highest_complexity[['zip', 'county', 'district', 'state_name', 'complexity_score', 'zip_count']].drop_duplicates(['state_name'], keep='first').head(10)
lowest_complexity[['zip', 'county', 'district', 'state_name', 'complexity_score', 'zip_count']].drop_duplicates(['state_name'], keep='last').tail(10)


# # Define report generator
# 
# Function to create a markdown-formatted ballot complexity report with:
# - Overall complexity score
# - Decision complexity metrics (unique decisions, options, density)
# - Language complexity (Flesch-Kincaid grade level)
# - Ballot length statistics
# - AI analysis disclaimer

# In[32]:


def get_report_markdown(ballot_report, complexity_score):
    # Generate Markdown report with AI disclaimer
    report_md = f"""# Ballot Complexity Report

*This report provides an AI-assisted analysis of ballot complexity. Please note that this is a supplementary analysis and not a substitute for official election information.*

**This ballot is more complex than {str(round(ballot_report['percentile']) or 1).replace('100', '99')} percent of U.S. Ballots.**
|                         |                                 |                                          |
|-------------------------|---------------------------------|------------------------------------------|
| **Decision Complexity** | Number of Questions             | {ballot_report['unique_decisions']}      |
|                         | Average Words per Question      | {ballot_report['avg_words_per_decision']:.1f}|
|                         | Average Options per Question    | {ballot_report['avg_options_per_decision']:.1f}|
|                         | Number of Races                 | {len(ballot_report['races'])}|
|                         | Number of Competitive Races     | {len(ballot_report['comp_races'])}|
|                         | Number of Ballot Measures       | {len(ballot_report['measures'])}|
"""

    # Conditionally add Non-Partisan Contests
    if ballot_report['non_partisan_races']:
        report_md += "|                         | Non-Partisan Races  | " + ", ".join(ballot_report['non_partisan_races'][:3]) + " |\n"

    # Language Complexity Section
    report_md += f"""| **Language Complexity** | [Flesch-Kincaid Grade Level](https://ballotpedia.org/Ballot_measure_readability_scores,_2024#Flesch-Kincaid_Grade_Level)""" + \
    f"""| {ballot_report['flesch_kincaid_grade']}  years of education      |
"""
    # Length Section
    report_md += f"""| **Length**              | Ballot Length                 | {ballot_report['ballot_length']:,} characters       |
|                         | Word Count                     | {ballot_report['word_count']:,}                         |
"""
    return report_md.replace('.0', '')


# In[33]:


pop_df = pd.read_csv('data/raw/zip_code_demographics.csv')
population_lookup = dict(zip(pop_df.zip.astype(str), pop_df.population))
state_id_lookup = dict(zip(pop_df.zip.astype(str), pop_df.state_id))


# In[34]:


full_df['zip'] = full_df.zip.apply(lambda x: f'{int(x):05}').astype(str)
full_df['population'] = full_df.zip.map(population_lookup)
full_df = full_df.sort_values(by='population', ascending=False)

zip_lookup = full_df.reset_index().rename(columns={
    'county_name': 'county',
    'state_name': 'state',
})[['state', 'county', 'zip', 'population']]

zip_lookup = zip_lookup.sort_values(by='population', ascending=False).drop(columns=['population'])
zip_lookup = zip_lookup.drop_duplicates(['state', 'county', 'zip'])
zip_lookup.head()

zip_lookup.to_csv('data/processed/zip_lookup.csv', index=False)


# In[35]:


full_df['full_markdown'] = full_df.apply(
    lambda x: get_report_markdown(x, x.complexity_score), axis=1
) + '\n---\n' + full_df.ballot_markdown


# In[36]:


COLUMNS = {
    'unique_decisions': 'unique_questions',
    'avg_words_per_decision': 'avg_words_per_question',
    'avg_options_per_decision': 'avg_options_per_question',
    'races': 'races',
    'measures': 'measures',
    'avg_words_per_decision': 'avg_words_per_question',
    'comp_races': 'competitive_races',
    'non_partisan_races': 'non_partisan_races',
    'flesch_kincaid_grade': 'flesch_kincaid_grade',
    'ballot_length': 'ballot_length',
    'word_count': 'word_count'
}


# In[37]:


from collections import defaultdict

full_df['population'] = full_df.zip.map(population_lookup)
full_df['state_id'] = full_df.zip.map(state_id_lookup)
data_lookup = full_df.reset_index().sort_values(by='population', ascending=False).rename(columns={
    'county_name': 'county',
    'state_name': 'state',
    **COLUMNS
})[['state', 'district', 'county', 'zip', 'full_markdown', *COLUMNS.values()]].drop_duplicates(
    ['state', 'district', 'county', 'zip']
)


# In[38]:


grouping = ['state', 'district', 'county', 'zip', 'full_markdown']
data_lookup = data_lookup.groupby(grouping).apply(
    lambda df: pd.Series({
        **df.drop(columns=grouping).to_dict(orient='records')[0],
        'measures': len(df.measures.iloc[0]),
        'races': len(df.races.iloc[0]),
        'competitive_races': len(df.competitive_races.iloc[0]),
        'non_partisan_races': df.non_partisan_races.iloc[0],
    })
).reset_index()
data_lookup['district'] = data_lookup.district.str.replace('00', '01')
data_lookup['district'] = data_lookup.district.str.replace('DC-CD98', '')


# In[39]:


alert('Data Lookup Complete')


# In[40]:


from IPython.display import display, Markdown
display(Markdown(data_lookup.full_markdown.sample(1).iloc[0]))


# In[41]:


from datetime import date

today = date.today().strftime("%Y%m%d")
data_lookup.to_csv(f'data/archive/data.csv')
data_lookup.to_csv(f'data/archive/data_{today}.csv')
for zip_code in tqdm(data_lookup.zip.unique()):
    data_lookup[data_lookup.zip == zip_code].to_csv(f'data/processed/zip_data_{zip_code}.csv'.lower().replace(' ', ''))


# In[42]:


alert('Files Saved')


# # Make maps

# # TODO
# [x] Percentile rank
# 
# [x] mf212mf@gmail.com
# 
# [x] bbg415bbg
# 
# [x] Percentile Rank for Complexity Score
# 
# [ ] Origin tweet -- edit and send out
# 
# [x] Fix the top ranking

# # TODO
# 
# [ ] Surface outliers
# [ ] Fix charts
# [ ] Add literacy-readbility map
# [ ] Add turnout map

# In[49]:


alert("plots generated")


# # Get NYTimes Data

# In[512]:





# # Perform repairs
# 
# Fix old reports without having to reprocess all the data.

# In[ ]:




