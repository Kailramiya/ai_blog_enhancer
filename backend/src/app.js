
const express = require('express');

const articleRoutes = require('./routes/article.routes');

const app = express();

// Minimal CORS (for Vite dev server)
app.use((req, res, next) => {
	const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
	res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		return res.sendStatus(204);
	}

	next();
});

app.use(express.json());

app.get('/', (_req, res) => {
	return res.json({ status: 'ok' });
});

app.use('/api/articles', articleRoutes);

module.exports = app;

