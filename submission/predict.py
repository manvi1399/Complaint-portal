import sys
import pickle
import re

# 1. Load the trained model
try:
    with open('complaint_model.pkl', 'rb') as f:
        model = pickle.load(f)
except FileNotFoundError:
    print("Error: Model file 'complaint_model.pkl' not found.")
    sys.exit(1)
except Exception as e:
    print(f"Error loading model: {e}")
    sys.exit(1)

# 2. Preprocessing Function (Must match the training script)
def preprocess_text(text):
    text = text.lower()
    text = re.sub(r'[^a-zA-Z\u0900-\u097F\s]', '', text)
    text = " ".join(text.split())
    return text

# 3. Main Prediction Logic
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: No complaint text provided.")
        sys.exit(1)
    
    complaint_text = sys.argv[1]
    
    try:
        # Preprocess and Predict
        processed_text = preprocess_text(complaint_text)
        prediction = model.predict([processed_text])[0]
        
        # Simple Rule-based Severity Logic for Submission
        severity = "Medium"
        critical_keywords = ["leak", "burst", "open", "dangerous", "accident", "manhole", "flood"]
        if any(word in processed_text for word in critical_keywords):
            severity = "High"
        
        # Output the result as "Category,Severity"
        print(f"{prediction},{severity}")
    except Exception as e:
        print(f"Error during prediction: {e}")
        sys.exit(1)
