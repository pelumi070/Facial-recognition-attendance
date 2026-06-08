from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np
from database import init_db, get_db_connection, encode_array, decode_array
from pydantic import BaseModel
from typing import List
from datetime import datetime
from contextlib import asynccontextmanager

# Initialize OpenCV face detector and LBPH recognizer
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
recognizer = cv2.face.LBPHFaceRecognizer_create()
model_trained = False
user_dict = {} # Maps label ID to user info

def train_model():
    global model_trained, user_dict
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, student_id, face_encoding FROM users")
    users = c.fetchall()
    conn.close()
    
    faces = []
    labels = []
    user_dict.clear()
    
    for user in users:
        # face_encoding now stores the numpy array of the cropped grayscale face image
        face_img = decode_array(user['face_encoding'])
        faces.append(face_img)
        labels.append(user['id'])
        user_dict[user['id']] = {'name': user['name'], 'student_id': user['student_id']}
        
    if len(faces) > 0:
        recognizer.train(faces, np.array(labels))
        model_trained = True
    else:
        model_trained = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    init_db()
    train_model()
    yield
    # Shutdown code (if any)

app = FastAPI(lifespan=lifespan)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/register")
async def register_user(name: str = Form(...), student_id: str = Form(...), image: UploadFile = File(...)):
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Convert image to grayscale for Haarcascade
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Detect face locations
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    if len(faces) == 0:
        raise HTTPException(status_code=400, detail="No face detected in the image.")
    if len(faces) > 1:
        raise HTTPException(status_code=400, detail="Multiple faces detected. Please upload an image with only one face.")
    
    # Crop and standardize the face image
    x, y, w, h = faces[0]
    face_roi = gray[y:y+h, x:x+w]
    face_roi = cv2.resize(face_roi, (200, 200)) # Standardize to 200x200
    
    # Encode face image array
    encoding_blob = encode_array(face_roi)
    
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (name, student_id, face_encoding) VALUES (?, ?, ?)", (name, student_id, encoding_blob))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Student ID already exists.")
    finally:
        conn.close()
        
    # Retrain the model dynamically
    train_model()
    return {"message": "User registered successfully"}

@app.post("/mark_attendance")
async def mark_attendance(image: UploadFile = File(...)):
    global model_trained
    if not model_trained:
        raise HTTPException(status_code=400, detail="Model not trained. Please register at least one user first.")
        
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    if len(faces) == 0:
        raise HTTPException(status_code=400, detail="No face detected.")
    
    recognized_names = []
    conn = get_db_connection()
    c = conn.cursor()
    
    for (x, y, w, h) in faces:
        face_roi = gray[y:y+h, x:x+w]
        face_roi = cv2.resize(face_roi, (200, 200))
        
        # Predict the face
        label_id, confidence = recognizer.predict(face_roi)
        
        # Lower confidence value means a better match in LBPH. Usually < 80 is a strong match.
        if confidence < 80:
            user = user_dict.get(label_id)
            if user:
                c.execute("INSERT INTO attendance_logs (user_id) VALUES (?)", (label_id,))
                conn.commit()
                recognized_names.append(user['name'])
                
    conn.close()
    
    if not recognized_names:
        raise HTTPException(status_code=404, detail="Face not recognized or match confidence too low.")
        
    return {"message": f"Attendance marked for: {', '.join(recognized_names)}"}

@app.get("/logs")
async def get_logs():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT users.name, users.student_id, attendance_logs.timestamp
        FROM attendance_logs
        JOIN users ON attendance_logs.user_id = users.id
        ORDER BY attendance_logs.timestamp DESC
    ''')
    logs = c.fetchall()
    conn.close()
    
    return [{"name": row["name"], "student_id": row["student_id"], "timestamp": row["timestamp"]} for row in logs]

@app.get("/users")
async def get_users():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, student_id FROM users ORDER BY id DESC")
    users = c.fetchall()
    conn.close()
    return [{"id": row["id"], "name": row["name"], "student_id": row["student_id"]} for row in users]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
