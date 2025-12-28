
const mongoose = require('mongoose');

const Article = require('../models/Article');
const { scrapeOldestBlogs } = require('../scripts/scrapeOldestBlogs');

function isValidObjectId(id) {
	return mongoose.Types.ObjectId.isValid(id);
}

async function createArticle(req, res) {
	try {
		const created = await Article.create(req.body);
		return res.status(201).json(created);
	} catch (err) {
		if (err && err.name === 'ValidationError') {
			return res.status(400).json({ message: err.message });
		}
		if (err && err.code === 11000) {
			return res.status(409).json({ message: 'Duplicate key error', keyValue: err.keyValue });
		}
		return res.status(500).json({ message: 'Internal server error' });
	}
}

async function getAllArticles(_req, res) {
	try {
		const articles = await Article.find().sort({ createdAt: -1 });
		return res.json(articles);
	} catch (_err) {
		return res.status(500).json({ message: 'Internal server error' });
	}
}

async function getArticleById(req, res) {
	try {
		const { id } = req.params;
		if (!isValidObjectId(id)) {
			return res.status(400).json({ message: 'Invalid id' });
		}

		const article = await Article.findById(id);
		if (!article) {
			return res.status(404).json({ message: 'Article not found' });
		}

		return res.json(article);
	} catch (_err) {
		return res.status(500).json({ message: 'Internal server error' });
	}
}

async function updateArticle(req, res) {
	try {
		const { id } = req.params;
		if (!isValidObjectId(id)) {
			return res.status(400).json({ message: 'Invalid id' });
		}

		const updated = await Article.findByIdAndUpdate(id, req.body, {
			new: true,
			runValidators: true,
		});

		if (!updated) {
			return res.status(404).json({ message: 'Article not found' });
		}

		return res.json(updated);
	} catch (err) {
		if (err && err.name === 'ValidationError') {
			return res.status(400).json({ message: err.message });
		}
		if (err && err.code === 11000) {
			return res.status(409).json({ message: 'Duplicate key error', keyValue: err.keyValue });
		}
		return res.status(500).json({ message: 'Internal server error' });
	}
}

async function deleteArticle(req, res) {
	try {
		const { id } = req.params;
		if (!isValidObjectId(id)) {
			return res.status(400).json({ message: 'Invalid id' });
		}

		const deleted = await Article.findByIdAndDelete(id);
		if (!deleted) {
			return res.status(404).json({ message: 'Article not found' });
		}

		return res.json({ message: 'Article deleted' });
	} catch (_err) {
		return res.status(500).json({ message: 'Internal server error' });
	}
}

module.exports = {
	createArticle,
	getAllArticles,
	getArticleById,
	updateArticle,
	deleteArticle,
	extractOldestBlogs,
};

async function extractOldestBlogs(req, res) {
	try {
		const limit = req && req.body && req.body.limit ? Number(req.body.limit) : 5;
		const result = await scrapeOldestBlogs({ limit });
		return res.json({ originals: result.originals || [], meta: { saved: result.saved, skipped: result.skipped } });
	} catch (err) {
		return res.status(500).json({ message: err && err.message ? err.message : 'Extraction failed' });
	}
}

