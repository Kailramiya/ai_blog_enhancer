
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchHtml(url) {
	const resp = await axios.get(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml',
		},
		timeout: 30000,
	});
	return resp.data;
}

function stripUnwanted($root) {
	$root.find('header, footer, nav, aside, script, style, noscript').remove();
}

function selectMainContainer($) {
	const candidates = [
		'main',
		'article',
		'[role="main"]',
		'#content',
		'.post-content',
		'.entry-content',
		'.article-content',
		'.content',
	];

	for (const sel of candidates) {
		const el = $(sel).first();
		if (el && el.length) return el;
	}

	return $('body').length ? $('body') : $.root();
}

/**
 * Fetches a blog/article URL and extracts the main content.
 * @param {string} url
 * @param {{ output?: 'text' | 'html' }} [options]
 * @returns {Promise<string>} cleaned text (default) or cleaned HTML
 */
async function scrapeExternal(url, options = {}) {
	const targetUrl = String(url || '').trim();
	if (!targetUrl) {
		throw new Error('url is required');
	}

	const { output = 'text' } = options;

	const html = await fetchHtml(targetUrl);
	const $ = cheerio.load(html);

	const $main = selectMainContainer($);
	stripUnwanted($main);

	if (output === 'html') {
		return ($main.html() || '').trim();
	}

	return $main.text().replace(/\s+/g, ' ').trim();
}

module.exports = {
	scrapeExternal,
};

