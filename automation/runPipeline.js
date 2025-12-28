require('dotenv').config();

const axios = require('axios');

const { fetchOriginalArticles } = require('./fetchArticles');
const { searchGoogleForReferences } = require('./searchGoogle');
const { scrapeExternal } = require('./scrapeExternal');
const { rewriteWithLLM } = require('./rewriteWithLLM');
const { publishUpdatedArticle } = require('./publishArticle');

function isTruthyEnv(value) {
	const v = String(value || '').trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

function getIdString(value) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value._id) return String(value._id);
	return String(value);
}

async function fetchAllArticles({ port }) {
	const url = `http://localhost:${port}/api/articles`;
	const resp = await axios.get(url, {
		headers: { Accept: 'application/json' },
		timeout: 30000,
		validateStatus: () => true,
	});

	if (resp.status < 200 || resp.status >= 300) {
		const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
		throw new Error(`GET ${url} failed: ${resp.status} ${resp.statusText} - ${body}`);
	}

	return Array.isArray(resp.data) ? resp.data : [];
}

function normalizeTitle(input) {
	return String(input || '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function titleWordSet(input) {
	const normalized = normalizeTitle(input);
	if (!normalized) return new Set();
	return new Set(normalized.split(' ').filter(Boolean));
}

function wordOverlapRatio(a, b) {
	const aWords = titleWordSet(a);
	const bWords = titleWordSet(b);
	if (aWords.size === 0 || bWords.size === 0) return 0;

	let intersection = 0;
	for (const w of aWords) {
		if (bWords.has(w)) intersection += 1;
	}

	return intersection / Math.min(aWords.size, bWords.size);
}

async function findAtLeastTwoRefs(title, label) {
	const queries = [
		title,
		`"${title}" blog`,
		`"${title}" guide`,
		`"${title}" case study`,
	];

	const seen = new Set();
	const combined = [];

	for (const q of queries) {
		let results = [];
		try {
			results = await searchGoogleForReferences(q);
		} catch (err) {
			console.warn(
				`[${label}] Google search failed for query: ${q} - ${err && err.message ? err.message : err}`
			);
		}

		for (const r of results) {
			if (!r || !r.url) continue;
			if (seen.has(r.url)) continue;
			seen.add(r.url);
			combined.push(r);
			if (combined.length >= 2) return combined.slice(0, 2);
		}

		await sleep(250);
	}

	return combined;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
	const port = process.env.PORT;
	if (!port) {
		throw new Error('PORT is not set');
	}

	const processOnlyOne = isTruthyEnv(process.env.PROCESS_ONLY_ONE);

	console.log('Pipeline start');

	const originals = await fetchOriginalArticles({ port });
	console.log(`Fetched ${originals.length} original articles`);

	const allArticles = await fetchAllArticles({ port });
	const alreadyUpdatedOriginalIds = new Set(
		allArticles
			.filter((a) => a && a.isUpdatedVersion === true && a.originalArticleId)
			.map((a) => getIdString(a.originalArticleId))
			.filter(Boolean)
	);

	let processed = 0;
	let succeeded = 0;
	let failed = 0;
	const processedTitles = [];
	let processedEligibleCount = 0;

	for (const article of originals) {
		processed += 1;
		const label = `${processed}/${originals.length}`;
		console.log(`\n[${label}] Processing: ${article._id} - ${article.title}`);

		try {
			if (alreadyUpdatedOriginalIds.has(getIdString(article._id))) {
				console.log(`[${label}] Skipping article because it is already updated`);
				continue;
			}

			// Duplicate-topic protection (word overlap)
			const overlapThreshold = 0.8;
			let isTooSimilar = false;
			for (const prevTitle of processedTitles) {
				const overlap = wordOverlapRatio(article.title, prevTitle);
				if (overlap > overlapThreshold) {
					console.log(`[${label}] Skipping article due to similar topic`);
					isTooSimilar = true;
					break;
				}
			}
			if (isTooSimilar) continue;
			processedTitles.push(article.title);

			const references = await findAtLeastTwoRefs(article.title, label);
			console.log(`[${label}] Google refs found: ${references.length}`);
			if (references.length < 2) {
				console.log(`[${label}] Skipping article due to insufficient references`);
				continue;
			}

			processedEligibleCount += 1;

			const scrapedRefs = [];
			for (const ref of references.slice(0, 2)) {
				try {
					const refContent = await scrapeExternal(ref.url, { output: 'text' });
					scrapedRefs.push({ title: ref.title, content: refContent });
					console.log(`[${label}] Scraped ref: ${ref.url}`);
				} catch (err) {
					console.warn(
						`[${label}] Failed scraping ref: ${ref.url} - ${err && err.message ? err.message : err}`
					);
				}
			}

			const rewritten = await rewriteWithLLM(
				{ title: article.title, content: article.content },
				scrapedRefs,
				{ format: process.env.REWRITE_FORMAT || 'markdown' }
			);
			console.log(`[${label}] Rewritten content length: ${rewritten.length}`);

			const updatedTitle = `${article.title} (Updated)`;
			const publishResp = await publishUpdatedArticle({
				title: updatedTitle,
				content: rewritten,
				originalArticleId: article._id,
				references: references.slice(0, 2),
				port,
			});

			if (!publishResp.ok) {
				throw new Error(publishResp.error);
			}

			console.log(`[${label}] Published updated article (status ${publishResp.status})`);
			succeeded += 1;
		} catch (err) {
			failed += 1;
			console.error(`[${label}] FAILED: ${err && err.message ? err.message : err}`);
		}

		if (processOnlyOne && processedEligibleCount >= 1) {
			console.log('PROCESS_ONLY_ONE enabled: stopping after first eligible article');
			break;
		}

		// tiny delay to reduce burstiness
		await sleep(300);
	}

	console.log(`\nPipeline done. processed=${processed} succeeded=${succeeded} failed=${failed}`);
}

if (require.main === module) {
	run().catch((err) => {
		console.error(err && err.message ? err.message : err);
		process.exitCode = 1;
	});
}

module.exports = { run };
