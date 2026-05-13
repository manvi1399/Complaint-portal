import pandas as pd
import numpy as np
import pickle
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import re

# 1. Load Dataset
# Note: dataset.csv should have columns: 'complaint_text' and 'category'
df = pd.read_csv('dataset.csv')

# 2. Text Preprocessing Function
def preprocess_text(text):
    # Convert to lowercase
    text = text.lower()
    # Remove special characters and numbers
    text = re.sub(r'[^a-zA-Z\u0900-\u097F\s]', '', text)
    # Remove extra whitespaces
    text = " ".join(text.split())
    return text

# Apply preprocessing
df['complaint_text'] = df['complaint_text'].apply(preprocess_text)

# 3. Split Data
X_train, X_test, y_train, y_test = train_test_split(
    df['complaint_text'], 
    df['category'], 
    test_size=0.2, 
    random_state=42
)

# 4. Create Pipeline (TF-IDF + Naive Bayes)
model_pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(ngram_range=(1, 2))),
    ('nb', MultinomialNB())
])

# 5. Train Model
print("Training model...")
model_pipeline.fit(X_train, y_train)

# 6. Evaluate
accuracy = model_pipeline.score(X_test, y_test)
print(f"Model Accuracy: {accuracy * 100:.2f}%")

# 7. Save Model and Vectorizer using Pickle
with open('complaint_model.pkl', 'wb') as f:
    pickle.dump(model_pipeline, f)

print("Model saved as complaint_model.pkl")

# 8. Test Prediction
test_complaint = "Sadak par bahut bade gadde hain aur pani bhara hua hai"
prediction = model_pipeline.predict([preprocess_text(test_complaint)])
print(f"Test Prediction: {prediction[0]}")
