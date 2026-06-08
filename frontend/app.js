const API_URL = 'https://facial-recognition-attendance-3.onrender.com';

// Navigation
const navLinks = document.querySelectorAll('.nav-links li');
const views = document.querySelectorAll('.view-section');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        // Update active nav link
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Show corresponding view
        const targetId = link.getAttribute('data-target');
        views.forEach(view => {
            view.classList.remove('active');
            if (view.id === targetId) {
                view.classList.add('active');
            }
        });

        // Load data if dashboard is clicked
        if (targetId === 'dashboard') {
            fetchDashboardData();
        }
    });
});

// Dashboard Logic
async function fetchDashboardData() {
    const refreshBtn = document.getElementById('refresh-logs');
    const originalText = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Refreshing...';
    refreshBtn.disabled = true;

    try {
        // Fetch Logs
        const logsResponse = await fetch(`${API_URL}/logs`);
        const logs = await logsResponse.json();
        
        const logsTbody = document.querySelector('#logs-table tbody');
        logsTbody.innerHTML = '';
        document.getElementById('total-scans').innerText = logs.length;

        logs.forEach(log => {
            // SQLite returns UTC string "YYYY-MM-DD HH:MM:SS", we format it to ISO 8601 "YYYY-MM-DDTHH:MM:SSZ"
            const isoTime = log.timestamp.replace(' ', 'T') + 'Z';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${log.name}</td>
                <td>${new Date(isoTime).toLocaleString()}</td>
            `;
            logsTbody.appendChild(tr);
        });

        // Fetch Users
        const usersResponse = await fetch(`${API_URL}/users`);
        const users = await usersResponse.json();
        
        const usersTbody = document.querySelector('#users-table tbody');
        usersTbody.innerHTML = '';
        document.getElementById('total-users').innerText = users.length;

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.name}</td>
                <td>${user.student_id}</td>
            `;
            usersTbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error fetching dashboard data:", err);
        alert("Failed to connect to the backend server. Please make sure you are running 'python main.py' in the backend folder.");
    } finally {
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
    }
}

document.getElementById('refresh-logs').addEventListener('click', fetchDashboardData);

// Camera Setup Utilities
async function setupCamera(videoElement) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoElement.srcObject = stream;
            return new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    resolve(videoElement);
                };
            });
        } catch (e) {
            alert('Camera access denied or no camera found.');
            console.error(e);
        }
    }
}

function captureFrame(videoElement, canvasElement) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const ctx = canvasElement.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    return new Promise(resolve => {
        canvasElement.toBlob(blob => {
            resolve(blob);
        }, 'image/jpeg', 0.9);
    });
}

// Live Scanner Logic
const scanVideo = document.getElementById('attendance-video');
const scanCanvas = document.getElementById('attendance-canvas');
const startScanBtn = document.getElementById('start-scan-btn');
const markAttendanceBtn = document.getElementById('mark-attendance-btn');
const scanResult = document.getElementById('scanner-result');

startScanBtn.addEventListener('click', async () => {
    await setupCamera(scanVideo);
    startScanBtn.disabled = true;
    startScanBtn.innerHTML = '<i class="ri-camera-lens-fill"></i> Camera Active';
    markAttendanceBtn.disabled = false;
});

markAttendanceBtn.addEventListener('click', async () => {
    scanResult.className = 'status-message';
    scanResult.innerText = 'Scanning...';
    scanResult.style.display = 'block';

    const blob = await captureFrame(scanVideo, scanCanvas);
    const formData = new FormData();
    formData.append('image', blob, 'frame.jpg');

    try {
        const response = await fetch(`${API_URL}/mark_attendance`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (response.ok) {
            scanResult.className = 'status-message success';
            scanResult.innerText = data.message;
        } else {
            scanResult.className = 'status-message error';
            scanResult.innerText = data.detail || 'Failed to recognize face.';
        }
    } catch (err) {
        scanResult.className = 'status-message error';
        scanResult.innerText = 'Server error. Is the backend running?';
    }
});

// Registration Logic
const regVideo = document.getElementById('register-video');
const regCanvas = document.getElementById('register-canvas');
const startRegCamBtn = document.getElementById('start-register-cam-btn');
const captureRegBtn = document.getElementById('capture-register-btn');
const regResult = document.getElementById('register-result');

startRegCamBtn.addEventListener('click', async () => {
    await setupCamera(regVideo);
    startRegCamBtn.disabled = true;
    startRegCamBtn.innerText = 'Camera Active';
    captureRegBtn.disabled = false;
});

captureRegBtn.addEventListener('click', async () => {
    const name = document.getElementById('user-name').value;
    const studentId = document.getElementById('student-id').value;

    if (!name || !studentId) {
        regResult.className = 'status-message error';
        regResult.innerText = 'Please enter name and Student ID.';
        return;
    }

    regResult.className = 'status-message';
    regResult.innerText = 'Registering...';
    regResult.style.display = 'block';

    const blob = await captureFrame(regVideo, regCanvas);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('student_id', studentId);
    formData.append('image', blob, 'register.jpg');

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (response.ok) {
            regResult.className = 'status-message success';
            regResult.innerText = data.message;
            document.getElementById('user-name').value = '';
            document.getElementById('student-id').value = '';
        } else {
            regResult.className = 'status-message error';
            regResult.innerText = data.detail || 'Registration failed.';
        }
    } catch (err) {
        regResult.className = 'status-message error';
        regResult.innerText = 'Server error. Is the backend running?';
    }
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
});
