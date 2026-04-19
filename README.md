# Financial-Flow-Pro

A full-stack personal finance application with a React frontend and Python FastAPI backend.

## Project Structure

```
Financial-Flow-Pro/
├── frontend/   # React app (Create React App + Craco)
└── backend/    # Python FastAPI server
```

## Local Development

### Frontend

```bash
cd frontend
npm install
npm start          # runs on http://localhost:3000
```

### Backend

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # fill in real values
uvicorn server:app --reload --port 8000
```

## Vercel Deployment

This project deploys the **frontend** to Vercel as a static site.  
The **backend** must be hosted separately (e.g., Render, Railway, or any cloud platform that supports Python).

### Steps

1. **Deploy the backend** to a Python-compatible host and note its public URL.

2. **Set environment variables** in the Vercel project dashboard:

   | Variable | Description |
   |---|---|
   | `REACT_APP_BACKEND_URL` | Public URL of the deployed backend (no trailing slash) |

3. **Deploy to Vercel**:
   - Connect this repository to a Vercel project.
   - Vercel will detect `vercel.json` and use the configuration automatically.
   - Build command: `cd frontend && npm run build`
   - Output directory: `frontend/build`

4. **Configure the backend** by creating a `.env` file from `.env.example` and filling in the required values (see that file for details).

> **Note**: All routes are rewritten to `/index.html` so React Router handles client-side navigation correctly.
