const axios = require('axios');
const cheerio = require('cheerio');
const Article = require('../models/Article');

const BLOG_INDEX_URL = 'https://beyondchats.com/blogs/';

function blogsPageUrl(pageNum) {
	return pageNum === 1 ? BLOG_INDEX_URL : `${BLOG_INDEX_URL}page/${pageNum}/`;
}

function toAbsoluteUrl(href, baseUrl) {
	try {
		return new URL(href, baseUrl).toString();
	} catch {
		return null;
	}
}

function normalizeSlug(input) {
	return String(input || '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-+/g, '-');
}

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

function extractLastPageNumber(indexHtml, baseUrl) {
	const $ = cheerio.load(indexHtml);
	let maxPage = 1;

	$('a[href]').each((_, a) => {
		const href = $(a).attr('href');
		if (!href) return;

		const abs = toAbsoluteUrl(href, baseUrl);
		if (!abs) return;

		let pageNum = null;
		try {
			const u = new URL(abs);
			if (!u.pathname.startsWith('/blogs')) return;

			const m1 = u.pathname.match(/\/blogs\/page\/(\d+)\/?$/i);
			if (m1) pageNum = Number(m1[1]);

			const paged = u.searchParams.get('paged') || u.searchParams.get('page');
			if (!pageNum && paged && /^\d+$/.test(paged)) pageNum = Number(paged);
		} catch {
			return;
		}

		if (Number.isFinite(pageNum) && pageNum > maxPage) {
			maxPage = pageNum;
		}
	});

	return maxPage;
}

function extractArticleLinksFromListingPage(listingHtml) {
	const $ = cheerio.load(listingHtml);
	const seen = new Set();
	const linksInOrder = [];

	const root = $('main').length ? $('main') : $('body');
	const selectors = [
		'.elementor-post__title a[href]',
		'.entry-title a[href]',
		'article a[rel="bookmark"][href]',
		'a[rel="bookmark"][href]',
		'h2 a[href]',
		'h3 a[href]',
	];

	root.find(selectors.join(',')).each((_, a) => {
		const href = $(a).attr('href');
		if (!href) return;

		const abs = toAbsoluteUrl(href, BLOG_INDEX_URL);
		if (!abs) return;

		let url;
		try {
			url = new URL(abs);
		} catch {
			return;
		}

		if (url.hostname !== 'beyondchats.com') return;
		if (!url.pathname.startsWith('/blogs/')) return;

		const segments = url.pathname.split('/').filter(Boolean); // ['blogs', 'slug']
		if (segments.length !== 2) return;
		if (segments[0] !== 'blogs') return;
		if (segments[1].toLowerCase() === 'page') return;
		if (['category', 'tag', 'author'].includes(segments[1].toLowerCase())) return;

		url.hash = '';
		url.search = '';

		const canonical = url.toString().replace(/\/$/, '') + '/';
		if (seen.has(canonical)) return;
		seen.add(canonical);
		linksInOrder.push(canonical);
	});

	return linksInOrder;
}

function pickOldestLinksFromPage(linksInOrder, limit, alreadyPicked) {
	const picked = [];
	for (let i = linksInOrder.length - 1; i >= 0 && picked.length < limit; i -= 1) {
		const link = linksInOrder[i];
		if (alreadyPicked.has(link)) continue;
		alreadyPicked.add(link);
		picked.push(link);
	}
	return picked;
}

function extractTitle($) {
	const h1 = $('h1').first().text().trim();
	if (h1) return h1;
	const og = $('meta[property="og:title"]').attr('content');
	if (og) return String(og).trim();
	const titleTag = $('title').first().text().trim();
	return titleTag;
}

function extractMainContentHtml($) {
	let root = $('main').first();
	if (!root.length) root = $('article').first();
	if (!root.length) root = $('#content').first();
	if (!root.length) root = $('body').first();

	root.find('header, footer, nav, aside, script, style, noscript').remove();
	const html = root.html();
	return (html || '').trim();
}

async function scrapeArticle(url) {
	const html = await fetchHtml(url);
	const $ = cheerio.load(html);

	const title = extractTitle($);
	const content = extractMainContentHtml($);
	const slug = normalizeSlug(title);

	return {
		title,
		slug,
		originalUrl: url,
		content,
	};
}

async function scrapeOldestBlogs({ limit = 5 } = {}) {
	const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 5;

	// If we already have the seeded originals in DB, do not repeat scraping.
	const existing = await Article.find({
		isUpdatedVersion: false,
		originalUrl: { $regex: /^https?:\/\/beyondchats\.com\/blogs\//i },
	})
		.sort({ createdAt: 1 })
		.limit(safeLimit)
		.lean();

	if (Array.isArray(existing) && existing.length === safeLimit) {
		return {
			lastPage: null,
			oldestLinks: [],
			saved: 0,
			skipped: 0,
			originals: existing,
			fromDb: true,
		};
	}

	const indexHtml = await fetchHtml(BLOG_INDEX_URL);
	const lastPage = extractLastPageNumber(indexHtml, BLOG_INDEX_URL);

	const oldestLinks = [];
	const alreadyPicked = new Set();

	for (let pageNum = lastPage; pageNum >= 1 && oldestLinks.length < safeLimit; pageNum -= 1) {
		const pageUrl = blogsPageUrl(pageNum);
		const pageHtml = await fetchHtml(pageUrl);
		const linksInOrder = extractArticleLinksFromListingPage(pageHtml);

		const needed = safeLimit - oldestLinks.length;
		const pickedFromPage = pickOldestLinksFromPage(linksInOrder, needed, alreadyPicked);
		oldestLinks.push(...pickedFromPage);
	}

	let saved = 0;
	let skipped = 0;
	const originals = [];

	for (const articleUrl of oldestLinks) {
		try {
			const { title, slug, originalUrl, content } = await scrapeArticle(articleUrl);
			if (!slug) {
				skipped += 1;
				continue;
			}

			const existing = await Article.findOne({ slug }).lean();
			if (existing) {
				originals.push(existing);
				skipped += 1;
				continue;
			}

			const created = await Article.create({
				title,
				slug,
				originalUrl,
				content,
				isUpdatedVersion: false,
				originalArticleId: null,
				references: [],
			});
			originals.push(created);
			saved += 1;
		} catch {
			// skip individual failures
		}
	}

	return {
		lastPage,
		oldestLinks,
		saved,
		skipped,
		originals,
		fromDb: false,
	};
}

module.exports = {
	scrapeOldestBlogs,
};

if (require.main === module) {
	const mongoose = require('mongoose');
	require('../config/env');
	const connectDB = require('../config/db');

	(async () => {
		let conn;
		try {
			conn = await connectDB();
			const result = await scrapeOldestBlogs({ limit: 5 });
			process.stdout.write(
				`Scrape done. saved=${result.saved} skipped=${result.skipped} picked=${result.originals.length}\n`
			);
		} catch (err) {
			process.stderr.write(`${err && err.message ? err.message : err}\n`);
			process.exitCode = 1;
		} finally {
			try {
				await mongoose.disconnect();
			} catch {
				// ignore
			}
			if (conn && conn.connection && conn.connection.close) {
				try {
					await conn.connection.close();
				} catch {
					// ignore
				}
			}
		}
	})();
}
