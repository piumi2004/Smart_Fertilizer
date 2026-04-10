# 🌿 Smart Fertilizer Management System

A comprehensive digital platform designed to modernize agricultural management, providing tools for fertilizer recommendation, machinery rental, expert consultation, and marketplace services.

## 🚀 Overview

The **Smart Fertilizer Management System** is a full-stack application built to empower farmers and agricultural stakeholders. It integrates machine learning for smart recommendations, a robust backend for managing complex agricultural workflows, and a modern, responsive frontend for an intuitive user experience.

---

## ✨ Key Features

- **🌾 Fertilizer Recommendation**: ML-powered insights for optimal crop yields.
- **🚜 Machinery Rental**: Seamless booking system for agricultural equipment.
- **👨‍🌾 Expert Consultation**: Connect with authorized Agricultural Officers for tailored advice.
- **🛒 Agri-Store Marketplace**: Buy and sell agricultural products and fertilizers.
- **🛡️ Multi-Role System**: Dedicated dashboards for **Admin**, **Seller**, and **Farmer/User**.
- **🔔 Real-time Notifications**: Stay updated on rental status, consultation reviews, and marketplace activity.
- **📊 Analytics Dashboard**: Comprehensive view for admins to monitor platform activity.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Vite)
- **Language**: TypeScript
- **Routing**: React Router 7
- **Styling**: Vanilla CSS (Modern aesthetic)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB (Mongoose ODM)
- **Security**: JWT & Bcrypt Auth, Helmet.js

### Machine Learning
- **Language**: Python
- **Framework**: Flask/FastAPI (Placeholder for `ml_service`)

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Python 3.10+](https://www.python.org/) (for ML Service)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas instance)

---

## 📥 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/piumi2004/Smart_Fertilizer.git
   cd Smart_Fertilizer
   ```

2. **Install Root Dependencies**:
   ```bash
   npm install
   ```

3. **Install Backend Dependencies**:
   ```bash
   cd backend
   npm install
   cd ..
   ```

4. **Set up Environment Variables**:
   - Create a `.env` file in the root directory based on `.env.example`.
   - Create a `.env` file in the `backend/` directory based on `backend/.env.example`.

---

## 🏃 Running the Application

You can run segments of the application individually or all at once.

### 🏁 Full Stack (Frontend + Backend + ML)
From the root directory:
```bash
npm run dev:full
```

### 💻 Frontend Only
From the root directory:
```bash
npm run dev
```

### ⚙️ Backend Only
From the root directory:
```bash
npm run dev --prefix backend
```

### 🤖 ML Service Only
From the root directory:
```bash
npm run dev:ml
```

---

## 📂 Project Structure

```text
Smart_Fertilizer/
├── backend/                # Express + TS Backend
│   ├── src/                # Backend Source Code
│   │   ├── models/         # Mongoose Schemas
│   │   ├── routes/         # API Route Definitions
│   │   └── services/       # Business Logic
│   └── scripts/            # Database migration scripts
├── ml_service/             # Python Machine Learning Service
│   ├── data/               # Dataset storage
│   └── models/             # Trained model files
├── src/                    # React + TS Frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Application views/pages
│   ├── context/            # Global State Management
│   └── assets/             # Images and styles
├── public/                 # Static assets
└── package.json            # Root scripts and workspace config
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
- `PORT`: Port for the server (default: 5000)
- `MONGODB_URI`: Connection string for MongoDB
- `JWT_SECRET`: Secret key for authentication
- `CORS_ORIGIN`: Allowed frontend origins

---

## 📄 License

This project is licensed under the ISC License.

---

**Developed for Smart Agriculture Initiatives.** 🌿📖
