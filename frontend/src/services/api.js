import axios from 'axios';

const DEFAULT_BASE_URL = 'http://localhost:3000';

function getBaseUrl() {
	const envUrl = import.meta?.env?.VITE_API_BASE_URL;
	const base = (envUrl || DEFAULT_BASE_URL).toString().trim();
	return base.replace(/\/+$/, '');
}

const api = axios.create({
	baseURL: getBaseUrl(),
	headers: {
		Accept: 'application/json',
	},
	timeout: 30000,
});

export async function fetchAllArticles() {
	const resp = await api.get('/api/articles');
	return resp.data;
}

export async function fetchArticleById(id) {
	if (!id) {
		throw new Error('Article id is required');
	}
	const resp = await api.get(`/api/articles/${encodeURIComponent(id)}`);
	return resp.data;
}

export async function extractOldestBlogs(limit = 5) {
	const resp = await api.post('/api/articles/extract-oldest', { limit });
	return resp.data;
}

export { api };
