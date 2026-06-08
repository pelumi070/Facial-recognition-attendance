# Smart Attendance System - Project Documentation

This document explains exactly how the Multiface Recognition Attendance System is built, what each technology does, and how the frontend and backend communicate with each other.

---

## 1. Project Architecture
The system follows a standard **Client-Server Architecture**. 
- **The Client (Frontend):** The web pages you see and interact with (HTML, CSS, JavaScript).
- **The Server (Backend):** The Python engine that processes images, does the heavy machine learning lifting, and talks to the database.

---

## 2. The Backend (Python)
The backend is responsible for receiving images from the webcam, identifying faces, and saving attendance logs.

### Technologies Used:
* **FastAPI:** A very fast web framework for Python. It is used to create the "API Endpoints" (`/register`, `/mark_attendance`, `/users`, `/logs`). These endpoints are basically URLs that the frontend can send data to or request data from.
* **OpenCV (`opencv-contrib-python`):** The core Computer Vision library. 
  * We use a Haarcascade (`haarcascade_frontalface_default.xml`) to *detect* where a face is in an image.
  * We use LBPH (`Local Binary Patterns Histograms` Face Recognizer) to *recognize* who that face belongs to.
* **SQLite:** A lightweight database that stores our data in a local file (`attendance.db`).

### Key Files:
* **`backend/database.py`:** 
  This sets up the SQLite database. It creates two tables:
  1. `users`: Stores the user's ID, Name, Student ID, and a mathematical representation of their face (converted to a byte array so the database can store it).
  2. `attendance_logs`: Stores a record linking a `user_id` to the exact `timestamp` they were scanned.

* **`backend/main.py`:**
  This is the brain of the application. 
  * **On Startup:** It loads all the registered faces from the database and "trains" the LBPH AI model so it knows what everyone looks like.
  * **`/register`:** Receives a name, student ID, and an image. It converts the image to grayscale, finds the face, crops it to exactly 200x200 pixels, and saves it to the database. It then re-trains the AI model dynamically.
  * **`/mark_attendance`:** Receives an image from the live scanner. It finds the face, asks the trained AI model to predict who it is, and if it's highly confident (a score lower than 80), it inserts a log into the `attendance_logs` table.
  * **`/logs` & `/users`:** Simple functions that read the database and send the data back to the frontend in a clean JSON format.

---

## 3. The Frontend (Web UI)
The frontend is what the user interacts with in the browser.

### Technologies Used:
* **HTML:** Structures the web page (creating the sidebar, tables, and camera containers).
* **CSS:** Styles the web page to look premium (dark mode, animations, layout).
* **JavaScript (`app.js`):** Adds logic to the web page. It handles clicking buttons, activating your webcam, and sending the camera frames to the Python backend.

### How `app.js` works:
1. **Navigation:** It listens for clicks on the sidebar to switch between the Dashboard, Scanner, and Registration views.
2. **Webcam Access:** Uses `navigator.mediaDevices.getUserMedia` to ask your browser for permission to turn on the camera.
3. **Taking Pictures:** When you click "Register Profile" or "Mark Attendance", JavaScript uses a hidden `<canvas>` element to instantly take a snapshot of the live video feed.
4. **Talking to Python:** It packages that snapshot into a `FormData` object and uses the `fetch()` API to send it to the Python backend at `http://127.0.0.1:8000`.
5. **Dashboard Data:** When you click "Refresh", it asks Python for the latest `/logs` and `/users`, formats the timestamps to your local timezone, and injects them into the HTML tables.

---

## 4. How It All Connects (The Flow)
Here is exactly what happens when a student walks up to the camera:

1. The student clicks **"Mark Attendance"** on the webpage.
2. **JavaScript** takes a snapshot of the webcam video and sends it via HTTP POST to `http://127.0.0.1:8000/mark_attendance`.
3. **FastAPI (Python)** receives the image.
4. **OpenCV** converts the image to black & white, scans it to find a face, and crops the face out.
5. The **LBPH AI Model** looks at the cropped face, compares it to everything it learned during startup, and says: *"I am confident this is User #1"*.
6. **Python** tells the **SQLite Database** to add a new timestamp for User #1.
7. **Python** sends a success message back to the webpage.
8. **JavaScript** receives the success message and displays a green box on the screen.
9. When the teacher goes to the Dashboard and clicks **Refresh**, JavaScript asks Python for the logs, and the new timestamp is displayed on the screen!

---

## Summary
By separating the project into a **Python Backend** (for heavy AI processing) and a **Web Frontend** (for a beautiful user experience), the system remains fast, scalable, and easy to maintain.
