require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database first
    await initDatabase();
    console.log('Database ready');

    // API Routes (loaded after database is initialized)
    const leadsRoutes = require('./routes/leads');
    const tasksRoutes = require('./routes/tasks');
    const emailTemplatesRoutes = require('./routes/emailTemplates');
    app.use('/api/leads', leadsRoutes);
    app.use('/api/tasks', tasksRoutes);
    app.use('/api/email-templates', emailTemplatesRoutes);

    // Serve static files from React app in production
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../client/build')));

      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
      });
    }

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: 'Something went wrong!' });
    });

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
