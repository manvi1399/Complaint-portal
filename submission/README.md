# Municipality Complaint Portal (India)

## Project Overview
This project is an AI-powered portal designed to automatically categorize municipal complaints into relevant categories such as **Garbage, Water Supply, Road Issues, Sewage, and Street Lights**. The system is built to handle multilingual inputs including **English, Hindi (Devanagari), and Hinglish (Romanized Hindi)**, reflecting the real-world linguistic diversity of Indian citizens.

## Tech Stack
- **Backend:** Java Spring Boot (REST API)
- **ML Model:** Python (scikit-learn, TF-IDF, Naive Bayes)
- **Frontend:** HTML, CSS, Bootstrap (Responsive UI)
- **Database:** MySQL (Optional for storing complaint history)

## Key Features
1. **Multilingual Support:** Seamlessly processes complaints in Hindi, English, and Hinglish.
2. **AI Routing:** Uses a trained Machine Learning model to route complaints to the correct department.
3. **Real-world Context:** Dataset and logic are tailored for Indian municipalities (specifically Jaipur/Mumbai context).
4. **User-friendly Interface:** Simple and intuitive form for citizens to submit grievances.

## How to Run
### 1. ML Model (Python)
- Install dependencies: `pip install pandas scikit-learn`
- From the `submission` folder, run the training script: `python model_train.py`
- This will generate `complaint_model.pkl`.

### 2. Backend (Spring Boot)
- The Java project now uses a standard Spring Boot Maven layout under `src/main/java`.
- Ensure JDK 17+ and Maven are installed.
- From the `submission` folder, run `mvn spring-boot:run`, or run `MunicipalityApplication.java` from your IDE.
- The API will be available at `http://localhost:8080/api/predict`.

Notes:
- `ComplaintController.java` is in `src/main/java/com/municipality/complaint/controller/`
- `ComplaintService.java` is in `src/main/java/com/municipality/complaint/service/`
- If Python or the trained model is unavailable, the service falls back to simple rule-based classification instead of failing completely.

### 3. Frontend
- Open `index.html` in any browser.
- Ensure the backend is running to handle classification requests.

## Dataset Explanation
The dataset consists of 250+ samples of municipal complaints. The data is sourced from public municipal portals (like Jaipur Municipal Corporation and Mumbai BMC) and augmented synthetically to cover a wide range of linguistic variations and common citizen issues.

---
**Developed for Academic Submission • 2026**
