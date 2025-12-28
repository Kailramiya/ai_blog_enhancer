
function normalizeSlug(input) {
	return String(input || '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-+/g, '-');
}

/**
 * Publishes an updated (rewritten) article by calling the backend API.
 *
 * @param {{
 *   title: string,
 *   content: string,
 *   originalArticleId: string,
 *   references?: Array<{ title?: string, url?: string }>,
 *   port?: string|number
 * }} params
 * @returns {Promise<{ ok: true, status: number, data: any } | { ok: false, status: number, error: string, data?: any }>} 
 */
async function publishUpdatedArticle(params) {
	const title = String(params && params.title ? params.title : '').trim();
	const content = String(params && params.content ? params.content : '').trim();
	const originalArticleId = String(params && params.originalArticleId ? params.originalArticleId : '').trim();
	const references = Array.isArray(params && params.references) ? params.references : [];

	if (!title) return { ok: false, status: 400, error: 'title is required' };
	if (!content) return { ok: false, status: 400, error: 'content is required' };
	if (!originalArticleId) return { ok: false, status: 400, error: 'originalArticleId is required' };

	const resolvedPort = params && params.port ? String(params.port) : process.env.PORT;
	if (!resolvedPort) return { ok: false, status: 400, error: 'PORT is not set (pass params.port or set process.env.PORT)' };

	const slug = normalizeSlug(title);
	if (!slug) return { ok: false, status: 400, error: 'unable to generate slug from title' };

	const url = `http://localhost:${resolvedPort}/api/articles`;
	const payload = {
		title,
		slug,
		content,
		isUpdatedVersion: true,
		originalArticleId,
		references,
	};

	try {
		const resp = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(payload),
		});

		const contentType = resp.headers.get('content-type') || '';
		const data = contentType.includes('application/json')
			? await resp.json().catch(() => null)
			: await resp.text().catch(() => '');

		if (!resp.ok) {
			return {
				ok: false,
				status: resp.status,
				error: `POST ${url} failed: ${resp.status} ${resp.statusText}`,
				data,
			};
		}

		return { ok: true, status: resp.status, data };
	} catch (err) {
		return {
			ok: false,
			status: 0,
			error: err && err.message ? err.message : String(err),
		};
	}
}

module.exports = {
	publishUpdatedArticle,
};

