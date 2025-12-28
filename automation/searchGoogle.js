
const axios = require('axios');

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

const BLOCKED_DOMAINS = [
	'sciencedirect.com',
	'springer.com',
	'ieee.org',
	'nature.com',
	'researchgate.net',
];

function isExcludedHost(hostname) {
	const host = String(hostname || '').toLowerCase();
	const isBlocked = BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
	if (isBlocked) return true;
	return (
		host === 'beyondchats.com' ||
		host.endsWith('.beyondchats.com') ||
		host === 'linkedin.com' ||
		host.endsWith('.linkedin.com') ||
		host === 'youtube.com' ||
		host.endsWith('.youtube.com') ||
		host === 'youtu.be'
	);
}

function looksLikeBlogOrArticleUrl(urlString) {
	try {
		const u = new URL(urlString);
		const path = u.pathname.toLowerCase();
		return /\/(blog|blogs|article|articles)\b/.test(path);
	} catch {
		return false;
	}
}

async function searchGoogleForReferences(articleTitle) {
	const title = String(articleTitle || '').trim();
	if (!title) {
		throw new Error('articleTitle is required');
	}

	const apiKey = process.env.SERPER_API_KEY;
	if (!apiKey) {
		throw new Error('SERPER_API_KEY is not set');
	}

	const resp = await axios.post(
		SERPER_ENDPOINT,
		{ q: title, num: 10 },
		{
			headers: {
				'X-API-KEY': apiKey,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			timeout: 30000,
			validateStatus: () => true,
		}
	);

	if (resp.status < 200 || resp.status >= 300) {
		const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
		throw new Error(`Serper request failed: ${resp.status} ${resp.statusText} - ${body}`);
	}

	const organic = Array.isArray(resp.data && resp.data.organic) ? resp.data.organic : [];

	const results = [];
	for (const item of organic) {
		if (!item || !item.link) continue;
		if (!looksLikeBlogOrArticleUrl(item.link)) continue;

		let u;
		try {
			u = new URL(item.link);
		} catch {
			continue;
		}

		if (isExcludedHost(u.hostname)) continue;

		results.push({
			title: String(item.title || '').trim(),
			url: u.toString(),
		});

		if (results.length >= 2) break;
	}

	return results;
}

module.exports = {
	searchGoogleForReferences,
};

