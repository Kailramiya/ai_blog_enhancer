
function assertNonEmptyString(value, name) {
	const v = String(value || '').trim();
	if (!v) throw new Error(`${name} is required`);
	return v;
}

function formatArticleForPrompt(article) {
	if (!article) return '';
	const title = String(article.title || '').trim();
	const content = String(article.content || '').trim();
	return `TITLE: ${title || '(untitled)'}\nCONTENT:\n${content || '(empty)'}`;
}

function escapeHtml(text) {
	return String(text || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function buildReferencesAppendix(referenceArticles, format) {
	const refs = Array.isArray(referenceArticles) ? referenceArticles : [];
	const linkRefs = refs
		.map((r) => {
			const title = String(r && r.title ? r.title : '').trim() || 'Reference';
			const url = String(r && r.url ? r.url : '').trim();
			return url ? { title, url } : null;
		})
		.filter(Boolean);

	if (format === 'html') {
		const items = linkRefs
			.map((r) => {
				const safeTitle = escapeHtml(r.title);
				const safeUrl = escapeHtml(r.url);
				return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a></li>`;
			})
			.join('');
		return `\n\n<h2>References</h2>\n<ul>${items}</ul>`;
	}

	const items = linkRefs
		.map((r) => {
			const title = String(r.title).replace(/\]/g, '\\]');
			const url = r.url.replace(/\)/g, '%29');
			return `- [${title}](${url})`;
		})
		.join('\n');

	return `\n\n## References\n${items}`;
}

async function callOpenAIResponses({ apiKey, model, input }) {
	const resp = await fetch('https://api.openai.com/v1/responses', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			model,
			input,
		}),
	});

	if (!resp.ok) {
		const raw = await resp.text().catch(() => '');
		let parsed;
		try {
			parsed = raw ? JSON.parse(raw) : null;
		} catch {
			parsed = null;
		}

		const code = parsed && parsed.error && parsed.error.code ? String(parsed.error.code) : '';
		if (resp.status === 429 && code === 'insufficient_quota') {
			throw new Error(
				'OpenAI quota exceeded (insufficient_quota). Add billing/credits in the OpenAI dashboard or set LLM_PROVIDER=gemini with GEMINI_API_KEY.'
			);
		}

		throw new Error(
			`OpenAI API error: ${resp.status} ${resp.statusText}${raw ? ` - ${raw}` : ''}`
		);
	}

	const data = await resp.json();
	const text = data && typeof data.output_text === 'string' ? data.output_text : '';
	return String(text || '').trim();
}

async function callGeminiGenerateContent({ apiKey, model, promptText }) {
	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
		model
	)}:generateContent?key=${encodeURIComponent(apiKey)}`;

	const resp = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			contents: [
				{
					role: 'user',
					parts: [{ text: promptText }],
				},
			],
		}),
	});

	if (!resp.ok) {
		const body = await resp.text().catch(() => '');
		throw new Error(`Gemini API error: ${resp.status} ${resp.statusText}${body ? ` - ${body}` : ''}`);
	}

	const data = await resp.json();
	const text =
		data &&
		data.candidates &&
		data.candidates[0] &&
		data.candidates[0].content &&
		Array.isArray(data.candidates[0].content.parts)
			? data.candidates[0].content.parts.map((p) => p.text || '').join('')
			: '';

	return String(text || '').trim();
}

async function callOpenRouterChatCompletions({ apiKey, model, messages }) {
	const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			// Optional but recommended by OpenRouter
			'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost',
			'X-Title': process.env.OPENROUTER_APP_NAME || 'beyondchats-blogs',
		},
		body: JSON.stringify({
			model,
			messages,
		}),
	});

	if (!resp.ok) {
		const body = await resp.text().catch(() => '');
		throw new Error(`OpenRouter API error: ${resp.status} ${resp.statusText}${body ? ` - ${body}` : ''}`);
	}

	const data = await resp.json();
	const text =
		data &&
		Array.isArray(data.choices) &&
		data.choices[0] &&
		data.choices[0].message &&
		typeof data.choices[0].message.content === 'string'
			? data.choices[0].message.content
			: '';

	return String(text || '').trim();
}

/**
 * Rewrites an article using an LLM and reference articles for tone/depth.
 *
 * @param {{ title: string, content: string }} originalArticle
 * @param {Array<{ title: string, content: string }>} referenceArticles
 * @param {{ format?: 'markdown' | 'html', provider?: 'openai', model?: string }} [options]
 * @returns {Promise<string>} rewritten content in markdown or HTML
 */
async function rewriteWithLLM(originalArticle, referenceArticles, options = {}) {
	const provider = options.provider || process.env.LLM_PROVIDER || 'openrouter';
	const format = options.format || 'markdown';

	if (provider !== 'openai' && provider !== 'gemini' && provider !== 'openrouter') {
		throw new Error(`Unsupported provider: ${provider}`);
	}

	const originalTitle = assertNonEmptyString(originalArticle && originalArticle.title, 'originalArticle.title');
	const originalContent = assertNonEmptyString(originalArticle && originalArticle.content, 'originalArticle.content');
	const refs = Array.isArray(referenceArticles) ? referenceArticles : [];

	const refBlock = refs
		.slice(0, 5)
		.map((a, idx) => `REFERENCE ${idx + 1}\n${formatArticleForPrompt(a)}`)
		.join('\n\n');

	const systemInstructions = [
		'You are an expert editor and writer.',
		`Rewrite the provided ORIGINAL article into high-quality ${format.toUpperCase()} with clear headings and improved structure.`,
		'Use the REFERENCE articles only to match tone, depth, and stylistic patterns.',
		'DO NOT plagiarize: do not copy sentences or distinctive phrasing from the references.',
		'DO NOT invent citations, quotes, or factual claims not supported by the ORIGINAL content.',
		'Keep the topic the same as the ORIGINAL article, but improve clarity, flow, and usefulness.',
		'Output ONLY the rewritten content (no preface, no explanation).',
	].join(' ');

	if (provider === 'openai') {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error('OPENAI_API_KEY is not set');
		}

		const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
		const input = [
			{ role: 'system', content: systemInstructions },
			{
				role: 'user',
				content:
					`ORIGINAL\nTITLE: ${originalTitle}\nCONTENT:\n${originalContent}\n\n` +
					(refBlock ? `${refBlock}\n\n` : '') +
					`OUTPUT FORMAT: ${format.toUpperCase()}\n` +
					(format === 'html'
						? 'Return valid HTML. Use semantic headings (<h2>, <h3>), paragraphs, and lists. Do not include <html>, <head>, or <body> wrappers.'
						: 'Return Markdown. Use headings (##, ###), paragraphs, and bullet lists.'),
			},
		];

		const rewritten = await callOpenAIResponses({ apiKey, model, input });
		return rewritten + buildReferencesAppendix(referenceArticles, format);
	}

	if (provider === 'openrouter') {
		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			throw new Error('OPENROUTER_API_KEY is not set');
		}

		const model = options.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
		const messages = [
			{ role: 'system', content: systemInstructions },
			{
				role: 'user',
				content:
					`ORIGINAL\nTITLE: ${originalTitle}\nCONTENT:\n${originalContent}\n\n` +
					(refBlock ? `${refBlock}\n\n` : '') +
					`OUTPUT FORMAT: ${format.toUpperCase()}\n` +
					(format === 'html'
						? 'Return valid HTML. Use semantic headings (<h2>, <h3>), paragraphs, and lists. Do not include <html>, <head>, or <body> wrappers.'
						: 'Return Markdown. Use headings (##, ###), paragraphs, and bullet lists.'),
			},
		];

		const rewritten = await callOpenRouterChatCompletions({ apiKey, model, messages });
		return rewritten + buildReferencesAppendix(referenceArticles, format);
	}

	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not set');
	}

	const model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
	const promptText =
		`${systemInstructions}\n\n` +
		`ORIGINAL\nTITLE: ${originalTitle}\nCONTENT:\n${originalContent}\n\n` +
		(refBlock ? `${refBlock}\n\n` : '') +
		`OUTPUT FORMAT: ${format.toUpperCase()}\n` +
		(format === 'html'
			? 'Return valid HTML. Use semantic headings (<h2>, <h3>), paragraphs, and lists. Do not include <html>, <head>, or <body> wrappers.'
			: 'Return Markdown. Use headings (##, ###), paragraphs, and bullet lists.');

	const rewritten = await callGeminiGenerateContent({ apiKey, model, promptText });
	return rewritten + buildReferencesAppendix(referenceArticles, format);
}

module.exports = {
	rewriteWithLLM,
};

