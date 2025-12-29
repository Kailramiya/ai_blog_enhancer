
const express = require('express');

const articleRoutes = require('./routes/article.routes');

const app = express();

app.use((req, res, next) => {
	function normalizeOrigin(value) {
		const s = String(value || '').trim();
		// Browsers send Origin without a trailing slash. Normalize env values like "https://app.vercel.app/".
		return s.endsWith('/') ? s.slice(0, -1) : s;
	}

	// Allow a single origin or a comma-separated list in FRONTEND_ORIGIN.
	const configured = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
	const allowedOrigins = configured
		.split(',')
		.map((o) => normalizeOrigin(o))
		.filter(Boolean);

	const requestOriginRaw = req.headers.origin;
	const requestOrigin = normalizeOrigin(requestOriginRaw);

	// Only echo back the Origin if it is explicitly allowed.
	if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
		res.setHeader('Access-Control-Allow-Origin', requestOriginRaw);
		res.setHeader('Vary', 'Origin');
	}

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

