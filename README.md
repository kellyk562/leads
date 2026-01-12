# WeedHurry POS - Sales Leads Tracker

A professional web application for tracking sales leads for the WeedHurry POS platform.

## Features

- **Dashboard** - View statistics and today's scheduled callbacks at a glance
- **Lead Management** - Add, edit, and track sales leads through their lifecycle
- **Status Tracking** - Categorize leads as Interested, Prospects, New Customer, or Closed
- **Callback Scheduling** - Set and track callback dates/times with daily reminders
- **Contact History** - Log every interaction with detailed notes and outcomes
- **Search & Filter** - Find leads by name, location, contact info, or status
- **Priority Levels** - Mark leads as Low, Medium, High, or Urgent priority

## Lead Information Tracked

- Dispensary details (name, address, phone, website, license number)
- Contact information (contact name, manager, owner, phone, email)
- Business details (current POS system, estimated revenue, number of locations)
- Lead source and priority
- Notes and callback scheduling
- Complete contact history

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (with better-sqlite3)
- **Frontend**: React 18
- **Styling**: Custom CSS

## Local Development

### Prerequisites

- Node.js 18 or higher
- npm

### Setup

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd SalesLeads
   ```

2. Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. Start the development servers:
   ```bash
   npm run dev
   ```

   This will start:
   - Backend server on http://localhost:5000
   - React dev server on http://localhost:3000

## Deploying to Render

### Option 1: Using Render Blueprint (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Go to [Render Dashboard](https://dashboard.render.com/)

3. Click **New** → **Blueprint**

4. Connect your repository

5. Render will automatically detect the `render.yaml` file and configure:
   - Web service with Node.js runtime
   - Persistent disk for SQLite database
   - Environment variables

6. Click **Apply** to deploy

### Option 2: Manual Setup

1. Go to [Render Dashboard](https://dashboard.render.com/)

2. Click **New** → **Web Service**

3. Connect your repository

4. Configure the service:
   - **Name**: weedhurry-sales-leads
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

5. Add environment variables:
   - `NODE_ENV`: production
   - `DATABASE_PATH`: /var/data/leads.db

6. Add a persistent disk:
   - **Name**: leads-data
   - **Mount Path**: /var/data
   - **Size**: 1 GB

7. Click **Create Web Service**

## API Endpoints

### Leads

- `GET /api/leads` - Get all leads (with optional filters)
- `GET /api/leads/:id` - Get single lead with contact history
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `PATCH /api/leads/:id/status` - Update lead status only
- `DELETE /api/leads/:id` - Delete lead

### Callbacks

- `GET /api/leads/callbacks/today` - Get today's callbacks
- `GET /api/leads/callbacks/upcoming` - Get callbacks for next 7 days

### Statistics

- `GET /api/leads/stats` - Get dashboard statistics

### Contact History

- `GET /api/leads/:id/history` - Get contact history for a lead
- `POST /api/leads/:id/history` - Add contact history entry

## License

Proprietary - WeedHurry POS
