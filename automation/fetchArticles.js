

const axios = require('axios');

function getIdString(value) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value._id) return String(value._id);
	return String(value);
}

async function fetchOriginalArticles({ port, excludeAlreadyUpdated = true } = {}) {
	const resolvedPort = port || process.env.PORT;
	if (!resolvedPort) {
		throw new Error('PORT is not set (pass { port } or set process.env.PORT)');
	}

	const url = `http://localhost:${resolvedPort}/api/articles`;

	let resp;
	try {
		resp = await axios.get(url, {
			headers: { Accept: 'application/json' },
			timeout: 30000,
			validateStatus: () => true,
		});
	} catch (err) {
		const msg = err && err.message ? err.message : String(err);
		throw new Error(
			`GET ${url} failed (${msg}). Is the backend running on PORT=${resolvedPort}?`
		);
	}

	if (resp.status < 200 || resp.status >= 300) {
		const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
		throw new Error(`GET ${url} failed: ${resp.status} ${resp.statusText} - ${body}`);
	}

	const data = resp.data;
	const articles = Array.isArray(data) ? data : [];

	const updatedOriginalIds = new Set(
		articles
			.filter((a) => a && a.isUpdatedVersion === true && a.originalArticleId)
			.map((a) => getIdString(a.originalArticleId))
			.filter(Boolean)
	);

	return articles
		.filter((a) => a && a.isUpdatedVersion === false)
		.filter((a) => {
			if (!excludeAlreadyUpdated) return true;
			return !updatedOriginalIds.has(getIdString(a._id));
		})
		.map((a) => ({
			_id: a._id,
			title: a.title,
			content: a.content,
		}));
}

module.exports = {
	fetchOriginalArticles,
};

if (require.main === module) {
	fetchOriginalArticles()
		.then((result) => {
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		})
		.catch((err) => {
			console.error(err && err.message ? err.message : err);
			process.exitCode = 1;
		});
}

