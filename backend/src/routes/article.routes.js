
const express = require('express');

const {
	createArticle,
	getAllArticles,
	getArticleById,
	updateArticle,
	deleteArticle,
	extractOldestBlogs,
} = require('../controllers/article.controller');

const router = express.Router();

router.post('/', createArticle);
router.post('/extract-oldest', extractOldestBlogs);
router.get('/', getAllArticles);
router.get('/:id', getArticleById);
router.put('/:id', updateArticle);
router.delete('/:id', deleteArticle);

module.exports = router;

