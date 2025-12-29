import { useEffect, useMemo, useState } from 'react';

import { fetchAllArticles, fetchArticleById } from '../services/api';
import { navigate } from '../navigation';

function getIdString(value) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value._id) return String(value._id);
	return String(value);
}

function getArticleIdFromPathname(pathname) {
	const path = String(pathname || '');
	const match = path.match(/\/articles\/([^/]+)\/?$/);
	return match ? decodeURIComponent(match[1]) : '';
}

function looksLikeHtml(text) {
	const s = String(text || '');
	// quick heuristic: has at least one tag-like pattern
	return /<\s*\/?\s*[a-z][\s\S]*?>/i.test(s);
}

function stripAfterMarkers(text, markers) {
	let out = String(text || '');
	for (const marker of markers) {
		const idx = out.toLowerCase().indexOf(String(marker).toLowerCase());
		if (idx !== -1) {
			out = out.slice(0, idx);
		}
	}
	return out;
}

function postProcessReadableText(text) {
	let out = String(text || '');

	// Remove common boilerplate that appears after the article.
	out = stripAfterMarkers(out, [
		'leave a reply',
		'cancel reply',
		'post comment',
		'more from',
		'see more recommendations',
		'related posts',
		'recommended',
	]);

	// Drop standalone numeric counter lines (e.g., repeated "0")
	out = out
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => !/^\s*\d+\s*$/.test(line))
		.join('\n');

	// Collapse excessive blank lines
	out = out.replace(/\n{3,}/g, '\n\n').trim();
	return out;
}

function htmlToText(html) {
	const s = String(html || '');
	try {
		if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
			const parser = new window.DOMParser();
			const doc = parser.parseFromString(s, 'text/html');

			const candidates = [];
			for (const sel of [
				'article',
				'main',
				'[role="main"]',
				'[itemprop="articleBody"]',
				'.entry-content',
				'.post-content',
				'.article-content',
				'.content',
			]) {
				doc.querySelectorAll(sel).forEach((n) => candidates.push(n));
			}
			if (doc.body) candidates.push(doc.body);

			function cleanupClone(node) {
				const clone = node.cloneNode(true);
				// Remove common non-content nodes
				for (const sel of [
					'script',
					'style',
					'noscript',
					'nav',
					'header',
					'footer',
					'aside',
					'form',
					'button',
					'input',
					'textarea',
					'svg',
				]) {
					clone.querySelectorAll(sel).forEach((n) => n.remove());
				}
				// Remove obvious boilerplate containers when present
				for (const sel of [
					'[id*="comment" i]',
					'[class*="comment" i]',
					'[id*="reply" i]',
					'[class*="reply" i]',
					'[class*="related" i]',
					'[class*="recommend" i]',
					'[class*="sidebar" i]',
				]) {
					clone.querySelectorAll(sel).forEach((n) => n.remove());
				}
				return clone;
			}

			let bestText = '';
			for (const node of candidates) {
				if (!node) continue;
				const cleanedNode = cleanupClone(node);
				const rawText =
					(cleanedNode && (cleanedNode.innerText || cleanedNode.textContent)) || '';
				const processed = postProcessReadableText(String(rawText));
				if (processed.length > bestText.length) bestText = processed;
			}

			return bestText;
		}
	} catch {
		// fall through to regex-based stripping
	}

	// fallback: strip tags
	const stripped = s
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return postProcessReadableText(stripped);
}

function contentToBlocks(content) {
	const raw = String(content || '');
	const blocks = [];

	function pushText(text) {
		const t = postProcessReadableText(String(text || ''));
		if (!t) return;
		// Split into paragraphs by blank lines to keep positions stable.
		const parts = t
			.split(/\n\s*\n/g)
			.map((p) => p.trim())
			.filter(Boolean);
		for (const p of parts) {
			blocks.push({ type: 'text', text: p });
		}
	}

	function pushImage(src) {
		const s = String(src || '').trim();
		if (!s) return;
		blocks.push({ type: 'image', src: s });
	}

	// HTML path: preserve order of text-ish blocks and <img> tags.
	if (looksLikeHtml(raw) && typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
		try {
			const parser = new window.DOMParser();
			const doc = parser.parseFromString(raw, 'text/html');

			const candidates = [];
			for (const sel of [
				'article',
				'main',
				'[role="main"]',
				'[itemprop="articleBody"]',
				'.entry-content',
				'.post-content',
				'.article-content',
				'.content',
			]) {
				doc.querySelectorAll(sel).forEach((n) => candidates.push(n));
			}
			if (doc.body) candidates.push(doc.body);

			function cleanupClone(node) {
				const clone = node.cloneNode(true);
				for (const sel of [
					'script',
					'style',
					'noscript',
					'nav',
					'header',
					'footer',
					'aside',
					'form',
					'button',
					'input',
					'textarea',
					'svg',
				]) {
					clone.querySelectorAll(sel).forEach((n) => n.remove());
				}
				for (const sel of [
					'[id*="comment" i]',
					'[class*="comment" i]',
					'[id*="reply" i]',
					'[class*="reply" i]',
					'[class*="related" i]',
					'[class*="recommend" i]',
					'[class*="sidebar" i]',
				]) {
					clone.querySelectorAll(sel).forEach((n) => n.remove());
				}
				return clone;
			}

			let bestNode = null;
			let bestTextLen = 0;
			for (const node of candidates) {
				if (!node) continue;
				const cleaned = cleanupClone(node);
				const rawText =
					(cleaned && (cleaned.innerText || cleaned.textContent)) || '';
				const processed = postProcessReadableText(String(rawText));
				if (processed.length > bestTextLen) {
					bestTextLen = processed.length;
					bestNode = cleaned;
				}
			}

			const root = bestNode || (doc.body ? cleanupClone(doc.body) : null);
			if (!root) {
				pushText(htmlToText(raw));
				return blocks;
			}

			const markers = [
				'leave a reply',
				'cancel reply',
				'post comment',
				'more from',
				'see more recommendations',
				'related posts',
				'recommended',
			];

			function shouldStopOnText(text) {
				const t = String(text || '').toLowerCase();
				return markers.some((m) => t.includes(m));
			}

			const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
			let stopped = false;
			while (!stopped && walker.nextNode()) {
				const el = walker.currentNode;
				if (!el || !el.tagName) continue;
				const tag = String(el.tagName || '').toLowerCase();

				if (tag === 'img') {
					const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
					if (src) pushImage(src);
					continue;
				}

				// Extract readable chunks from common content tags.
				if (
					['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)
				) {
					const txt = (el.innerText || el.textContent || '').trim();
					if (!txt) continue;
					if (shouldStopOnText(txt)) {
						stopped = true;
						break;
					}
					pushText(txt);
				}
			}

			if (blocks.length > 0) return blocks;
		} catch {
			// fall back
		}
	}

	// Markdown images and plain image URLs (preserve position).
	const tokenRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s"')]+?\.(?:png|jpe?g|gif|webp|svg))(\?[^\s"')]+)?/gi;
	let last = 0;
	let match;
	while ((match = tokenRe.exec(raw)) !== null) {
		const full = match[0] || '';
		const mdUrl = match[1] || '';
		const plainBase = match[2] || '';
		const plainQs = match[3] || '';
		const url = mdUrl || (plainBase ? plainBase + plainQs : '');
		const idx = match.index;
		const before = raw.slice(last, idx);
		pushText(before);
		pushImage(url);
		last = idx + full.length;
	}
	pushText(raw.slice(last));

	return blocks;
}

function buildCanonicalImagePlan(blocks) {
	const plan = [];
	let textIndex = -1;
	for (const b of Array.isArray(blocks) ? blocks : []) {
		if (!b) continue;
		if (b.type === 'text') {
			textIndex += 1;
			continue;
		}
		if (b.type === 'image' && b.src) {
			plan.push({ src: b.src, afterTextIndex: textIndex });
		}
	}
	return plan;
}

function extractTextBlocks(blocks) {
	return (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.type === 'text' && b.text);
}

function groupImagesByAfterIndex(imagePlan, maxTextIndex) {
	const map = new Map();
	for (const img of Array.isArray(imagePlan) ? imagePlan : []) {
		if (!img || !img.src) continue;
		let idx = typeof img.afterTextIndex === 'number' ? img.afterTextIndex : -1;
		if (typeof maxTextIndex === 'number' && maxTextIndex >= 0) {
			idx = Math.min(idx, maxTextIndex);
		}
		if (!map.has(idx)) map.set(idx, []);
		map.get(idx).push(img.src);
	}
	return map;
}

function ContentBlock({ article, sideLabel }) {
	if (!article) {
		return (
			<div className="card card--empty" style={{ minHeight: 120 }}>
				{sideLabel}: Not available.
			</div>
		);
	}

	const rawContent = String(article.content || '');
	const blocks = contentToBlocks(rawContent);
	const refs = Array.isArray(article.references) ? article.references : [];
	const referenceLinks = refs
		.map((r) => {
			const title = String(r && r.title ? r.title : '').trim();
			const url = String(r && r.url ? r.url : '').trim();
			if (!url) return null;
			return { title: title || url, url };
		})
		.filter(Boolean);

	return (
		<div className="card">
			<div>
				<p className="block-label">{sideLabel}</p>
				<h2 className="block-heading">{article.title}</h2>
			</div>

			<div className="block-body">
				{blocks.length === 0 ? 'No content.' : null}
				{blocks.map((b, idx) => {
					if (!b) return null;
					if (b.type === 'image') {
						return (
							<div key={`${b.src || 'img'}-${idx}`} className="image-grid">
								<img src={b.src} alt="" loading="lazy" />
							</div>
						);
					}
					if (b.type === 'text') {
						return (
							<p key={`t-${idx}`} style={{ margin: '0 0 12px' }}>
								{b.text}
							</p>
						);
					}
					return null;
				})}
			</div>

			{referenceLinks.length > 0 ? (
				<div className="refs">
					<h3>References</h3>
					<ul>
						{referenceLinks.map((r) => (
							<li key={r.url}>
								<a href={r.url} target="_blank" rel="noreferrer">
									{r.title}
								</a>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

export default function ArticleDetail({ articleId }) {
	const resolvedId = useMemo(() => {
		if (articleId) return String(articleId);
		if (typeof window !== 'undefined') return getArticleIdFromPathname(window.location.pathname);
		return '';
	}, [articleId]);

	const [article, setArticle] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [originalArticle, setOriginalArticle] = useState(null);
	const [updatedArticle, setUpdatedArticle] = useState(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			if (!resolvedId) {
				setArticle(null);
				setLoading(false);
				setError('Missing article id');
				return;
			}

			setLoading(true);
			setError('');
			setOriginalArticle(null);
			setUpdatedArticle(null);

			try {
				const data = await fetchArticleById(resolvedId);
				if (cancelled) return;
				setArticle(data || null);
			} catch (e) {
				if (cancelled) return;
				setError(e && e.message ? e.message : 'Failed to load article');
				setArticle(null);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [resolvedId]);

	useEffect(() => {
		let cancelled = false;

		async function resolveLinks() {
			if (!article) return;

			const isUpdated = Boolean(article.isUpdatedVersion);
			if (isUpdated) {
				setUpdatedArticle(article);
				const originalId = getIdString(article.originalArticleId);
				if (!originalId) {
					setOriginalArticle(null);
					return;
				}
				try {
					const orig = await fetchArticleById(originalId);
					if (cancelled) return;
					setOriginalArticle(orig || null);
				} catch {
					if (!cancelled) setOriginalArticle(null);
				}
				return;
			}

			// current is original
			setOriginalArticle(article);
			try {
				const all = await fetchAllArticles();
				if (cancelled) return;
				const list = Array.isArray(all) ? all : [];
				const match = list.find(
					(a) =>
						a &&
						a.isUpdatedVersion === true &&
						getIdString(a.originalArticleId) === getIdString(article._id)
				);
				setUpdatedArticle(match || null);
			} catch {
				// ignore; page still renders
			}
		}

		resolveLinks();
		return () => {
			cancelled = true;
		};
	}, [article]);

	return (
		<div className="app-shell">
			<a
				href="/"
				className="backlink"
				onClick={(e) => {
					if (e.defaultPrevented) return;
					if (e.button !== 0) return;
					if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
					e.preventDefault();
					navigate('/');
				}}
			>
				← Back
			</a>

			{loading ? <p className="status">Loading…</p> : null}
			{!loading && error ? <p className="status status--danger">{error}</p> : null}

			{!loading && !error && article ? (
				<div>
					<div className="app-header" style={{ marginTop: 0 }}>
						<h1 className="app-title">Original vs Updated</h1>
					</div>

					{(() => {
						const origContent = originalArticle ? String(originalArticle.content || '') : '';
						const origBlocks = originalArticle ? contentToBlocks(origContent) : [];
						const canonicalPlan = buildCanonicalImagePlan(origBlocks);

						function renderWithCanonicalImages(articleForSide, sideLabelForSide) {
							if (!articleForSide) return <ContentBlock article={null} sideLabel={sideLabelForSide} />;
							const sideBlocks = contentToBlocks(String(articleForSide.content || ''));
							const textBlocks = extractTextBlocks(sideBlocks);
							const imagesByIdx = groupImagesByAfterIndex(canonicalPlan, textBlocks.length - 1);

							return (
								<div className="card">
									<div>
										<p className="block-label">{sideLabelForSide}</p>
										<h2 className="block-heading">{articleForSide.title}</h2>
									</div>

									<div className="block-body">
										{(imagesByIdx.get(-1) || []).length > 0 ? (
											<div className="image-grid">
												{imagesByIdx.get(-1).map((src, i) => (
													<img key={`${src}-${i}`} src={src} alt="" loading="lazy" />
												))}
											</div>
										) : null}

										{textBlocks.length === 0 ? 'No content.' : null}
										{textBlocks.map((tb, idx) => (
											<div key={`tb-${idx}`}>
												<p style={{ margin: '0 0 12px' }}>{tb.text}</p>
												{(imagesByIdx.get(idx) || []).length > 0 ? (
													<div className="image-grid">
														{imagesByIdx.get(idx).map((src, i) => (
															<img key={`${src}-${idx}-${i}`} src={src} alt="" loading="lazy" />
														))}
													</div>
												) : null}
											</div>
										))}
									</div>

									{Array.isArray(articleForSide.references) && articleForSide.references.length > 0 ? (
										<div className="refs">
											<h3>References</h3>
											<ul>
												{articleForSide.references
													.map((r) => {
														const title = String(r && r.title ? r.title : '').trim();
														const url = String(r && r.url ? r.url : '').trim();
														if (!url) return null;
														return { title: title || url, url };
													})
													.filter(Boolean)
													.map((r) => (
														<li key={r.url}>
															<a href={r.url} target="_blank" rel="noreferrer">
																{r.title}
															</a>
														</li>
													))}
											</ul>
										</div>
									) : null}
								</div>
							);
						}

						return (
							<div className="two-col">
								{renderWithCanonicalImages(originalArticle, 'Original')}
								{renderWithCanonicalImages(updatedArticle, 'Updated')}
							</div>
						);
					})()}
				</div>
			) : null}
		</div>
	);
}
